#!/usr/bin/env node
/**
 * 低语诸王大典锚句校验（scripts/verify-world-bible-anchors.mts）。
 *
 * 第二版（2026-11-17）：中英成对文件逐章核对。
 * 目录约定：`NNN-<title>.md` 为中文正典，`NNN-<title>.en.md` 为其英文译本；
 * 两个文件都按章自带中英两对锚句标记，此处按文件分别统计。
 *
 * 判据：
 *   1. 每个中文锚句在中文正典文件里恰好出现一次；
 *   2. 每个英文锚句在英文译本文件里恰好出现一次；
 *   3. 每章中文、英文锚句数量一致；
 *   4. 每章中文、英文锚句数量各 ≥ 4；
 *   5. 每章都得有英文译本（`NNN-*.en.md`）；
 *   6. 中文正典里出现的英文锚句标记不被计数（仅统计正典文件），语言对不交叉。
 *
 * 退出码：0 = 全部通过；1 = 有任一判据红。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BIBLE_DIR = join(process.cwd(), 'docs', 'world-bible');
const anchorZhRe = /^\*\*锚句\*\*[:：]?\s*(.+)$/;
const anchorEnRe = /^\*\*Anchor sentence\*\*[:：]?\s*(.+)$/;

let failures = 0;

const files = readdirSync(BIBLE_DIR).filter((f) => f.endsWith('.md'));
if (files.length === 0) {
  console.error('world-bible 目录里没有任何 .md 文件');
  process.exit(1);
}

const zhFiles = files.filter((f) => !f.endsWith('.en.md'));
const enFiles = files.filter((f) => f.endsWith('.en.md'));
const zhSet = new Set(zhFiles);
const enSet = new Set(enFiles);
const fileLines = new Map<string, string[]>();
for (const f of files) {
  fileLines.set(f, readFileSync(join(BIBLE_DIR, f), 'utf8').split(/\r?\n/));
}
const linesOf = (f: string) => fileLines.get(f)!;

/** @type {Map<string, { file: string; line: number }>} */
const zhAnchors = new Map();
/** @type {Map<string, { file: string; line: number }>} */
const enAnchors = new Map();

for (const f of zhFiles) {
  const lines = linesOf(f);
  for (let i = 0; i < lines.length; i++) {
    const m = anchorZhRe.exec(lines[i]!);
    if (!m) continue;
    const text = m[1]!.trim();
    if (zhAnchors.has(text)) {
      console.error(`✗ 中文锚句重复出现（${f}:${i + 1}）: ${text}`);
      failures++;
    } else {
      zhAnchors.set(text, { file: f, line: i + 1 });
    }
  }
}

for (const f of enFiles) {
  const lines = linesOf(f);
  for (let i = 0; i < lines.length; i++) {
    const m = anchorEnRe.exec(lines[i]!);
    if (!m) continue;
    const text = m[1]!.trim();
    if (enAnchors.has(text)) {
      console.error(`✗ English anchor repeated (${f}:${i + 1}): ${text}`);
      failures++;
    } else {
      enAnchors.set(text, { file: f, line: i + 1 });
    }
  }
}

// 逐章配对 + 每章锚句计数
for (const zh of zhFiles) {
  const en = zh.replace(/\.md$/, '.en.md');
  const zhCount = linesOf(zh).filter((l) => l.startsWith('**锚句**')).length;
  if (zhCount < 4) { console.error(`✗ ${zh}: 中文锚句只有 ${zhCount} 个（≥4）`); failures++; }
  if (!enSet.has(en)) {
    console.error(`✗ ${zh} 缺少英文译本 ${en}`);
    failures++;
    continue;
  }
  const enCount = linesOf(en).filter((l) => l.startsWith('**Anchor sentence**')).length;
  if (enCount < 4) { console.error(`✗ ${en}: English anchors only ${enCount} (≥4)`); failures++; }
  if (zhCount !== enCount) { console.error(`✗ ${zh} ↔ ${en}: 锚句数量不一致 (${zhCount} vs ${enCount})`); failures++; }
}

// 英文译本多余告警（无对应中文正典）
for (const en of enFiles) {
  const zh = en.replace(/\.en\.md$/, '.md');
  if (!zhSet.has(zh)) console.error(`✗ ${en} 没有对应的中文章（${zh}）`);
  if (!zhSet.has(zh)) failures++;
}

console.log(`world-bible 锚句校验：${zhFiles.length} 个中文章（+${enFiles.length} 个英文译本），zh 锚句 ${zhAnchors.size}，en 锚句 ${enAnchors.size}`);
if (failures > 0) {
  console.error(`✗ 共 ${failures} 项未通过`);
  process.exit(1);
}
console.log('✓ 全部通过');
