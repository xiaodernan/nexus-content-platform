// Pass 2: v585 was claimed in the SHARED INDEX while this batch was being re-aimed — the liveness lane's
// staged docs/decisions/0036-liveness-readiness.md says "(v585, `GET /health/live` + `GET /health/ready`)"
// and their staged ROADMAP line 17 carries it. So my label moves v585 -> v586 and my grant v586 -> v587.
// Length-preserving, LF-only, and their v585 must survive untouched.
import { readFileSync, writeFileSync } from 'node:fs';
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
// { rel, needle, expectNeedle, expectV585After } — a shared file is moved by a needle, never file-wide.
const NEEDLES = [
  { rel: 'docs/ROADMAP.md', needle: '**v585 (ADR 0016 amendment 544)**', repl: '**v586 (ADR 0016 amendment 544)**', expect: 1, leftV585: 1 },
];
const SHARED_GLOBAL = [
  { rel: 'docs/LONG_TERM_PLAN.md', expect: 2, leftV585: 0 },
  { rel: 'docs/decisions/0016-agent-runtime-hermetic-demo-loop.md', expect: 2, leftV585: 0 },
];
const count = (s, t) => s.split(t).length - 1;

// 1. the grant sentence, BEFORE any label moves, so v586 -> v587 cannot be re-hit by the label pass.
const adrRel = 'docs/decisions/0016-agent-runtime-hermetic-demo-loop.md';
const adrPath = `${ROOT}/${adrRel}`;
const adrNow = readFileSync(adrPath, 'utf8');
const grantNeedle = '**GRANTS** amendment 545 / version v586';
if (count(adrNow, grantNeedle) !== 1) throw new Error(`the ADR grant needle is not exactly one occurrence (found ${count(adrNow, grantNeedle)})`);
const grantBytes = Buffer.from(adrNow.replace(grantNeedle, '**GRANTS** amendment 545 / version v587'), 'utf8');
writeFileSync(adrPath, grantBytes);
console.log(`[grant] amendment 545 / version v586 -> v587 · ${grantBytes.length} bytes`);

const targets = [
  ...WHOLE.map((rel) => ({ rel, mode: 'global', expect: null })),
  ...SHARED_GLOBAL.map((s) => ({ rel: s.rel, mode: 'global', expect: s.expect, leftV585: s.leftV585 })),
  ...NEEDLES.map((s) => ({ rel: s.rel, mode: 'needle', expect: s.expect, leftV585: s.leftV585 })),
];

for (const t of targets) {
  const p = `${ROOT}/${t.rel}`;
  const before = readFileSync(p);
  const text = before.toString('utf8');
  const crBefore = count(before.toString('latin1'), '\r');
  let next;
  let moved;
  if (t.mode === 'global') {
    moved = count(text, 'v585');
    if (t.expect !== null && moved !== t.expect) throw new Error(`${t.rel}: ${moved} occurrence(s) of v585, expected ${t.expect} — the label target moved again, refuse to write`);
    if (moved === 0) throw new Error(`${t.rel}: no v585 to move`);
    next = text.split('v585').join('v586');
  } else {
    const spec = NEEDLES.find((n) => n.rel === t.rel);
    moved = count(text, spec.needle);
    if (moved !== spec.expect) throw new Error(`${t.rel}: needle found ${moved} time(s), expected ${spec.expect}`);
    if (count(text, 'v585') <= spec.leftV585) throw new Error(`${t.rel}: the file holds no v585 beyond the ${spec.leftV585} that belong to another lane — my label is not in this file`);
    next = text.split(spec.needle).join(spec.repl);
  }
  const after = Buffer.from(next, 'utf8');
  if (after.length !== before.length) throw new Error(`${t.rel}: byte length moved ${before.length} -> ${after.length}`);
  if (count(after.toString('latin1'), '\r') !== crBefore) throw new Error(`${t.rel}: CR count moved — EOL must be untouched`);
  const left = count(after.toString('utf8'), 'v585');
  if (t.leftV585 !== undefined && left !== t.leftV585) throw new Error(`${t.rel}: ${left} v585 left, expected ${t.leftV585} — I would have moved a label that is not mine`);
  if (t.mode === 'global' && left !== 0) throw new Error(`${t.rel}: ${left} v585 survived the global pass`);
  writeFileSync(p, after);
  if (!readFileSync(p).equals(after)) throw new Error(`${t.rel}: write-back mismatch`);
  console.log(`[wrote] ${t.rel}: ${moved} v585->v586 · ${after.length} bytes · CR ${crBefore} · v585 left ${left}`);
}

// Post-read: what each label now says in the shared cell, so the print is the evidence, not the claim.
const road = readFileSync(`${ROOT}/docs/ROADMAP.md`, 'utf8').split('\n')[16];
console.log(`[post] ROADMAP M9 cell: my label at index ${road.indexOf('v586 (ADR 0016 amendment 544)')}, their label at index ${road.indexOf('v585, ADR 0036')}`);
console.log(`[post] v586 in git log: ${execFileSync('git', ['log', '--oneline', '--grep', 'v586'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).trim() || '(none)'}`);
console.log(`[post] dirty paths: ${execFileSync('git', ['status', '--porcelain=v1'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').length}`);
