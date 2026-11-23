#!/usr/bin/env node
/**
 * ──BIBLE-ANCHOR-ECHO · 锚句回放数据生成器（cont. 181）──
 *
 * 从 docs/world-bible/**\/ 里解析全部 锚句 / Anchor sentence 对，生成
 *   apps/web/src/world-bible/anchors.generated.ts
 * 供 `/bible/anchors` 锚句回放游戏使用（读正典、背正典、选对出处）。
 *
 * 纪律：
 *  1. 锚句逐字来自正典文件，不改写、不拼接；每条都带上它属于哪一章/哪一回响 + 第几节。
 *  2. 生成结果可验证：`verify:anchor-echo` 会重放本脚本并逐字节比对，不一致即失败。
 *  3. 中英必须一一对应（顺序即绑定），文件缺英文即失败。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BIBLE_DIR = join(ROOT, 'docs', 'world-bible');
const ECHOES_DIR = join(BIBLE_DIR, 'echoes');
const OUT = join(ROOT, 'apps', 'web', 'src', 'world-bible', 'anchors.generated.ts');

const ZH_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const zhRe = /^\*\*锚句\*\*[:：]?\s*(.+)$/;
const enRe = /^\*\*Anchor sentence\*\*[:：]?\s*(.+)$/;

function pairFor(zhFile: string, enFile: string, refZh: string, refEn: string) {
  const zhLines = readFileSync(zhFile, 'utf8').split(/\r?\n/);
  const enLines = readFileSync(enFile, 'utf8').split(/\r?\n/);
  const zhAnchors = zhLines.map((l) => zhRe.exec(l)?.[1]?.trim()).filter(Boolean) as string[];
  const enAnchors = enLines.map((l) => enRe.exec(l)?.[1]?.trim()).filter(Boolean) as string[];
  if (zhAnchors.length !== enAnchors.length) {
    throw new Error(`${zhFile} / ${enFile} 锚句数量不一致（${zhAnchors.length} vs ${enAnchors.length}）`);
  }
  return zhAnchors.map((zh, i) => ({
    zh,
    en: enAnchors[i]!,
    refZh: `${refZh} · ${ZH_NUM[i] ?? String(i + 1)}`,
    refEn: `${refEn} · ${ROMAN[i] ?? String(i + 1)}`,
  }));
}

const out: { zh: string; en: string; refZh: string; refEn: string }[] = [];

// ── 正章：NNN-*.md
const chapterFiles = readdirSync(BIBLE_DIR).filter((f) => /^\d{3}-.+\.md$/.test(f) && !f.endsWith('.en.md')).sort();
for (const zhName of chapterFiles) {
  const enName = zhName.replace(/\.md$/, '.en.md');
  if (!existsSync(join(BIBLE_DIR, enName))) throw new Error(`缺英文译本 ${enName}`);
  const n = parseInt(zhName.slice(0, 3), 10);
  const zhNum = ZH_NUM[n - 1] ?? String(n);
  const roman = ROMAN[n - 1] ?? String(n);
  out.push(...pairFor(join(BIBLE_DIR, zhName), join(BIBLE_DIR, enName), `第${zhNum}章`, `Chapter ${roman}`));
}
// ── 回响：E0N-*.md（E100 起是三位编号；旧正则只认两位，2026-11-22 实测把 E100–E218 整段漏在门外）
const echoFiles = readdirSync(ECHOES_DIR).filter((f) => /^E\d{2,3}-.+\.md$/.test(f) && !f.endsWith('.en.md')).sort();
for (const zhName of echoFiles) {
  const enName = zhName.replace(/\.md$/, '.en.md');
  if (!existsSync(join(ECHOES_DIR, enName))) throw new Error(`缺英文译本 ${enName}`);
  const n = Number(/^E(\d{2,3})-/.exec(zhName)![1]);
  const zhNum = ZH_NUM[n - 1] ?? String(n);
  out.push(...pairFor(join(ECHOES_DIR, zhName), join(ECHOES_DIR, enName), `回响（其${zhNum}）`, `Echo No. ${n}`));
}

const header = `// 由 scripts/gen-anchor-echo.mts 生成；请勿手改（npm run verify:anchor-echo 验证一致）
// docs/world-bible/ 是唯一真值

export interface BibleAnchor {
  readonly zh: string;
  readonly en: string;
  readonly refZh: string;
  readonly refEn: string;
}

export const BIBLE_ANCHORS: readonly BibleAnchor[] = ${JSON.stringify(out, null, 2)} as const;
`;

if (process.argv.includes('--check')) {
  const existing = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (existing !== header) {
    console.error('verify:anchor-echo FAIL —— anchors.generated.ts 与 docs/world-bible/ 不一致，请 npm run gen:anchor-echo');
    process.exit(1);
  }
  console.log(`verify:anchor-echo OK · ${out.length} 锚句（中英成对）`);
  process.exit(0);
}

writeFileSync(OUT, header, 'utf8');
console.log(`generated ${OUT} · ${out.length} 锚句（中英成对）`);
