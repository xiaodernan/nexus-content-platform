// v599 witness arms — a clause label is claimed ONCE, and the block `5a3a841` wrote is measured dead.
//
// Three phases on a plane OUTSIDE the repository (never the shared worktree — other lanes commit from it):
//   1. plant the BROKEN ref's bytes and run the BROKEN proof: the before-picture. The claim is that the row
//      does not grade anything at those bytes, it CRASHES on its own print line.
//   2. plant the BROKEN bytes again with an R1 offender: the dead-by-construction measurement. The fake
//      §11.10's trigger is a strict superset of §11.9b's, so the first red must be §11.9b's sentence and the
//      fake sentence must never appear — which is what makes it unchargeable rather than merely unused.
//   3. plant the draft bytes (the carriers back, §11.12 in) and splice the plane's own proof: one arm per
//      rule, one per carrier, plus the discrimination arm that a MENTION is not a declaration.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLANE = resolve(SRC, '..', 'nexus-v599-arms');
const PROOF = 'docs/evidence/m9/audit-contract-proof.mjs';
const BROKEN = '5a3a84131a2a7dbb98710a5c5794f460c60398d2'; // the ref whose §11 row crashes — pinned by sha, not by HEAD

const JAVA = [
  'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditController.java',
  'services/nexus-api/src/main/java/dev/nexus/api/ops/AuditService.java',
  'services/nexus-api/src/main/java/dev/nexus/api/social/ReportDtos.java',
  'services/nexus-api/src/main/java/dev/nexus/api/social/ReportService.java',
  'services/nexus-api/src/main/java/dev/nexus/api/moderation/ModerationService.java',
];
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
const refBytes = (ref, rel) => execFileSync('git', ['show', `${ref}:${rel}`], { cwd: SRC, maxBuffer: 64 * 1024 * 1024 });
const workBytes = (rel) => readFileSync(join(SRC, rel));

function plant(ref) {
  rmSync(PLANE, { recursive: true, force: true });
  mkdirSync(PLANE, { recursive: true });
  for (const rel of CLOSURE) {
    mkdirSync(dirname(join(PLANE, rel)), { recursive: true });
    if (ref === 'WORKTREE' && !existsSync(join(SRC, rel))) throw new Error(`the closure names ${rel} but the repository has no such file`);
    writeFileSync(join(PLANE, rel), ref === 'BROKEN' ? refBytes(BROKEN, rel) : workBytes(rel));
  }
  mkdirSync(join(PLANE, 'node_modules'), { recursive: true });
  cpSync(join(SRC, 'node_modules/typescript'), join(PLANE, 'node_modules/typescript'), { recursive: true });
}

const hash = (rel) => (existsSync(join(PLANE, rel)) ? createHash('sha256').update(readFileSync(join(PLANE, rel))).digest('hex').slice(0, 12) : '(absent)');
const runProof = () => {
  const r = spawnSync(process.execPath, [PROOF], { cwd: PLANE, encoding: 'utf8' });
  return { exit: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
};

const NEEDLES = {
  '11.12-own-label-carrier': 'does not find its OWN label among the',
  '11.12-tag-carrier': 'clause-range tags of the shape',
  '11.12-endpoint-carrier': 'as an endpoint, but no comment declares that label',
  '11.12-duplicate-label': 'clause label(s) declared more than once in this file',
  '11.9b-charge': 'use a report reason word as a reason instead of asking',
  '11.9b-owner-words-carrier': 'declared reasons as string literals',
  '11.9b-domain-carrier': 'reads a `.reason` field at all',
  'carrier-crash': 'ReferenceError: reasonFieldReads is not defined',
  'fake-case-death': 'case clauses that should have triggered early termination',
};
const classify = ({ exit, out }) => {
  if (exit === 0) return 'green';
  const hit = Object.entries(NEEDLES).find(([, n]) => out.includes(n));
  return hit ? hit[0] : `UNCLASSIFIED(exit ${exit}: ${(out.split('\n').find((l) => l.includes('Error')) || out).slice(0, 180)})`;
};

const R1 = {
  rel: 'apps/studio/src/components/ReasonKeyedPanel.tsx',
  bytes: `export function reasonCaption(report: { reason: string }): string {
  if (report.reason === 'spam') return 'a spam report';
  return 'a report';
}
`,
};
// The splices reach the PROOF's own bytes, which is the file §11.12 reads. Every needle must match once.
const SPLICES = {
  A1: { needle: '    // 11.10 — the two faces RUN', body: '    // 11.10 — an arm wearing this label a second time (v599 A1)\n    // 11.10 — the two faces RUN' },
  A2: { needle: '    // 11.11 — WHICH statuses stand', body: '    // the citation §11.10 above is a MENTION of a neighbour, not a declaration (v599 A2)\n    // 11.11 — WHICH statuses stand' },
  A3: { needle: '    // 11.11 — WHICH statuses stand', body: '    // 11.11 - WHICH statuses stand' },
  A4: { needle: '    // 11.12 — ', body: '    // 11.12: ' },
};

console.log(`[broken] ${BROKEN} · plane ${PLANE} (outside the repository) · closure ${CLOSURE.length} files (${CLIENT_FILES.length} client sources, ${JAVA.length} Java)`);

plant('BROKEN');
const p1 = runProof();
console.log(`\n[phase 1 · BROKEN bytes × BROKEN proof] exit ${p1.exit} · ${classify(p1)}`);
console.log(`  ${NEEDLES['carrier-crash'] && p1.out.includes(NEEDLES['carrier-crash']) ? 'the row dies on its own print line: ReferenceError: reasonFieldReads is not defined' : 'NOT the carrier crash — the before-picture is a different finding'}`);

// Phase 2 — the dead-by-construction measurement: with a charged file present, WHICH sentence is the first red?
writeFileSync(join(PLANE, R1.rel), R1.bytes);
const p2 = runProof();
const firstLine = (p2.out.split('\n').find((l) => l.includes('AssertionError')) || p2.out.split('\n').find((l) => l.includes('Error')) || '').trim();
console.log(`\n[phase 2 · BROKEN bytes × BROKEN proof × R1 plant] exit ${p2.exit} · ${classify(p2)}`);
console.log(`  first red: ${classify(p2)} · the fake §11.10's own sentence present in the output: ${p2.out.includes(NEEDLES['fake-case-death'])}`);
rmSync(join(PLANE, R1.rel), { force: true });

plant('WORKTREE');
const proofSnapshot = readFileSync(join(PLANE, PROOF));
const hashes = new Map(CLOSURE.map((rel) => [rel, hash(rel)]));
const p3 = runProof();
console.log(`\n[phase 3 · DRAFT bytes × DRAFT proof] exit ${p3.exit} · ${classify(p3)}`);
console.log(`  ${(p3.out.split('\n').find((l) => l.startsWith('[§11.12]')) || '(no §11.12 line printed)').trim()}`);

const ARMS = [
  { tag: 'A0', verdict: 'green', splice: null, note: 'control: the draft bytes as they stand' },
  { tag: 'A1', verdict: '11.12-duplicate-label', splice: 'A1', note: 'a second block declaring `11.10` — what 5a3a841 actually did' },
  { tag: 'A2', verdict: 'green', splice: 'A2', note: 'DISCRIMINATION: a comment that CITES §11.10 in prose is not a declaration' },
  { tag: 'A3', verdict: '11.12-endpoint-carrier', splice: 'A3', note: 'the range tag\'s endpoint 11.11 re-spelled so the grammar goes blind — charged' },
  { tag: 'A4', verdict: '11.12-own-label-carrier', splice: 'A4', note: 'this clause\'s OWN label re-spelled — a grammar blind to itself cannot certify uniqueness' },
];

let matched = 0;
for (const arm of ARMS) {
  if (arm.splice) {
    const { needle, body } = SPLICES[arm.splice];
    const src = readFileSync(join(PLANE, PROOF), 'utf8');
    const n = src.split(needle).length - 1;
    if (n !== 1) throw new Error(`[${arm.tag}] the splice needle matched ${n} times, not once: ${needle}`);
    writeFileSync(join(PLANE, PROOF), src.replace(needle, body));
  }
  const res = runProof();
  const verdict = classify(res);
  const ok = verdict === arm.verdict;
  if (ok) matched += 1;
  console.log(`[${arm.tag}] predicted ${arm.verdict} · observed ${verdict} · exit ${res.exit} · ${ok ? 'MATCHED' : 'MISMATCH'}`);
  console.log(`       ${(res.out.split('\n').find((l) => l.startsWith('[§11.12]')) || res.out.split('\n').find((l) => l.includes('AssertionError')) || '').trim().slice(0, 220)}`);
  writeFileSync(join(PLANE, PROOF), proofSnapshot);
  if (hash(PROOF) !== hashes.get(PROOF)) throw new Error(`[${arm.tag}] the proof did not come back to its snapshot bytes`);
  const leaked = CLOSURE.filter((rel) => hash(rel) !== hashes.get(rel));
  if (leaked.length) throw new Error(`[${arm.tag}] the plane does not match its snapshot: ${leaked.join(', ')}`);
}

console.log(`\n[arms] ${ARMS.length} arms · ${matched}/${ARMS.length} MATCHED`);
console.log(`[arms] the repository worktree was never a fixture: every write landed in ${PLANE}`);
rmSync(PLANE, { recursive: true, force: true });
console.log(`[arms] plane removed · ${!existsSync(PLANE) ? 'gone' : 'STILL PRESENT'}`);
process.exitCode = matched === ARMS.length ? 0 : 1;
