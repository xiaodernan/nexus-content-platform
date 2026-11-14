import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/**
 * /ship 的编译期生产器：git log → docs/ship-manifest.json
 *
 * 只保留"值得给用户看的"提交（feat / fix / merge / refactor / docs 且  subject 带 ADR 或 v\\d+ 语义），
 * 按 commit 时间倒序排列（最新在前）。数据只是提交字节的投影——
 * 不编造里程碑，不写阅读量，不装"我们很牛"的鬼话，只把已经发生的事按顺序列出来。
 */

const out = execFileSync(
  'git',
  ['log', '--reverse', '--pretty=format:%H|%ad|%s', '--date=short', 'HEAD'],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

const hits: Array<{ hash: string; date: string; subject: string }> = [];
for (const line of out.split('\n')) {
  const [hash, date, subject] = line.split('|', 3);
  if (!hash || !date || !subject) continue;
  const lower = subject.toLowerCase();
  const notable =
    lower.startsWith('feat') ||
    lower.startsWith('fix') ||
    lower.startsWith('merge') ||
    lower.startsWith('refactor') ||
    lower.startsWith('test') ||
    /v\d{3}/.test(subject) ||
    /ADR[ -]?\d{4}/.test(subject);
  if (!notable) continue;
  hits.push({ hash: hash.slice(0, 10), date, subject: subject.trim() });
}

// 只保留最近 90 条，避免 json 无限增长
const trimmed = hits.slice(-90);

// 按日期分组（同一天的合并 commit + feature 一起展示）
const grouped = new Map<string, typeof trimmed>();
for (const hit of trimmed) {
  const arr = grouped.get(hit.date) ?? [];
  arr.push(hit);
  grouped.set(hit.date, arr);
}
const days = [...grouped.entries()]
  .sort((a, b) => (a[0] < b[0] ? 1 : -1))
  .map(([date, entries]) => ({ date, entries }));

const manifest = {
  generatedAt: new Date().toISOString(),
  window: { commitsScanned: out.split('\n').filter(Boolean).length, kept: hits.length },
  days,
};

writeFileSync('docs/ship-manifest.json', JSON.stringify(manifest, null, 2), 'utf8');

// Next 的 import 只信 apps/web 下的源根：把同一份机械投影生成 .ts，
// 页面 import 这个文件（单一真值）。
const CURRENT_REF = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const source = `/** 由 scripts/gen-ship-manifest.mts 机械生成——勿手改。生成于 ${manifest.generatedAt} (${CURRENT_REF}) */
export interface ShipEntry { hash: string; date: string; subject: string }
export interface ShipDay { date: string; entries: ShipEntry[] }
export const SHIP_DAYS: ShipDay[] = ${JSON.stringify(days, null, 2)};
`;
writeFileSync('apps/web/src/lib/ship-manifest.ts', source, 'utf8');

console.log(`written docs/ship-manifest.json + apps/web/src/lib/ship-manifest.ts: ${days.length} days, ${trimmed.length} notable commits`);
