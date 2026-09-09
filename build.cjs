'use strict';

const fs = require('fs'),
	esbuild = require('esbuild'),
	{version} = require('./package.json'),
	tests = require('wikiparser-node/test/parserTests.json');

esbuild.buildSync({
	entryPoints: ['src/index.ts'],
	charset: 'utf8',
	target: 'esnext',
	format: 'esm',
	define: {
		$VERSION: JSON.stringify(version),
	},
	outfile: 'dist/index.js',
	logLevel: 'info',
});

fs.writeFileSync('parserTests.json', JSON.stringify(tests.map(({desc, wikitext}) => ({desc, wikitext}))));
