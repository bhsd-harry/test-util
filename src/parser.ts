import fs from 'fs';
import assert from 'assert';
import {describe, it, before, after, prepare} from './mocha.js';
import tests from '../parserTests.json' with {type: 'json'};
import type {Func, AsyncFunc} from 'mocha';

export interface Test {
	desc: string;
	title?: string | undefined;
	wikitext?: string;
	parsed?: string;
	html?: string;
	print?: string;
	render?: string;
}
declare type TestResult = Pick<Test, 'desc' | 'wikitext' | 'parsed'>;

export const split = (str?: string): string[] | undefined =>
	str?.split(/(?<=<\/[^>]*>)(?!$)|(?<!^)(?=<(?!\/))/u);

export const mochaTest = (results: unknown, parse: (wikitext: string) => string, beforeFn?: Func | AsyncFunc): void => {
	void describe('Parser tests', () => {
		const copy = [...tests] as Test[];
		if (process.argv[2] === 'skip') {
			prepare(copy.filter(({wikitext}) => wikitext).length);
		} else {
			for (let i = copy.length - 1; i >= 0; i--) {
				const t = copy[i]!,
					{wikitext, desc} = t;
				if (wikitext) {
					it(desc, () => {
						try {
							const rest = {desc, wikitext, parsed: parse(wikitext)};
							copy[i] = rest;
							assert.deepStrictEqual(
								split(rest.parsed),
								split((results as TestResult[]).find(({desc: d}) => d === desc)?.parsed),
							);
						} catch (e) {
							if (!(e instanceof assert.AssertionError)) {
								copy.splice(i, 1);
							}
							if (e instanceof Error) {
								Object.assign(e, {cause: {message: `\n${wikitext}`}});
							}
							throw e;
						}
					});
				}
			}
			if (beforeFn) {
				before(beforeFn as Func);
			}
			after(() => {
				fs.writeFileSync(
					'test/parserTests.json',
					`${JSON.stringify(copy, null, '\t')}\n`,
				);
			});
		}
	});
};

