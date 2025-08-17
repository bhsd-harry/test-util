declare interface StartData {
	name: string;
	nesting: number;
}
declare interface CompleteData extends StartData {
	details: {
		passed: boolean;
		duration_ms: number;
	};
}
declare interface FailData extends StartData {
	details: {
		error: Error & {cause: Error};
	};
}
declare interface SummaryData {
	counts: {
		passed: number;
		failed: number;
		skipped: number;
	};
	duration_ms: number;
	file: string;
}
declare type Data = CompleteData | StartData | FailData | SummaryData;

const getColoredStr = (color: number, str: string): string => `\x1b[${color}m${str}\x1b[0m`;
const ms = 75,
	f = getColoredStr(31, '!'),
	slow = getColoredStr(93, '.'),
	medium = getColoredStr(33, '.'),
	fast = getColoredStr(90, '.');

// eslint-disable-next-line jsdoc/require-jsdoc
export = async function*(source: AsyncIterable<Event & {data: Data}>): AsyncGenerator {
	let output = '',
		cur = '',
		pass = 0,
		fail = 0;
	for await (const {type, data} of source) {
		switch (type) {
			case 'test:complete': {
				const {nesting, details: {passed, duration_ms: duration}} = data as CompleteData;
				let symbol;
				if (!passed) {
					symbol = f;
				} else if (duration > ms) {
					symbol = slow;
				} else {
					symbol = duration > ms / 2 ? medium : fast;
				}
				yield nesting === 0 ? '' : (pass++ === 0 ? '\n\n  ' : '') + symbol;
				break;
			}
			case 'test:start': {
				const {nesting, name} = data as StartData;
				if (nesting === 0) {
					cur = name;
				}
				yield '';
				break;
			}
			case 'test:fail': {
				const {nesting, name, details: {error}} = data as FailData;
				if (nesting > 0) {
					output += `  ${++fail}) ${cur}\n`;
					const indent = ' '.repeat(String(fail).length + 4);
					output += `${indent}  ${name}\n${indent}${error.cause.stack}\n\n`;
				}
				yield '';
				break;
			}
			case 'test:summary': {
				const {counts: {passed, failed, skipped}, duration_ms: duration, file} = data as SummaryData;
				if (!file) {
					const passing = getColoredStr(32, `\n  ${passed} passing`),
						time = getColoredStr(90, `(${Math.round(duration)}ms)`),
						pending = skipped ? getColoredStr(36, `\n  ${skipped} pending`) : '',
						failing = failed ? getColoredStr(31, `\n  ${failed} failing`) : '';
					yield ` \n${passing} ${time}${pending}${failing}\n\n${output}`;
				}
			}
			// no default
		}
	}
};
