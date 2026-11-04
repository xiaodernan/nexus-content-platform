// v597 witness arms — 11.9b: a declared report reason used AS a reason outside its owner is charged, and a
// word that merely collides with the vocabulary in another list is not.
//
// Three phases, on a plane OUTSIDE the repository (never the shared worktree — other lanes commit from it):
//   1. plant the BASE ref's bytes and run the BASE proof: the "before" picture, printing the §11.7-11 line
//      as it stood without the reason census.
//   2. plant the base proof again over a tree that HAS the shapes 11.9b charges, and show it stays GREEN:
//      the blindness control. This is the difference between v593's arm A4 (disclosed as a green-on-purpose
//      blind spot) and a measurement that the hole was real: the shipped gate could not see a panel that
//      inlines the reason sentence, and could not see a renamed copy of the reason list.
//   3. plant the draft bytes (with 11.9b) and run the arms: five charges, one per rule, plus two arms
//      predicted GREEN on purpose — the colliding category list and the seed row this clause does not charge.
//
// Every needle must match EXACTLY ONCE, every created file is deleted again, and the plane is re-hashed
// against its snapshot after every arm.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLANE = resolve(SRC, '..', 'nexus-v597-arms');
const PROOF = 'docs/evidence/m9/audit-contract-proof.mjs';

const BASE = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: SRC, encoding: 'utf8' }).trim();

const JAVA = [
  'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditController.java',
  'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditService.java',
  'services/nexus-api/src/main/java/dev/nexus/api/social/ReportDtos.java',
  'services/nexus-api/src/main/java/dev/nexus/api/social/ReportService.java',
  'services/nexus-api/src/main/java/dev/nexus/api/moderation/ModerationService.java',
];

// §11's census walks apps/studio/src and refuses a population thinner than 20, so the plane carries every
// shipped and test source, not only the graded files.
const CLIENT_FILES = (() => {
  const root = join(SRC, 'apps/studio/src');
  const out = [];
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(p, r);
      else if (/\.tsx?$/.test(e.name)) out.push(r);
    }
  };
  walk(root, 'apps/studio/src');
  return out;
})();

const CLOSURE = [PROOF, ...JAVA, ...CLIENT_FILES];

const gitBytes = (rel) => execFileSync('git', ['show', `${BASE}:${rel}`], { cwd: SRC, maxBuffer: 64 * 1024 * 1024 });
const workBytes = (rel) => readFileSync(join(SRC, rel));

function plant(ref) {
  rmSync(PLANE, { recursive: true, force: true });
  mkdirSync(PLANE, { recursive: true });
  for (const rel of CLOSURE) {
    mkdirSync(dirname(join(PLANE, rel)), { recursive: true });
    if (!existsSync(join(SRC, rel))) throw new Error(`the plane closure names ${rel} but the repository has no such file`);
    writeFileSync(join(PLANE, rel), ref === 'BASE' ? gitBytes(rel) : workBytes(rel));
  }
  mkdirSync(join(PLANE, 'node_modules'), { recursive: true });
  cpSync(join(SRC, 'node_modules/typescript'), join(PLANE, 'node_modules/typescript'), { recursive: true });
}

const hash = (rel) => (existsSync(join(PLANE, rel)) ? createHash('sha256').update(readFileSync(join(PLANE, rel))).digest('hex').slice(0, 12) : '(absent)');

function runProof(label) {
  const r = spawnSync(process.execPath, [PROOF], { cwd: PLANE, encoding: 'utf8' });
  return { label, exit: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

const censusLine = (out) => (out.split('\n').find((l) => l.startsWith('[§11.7-11]')) || '(no §11.7-11 line printed)').trim();
// The clause's own sentence, read out of the print line rather than asserted as a fixed number.
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

console.log(`[base] ${BASE} · plane ${PLANE} (outside the repository)`);
console.log(`[closure] ${CLOSURE.length} files (${CLIENT_FILES.length} client sources, ${JAVA.length} Java) + node_modules/typescript`);

// Phase 1 — the before-picture, off the base ref's own bytes with the base ref's own proof.
plant('BASE');
const before = runProof('base bytes × base proof');
console.log(`\n[phase 1 · BASE×BASE] exit ${before.exit} · ${classify(before)}`);
console.log(`  ${reasonSentence(before.out)}`);

// Phase 2 — the blindness control: the SHIPPED gate over a tree that has the charged shapes. Predicted GREEN,
// because 11.9b does not exist there yet. This is the measurement that the hole v593 disclosed was real.
const blind = [];
for (const n of ['R1', 'R4']) {
  create([n]);
  const r = runProof(`base proof × ${n} plant`);
  blind.push({ n, verdict: classify(r), exit: r.exit });
  console.log(`\n[phase 2 · BASE proof × ${n} plant, predicted green] exit ${r.exit} · ${classify(r)}`);
  console.log(`  ${reasonSentence(r.out)}`);
  remove([n]);
}

// Phase 3 — arms on the draft bytes.
plant('WORKTREE');
const snapshot = new Map();
for (const rel of CLOSURE) snapshot.set(rel, hash(rel));
console.log(`\n[phase 3 · DRAFT×NEW] snapshot hashed`);
console.log(`  ${reasonSentence(runProof('draft × new').out)}`);

const ARMS = [
  { tag: 'A0', verdict: 'green', plants: [], note: 'control: the draft tree as it stands' },
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
  const leaked = CLOSURE.filter((rel) => hash(rel) !== snapshot.get(rel));
  if (leaked.length) throw new Error(`[${arm.tag}] the plane does not match its snapshot after restore: ${leaked.join(', ')}`);
}

const blindOk = blind.every((b) => b.verdict === 'green');
console.log(`\n[arms] ${ARMS.length} arms · ${matched}/${ARMS.length} MATCHED`);
console.log(`[arms] phase 2 blindness control: ${blind.map((b) => `${b.n}=${b.verdict}`).join(' ')} · ${blindOk ? 'the shipped gate saw neither shape' : 'UNEXPECTED'}`);
console.log(`[arms] the repository worktree was never a fixture: every write landed in ${PLANE}`);
rmSync(PLANE, { recursive: true, force: true });
console.log(`[arms] plane removed · ${!existsSync(PLANE) ? 'gone' : 'STILL PRESENT'}`);
process.exitCode = matched === ARMS.length && blindOk ? 0 : 1;
