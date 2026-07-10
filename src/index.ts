import fs from 'fs';
import {execSync} from 'child_process';
import {refreshStdout, red} from '@bhsd/nodejs';
import type {EventData} from 'node:test';

declare const $VERSION: string;
declare interface MediaWikiPage {
	readonly pageid: number;
	readonly title: string;
	readonly ns: number;
	readonly revisions?: {
		readonly content: string;
		readonly contentmodel: string;
	}[];
}
declare interface MediaWikiResponse {
	readonly query: {
		readonly pages: MediaWikiPage[];
	};
	readonly continue?: Record<string, string>;
}
export interface SimplePage extends Pick<MediaWikiPage, 'pageid' | 'title' | 'ns'> {
	readonly content: string;
}

declare interface Coverage {
	total: {
		statements: {
			pct: number;
		};
	};
}

export interface ApiOptions {
	site?: string | undefined;
	grclimit?: string | undefined;
	grcnamespace?: string | undefined;
	contentmodel?: string | undefined;
}

export const apis: [string, string][] = [
	['维基百科', 'https://zh.wikipedia.org/w'],
	['Wikipedia', 'https://en.wikipedia.org/w'],
	['ウィキペディア', 'https://ja.wikipedia.org/w'],
];

let c: Record<string, string> | undefined;

/**
 * 获取最近更改的页面源代码
 * @param url api.php网址
 * @param opt 选项
 * @param opt.site 站点名称
 * @param opt.grclimit 页面数上限
 * @param opt.grcnamespace 命名空间
 * @param opt.contentmodel 内容模型
 */
export const getPages = async (
	url: string,
	{
		site,
		grclimit = 'max',
		grcnamespace = site === 'MediaWiki' ? '0|10|12|100|102|104|106' : '0|10',
		contentmodel = 'wikitext',
	}: ApiOptions,
): Promise<SimplePage[]> => {
	const qs = {
			action: 'query',
			format: 'json',
			formatversion: '2',
			errorformat: 'plaintext',
			generator: 'recentchanges',
			grcnamespace,
			grclimit,
			grctype: 'edit|new',
			grctoponly: '1',
			prop: 'revisions',
			rvprop: 'contentmodel|content',
			...c,
		},
		response: MediaWikiResponse = await (await fetch(`${url}?${String(new URLSearchParams(qs))}`, {
			headers: {
				'User-Agent': `@bhsd/test-util/${$VERSION} (https://www.npmjs.com/package/@bhsd/test-util; ${
					execSync('git config user.email', {encoding: 'utf8'}).trim()
				}) Node.js/${process.version}`,
			},
		})).json();
	c = response.continue; // eslint-disable-line require-atomic-updates
	return response.query.pages.filter(({revisions}) => {
		const revision = revisions?.[0];
		return (!contentmodel || revision?.contentmodel === contentmodel) && Boolean(revision?.content);
	}).map(({pageid, title, ns, revisions}): SimplePage => ({
		pageid,
		title,
		ns,
		content: revisions![0]!.content,
	}));
};

/** 重置请求 */
export const reset = (): void => {
	c = undefined;
};

/**
 * 执行解析测试
 * @param parse 解析函数
 * @param opt 选项
 * @param sites 站点列表
 */
export const execute = async (
	parse: (wikitext: string, title: string) => unknown,
	opt?: Omit<ApiOptions, 'site'>,
	sites = apis,
): Promise<void> => {
	const failures = new Map<string, number>();
	for (const [site, url] of sites) {
		console.log(`开始检查${site}：`);
		let worst: {title: string, duration: number} | undefined;
		reset();
		try {
			let failed = 0,
				i = 0;
			for (let j = 0; j < 10; j++) {
				for (const {content, title} of await getPages(`${url}/api.php`, {...opt, site})) {
					refreshStdout(`${++i} ${title}`);
					try {
						const start = performance.now();
						parse(content, title);
						const duration = performance.now() - start;
						if (!worst || duration > worst.duration) {
							worst = {title, duration};
						}
					} catch (e) {
						console.error(red(`\n解析 ${title} 页面时出错！`));
						console.error(e);
						failed++;
					}
				}
			}
			if (failed) {
				failures.set(site, failed);
			}
			console.log(`\n最耗时页面：${worst!.title} (${worst!.duration.toFixed(3)}ms)`);
		} catch (e) {
			console.error(red(`访问${site}的API端口时出错！`));
			console.error(e);
		}
	}
	if (failures.size > 0) {
		let total = 0;
		for (const [site, failed] of failures) {
			console.error(red(`${site}：${failed} 个页面解析失败！`));
			total += failed;
		}
		throw new Error(`共有 ${total} 个页面解析失败！`);
	}
};

export const updateBadge = (): void => {
	let pct: number;
	if (fs.existsSync('coverage/coverage.json')) {
		pct = (JSON.parse(
			fs.readFileSync('coverage/coverage.json', 'utf8'),
		) as EventData.TestCoverage['summary']).totals.coveredLinePercent;
	} else {
		({pct} = (JSON.parse(
			fs.readFileSync('coverage/coverage-summary.json', 'utf8'),
		) as Coverage).total.statements);
	}
	const colors = ['#4c1', '#dfb317', '#e05d44'] as const;
	let color: string;
	if (pct >= 80) {
		[color] = colors;
	} else if (pct >= 60) {
		[, color] = colors;
	} else {
		[,, color] = colors;
	}
	fs.writeFileSync(
		'coverage/badge.svg',
		fs.readFileSync('coverage/badge.svg', 'utf8').replaceAll(
			new RegExp(String.raw`(?:${colors.join('|')})\b|\b\d{2}(?=%)`, 'gu'),
			m => m.startsWith('#') ? color : String(Math.round(pct)),
		),
	);
};

export const findUncoveredBlocks = (input: string, output: string, file: string, threshold = 20): void => {
	const {files}: EventData.TestCoverage['summary'] = JSON.parse(fs.readFileSync(input, 'utf8')),
		filePath = fs.realpathSync(file),
		coverage = files.find(({path}) => path === filePath);
	if (!coverage) {
		throw new RangeError(`未找到文件 ${filePath} 的覆盖率数据！`);
	}
	const uncovered = coverage.lines.filter(({count}) => count === 0).map(({line}) => line),
		uncoveredBlocks: string[] = [];
	for (let i = 0, j = 0, start = uncovered[0]!; i < uncovered.length; i++) {
		const line = uncovered[i]!,
			count = i - j;
		if (line - start > count) {
			if (count >= threshold) {
				uncoveredBlocks.push(`${start}-${start + count - 1}`);
			}
			j = i;
			start = line;
		}
	}
	fs.writeFileSync(output, uncoveredBlocks.join('\n'));
};
