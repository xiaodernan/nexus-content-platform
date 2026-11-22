// 普查：docs 里点名的 .scratch 路径（含 glob）各自在不在磁盘上、进没进版本库。
// 上一版按扩展名分桶，把 `.scratch/submit.ts.fixed` 截成 `submit.ts` 误报了一条"死引用"——
// 现在先吃整段路径 token，再按 glob 展开，缺就是真缺。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const docs = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.md')) docs.push(p);
  }
};
walk(path.join(ROOT, 'docs'));
if (!docs.length) {
  console.log('docs 一个文件都没扫到：普查作废（population 是空的，任何「没引用」都不算证据）');
  process.exit(1);
}

// 引用形状：`.scratch/<段>[/<段>][*]`，段里允许点、下划线、连字符、加号、@；
// 收尾处剥掉中文标点与反引号，否则 `.scratch/x.mjs，` 会把逗号当成文件名。
const CITATION = /\.scratch\/([A-Za-z0-9_+.@*-]+(?:\/[A-Za-z0-9_+.@*-]+)?)/g;
const cited = new Map(); // token -> {count, where:[file:line]}
for (const f of docs) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(CITATION)) {
      const tok = m[1].replace(/[，。、；：)"'`]+$/, '');
      const row = cited.get(tok) ?? { count: 0, where: [] };
      row.count += 1;
      if (row.where.length < 2) row.where.push(`${path.relative(ROOT, f)}:${i + 1}`);
      cited.set(tok, row);
    }
  }
}

const tracked = new Set(
  execFileSync('git', ['ls-files', '-c', '--', '.scratch'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean),
);

/** token -> 磁盘上的文件（相对 ROOT）。目录也算：文档可以点名一个 --out 目录。 */
function filesUnder(dir, relPrefix) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? filesUnder(path.join(dir, e.name), `${relPrefix}${e.name}/`)
        : [`.scratch/${relPrefix}${e.name}`],
    );
}

/** glob token -> 磁盘上匹配的文件（相对 ROOT 的路径）。 */
function expand(tok) {
  const full = path.join(ROOT, '.scratch', tok);
  if (!tok.includes('*')) {
    if (!fs.existsSync(full)) return [];
    return fs.statSync(full).isDirectory() ? filesUnder(full, `${tok}/`) : [`.scratch/${tok}`];
  }
  const dirs = tok.split('/');
  const last = dirs.pop();
  let base = path.join(ROOT, '.scratch', ...dirs);
  if (dirs.length === 0) base = path.join(ROOT, '.scratch');
  if (!fs.existsSync(base)) return [];
  const re = new RegExp(`^${last.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return fs
    .readdirSync(base)
    .filter((n) => re.test(n))
    .map((n) => path.posix.join(dirs.length ? dirs.join('/') : '', n))
    .map((rel) => `.scratch/${rel}`)
    .sort();
}

let bytes = 0;
const allFiles = new Set();
const unmatched = [];
for (const [tok, row] of [...cited].sort()) {
  const hits = expand(tok);
  if (!hits.length) unmatched.push([tok, row]);
  for (const h of hits) allFiles.add(h);
}
for (const f of allFiles) if (!tracked.has(f)) bytes += fs.statSync(path.join(ROOT, f)).size;

console.log(`docs 文件数=${docs.length} · 点名 token=${cited.size} · 展开到磁盘文件=${allFiles.size}`);
console.log(`其中已入库=${[...allFiles].filter((f) => tracked.has(f)).length} · 未入库=${[...allFiles].filter((f) => !tracked.has(f)).length} · 未入库合计 ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`一条都匹配不上的 token=${unmatched.length}`);
for (const [tok, row] of unmatched) console.log(`  缺  ${tok}  ← ${row.where.join(', ')}（${row.count}x）`);
const byExt = new Map();
for (const f of allFiles) {
  const e = path.extname(f) || '(none)';
  byExt.set(e, (byExt.get(e) ?? 0) + 1);
}
console.log('按扩展名：', [...byExt].sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e}=${n}`).join(' '));
if (process.argv.includes('--list')) {
  console.log('--- 未入库文件清单 ---');
  for (const f of [...allFiles].filter((x) => !tracked.has(x)).sort()) console.log(f);
}
