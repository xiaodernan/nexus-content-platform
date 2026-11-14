#!/usr/bin/env node
/**
 * §FE-CENSUS · globals.css façade class census — 零引用的门面类一律红。
 *
 * 为什么有这一门（§FE-102 之后的兜底）：
 *   `verify:no-raw-tailwind` 守的是"没有裸原子"，
 *   `verify:fe-gates` 守的是"门面类零 Hex/零 raw 归属"，
 *   本门守的是"定义了的门面类必须被用到" —— §FE-60 死类清扫（4d7b2f9a）证明，
 *   改名前后很容易把类遗留在 globals.css 里没人引用。
 *
 * 判据**严格 raw substring**：
 *   - 注释先剔（/\* … *\//），避免文档提到死类而拿到"被引用"的假绿（§FE-6/.pb-* 教训）。
 *   - 类名必须是字母开头（globals.css 只有 .xYZ 形态的门面类）。
 *   - 全仓库 tracked 文件（globals.css 自身除外）只要子串出现即算被使用 ——
 *     比如 `cn()` 动态拼接 `isOpen ? 'pb-publishLive' : 'pb-publishIdle'`，子串仍命中。
 *   - 假阳性是良性的（宁可记一条不必要的引用，也不删活类）；
 *     判据只因真死类发红，不会因"不够巧"而红。
 *
 * Exit 0 = 全部定义类都有引用方。Exit 1 = 存在零引用门面类（门面层必须清）。
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

process.env.FORCE_COLOR = '0';
const cwd = process.cwd();
const css = readFileSync('apps/web/src/app/globals.css', 'utf8');
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

const defined = new Set();
for (const m of clean.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/g)) defined.add(m[1]);

const out = execSync('git ls-files -z', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .split('\0')
  .filter(Boolean)
  .filter((f) => /^(apps|packages|tools|scripts|e2e)\//.test(f))
  .filter((f) => f !== 'apps/web/src/app/globals.css')
  .filter((f) => !/\.(png|jpe?g|gif|webp|ico|pdf|lock|snap|tsbuildinfo|woff2?|tgz|jar|tar)$/i.test(f));

let corpusBlob = '';
for (const f of out) {
  try { corpusBlob += readFileSync(f, 'utf8') + '\n'; } catch { /* unreadable */ }
}

const unused = [];
for (const cls of defined) {
  if (!corpusBlob.includes(cls)) unused.push(cls);
}

if (unused.length > 0) {
  console.error(`verify:census FAIL — globals.css 里 ${unused.length} 个零引用门面类：`);
  for (const cls of unused.sort()) console.error(`  - .${cls}`);
  console.error('删除零引用门面类（参看 ADR-0260 的手术刀流程），或找到它的引用方。');
  process.exit(1);
}
console.log(`verify:census OK — globals.css 定义 ${defined.size} 个类，全部有引用方`);
