import {suite, test, beforeEach as bE, before as b, afterEach as aE, after as a} from 'node:test';
import type {TestFn} from 'node:test';
import type {SuiteFunction, TestFunction, HookFunction, Hook} from 'mocha';

const isSkip = process.argv[2] === 'skip',
	// @ts-expect-error missing properties
	myIt: typeof test = isSkip ? (name: string, fn: TestFn): Promise<void> => test.skip(name, fn) : test,
	noop = (): void => {},
	myBeforeForEach: typeof bE = isSkip ? noop : bE,
	myBefore: typeof b = isSkip ? noop : b,
	myAfterForEach: typeof aE = isSkip ? noop : aE,
	myAfter: typeof a = isSkip ? noop : a;
myIt.skip = test.skip;

export const {describe, it, beforeEach, before, afterEach, after} = typeof globalThis.it === 'function'
	? globalThis
	: {
		/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
		describe: suite as unknown as SuiteFunction,
		it: myIt as unknown as TestFunction,
		beforeEach: myBeforeForEach as unknown as HookFunction<Hook>,
		before: myBefore as unknown as HookFunction<Hook>,
		afterEach: myAfterForEach as unknown as HookFunction<Hook>,
		after: myAfter as unknown as HookFunction<Hook>,
		/* eslint-enable @typescript-eslint/no-unnecessary-type-assertion */
	};

export const prepare = (n: number): void => {
	void test.skip(`@bhsd/test-util:${n}`);
};
