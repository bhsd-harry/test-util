import {jsDoc, node, extend} from '@bhsd/code-standard';

export default extend(
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
