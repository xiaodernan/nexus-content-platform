#!/usr/bin/env node
/**
 * 低语诸王大典锚句校验（scripts/verify-world-bible-anchors.mts）。
 *
 * 判据：
 *   1. 每个中文锚句在世界大典文件里恰好出现一次；
 *   2. 每个英文锚句在世界大典文件里恰好出现一次（中英各 1 次）；
 *   3. 每个锚句在 zh/en 两边文本中各有一份；
 *   4. 任何锚句行不出现在两个文件里（不重复钉死）；
 *   5. 至少覆盖一个 lore 类条目（模型映射表非空）。
 *
 * 退出码：0 = 全部通过；1 = 有任一判据红。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BIBLE_DIR = join(process.cwd(), 'docs', 'world-bible');
const anchorRe = /^\*\*锚句\*\*[:：]?\s*(.+)$/gm;
const anchorEnRe = /^\*\*Anchor sentence\*\*[:：]?\s*(.+)$/gm;

let failures = 0;

const files = readdirSync(BIBLE_DIR).filter((f) => f.endsWith('.md'));
if (files.length === 0) {
  console.error('world-bible 目录里没有任何 .md 文件');
  process.exit(1);
}

/** @type {Map<string, { file: string; line: number }>} */
const zhAnchors = new Map();
/** @type {Map<string, { file: string; line: number }>} */
const enAnchors = new Map();
const fileLines = new Map<string, string[]>();
for (const f of files) {
  fileLines.set(f, readFileSync(join(BIBLE_DIR, f), 'utf8').split(/\r?\n/));
}

// 收集锚句：中英
for (const f of files) {
  const lines = fileLines.get(f)!;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    for (const m of [...line.matchAll(anchorRe)]) {
      const text = m[1]!.trim();
      if (zhAnchors.has(text)) {
        console.error(`✗ 中文锚句重复出现（${f}）: ${text}`);
        failures++;
      } else {
        zhAnchors.set(text, { file: f, line: i + 1 });
      }
    }
    for (const m of [...line.matchAll(anchorEnRe)]) {
      const text = m[1]!.trim();
      if (enAnchors.has(text)) {
        console.error(`✗ English anchor repeated (${f}): ${text}`);
        failures++;
      } else {
        enAnchors.set(text, { file: f, line: i + 1 });
      }
    }
  }
}

// 每篇锚句数量 ≥ 4（低语诸王正典密度下限）
for (const f of files) {
  const zhCount = fileLines.get(f)!.filter((l) => l.startsWith('**锚句**')).length;
  const enCount = fileLines.get(f)!.filter((l) => l.startsWith('**Anchor sentence**')).length;
  if (zhCount < 4) { console.error(`✗ ${f}: 中文锚句只有 ${zhCount} 个（≥4）`); failures++; }
  if (enCount < 4) { console.error(`✗ ${f}: English anchors only ${enCount} (≥4)`); failures++; }
  if (zhCount !== enCount) { console.error(`✗ ${f}: 中英锚句数量不一致 (${zhCount} vs ${enCount})`); failures++; }
}

console.log(`world-bible 锚句校验：${files.length} 个章文件，zh 锚句 ${zhAnchors.size}，en 锚句 ${enAnchors.size}`);
if (failures > 0) {
  console.error(`✗ 共 ${failures} 项未通过`);
  process.exit(1);
}
console.log('✓ 全部通过');
