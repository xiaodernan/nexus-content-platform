#!/usr/bin/env node
/**
 * 低语诸王大典锚句校验（scripts/verify-world-bible-anchors.mts）。
 *
 * 第三版（2026-11-17）：正典（主线） + 回响（echoes/）同一套纪律、同一套判据，跨目录唯一性。
 *
 * 目录约定：
 *   `docs/world-bible/NNN-<title>.md`      —— 中文主线正典
 *   `docs/world-bible/NNN-<title>.en.md`   —— 英文译本
 *   `docs/world-bible/echoes/E0N-<title>.md`    —— 中文回响
 *   `docs/world-bible/echoes/E0N-<title>.en.md` —— 回响英文译本
 *
 * 判据：
 *   1. 锚句恰好在自己的锚标记行里出现一次；
 *   2. 每章/每篇中、英锚句数量一致；
 *   3. 单篇锚句数量各 ≥ 4；
 *   4. 每篇都有英文译本；
 *   5. **跨主线与回响全局唯一**——同一句不得在两个文件里出现（包括同位的两份译本）。
 *
 * 退出码：0 = 全部通过；1 = 有任一判据红。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const anchorZhRe = /^\*\*锚句\*\*[:：]?\s*(.+)$/;
const anchorEnRe = /^\*\*Anchor sentence\*\*[:：]?\s*(.+)$/;

let failures = 0;
/** @type {Map<string, { file: string; line: number }>} */
const zhAnchors = new Map();
/** @type {Map<string, { file: string; line: number }>} */
const enAnchors = new Map();

function collect(dir: string, label: string): void {
  if (!existsSync(dir)) {
    if (label === 'echoes') console.log('（没有回响目录，跳过 echoes 校验）');
    return;
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'))
    .filter((f) => f !== 'README.md' && f !== 'README.en.md');
  if (files.length === 0) {
    console.log(`（${label} 目录为空，跳过）`);
    return;
  }
  const zhFiles = files.filter((f) => !f.endsWith('.en.md')).sort();
  const enFiles = files.filter((f) => f.endsWith('.en.md')).sort();
  const enSet = new Set(enFiles);
  const zhSet = new Set(zhFiles);
  const fileLines = new Map<string, string[]>();

  for (const f of files) {
    fileLines.set(f, readFileSync(join(dir, f), 'utf8').split(/\r?\n/));
  }
  const linesOf = (f: string) => fileLines.get(f)!;

  for (const f of zhFiles) {
    const lines = linesOf(f);
    for (let i = 0; i < lines.length; i++) {
      const m = anchorZhRe.exec(lines[i]!);
      if (!m) continue;
      const text = m[1]!.trim();
      if (zhAnchors.has(text)) {
        console.error(`✗ 中文锚句跨文件重复（${f}:${i + 1} vs ${zhAnchors.get(text)!.file}:${zhAnchors.get(text)!.line}）: ${text}`);
        failures++;
      } else {
        zhAnchors.set(text, { file: f, line: i + 1 });
      }
    }
    const en = f.replace(/\.md$/, '.en.md');
    if (!enSet.has(en)) {
      console.error(`✗ ${label}/${f} 缺少英文译本 ${en}`);
      failures++;
      continue;
    }
    const zhCount = lines.filter((l) => l.startsWith('**锚句**')).length;
    const enCount = linesOf(en).filter((l) => l.startsWith('**Anchor sentence**')).length;
    if (zhCount < 4) { console.error(`✗ ${label}/${f}: 中文锚句只有 ${zhCount} 个（≥4）`); failures++; }
    if (zhCount !== enCount) { console.error(`✗ ${label}/${f} ↔ ${en}: 锚句数量不一致 (${zhCount} vs ${enCount})`); failures++; }
  }
  for (const f of enFiles) {
    const lines = linesOf(f);
    for (let i = 0; i < lines.length; i++) {
      const m = anchorEnRe.exec(lines[i]!);
      if (!m) continue;
      const text = m[1]!.trim();
      if (enAnchors.has(text)) {
        console.error(`✗ English anchor repeated (${f}:${i + 1} vs ${enAnchors.get(text)!.file}:${enAnchors.get(text)!.line}): ${text}`);
        failures++;
      } else {
        enAnchors.set(text, { file: f, line: i + 1 });
      }
    }
    const zh = f.replace(/\.en\.md$/, '.md');
    if (!zhSet.has(zh)) { console.error(`✗ ${label}/${f} 没有对应的中文章（${zh}）`); failures++; }
  }
}

collect(join(process.cwd(), 'docs', 'world-bible'), 'bible');
collect(join(process.cwd(), 'docs', 'world-bible', 'annex'), 'annex');
collect(join(process.cwd(), 'docs', 'world-bible', 'echoes'), 'echoes');
collect(join(process.cwd(), 'docs', 'world-bible', 'annex', 'echoes'), 'annex-echoes');

console.log(`world-bible 锚句校验：共 ${zhAnchors.size} zh / ${enAnchors.size} en 锚句（主线 + 回响）`);
if (failures > 0) {
  console.error(`✗ 共 ${failures} 项未通过`);
  process.exit(1);
}
console.log('✓ 全部通过');
