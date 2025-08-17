'use strict';

const esbuild = require('esbuild'),
	{version} = require('./package.json');

esbuild.buildSync({
	entryPoints: ['src/index.ts'],
	charset: 'utf8',
	target: 'es2024',
	format: 'cjs',
	define: {
		$VERSION: JSON.stringify(version),
	},
	outfile: 'dist/index.js',
	logLevel: 'info',
});

esbuild.buildSync({
	entryPoints: ['src/reporter.ts', 'src/import.ts'],
	charset: 'utf8',
	target: 'es2023',
	format: 'cjs',
	outdir: '.',
	logLevel: 'info',
});
