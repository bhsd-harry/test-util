#!/usr/bin/env node
import {styleText} from 'util';
import readline from 'readline';
import {finished} from 'stream/promises';
import {run} from 'node:test';
import {red, gray} from '@bhsd/nodejs';
import type {InspectColor} from 'util';
import type {TestsStream, EventData, RunOptions} from 'node:test';

const args = process.argv.slice(2),
	files = args.filter(arg => !arg.startsWith('-')),
	execArgv = args.filter(arg => arg.startsWith('-')),
	cwd = process.cwd(),
	width = Math.round(process.stdout.columns / 2) - 1;

const endStream = async (stream: TestsStream): Promise<void> => {
	stream.resume();
	await finished(stream, {cleanup: true});
};

const stat = (color: InspectColor, count: number | string, label: string): string =>
	`  ${styleText(color, `${count} ${label}`)}`;

const isTrace = (line: string): boolean => line.trim().startsWith('at ');

const rewrite = (line: string): void => {
	readline.clearLine(process.stdout, 0);
	readline.cursorTo(process.stdout, 0);
	process.stdout.write(line);
};

(async () => {
	// 1. Count the total number of atomic tests that will be run
	let total = 0;
	const renderProgress = (): void => {
		rewrite(`  ${gray(`Preparing tests: ${total}`)}`);
	};
	const opts: RunOptions = {files, concurrency: true, execArgv},
		pre = '@bhsd/test-util:',
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
	console.log();

	// 2. Run the tests and track progress
	let completed = 0,
		passed = 0,
		skipped = 0,
		failed = 0;
	const renderProgressBar = (): void => {
		const percent = total === 0 ? 1 : Math.min(1, completed / total);
		rewrite(`  ${gray('[')}${
			'▬'.repeat(Math.round(percent * width)).padEnd(width, '.')
		}${gray(']')}`);
	};
	const failures: {path: string[], error: Error}[] = [],
		registry = new Map<string, {name: string, parentId: number | undefined}>(),
		start = performance.now(),
		testStream = run({
			...opts,
			setup(stream) {
				stream.on(
					'test:start',
					({file = '', name, testId, parentId}: EventData.TestStart & {parentId?: number}) => {
						registry.set(`${file}-${testId}`, {name, parentId});
					},
				).on(
					'test:complete',
					({
						details: {type, passed: p, error},
						skip,
						name,
						file = '',
						parentId,
					}: EventData.TestComplete & {parentId?: number}) => {
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
								const path = [name];
								while (parentId !== undefined) {
									const entry = registry.get(`${file}-${parentId}`);
									if (!entry) {
										break;
									}
									path.push(entry.name);
									({parentId} = entry); // eslint-disable-line no-param-reassign
								}
								failures.push({
									path,
									error: error!.cause instanceof Error ? error!.cause : error!,
								});
							}
						}
					},
				);
			},
		}),
		renderer = setInterval(renderProgressBar, 50);
	await endStream(testStream);
	renderProgressBar();
	clearInterval(renderer);
	const elapsed = performance.now() - start;
	let seconds: string;
	if (elapsed < 1e3) {
		seconds = `${Math.round(elapsed)}ms`;
	} else if (elapsed < 9e4) {
		seconds = `${Math.round(elapsed / 1e3)}s`;
	} else {
		seconds = `${Math.round(elapsed / 6e4)}m`;
	}

	// 3. Log the results
	console.log(`\n\n${stat('green', passed, 'passing')} ${gray(`(${seconds})`)}`);
	if (skipped) {
		console.log(stat('cyan', skipped, 'pending'));
	}
	if (failed) {
		process.exitCode = 1;
		console.log(stat('red', failed, 'failing'));
	}
	if (completed > total) {
		console.error(stat('red', `${completed}/${total}`, 'completed'));
	}
	console.log();
	for (let i = 0; i < failures.length; i++) {
		const {path, error: {stack, message, cause}} = failures[i]!,
			prefix = `  ${i + 1}) `;
		let {length} = prefix;
		console.log(`${prefix}${path.pop()}`);
		while (path.length > 0) {
			length += 2;
			console.log(' '.repeat(length) + path.pop());
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
