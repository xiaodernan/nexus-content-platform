// v586 witness arms — §11.7–§11.11, judged on a plane OUTSIDE the repository.
//
// The battery splices each defect into a frozen copy of the bytes the proof reads, runs the proof with that
// copy as its cwd, and classifies the red by the CLAUSE MESSAGE rather than by a count. Nothing here writes
// inside D:/终极项目: the worktree other lanes are committing from is never a fixture.
//
// Every splice must match its needle EXACTLY ONCE before the run (a needle that moved is a refused arm, not a
// silently green one), the plane file is restored from the snapshot after every arm, and the whole plane is
// re-hashed at the end — an arm that leaks its mutation into the next arm grades the previous arm again.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLANE = resolve(SRC, '..', 'nexus-v586-arms');
const PROOF = 'docs/evidence/m9/audit-contract-proof.mjs';

const JAVA = [
  'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditController.java',
  'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditService.java',
  'services/nexus-api/src/main/java/dev/nexus/api/social/ReportDtos.java',
  'services/nexus-api/src/main/java/dev/nexus/api/social/ReportService.java',
  'services/nexus-api/src/main/java/dev/nexus/api/moderation/ModerationService.java',
];

// The §11 census walks apps/studio/src and refuses a population thinner than 20, so the plane carries every
// shipped and test source, not only the graded files — a closure of 14 would trip the floor and grade nothing.
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

rmSync(PLANE, { recursive: true, force: true });
mkdirSync(PLANE, { recursive: true });
for (const rel of CLOSURE) {
  const from = join(SRC, rel);
  if (!existsSync(from)) throw new Error(`the plane closure names ${rel} but the repository has no such file — the closure is a copy, not a claim`);
  const to = join(PLANE, rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
}
// `require('typescript')` resolves upward from the proof file, so the plane needs its own real copy. Never a
// junction: amendment 542 named what a link back into the graded tree costs.
mkdirSync(join(PLANE, 'node_modules'), { recursive: true });
cpSync(join(SRC, 'node_modules/typescript'), join(PLANE, 'node_modules/typescript'), { recursive: true });

const snapshot = new Map();
const hash = (rel) => createHash('sha256').update(readFileSync(join(PLANE, rel))).digest('hex').slice(0, 12);
for (const rel of CLOSURE) snapshot.set(rel, hash(rel));
console.log(`[plane] ${PLANE}`);
console.log(`[plane] ${CLOSURE.length} closure files (${CLIENT_FILES.length} client sources, ${JAVA.length} Java) · real copy of node_modules/typescript · snapshot hashed`);

const OPS = 'apps/studio/src/lib/ops.ts';
const BAR = 'apps/studio/src/lib/reportBar.ts';
const MOD = 'apps/studio/src/lib/moderation.ts';
const RSVC = 'services/nexus-api/src/main/java/dev/nexus/api/social/ReportService.java';
const MSVC = 'services/nexus-api/src/main/java/dev/nexus/api/moderation/ModerationService.java';

const BAR_IMPORT = `import { REPORT_STATUS_NOT_GIVEN, reportStanding, reportStatusText, reportWithdrawn } from './ops';`;
const STANDING = `export const REPORT_STATUSES_STANDING: readonly string[] = ['open'];`;
const UNREAD_FACE = `  if (status === REPORT_STATUS_NOT_GIVEN) return 'the service gave no status';`;
const GUARD = `        if (!ReportDtos.STATUS_OPEN.equals(row.getStatus())) {`;

// verdict → the fingerprint of the clause message that must appear for that verdict to be the one the run reached
const VERDICTS = {
  '11.7-face-count': 'is declared by 2 shipped files',
  '11.7-specifier': 'does not import that name from a module named ops',
  '11.9': 'spell a status the service declares as their own literal',
  '11.10': 'about a status it did not receive',
  '11.11-equality': "standing and the service's own guards refuse",
  '11.11-carrier': "has lost the service's own standing test",
  '9-open-count': 'an acknowledged report is not "still waiting"',
};

const ARMS = [
  {
    tag: 'A0',
    verdict: 'green',
    note: 'control — the plane as frozen must answer with its own passing line',
    splices: [],
  },
  {
    tag: 'A1',
    verdict: '11.7-face-count',
    note: 'the second face comes back: reportBar.ts declares its own reportStatusText and drops the import',
    splices: [{ rel: BAR, needle: BAR_IMPORT, repl: `import { REPORT_STATUS_NOT_GIVEN, reportStanding, reportWithdrawn } from './ops';\nexport function reportStatusText(status: string): string {\n  return String(status);\n}` }],
  },
  {
    tag: 'A2',
    verdict: '11.7-specifier',
    note: 'the same word, taken from the wrong shelf: reportBar.ts imports the face from moderation.ts, which re-exports the owner',
    splices: [{ rel: BAR, needle: BAR_IMPORT, repl: `import { REPORT_STATUS_NOT_GIVEN, reportStanding, reportWithdrawn } from './ops';\nimport { reportStatusText } from './moderation';` }],
  },
  {
    tag: 'A3',
    verdict: '11.9',
    note: "the desk re-learns the literal: `status === 'open' || reportStanding(status)` — behaviourally identical today, and that is the point",
    splices: [{ rel: MOD, needle: `    open: reportStanding(status),`, repl: `    open: status === 'open' || reportStanding(status),` }],
  },
  {
    tag: 'A4',
    verdict: '11.10',
    note: 'the fold returns BY MEANING, not by a literal: the owner answers an unread status with the old sentence from the bar, so no census of quoted statuses can see it',
    splices: [{ rel: OPS, needle: UNREAD_FACE, repl: `  if (status === REPORT_STATUS_NOT_GIVEN) return 'not acknowledged yet';` }],
  },
  {
    tag: 'A5',
    verdict: '11.11-equality',
    note: 'the client declares nothing standing while both service guards still refuse everything but open',
    splices: [{ rel: OPS, needle: STANDING, repl: `export const REPORT_STATUSES_STANDING: readonly string[] = [];` }],
  },
  {
    tag: 'A6',
    verdict: '9-open-count',
    note: 'acknowledged marked standing — predicted to die in §9 (which runs first and already charges that an acknowledged report is not "still waiting"), NOT in 11.11',
    splices: [{ rel: OPS, needle: STANDING, repl: `export const REPORT_STATUSES_STANDING: readonly string[] = ['open', 'acknowledged'];` }],
  },
  {
    tag: 'A7',
    verdict: '11.11-carrier',
    note: 'both guards re-spelled as the same test on a string literal — the standing rule survives, its READABLE shape does not, and the clause must refuse to certify against nothing',
    splices: [
      { rel: RSVC, needle: GUARD, repl: `        if (!"open".equals(row.getStatus())) {` },
      { rel: MSVC, needle: GUARD, repl: `        if (!"open".equals(row.getStatus())) {` },
    ],
  },
];

function runProof() {
  const r = spawnSync(process.execPath, [PROOF], { cwd: PLANE, encoding: 'utf8', maxBuffer: 1 << 28 });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

function classify(run) {
  if (run.code === 0) return 'green';
  for (const [verdict, fingerprint] of Object.entries(VERDICTS)) {
    if (run.out.includes(fingerprint)) return verdict;
  }
  return 'UNCLASSIFIED';
}

const rows = [];
for (const arm of ARMS) {
  for (const s of arm.splices) {
    const text = readFileSync(join(PLANE, s.rel), 'utf8');
    const hits = text.split(s.needle).length - 1;
    if (hits !== 1) {
      throw new Error(`${arm.tag}: the needle in ${s.rel} matched ${hits} time(s), not exactly once — refuse to run an arm whose splice is not the one it claims`);
    }
  }
  for (const s of arm.splices) {
    const p = join(PLANE, s.rel);
    const text = readFileSync(p, 'utf8');
    writeFileSync(p, text.split(s.needle).join(s.repl));
  }
  const run = runProof();
  const observed = classify(run);
  for (const s of arm.splices) {
    const from = join(SRC, s.rel);
    cpSync(from, join(PLANE, s.rel));
  }
  const drifted = CLOSURE.filter((rel) => hash(rel) !== snapshot.get(rel));
  if (drifted.length > 0) throw new Error(`${arm.tag}: the plane did not come back byte-identical — these files still carry the arm's mutation: ${drifted.join(', ')}`);
  const matched = observed === arm.verdict ? 'MATCHED' : 'MISMATCH';
  const tail = run.out.split('\n').filter((l) => l.startsWith('AssertionError') || l.includes('Assertion'))[0] || '';
  rows.push({ tag: arm.tag, verdict: arm.verdict, observed, matched, tail });
  console.log(`[${arm.tag}] predicted ${arm.verdict} · observed ${observed} · exit ${run.code} · ${matched}${tail ? `\n       ${tail.slice(0, 190)}` : ''}`);
}

const mismatched = rows.filter((r) => r.matched === 'MISMATCH');
console.log(`\n[arms] ${rows.length} arms · ${rows.length - mismatched.length}/${rows.length} MATCHED`);
for (const r of mismatched) console.log(`  ${r.tag}: predicted ${r.verdict}, observed ${r.observed}`);
console.log(`[arms] the repository worktree was never a fixture: every write landed in ${PLANE}`);
rmSync(PLANE, { recursive: true, force: true });
console.log(`[arms] plane removed · ${existsSync(PLANE) ? 'STILL PRESENT' : 'gone'}`);
process.exit(mismatched.length === 0 ? 0 : 1);
