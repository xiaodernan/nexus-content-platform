#!/usr/bin/env node
/**
 * ──BIBLE-MARGINS · 正典「页边批注」生成器（2026-11-22）──
 *
 * 回响文件里以 `> 页边：`（zh）/ `> Margin:`（en）开头的行，是抄本师写在页边的话——
 * 不属于正文、不参与锚句、不进名册。把它们收成一本薄册子，给 `/bible/margins` 读。
 *
 * 纪律（与 gen-anchor-echo 同谱系）：
 *  1. 逐字来自正典文件，不改写、不拼接；中英按文件一一对应，缺一侧即失败。
 *  2. 生成结果可验证：本脚本重放 + 逐字节比对（verify:margins 由 bible-snapshot 的
 *     `ECHO_WEB_SLUGS` 同源 slug 保证，页边只挂回响，不挂正章）。
 *  3. 顺序 = 回响编号升序（E01…E212），同文件内按出现次序。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BIBLE_DIR = join(ROOT, 'docs', 'world-bible');
const ECHOES_DIR = join(BIBLE_DIR, 'echoes');
const OUT = join(ROOT, 'apps', 'web', 'src', 'world-bible', 'margins.generated.ts');

// 回响的网页 slug 与 gen-bible-snapshot.mts 同源（一份真值，两处消费）：
// 从那边导出而不是再抄一张表，否则两条表一漂移，页边就指向一个不存在的页面。
const SLUG_SOURCE = readFileSync(join(ROOT, 'scripts', 'gen-bible-snapshot.mts'), 'utf8');
const slugBlock = /const ECHO_WEB_SLUGS: Record<string, string> = \{([\s\S]*?)\n\};/.exec(SLUG_SOURCE);
if (!slugBlock) throw new Error('在 gen-bible-snapshot.mts 里找不到 ECHO_WEB_SLUGS');
const ECHO_WEB_SLUGS: Record<string, string> = {};
for (const line of slugBlock[1]!.split('\n')) {
  const m = /'([^']+)':\s*'([^']+)'/.exec(line.trim());
  if (m) ECHO_WEB_SLUGS[m[1]!] = m[2]!;
}

const zhRe = /^>\s*页边[:：]\s*(.+)$/;
const enRe = /^>\s*Margin[:：]\s*(.+)$/;

function marginsOf(file: string, re: RegExp): string[] {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => re.exec(line)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

/** 回响首行标题（「」内是中文题，英文译本取冒号后那段）——与 gen-bible-snapshot 同一条解析规则。 */
function titlesOf(zhFile: string, enFile: string): { titleZh: string; titleEn: string } {
  const zhLines = readFileSync(zhFile, 'utf8').split(/\r?\n/);
  const enLines = readFileSync(enFile, 'utf8').split(/\r?\n/);
  const zhMatch = /「(.+?)」/.exec(zhLines[0] ?? '');
  const enLine = enLines[0] ?? '';
  const cut = enLine.lastIndexOf(': ');
  if (!zhMatch || cut < 0) throw new Error(`无法解析回响标题：${zhFile}`);
  return { titleZh: zhMatch[1]!, titleEn: enLine.slice(cut + 2).trim() };
}

const echoFiles = readdirSync(ECHOES_DIR)
  .filter((f) => /^E\d{2,3}-.+\.md$/.test(f) && !f.endsWith('.en.md'))
  .sort();

const rows: { echo: string; slug: string; titleZh: string; titleEn: string; zh: string; en: string }[] = [];
for (const zhName of echoFiles) {
  const enName = zhName.replace(/\.md$/, '.en.md');
  if (!existsSync(join(ECHOES_DIR, enName))) throw new Error(`缺英文译本 ${enName}`);
  const zh = marginsOf(join(ECHOES_DIR, zhName), zhRe);
  const en = marginsOf(join(ECHOES_DIR, enName), enRe);
  if (zh.length !== en.length) {
    throw new Error(`${zhName} / ${enName} 页边数量不一致（${zh.length} vs ${en.length}）`);
  }
  const webSlug = ECHO_WEB_SLUGS[zhName.replace(/\.md$/, '')];
  if (!webSlug) {
    throw new Error(`${zhName} 有页边但没有登记网页 slug（先在 gen-bible-snapshot.mts 的 ECHO_WEB_SLUGS 里补一行）`);
  }
  const slug = `/bible/${webSlug}`;
  const titles = titlesOf(join(ECHOES_DIR, zhName), join(ECHOES_DIR, enName));
  for (let i = 0; i < zh.length; i += 1) {
    rows.push({
      echo: zhName.replace(/\.md$/, ''),
      slug,
      titleZh: titles.titleZh,
      titleEn: titles.titleEn,
      zh: zh[i]!,
      en: en[i]!,
    });
  }
}

const header = `// 由 scripts/gen-margins.mts 生成；请勿手改（重跑本脚本并逐字节比对）
// docs/world-bible/echoes/ 里以「> 页边：」开头的行是唯一真值

export interface BibleMargin {
  /** 这条页边所属的回响文件名（不含 .md） */
  readonly echo: string;
  /** 回响在典籍室里的地址 */
  readonly slug: string;
  /** 该回响的题名（中英各一，逐字来自文件首行） */
  readonly titleZh: string;
  readonly titleEn: string;
  readonly zh: string;
  readonly en: string;
}

/** 页边批注：逐字来自正典文件，顺序 = 回响编号升序。 */
export const BIBLE_MARGINS: readonly BibleMargin[] = ${JSON.stringify(rows, null, 2)} as const;
`;

writeFileSync(OUT, header);
console.log(`generated ${OUT} · ${rows.length} 条页边（中英成对）`);
