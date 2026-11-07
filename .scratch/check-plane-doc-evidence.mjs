// 把 doc-evidence.test.ts 的四条腿拿干净平面上跑一遍：那一层才是"跟仓库一起走"的真正判据。
// 主树里 gate 绿只证工作树+索引；干净平面（git worktree add --detach HEAD）里没有我这些年的手边文件，
// 只有 HEAD 真提交进去的东西——所以这里的每一条红/绿都是提交本身的形状。
// 用法：node .scratch/check-plane-doc-evidence.mjs <plane-root>
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, relative } from 'node:path';

const PLANE = process.argv[2];
if (!PLANE || !existsSync(join(PLANE, 'docs'))) {
  console.log(`用法：node .scratch/check-plane-doc-evidence.mjs <plane-root>（给了 "${PLANE}"，它下面没有 docs）`);
  process.exit(1);
}

const CITATION = /\.scratch\/([A-Za-z0-9_+.@*-]+(?:\/[A-Za-z0-9_+.@*-]+)?)/g;

const markdownFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '.git' || name === 'node_modules' ? [] : markdownFiles(p);
    return name.endsWith('.md') ? [p] : [];
  });

const walkFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walkFiles(p);
    return [relative(PLANE, p).split('\\').join('/')];
  });

const docs = markdownFiles(join(PLANE, 'docs'));
const cites = [];
for (const f of docs) {
  const lines = readFileSync(f, 'utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const m of (lines[i] ?? '').matchAll(CITATION)) {
      const token = (m[1] ?? '').replace(/\.+$/, '');
      if (token) cites.push({ token, where: `${relative(PLANE, f).split('\\').join('/')}:${i + 1}` });
    }
  }
}

function resolveToken(token) {
  const direct = join(PLANE, '.scratch', token);
  if (!token.includes('*')) {
    if (!existsSync(direct)) return { kind: 'none', paths: [] };
    if (statSync(direct).isDirectory()) return { kind: 'dir', paths: walkFiles(direct) };
    return { kind: 'file', paths: [`.scratch/${token}`] };
  }
  const segs = token.split('/');
  const last = segs.pop() ?? '';
  const base = join(PLANE, '.scratch', ...segs);
  if (!existsSync(base)) return { kind: 'none', paths: [] };
  const re = new RegExp(`^${last.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  const hits = readdirSync(base)
    .filter((n) => re.test(n) && statSync(join(base, n)).isFile())
    .map((n) => `.scratch/${[...segs, n].join('/')}`)
    .sort();
  return hits.length ? { kind: 'file', paths: hits } : { kind: 'none', paths: [] };
}

const tracked = new Set(
  execFileSync('git', ['ls-files', '-c', '--', '.scratch'], { cwd: PLANE, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean),
);

const missing = cites.filter((c) => resolveToken(c.token).kind === 'none');
const resolvable = cites.filter((c) => resolveToken(c.token).kind !== 'none');
const untracked = new Set();
for (const c of resolvable) {
  for (const p of resolveToken(c.token).paths) if (!tracked.has(p)) untracked.add(`${p}  ← ${c.where}`);
}

console.log(`平面=${PLANE}（HEAD 干净 checkout，无 node_modules）`);
console.log(`腿1 人口：docs=${docs.length}（下限 50）· 点名出现=${cites.length}（下限 70）`);
console.log(`腿3 解得出：${missing.length} 条点名在平面上查不到`);
for (const m of missing.slice(0, 10)) console.log(`    缺 ${m.where} 点名 .scratch/${m.token}`);
console.log(`腿4 入册：可解点名 ${resolvable.length} 条 · 平面上 tracked=${tracked.size}（下限 100）· 未入库=${untracked.size}`);
for (const u of [...untracked].sort().slice(0, 12)) console.log(`    未入库 ${u}`);
const verdict = missing.length === 0 && untracked.size === 0 && docs.length >= 50 && cites.length >= 70 && tracked.size >= 100;
console.log(`结论：${verdict ? '干净平面上四条腿全过——证据确实跟仓库一起走了' : '平面上不过（见上面逐条）'}`);
process.exit(verdict ? 0 : 1);
