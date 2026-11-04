// NEXUS v598 (docs/evidence/m9) — THE 11.9b ARMS ARE A ROW NOW: EVERY CHARGE THE REASON CENSUS MAKES IS RE-EARNED ON A PLANE OUTSIDE THE REPOSITORY, ON THE COMMITTED BYTES, ON EVERY BUILD (ADR 0016 amendment 551).
// sweep-budget-ms: 420000
// sweep-asks-repository: git rev-parse HEAD, git cat-file -e, git merge-base --is-ancestor, git ls-tree -r and git show of a pinned BASE ref and of HEAD
//
// Why this exists, stated the way §60 requires: amendment 550's record says `8 arms · 8/8 MATCHED`, and until
// this file existed the only place those eight arms lived was `.nexus-tmp/arms-v597.mjs` — scratch, untracked,
// gone with the next clean-up. A reader who wanted to check that sentence had to take it on faith, which is the
// difference between evidence and a citation. The ci lane met the same hole at v555 (amendment 536, "A ROW, NOT
// A HUMAN'S ERRAND") and moved its arms into the build; this is that move for the M9 vocabulary gate.
//
// What the build now re-earns, in three phases on a plane OUTSIDE the repository (never the shared worktree —
// other lanes commit from it, and a battery that writes into the tree it grades is the rot this file exists to
// stop):
//   1. the pinned BASE ref's bytes × the BASE ref's own proof: exit 0, and NO `11.9b` in its print line. This is
//      the honest shape of "before", and the base is PINNED, not read off HEAD, because HEAD moves past the
//      clause the day this file lands — a before-picture keyed on HEAD would silently become an after-picture.
//   2. the BASE proof over a tree that HAS the charged shapes: predicted GREEN on both plants. That green is the
//      blindness control — the hole was measured, not asserted.
//   3. HEAD's bytes × the shipped proof, and the arms: five charges, one per rule, plus two plants this clause
//      refuses to charge, predicted green on purpose.
//
// The bytes planted are read from REFS (`git show`), never from the worktree, so a dirty shared tree cannot
// talk this row into a verdict about bytes no commit ever held. Every needle matches exactly once, every plant is
// deleted again, the plane is re-hashed against its own snapshot after every arm, and the plane directory is
// removed on the way out.

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PLANE = resolve(ROOT, '..', `nexus-m9-arms-plane-${process.pid}`);
const PROOF = 'docs/evidence/m9/audit-contract-proof.mjs';

// The last commit whose proof did NOT contain §11.9b — the ref amendment 550 was measured against. Pinned by
// full sha because a control keyed on "the parent" stops being the same control the day someone rebases.
const BASE = 'f726debc8a6978406d71cc1ab8f89e7c2ec1cf56';

const git = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: ROOT, encoding, maxBuffer: 64 * 1024 * 1024 });

if (!existsSync(join(ROOT, '.git'))) throw new Error(`${ROOT} is not a repository — this battery reads refs, so it cannot run on a bare copy`);
const HEAD_REF = git(['rev-parse', 'HEAD']).trim();
try {
  git(['cat-file', '-e', `${BASE}^{commit}`]);
} catch {
  throw new Error(`the pinned BASE ${BASE} is not in this clone — the battery needs a full history (.github/workflows/ci.yml checks out with fetch-depth: 0; a shallow clone cannot state a "before")`);
}
// spawnSync, not execFileSync: an ancestry refusal is a verdict this file has to read, and execFileSync would
// throw before a `.status` ever existed to check.
if (spawnSync('git', ['merge-base', '--is-ancestor', BASE, HEAD_REF], { cwd: ROOT }).status !== 0) {
  throw new Error(`${BASE} is not an ancestor of ${HEAD_REF} — the "before" ref must be reachable from what is being graded`);
}

// The closure is DERIVED from each ref's own tree, not copied from disk: the plane gets exactly the files the
// proof may walk, at the bytes that ref holds. §11's census refuses a shipped population thinner than 20, so a
// closure that lost apps/studio/src would crash the child rather than measure anything.
const JAVA_ROOT = 'services/nexus-api/src/main/java/dev/nexus/api';
const closureAt = (ref) => {
  const listed = (path, filter) => git(['ls-tree', '-r', '--name-only', `${ref}`, '--', path])
    .split('\n').filter((l) => l.length > 0).filter(filter);
  const java = listed(JAVA_ROOT, (f) => f.endsWith('.java'));
  const client = listed('apps/studio/src', (f) => /\.tsx?$/.test(f));
  if (java.length === 0 || client.length < 20) {
    throw new Error(`${ref} produced a closure of ${java.length} Java + ${client.length} client files — the plane would not carry what §11 walks`);
  }
  return [PROOF, ...java, ...client];
};

const refBytes = (ref, rel) => git(['show', `${ref}:${rel}`], 'buffer');

function plant(ref) {
  rmSync(PLANE, { recursive: true, force: true });
  mkdirSync(PLANE, { recursive: true });
  const closure = closureAt(ref);
  for (const rel of closure) {
    mkdirSync(dirname(join(PLANE, rel)), { recursive: true });
    writeFileSync(join(PLANE, rel), refBytes(ref, rel));
  }
  mkdirSync(join(PLANE, 'node_modules'), { recursive: true });
  cpSync(join(ROOT, 'node_modules/typescript'), join(PLANE, 'node_modules/typescript'), { recursive: true });
  return closure;
}

const planeHash = (rel) => (existsSync(join(PLANE, rel))
  ? createHash('sha256').update(readFileSync(join(PLANE, rel))).digest('hex').slice(0, 12)
  : '(absent)');

const runProof = (label) => {
  const r = spawnSync(process.execPath, [PROOF], { cwd: PLANE, encoding: 'utf8' });
  return { label, exit: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};

const censusLine = (out) => (out.split('\n').find((l) => l.startsWith('[§11.7-11]')) || '(no §11.7-11 line printed)').trim();
const reasonSentence = (out) => {
  const m = censusLine(out).match(/11\.9b charges [^\n]*/);
  return m ? m[0] : '(11.9b not printed)';
};
const chargedCount = (out) => {
  const printed = reasonSentence(out).match(/^11\.9b charges (\d+) file\(s\) that USE a reason word in a position \(([^)]*)\)/);
  if (printed) return { n: Number(printed[1]), who: printed[2] };
  // A red run never reaches the print line, so read the charge set out of the assertion itself.
  const red = out.match(/instead of asking apps\/studio\/src\/lib\/ops\.ts: (.*?) —/);
  return red ? { n: red[1].split(';').length, who: red[1] } : { n: NaN, who: '(unparsed)' };
};

// Each plant is a whole shipped file the gate has never seen, written into the plane and deleted after the arm.
// The shapes are the ones amendment 550 names: a caption keyed on the wire token, a switch over `.reason`, a
// second word TABLE (the shape §11.7 cannot see because it declares no face), the list re-declared wholesale
// (the shape §11.1 walks straight past), a `data-reason` attribute, and the two shapes this clause lets go.
const P = (rel, body) => ({ rel, bytes: body });
const PLANTS = {
  R1: P(
    'apps/studio/src/components/ReasonKeyedPanel.tsx',
    `export function reasonCaption(report: { reason: string }): string {
  if (report.reason === 'spam') return 'a spam report';
  return 'a report';
}
`,
  ),
  R2: P(
    'apps/studio/src/components/ReasonCasePanel.tsx',
    `export function reasonWeight(row: { reason: string }): number {
  switch (row.reason) {
    case 'harassment':
      return 3;
    default:
      return 1;
  }
}
`,
  ),
  R3: P(
    'apps/studio/src/components/ReasonWordsPanel.tsx',
    `const WORDS: Record<string, string> = { spam: 'a spam report', harassment: 'a harassment report' };
export function inlineWords(reason: string): string {
  return WORDS[reason] ?? 'a report';
}
`,
  ),
  R4: P(
    'apps/studio/src/lib/allReasons.ts',
    `export const ALL_REASONS = ['spam', 'harassment', 'illegal', 'other'] as const;
`,
  ),
  R5: P(
    'apps/studio/src/components/ReasonChip.tsx',
    `export function ReasonChip() {
  return <span data-reason="illegal">chip</span>;
}
`,
  ),
  INNOCENT: P(
    'apps/studio/src/lib/categoryCatalog.ts',
    `const CATEGORIES = ['landing', 'dashboard', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<string, string> = {
  landing: 'a landing page',
  dashboard: 'a dashboard',
  other: 'something else',
};
`,
  ),
  SEED: P(
    'apps/studio/src/lib/seedReport.ts',
    `export const SEED_REPORT = { id: 'r-1', reporterId: 'acct-ada', targetId: 'pub-1', reason: 'spam', detail: '', createdAt: 1 };
`,
  ),
};

const VERDICTS = {
  green: null,
  '11.9b-R1': 'R1-compare',
  '11.9b-R2': 'R2-case',
  '11.9b-R3': 'R3-table',
  '11.9b-R4': 'R4-wholesale',
  '11.9b-R5': 'R5-attribute',
};

const classify = ({ exit, out }) => {
  if (exit === 0) return 'green';
  for (const [verdict, needle] of Object.entries(VERDICTS)) {
    if (needle && out.includes(needle)) return verdict;
  }
  return `UNCLASSIFIED(exit ${exit}: ${(out.split('\n').find((l) => l.includes('AssertionError')) || out).slice(0, 200)})`;
};

const create = (names) => {
  for (const n of names) {
    const { rel, bytes } = PLANTS[n];
    mkdirSync(dirname(join(PLANE, rel)), { recursive: true });
    writeFileSync(join(PLANE, rel), bytes);
  }
};
const remove = (names) => {
  for (const n of names) rmSync(join(PLANE, PLANTS[n].rel), { force: true });
};

const started = Date.now();
console.log(`[base] pinned ${BASE} · graded ${HEAD_REF} · plane ${PLANE} (outside the repository)`);

const baseClosure = plant(BASE);
console.log(`[closure] ${baseClosure.length} files planted from ${BASE.slice(0, 7)} + node_modules/typescript`);

// Phase 1 — the before-picture: the BASE ref's bytes and the BASE ref's own proof.
const before = runProof('BASE bytes × BASE proof');
const beforeOk = before.exit === 0 && !censusLine(before.out).includes('11.9b');
console.log(`\n[phase 1 · BASE×BASE, predicted green and silent on 11.9b] exit ${before.exit} · ${classify(before)}`);
console.log(`  ${reasonSentence(before.out)}`);

// Phase 2 — the blindness control, on the same BASE plant: the shipped gate could not see either shape, which
// is what makes amendment 550's hole a measurement rather than a claim.
const blind = [];
for (const n of ['R1', 'R4']) {
  create([n]);
  const r = runProof(`BASE proof × ${n} plant`);
  blind.push({ n, verdict: classify(r), exit: r.exit });
  console.log(`\n[phase 2 · BASE proof × ${n} plant, predicted green] exit ${r.exit} · ${classify(r)}`);
  console.log(`  ${reasonSentence(r.out)}`);
  remove([n]);
}

// Phase 3 — the arms, on HEAD's own bytes with the clause that charges them.
const headClosure = plant(HEAD_REF);
const snapshot = new Map();
for (const rel of headClosure) snapshot.set(rel, planeHash(rel));
console.log(`\n[phase 3 · HEAD ${HEAD_REF.slice(0, 7)} × shipped proof, ${headClosure.length} files planted]`);
console.log(`  ${reasonSentence(runProof('HEAD × shipped').out)}`);

const ARMS = [
  { tag: 'A0', verdict: 'green', plants: [], note: 'control: HEAD as it stands charges nobody' },
  { tag: 'A1', verdict: '11.9b-R1', plants: ['R1'], note: 'a panel that keys its own caption on report.reason === the wire token' },
  { tag: 'A2', verdict: '11.9b-R2', plants: ['R2'], note: 'a switch over row.reason with a declared reason as a case label' },
  { tag: 'A3', verdict: '11.9b-R3', plants: ['R3'], note: 'a second word TABLE: two reason words as the keys of one object literal, no face declared' },
  { tag: 'A4', verdict: '11.9b-R4', plants: ['R4'], note: 'the whole reason list re-declared under a name §11.1 does not know' },
  { tag: 'A5', verdict: '11.9b-R5', plants: ['R5'], note: 'a JSX attribute named data-reason wearing a wire token' },
  { tag: 'A6', verdict: 'green', plants: ['INNOCENT'], note: 'DISCRIMINATION: a category list and label map that spell `other` in their own vocabulary' },
  { tag: 'A7', verdict: 'green', plants: ['SEED'], note: 'DISCLOSED BOUND: a seed ROW written with a reason word is data the service accepts, not a second speaker' },
];

let matched = 0;
for (const arm of ARMS) {
  create(arm.plants);
  const res = runProof(arm.tag);
  const verdict = classify(res);
  const ok = verdict === arm.verdict;
  if (ok) matched += 1;
  const charged = chargedCount(res.out);
  console.log(`[${arm.tag}] predicted ${arm.verdict} · observed ${verdict} · exit ${res.exit} · ${ok ? 'MATCHED' : 'MISMATCH'}`);
  console.log(`       charged: ${charged.n} (${charged.who}) · ${arm.note}`);
  if (!ok) console.log(`       ${(res.out.split('\n').find((l) => l.includes('AssertionError')) || res.out).trim().slice(0, 260)}`);
  remove(arm.plants);
  const leftover = arm.plants.filter((n) => existsSync(join(PLANE, PLANTS[n].rel)));
  if (leftover.length) throw new Error(`[${arm.tag}] the plant ${leftover.join(', ')} is still on the plane after restore`);
  const leaked = [...snapshot.keys()].filter((rel) => planeHash(rel) !== snapshot.get(rel));
  if (leaked.length) throw new Error(`[${arm.tag}] the plane does not match its snapshot after restore: ${leaked.join(', ')}`);
}

const blindOk = blind.every((b) => b.verdict === 'green');
rmSync(PLANE, { recursive: true, force: true });
const wall = Math.round((Date.now() - started) / 1000);
console.log(`\n[arms] ${ARMS.length} arms · ${matched}/${ARMS.length} MATCHED · ${wall}s on this box · plane ${existsSync(PLANE) ? 'STILL PRESENT' : 'removed'}`);
console.log(`[arms] phase 1 before-picture ${beforeOk ? 'holds' : 'BROKE'} · phase 2 blindness ${blind.map((b) => `${b.n}=${b.verdict}`).join(' ')} · the repository worktree was never a fixture: every write landed in ${PLANE}`);
process.exitCode = matched === ARMS.length && blindOk && beforeOk ? 0 : 1;
