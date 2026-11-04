// v593 witness arms — the reason SENTENCE and the reason LIST must share one file, and the readers must
// reach it through the owner's specifier.
//
// Three phases, on a plane OUTSIDE the repository (never the shared worktree — other lanes commit from it):
//   1. plant the BASE ref's bytes and run the BASE proof: this is the "before" measurement, read off the
//      tree that still had the split, not off the tree that fixes it.
//   2. plant the base bytes again and run the NEW proof: the reverse control. A clause that stays green on
//      the pre-fix tree measures nothing, so this run is EXPECTED to be red, at the reason pin.
//   3. plant the draft bytes and run the arms.
//
// Every splice must match its needle EXACTLY ONCE before the run, every arm restores the file it mutated,
// and the plane is re-hashed against its snapshot after every arm.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLANE = resolve(SRC, '..', 'nexus-v593-arms');
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

const mkdirFor = (rel) => mkdirSync(dirname(join(PLANE, rel)), { recursive: true });

function plant(ref) {
  rmSync(PLANE, { recursive: true, force: true });
  mkdirSync(PLANE, { recursive: true });
  for (const rel of CLOSURE) {
    const to = join(PLANE, rel);
    mkdirFor(rel);
    if (!existsSync(join(SRC, rel))) throw new Error(`the plane closure names ${rel} but the repository has no such file`);
    writeFileSync(to, ref === 'BASE' ? gitBytes(rel) : workBytes(rel));
  }
  mkdirSync(join(PLANE, 'node_modules'), { recursive: true });
  cpSync(join(SRC, 'node_modules/typescript'), join(PLANE, 'node_modules/typescript'), { recursive: true });
}

const hash = (rel) => createHash('sha256').update(readFileSync(join(PLANE, rel))).digest('hex').slice(0, 12);

function runProof(label) {
  const r = spawnSync(process.execPath, [PROOF], { cwd: PLANE, encoding: 'utf8' });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return { label, exit: r.status, out };
}

const faceLine = (out) => (out.split('\n').find((l) => l.startsWith('[§11.7-11]')) || '(no §11.7-11 line printed)').trim();
const ownerOf = (out, face) => {
  const re = new RegExp(`${face} (?:is declared only in|by) ([^,]+)`);
  const m = faceLine(out).match(re);
  return m ? m[1].trim() : '(not printed)';
};

const OPS = 'apps/studio/src/lib/ops.ts';
const BAR = 'apps/studio/src/lib/reportBar.ts';
const MOD = 'apps/studio/src/lib/moderation.ts';

const OPS_FACE = `export function reportReasonText(reason: string): string {`;
const BAR_REEXPORT = `export { reportReasonText };`;
const BAR_IMPORT = `import { REPORT_STATUS_NOT_GIVEN, reportReasonText, reportStanding, reportStatusText, reportWithdrawn } from './ops';`;
const MOD_IMPORT = `import { REPORT_STATUS_NOT_GIVEN, reportReasonText, reportStanding, reportStatusText, statusGaps, statusGapText } from './ops';`;
const OPS_OTHER = `  other: 'something else',`;

const BAR_DECLARED = `export function reportReasonText(reason: string): string {
  switch (reason) {
    case 'other':
      return 'something else';
    default:
      return reason;
  }
}`;

const VERDICTS = {
  green: null,
  '11.7-reason-pin': 'the reason words are now owned by',
  '11.7-face-count': 'is declared by 2 shipped files',
  '11.7-reason-specifier': 'uses reportReasonText as a value but does not import that name from a module named ops',
};

const classify = ({ exit, out }) => {
  if (exit === 0) return 'green';
  for (const [verdict, needle] of Object.entries(VERDICTS)) {
    if (needle && out.includes(needle)) return verdict;
  }
  return `UNCLASSIFIED(exit ${exit}: ${(out.split('\n').find((l) => l.includes('AssertionError')) || out).slice(0, 160)})`;
};

const ARMS = [
  {
    tag: 'A0',
    verdict: 'green',
    note: 'control: the draft tree as it stands',
    splices: [],
  },
  {
    tag: 'A1',
    verdict: '11.7-reason-pin',
    note: 'the reason face moved BACK to reportBar.ts as its sole declaration — one speaker, wrong roof',
    splices: [
      { rel: OPS, from: OPS_FACE, to: `function retiredReasonFace(reason: string): string {` },
      { rel: BAR, from: BAR_IMPORT, to: `import { REPORT_STATUS_NOT_GIVEN, reportStanding, reportStatusText, reportWithdrawn } from './ops';` },
      { rel: BAR, from: BAR_REEXPORT, to: BAR_DECLARED },
    ],
  },
  {
    tag: 'A2',
    verdict: '11.7-face-count',
    note: 'the reason face declared in BOTH ops.ts and reportBar.ts — two answers to one wire token',
    splices: [
      { rel: BAR, from: BAR_IMPORT, to: `import { REPORT_STATUS_NOT_GIVEN, reportStanding, reportStatusText, reportWithdrawn } from './ops';` },
      { rel: BAR, from: BAR_REEXPORT, to: BAR_DECLARED },
    ],
  },
  {
    tag: 'A3',
    verdict: '11.7-reason-specifier',
    note: 'a reader takes the word off the shelf (./reportBar) instead of the file that declares it (./ops)',
    splices: [
      { rel: MOD, from: MOD_IMPORT, to: `import { REPORT_STATUS_NOT_GIVEN, reportStanding, reportStatusText, statusGaps, statusGapText } from './ops';\nimport { reportReasonText } from './reportBar';` },
    ],
  },
  {
    tag: 'A4',
    verdict: 'green',
    note: 'DISCLOSED BLIND SPOT: a reason WORD changed to another reason\'s word. The gate pins owners and specifiers; the word values are held by the suite (reportBar.test.ts:46-53), not by §11.',
    splices: [{ rel: OPS, from: OPS_OTHER, to: `  other: 'spam',` }],
  },
];

console.log(`[base] ${BASE} · plane ${PLANE} (outside the repository)`);
console.log(`[closure] ${CLOSURE.length} files (${CLIENT_FILES.length} client sources, ${JAVA.length} Java) + node_modules/typescript`);

// Phase 1 — the before-picture, off the base ref's own bytes with the base ref's own proof.
plant('BASE');
const before = runProof('base bytes × base proof');
console.log(`\n[phase 1 · BASE×BASE] exit ${before.exit}`);
console.log(`  reportReasonText declared by: ${ownerOf(before.out, 'reportReasonText')}`);
console.log(`  reportStatusText declared by: ${ownerOf(before.out, 'reportStatusText')}`);

// Phase 2 — reverse control: the NEW clause judged against the OLD tree. Predicted RED at the reason pin.
writeFileSync(join(PLANE, PROOF), workBytes(PROOF));
const control = runProof('base bytes × new proof');
const controlVerdict = classify(control);
console.log(`\n[phase 2 · BASE×NEW (reverse control, predicted 11.7-reason-pin)] exit ${control.exit} · ${controlVerdict}`);
console.log(`  ${(control.out.split('\n').find((l) => l.includes('AssertionError')) || '').trim().slice(0, 200)}`);

// Phase 3 — arms on the draft bytes.
plant('WORKTREE');
const snapshot = new Map();
for (const rel of CLOSURE) snapshot.set(rel, hash(rel));
console.log(`\n[phase 3 · DRAFT×NEW] snapshot hashed`);

let matched = 0;
for (const arm of ARMS) {
  const touched = new Set(arm.splices.map((s) => s.rel));
  for (const { rel, from, to } of arm.splices) {
    const path = join(PLANE, rel);
    const bytes = readFileSync(path, 'utf8');
    const hits = bytes.split(from).length - 1;
    if (hits !== 1) {
      for (const t of touched) writeFileSync(join(PLANE, t), snapshot.get(t) === hash(t) ? readFileSync(path, 'utf8') : workBytes(t));
      throw new Error(`[${arm.tag}] the needle in ${rel} matched ${hits} times, not once — the arm is refused, not silently graded`);
    }
    writeFileSync(path, bytes.replace(from, to));
  }
  const res = runProof(arm.tag);
  const verdict = classify(res);
  const ok = verdict === arm.verdict;
  if (ok) matched += 1;
  console.log(`[${arm.tag}] predicted ${arm.verdict} · observed ${verdict} · exit ${res.exit} · ${ok ? 'MATCHED' : 'MISMATCH'}`);
  if (!ok) console.log(`       ${(res.out.split('\n').find((l) => l.includes('AssertionError')) || res.out).trim().slice(0, 220)}`);
  for (const rel of touched) writeFileSync(join(PLANE, rel), workBytes(rel));
  const leaked = CLOSURE.filter((rel) => hash(rel) !== snapshot.get(rel));
  if (leaked.length) throw new Error(`[${arm.tag}] the plane does not match its snapshot after restore: ${leaked.join(', ')}`);
}

console.log(`\n[arms] ${ARMS.length} arms · ${matched}/${ARMS.length} MATCHED`);
console.log(`[arms] the repository worktree was never a fixture: every write landed in ${PLANE}`);
rmSync(PLANE, { recursive: true, force: true });
console.log(`[arms] plane removed · ${!existsSync(PLANE) ? 'gone' : 'STILL PRESENT'}`);
process.exitCode = matched === ARMS.length && controlVerdict === '11.7-reason-pin' ? 0 : 1;
