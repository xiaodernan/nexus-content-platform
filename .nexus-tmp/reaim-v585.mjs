// One-shot re-aim of this batch's version label: v557 -> v585 (v557 is taken by the webhooks lane at
// 4e392a2; v558..v584 are taken by other lanes). Token-for-token, same byte length, EOL untouched.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = 'D:/\u7ec8\u6781\u9879\u76ee';
const WHOLE = [
  'apps/studio/src/lib/ops.ts',
  'apps/studio/src/lib/reportBar.ts',
  'apps/studio/src/lib/moderation.ts',
  'apps/studio/src/components/Toolbar.tsx',
  'apps/studio/src/lib/ops.test.ts',
  'apps/studio/src/lib/moderation.test.ts',
  'apps/studio/src/lib/reportBar.test.ts',
  'apps/studio/src/lib/reportLane.test.ts',
  'docs/evidence/m9/audit-contract-proof.mjs',
  'docs/evidence/m9/README.md',
];
// Shared docs: only the lines THIS batch owns may move. { file, fromLine, toLine, expect }
const headLineCount = (rel) => execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').length - 1;
const LINES = [
  { rel: 'docs/LONG_TERM_PLAN.md', from: 213, to: 213, expect: 2 },
  { rel: 'docs/ROADMAP.md', from: 17, to: 17, expect: 1 },
  // The ADR window is everything HEAD does not have: my amendment is appended at the end of the file.
  { rel: 'docs/decisions/0016-agent-runtime-hermetic-demo-loop.md', from: headLineCount('docs/decisions/0016-agent-runtime-hermetic-demo-loop.md') + 1, to: Infinity, expect: 2 },
];

const countToken = (s, tok) => s.split(tok).length - 1;

const plan = [];
for (const rel of WHOLE) {
  const text = readFileSync(`${ROOT}/${rel}`, 'utf8');
  plan.push({ rel, text, hits: countToken(text, 'v557'), restrict: null });
}
for (const spec of LINES) {
  const text = readFileSync(`${ROOT}/${spec.rel}`, 'utf8');
  const lines = text.split('\n');
  const inWindow = lines.slice(spec.from - 1, Number.isFinite(spec.to) ? spec.to : lines.length).join('\n');
  const hits = countToken(inWindow, 'v557');
  if (hits !== spec.expect) throw new Error(`${spec.rel}: the window I own holds ${hits} occurrence(s) of v557, not the ${spec.expect} I predicted — re-aim the window, do not widen it`);
  plan.push({ rel: spec.rel, text, hits, restrict: spec });
}
console.log('[pre-flight] planned replacements per file:');
for (const p of plan) console.log(`  ${p.rel} -> ${p.hits} occurrence(s) of v557`);

for (const p of plan) {
  if (p.hits === 0) throw new Error(`${p.rel}: 0 occurrences of v557 in the window I own — the re-aim target moved, refuse to write`);
}

let out = plan.map((p) => {
  if (!p.restrict) return { rel: p.rel, text: p.text.split('v557').join('v585'), moved: p.hits, restrict: null };
  const lines = p.text.split('\n');
  let moved = 0;
  for (let i = p.restrict.from - 1; i < Math.min(p.restrict.to, lines.length); i++) {
    const n = countToken(lines[i], 'v557');
    lines[i] = lines[i].split('v557').join('v585');
    moved += n;
  }
  return { rel: p.rel, text: lines.join('\n'), moved, restrict: p.restrict };
});

// The ADR grant line: this batch grants the label AFTER its own.
const adrIdx = out.findIndex((o) => o.rel.startsWith('docs/decisions/0016'));
const adrText = out[adrIdx].text;
if (countToken(adrText, 'version v570') !== 1) throw new Error('the ADR grant sentence "version v570" is not exactly one occurrence');
out[adrIdx] = { ...out[adrIdx], text: adrText.split('version v570').join('version v586') };

for (const o of out) {
  const rel = o.rel;
  const before = readFileSync(`${ROOT}/${rel}`);
  const after = Buffer.from(o.text, 'utf8');
  if (after.length !== before.length) throw new Error(`${rel}: byte length moved ${before.length} -> ${after.length}; a token re-aim must be length-preserving`);
  const crBefore = countToken(before.toString('latin1'), '\r');
  const crAfter = countToken(after.toString('latin1'), '\r');
  if (crBefore !== crAfter) throw new Error(`${rel}: CR count moved ${crBefore} -> ${crAfter}; EOL must be untouched`);
  const insideLeft = o.restrict
    ? countToken(o.text.split('\n').slice(o.restrict.from - 1, Number.isFinite(o.restrict.to) ? o.restrict.to : o.text.split('\n').length).join('\n'), 'v557')
    : countToken(o.text, 'v557');
  if (insideLeft !== 0) throw new Error(`${rel}: ${insideLeft} occurrence(s) of v557 survive inside the window I claimed — the splice did not land`);
  const outsideLeft = countToken(o.text, 'v557') - insideLeft;
  writeFileSync(`${ROOT}/${rel}`, after);
  const onDisk = readFileSync(`${ROOT}/${rel}`);
  if (!onDisk.equals(after)) throw new Error(`${rel}: write-back does not match the bytes I meant to send`);
  console.log(`[wrote] ${rel}: ${o.moved} token(s) v557->v585 · ${after.length} bytes (unchanged) · CR ${crBefore} · ${outsideLeft} v557 left OUTSIDE my window (not mine to move)`);
}

// Post-conditions on the whole tree, printed not claimed.
const dirty = execFileSync('git', ['status', '--porcelain=v1'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
console.log(`[post] worktree still dirty on ${dirty.length} path(s)`);
let anyV557 = '(no v557 left in the 13 paths)';
try {
  anyV557 = execFileSync('git', ['grep', '-c', 'v557', '--', ...WHOLE, ...LINES.map((l) => l.rel)], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
} catch (e) {
  anyV557 = `(git grep exited ${e.status}: ${(e.stdout || '').trim()})`;
}
console.log(`[post] git grep v557 in the 13 paths:\n${anyV557}`);
