#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import {styleText} from 'util';
import readline from 'readline';
import {finished} from 'stream/promises';
import {run} from 'node:test';
import {red, green, yellow, gray} from '@bhsd/nodejs';
import type {InspectColor} from 'util';
import type {TestsStream, EventData, RunOptions} from 'node:test';

const getValues = (args: string[], key: string): string[] =>
	args.filter(arg => arg.startsWith(key)).map(arg => arg.slice(key.length + 1));

const args = process.argv.slice(2),
	files = args.filter(arg => !arg.startsWith('-')),
	includeArgs = '--test-coverage-include',
	timeoutArg = '--test-timeout',
	reporterArg = '--test-reporter',
	known = new Set([includeArgs, timeoutArg, reporterArg]),
	coverageIncludeGlobs = getValues(args, includeArgs),
	timeout = Number(getValues(args, timeoutArg).at(-1)),
	reporter = getValues(args, reporterArg).at(-1),
	execArgv = args.filter(
		arg => arg.startsWith('-') && !known.has(arg.split('=', 1)[0]!),
	),
	cwd = process.cwd(),
	width = Math.round(process.stdout.columns / 2) - 1;

const endStream = async (stream: TestsStream): Promise<void> => {
	stream.resume();
	await finished(stream, {cleanup: true});
};

const stat = (color: InspectColor, count: number | string, label: string): string =>
	`  ${styleText(color, `${count} ${label}`)}`;

const pad = (num: number, length = 8): string => `${num.toFixed(2).padStart(length)} `;

const greenBold = (str: string[]): string => str.map(s => `${styleText(['green', 'bold'], s)}|`).join('');

const isTrace = (line: string): boolean => line.trim().startsWith('at ');

const rewrite = (line: string): void => {
	readline.clearLine(process.stdout, 0);
	readline.cursorTo(process.stdout, 0);
	process.stdout.write(line);
};

(async () => {
	const opts: RunOptions = {files, concurrency: true, execArgv};
	let total = 0;

	if (reporter !== 'spec') {
		// 1. Count the total number of atomic tests that will be run
		const renderProgress = (): void => {
			rewrite(`  ${gray(`Preparing tests: ${total}`)}`);
		};
		const pre = '@bhsd/test-util:',
			skipStream = run({
				...opts,
				argv: ['skip'],
				setup(stream) {
					stream.on('test:complete', ({name, details: {type}}) => {
						if (type === 'test') {
							total += name.startsWith(pre) ? Number(name.slice(pre.length)) : 1;
						}
					});
				},
			}),
			progressRenderer = setInterval(renderProgress, 100);
		await endStream(skipStream);
		rewrite('');
		clearInterval(progressRenderer);
	}

	// 2. Run the tests and track progress
	if (coverageIncludeGlobs.length > 0) {
		console.log(gray('Coverage includes:'), coverageIncludeGlobs);
	}
	console.log();
	let completed = 0,
		passed = 0,
		skipped = 0,
		failed = 0,
		last: number | undefined,
		coverage: EventData.TestCoverage['summary'] | undefined;
	const renderProgressBar = (): void => {
		const percent = total === 0 ? 1 : Math.min(1, completed / total);
		if (percent !== last) {
			last = percent;
			rewrite(`  ${gray('[')}${
				'▬'.repeat(Math.round(percent * width)).padEnd(width, '.')
			}${gray(']')}`);
		}
	};
	const failures: {paths: string[], error: Error}[] = [],
		stderrs = new Map<string, string>(),
		registry = new Map<string, {name: string, parentId: number | undefined}>(),
		controller = new AbortController(),
		{signal} = controller,
		start = performance.now(),
		testStream = run({
			...opts,
			coverage: coverageIncludeGlobs.length > 0,
			coverageIncludeGlobs,
			...timeout && {signal},
			setup(stream) {
				let timer: NodeJS.Timeout | undefined;
				stream.on(
					'test:dequeue',
					({file = '', name, testId, parentId}: EventData.TestDequeue & {parentId?: number}) => {
						registry.set(`${file}-${testId}`, {name, parentId});
					},
				)
					.on('test:stderr', ({file, message}) => {
						stderrs.set(file, (stderrs.get(file) ?? '') + message);
					})
					.on(
						'test:complete',
						({
							details: {type, passed: p, error, duration_ms: duration},
							skip,
							name,
							file = '',
							parentId,
							nesting,
						}: EventData.TestComplete & {parentId?: number}) => {
							if (error?.cause instanceof Error) {
								const paths = [name];
								while (parentId !== undefined) {
									const entry = registry.get(`${file}-${parentId}`);
									if (!entry) {
										break;
									}
									paths.push(entry.name);
									({parentId} = entry); // eslint-disable-line no-param-reassign
								}
								failures.push({
									paths,
									error: error.cause,
								});
							}
							if (type === 'test') {
								completed++;
							}
							if (skip) {
								skipped++;
							} else if (type === 'test') {
								if (p) {
									passed++;
								} else {
									failed++;
								}
								if (reporter === 'spec' && nesting) {
									if (p) {
										const elapsed = duration > 200
											? (duration > 500 ? red : yellow)(` (${Math.round(duration)}ms)`)
											: '';
										console.log(`  ${green('✔')} ${gray(name)}${elapsed}`);
									} else {
										console.log(red(`  ${failures.length}) ${name}`));
									}
								}
							}
						},
					)
					.on('test:coverage', ({summary}) => {
						fs.writeFileSync(path.join(cwd, 'coverage', 'coverage.json'), JSON.stringify(summary));
						coverage = summary;
					})
					.on('end', () => {
						clearInterval(timer);
					});
				if (timeout) {
					timer = setTimeout(() => {
						controller.abort();
					}, timeout);
				}
			},
		});
	if (reporter === 'spec') {
		await endStream(testStream);
	} else {
		const renderer = setInterval(renderProgressBar, 50);
		await endStream(testStream);
		renderProgressBar();
		clearInterval(renderer);
		if (completed < total) {
			process.stdout.write(gray(` ${completed} of ${total}`) as string);
		}
	}

	// 3. Log the results
	const elapsed = performance.now() - start;
	let ms: string;
	if (elapsed < 1e3) {
		ms = `${Math.round(elapsed)}ms`;
	} else {
		const seconds = Math.round(elapsed / 1e3),
			minutes = Math.floor(seconds / 60),
			res = minutes < 10 ? seconds % 60 : 0;
		ms = (minutes === 0 ? '' : `${minutes}m`) + (res ? `${res}s` : '');
	}
	console.log(`\n\n${stat('green', passed, 'passing')} ${gray(`(${ms})`)}`);
	if (skipped) {
		console.log(stat('cyan', skipped, 'pending'));
	}
	if (failed) {
		process.exitCode = 1;
		console.log(stat('red', failed, 'failing'));
	}
	if (reporter !== 'spec' && completed > total) {
		console.error(stat('red', `${completed} / ${total}`, 'completed'));
	}
	console.log();
	if (coverage) {
		const {files: f, totals: {coveredBranchPercent, coveredFunctionPercent, coveredLinePercent}} = coverage,
			l = Math.max(8, ...f.map(({path: p}) => path.relative(cwd, p).length)) + 2,
			border = `${'-'.repeat(l)}|----------|---------|---------|`;
		console.log(
			`${border}
${'File'.padEnd(l)}| % Branch | % Funcs | % Lines |
${border}
${
	greenBold([
		'All files'.padEnd(l),
		pad(coveredBranchPercent, 9),
		pad(coveredFunctionPercent),
		pad(coveredLinePercent),
	])
	}
${
	f.map(
		({path: p, coveredBranchPercent: cb, coveredFunctionPercent: cf, coveredLinePercent: cl}) =>
			greenBold([` ${path.relative(cwd, p).padEnd(l - 1)}`, pad(cb, 9), pad(cf), pad(cl)]),
	).join('\n')
	}
${border}
`,
		);
	}
	for (const [file, stderr] of stderrs) {
		console.error(` Exception during run: ${file}\n${stderr}`);
	}
	for (let i = 0; i < failures.length; i++) {
		const {paths, error: {stack, message, cause}} = failures[i]!,
			prefix = `  ${i + 1}) `;
		let {length} = prefix;
		console.log(`${prefix}${paths.pop()}`);
		while (paths.length > 0) {
			length += 2;
			console.log(' '.repeat(length) + paths.pop());
		}
		console.error(
			' '.repeat(5) + (
				stack
					? stack.split('\n')
						.filter(line => {
							if (!isTrace(line)) {
								return true;
							}
							const j = line.indexOf('(');
							return j === -1 || /^(?:\/|file:\/{2})/u.test(line.charAt(j + 1));
						})
						.map((line, k) => {
							if (isTrace(line)) {
								const j = line.indexOf('(');
								return styleText(
									'dim',
									j !== -1 && line.slice(j + 1).startsWith(cwd)
										? line.slice(0, j + 1) + line.slice(j + cwd.length + 2)
										: line,
								);
							}
							return k === 0 ? red(line) : line;
						})
						.join('\n')
					: red(message)
			),
		);
		if (typeof cause === 'object' && cause !== null && 'message' in cause) {
			console.error(gray(`     Caused by:${
				(cause as {message: string}).message.replaceAll('\n', '\n  ')
			}`));
		}
		console.log();
	}
})();
