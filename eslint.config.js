import {jsDoc, node, extend} from '@bhsd/code-standard';

const config = extend(
	'module',
	jsDoc,
	...node,
	{
		ignores: ['parserTests.json'],
	},
	{
		files: ['src/bin.ts'],
		rules: {
			'n/hashbang': 0,
		},
	},
);

export default config;
