// NEXUS v605 (docs/evidence/m9) — THE REASON CENSUS AND THE LABEL CENSUS ARE A ROW NOW: EVERY CHARGE §11.9b AND §11.12 MAKE IS RE-EARNED ON A PLANE OUTSIDE THE REPOSITORY, ON THE COMMITTED BYTES, ON EVERY BUILD (ADR 0016 amendment 553).
// sweep-budget-ms: 420000
// sweep-asks-repository: git rev-parse HEAD, git cat-file -e, git merge-base --is-ancestor, git ls-tree -r and git show of a pinned BASE ref and of HEAD
// v641 (ADR 0016 amendment 568) — two of the §11.12 arms went GREEN on their own premises, because they hard-named
// clause numbers (13, and the 11.13/11.14 pair) that the graded proof has since GRANTED to real clauses; the fix is
// to derive an undeclared number from the census's own count, which is what makes arms A10 and A14 un-ageable.
//
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
//   3. HEAD's bytes × the shipped proof, and the arms: five charges, one per reason rule, plus two plants §11.9b
//      refuses to charge, predicted green on purpose. Then seven arms against the PROOF'S OWN bytes for §11.12
//      (§11.12 as `f53f988` landed it, plus the fourth carrier the commit before this row added — a
//      duplicated label, a declaration the census cannot read, a range
//      tag naming an endpoint nobody declares, a verdict line whose §11 tag no comment declares, the same
//      charge re-run on the real bytes of `6625992` with those bytes' own tags re-aimed at numbers nothing
//      declares today, and A13, which re-plants `6625992`'s two lines EXACTLY as they landed and is predicted
//      GREEN because those two numbers became real clauses afterwards — the discrimination that keeps this
//      carrier from being a word-hunt about history) plus one that plants a
//      MENTION of an undeclared label in a string and stays green — the arm that makes the census's "a mention
//      is not a declaration" sentence a measurement instead of a remark. These eight mutate the graded file
//      itself, so the plane's copy is restored from the bytes this run planted and re-hashed against the
//      snapshot before the next arm is believed.
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

// The commit that printed two §11 clause tags no comment declared — the bytes the fourth carrier's reverse
// control runs under (amendment 553's record names it, so the arm reads them from the ref rather than from a
// hand-copy that would rot the day the prose is reworded).
const PRINTED_WITHOUT_CLAUSE = '6625992a616ace0d38bd13a3ff3e3e9df3c475a6';

const git = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: ROOT, encoding, maxBuffer: 64 * 1024 * 1024 });

if (!existsSync(join(ROOT, '.git'))) throw new Error(`${ROOT} is not a repository — this battery reads refs, so it cannot run on a bare copy`);
const HEAD_REF = git(['rev-parse', 'HEAD']).trim();
// spawnSync, not execFileSync: an ancestry refusal is a verdict this file has to read, and execFileSync would
// throw before a `.status` ever existed to check.
for (const [role, ref] of [['the pinned BASE', BASE], ['the printed-tag ref', PRINTED_WITHOUT_CLAUSE]]) {
  try {
    git(['cat-file', '-e', `${ref}^{commit}`]);
  } catch {
    throw new Error(`${role} ${ref} is not in this clone — the battery needs a full history (.github/workflows/ci.yml checks out with fetch-depth: 0; a shallow clone cannot state a "before")`);
  }
  if (spawnSync('git', ['merge-base', '--is-ancestor', ref, HEAD_REF], { cwd: ROOT }).status !== 0) {
    throw new Error(`${ref} is not an ancestor of ${HEAD_REF} — the "before" ref must be reachable from what is being graded`);
  }
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
  '11.12-duplicate': 'clause label(s) declared more than once',
  '11.12-blind': 'does not find its OWN label',
  '11.12-endpoint': 'as an endpoint',
  '11.12-print': 'of them are undeclared',
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
const headRun = runProof('HEAD × shipped');
console.log(`  ${reasonSentence(headRun.out)}`);

// Which clause numbers the graded file's OWN census declares is derived below, after the baseline is captured:
// the arms need a number the census does NOT see, and hard-coding one is exactly how A10 and A13 went stale — the
// proof gained labels 11.13 and 11.14 after those arms were written, so a tag naming 13 stopped being a defect and
// both arms turned green on their own premise.

// The §11.12 arms grade the PROOF ITSELF, so they rewrite the plane's copy of it. The baseline is the bytes
// this run planted, captured before the first splice; the snapshot re-hash below is what proves the restore.
const proofBaseline = readFileSync(join(PLANE, PROOF), 'utf8');
if (proofBaseline !== refBytes(HEAD_REF, PROOF).toString('utf8')) {
  throw new Error(`the plane's ${PROOF} is not the bytes of ${HEAD_REF.slice(0, 7)} — a splice would grade a file no commit holds`);
}

const spliceInto = (how) => {
  const { from, to } = how(proofBaseline);
  const hits = proofBaseline.split(from).length - 1;
  if (hits !== 1) throw new Error(`the splice needle occurs ${hits} times in ${PROOF}, expected exactly once: ${from.slice(0, 70)}`);
  const next = proofBaseline.replace(from, to);
  if (next === proofBaseline) throw new Error(`the splice changes no bytes in ${PROOF} — the arm would grade the unmutated file and call the green a measurement`);
  if (!next.includes(to)) throw new Error(`the spliced bytes are not in the file the arm writes — the replacement was not applied`);
  writeFileSync(join(PLANE, PROOF), next);
  return to;
};
const restoreProof = () => writeFileSync(join(PLANE, PROOF), proofBaseline);

// The two verdict lines `6625992` printed with no clause behind them, read from that ref rather than copied
// into this file: the reverse control has to run the new carrier over the bytes that actually landed.
const printedWithoutClause = refBytes(PRINTED_WITHOUT_CLAUSE, PROOF).toString('utf8')
  .split('\n')
  .filter((l) => /^\s*console\.log\(`\[§11\.1[34]\]/.test(l))
  .map((l) => l.replace(/\s+$/, ''));
if (printedWithoutClause.length !== 2) {
  throw new Error(`${PRINTED_WITHOUT_CLAUSE.slice(0, 7)} holds ${printedWithoutClause.length} undeclared §11 verdict line(s), not the 2 amendment 553 names — the reverse control has nothing to re-plant`);
}

// The label census's declaration grammar, mirrored from §11.12 so that an arm needing a number the census does
// NOT declare derives one instead of naming 13 and watching the file grant it a cycle later. The mirror is
// reconciled against the count §11.12 prints for itself, so a grammar that drifts from its owner stops this row
// rather than quietly picking an "undeclared" number that is already declared.
const DECLARATION_RE = /^[ \t]*\/\/+[ \t]*(11\.[0-9]+[a-z]?)[ \t]+—[ \t]/gm;
const declaredLabels = new Set([...proofBaseline.matchAll(DECLARATION_RE)].map((m) => m[1]));
const censusCount = /(\d+) clause labels declared in this file/.exec(headRun.out);
if (censusCount === null) {
  throw new Error(`the shipped proof's §11.12 line printed no label count — the arms cannot check their mirror of the declaration grammar against its owner`);
}
if (declaredLabels.size !== Number(censusCount[1])) {
  throw new Error(`this file's mirror of §11.12's grammar finds ${declaredLabels.size} clause labels while §11.12 itself counts ${censusCount[1]} — an arm would pick its "undeclared" number from a scan that disagrees with the census it grades`);
}
// Two numbers the census does NOT declare, taken ABOVE the highest label the file owns, so a spliced tag still
// reads as a clause that has not been written rather than as a hole in the middle of the numbering.
const highestDeclared = Math.max(...[...declaredLabels].map((label) => Number(/^11\.(\d+)$/.exec(label)?.[1] ?? 0)));
const undeclaredSuffixes = [highestDeclared + 1, highestDeclared + 2].filter((n) => !declaredLabels.has(`11.${n}`));
if (undeclaredSuffixes.length !== 2) {
  throw new Error(`only ${undeclaredSuffixes.length} of the two numbers above the highest declared label (${highestDeclared}) are undeclared — the derivation cannot promise an arm a number the census does not see`);
}

const ANCHOR_1110 = '    // 11.10 — the two faces RUN';
const ANCHOR_1112 = '// 11.12 — a clause LABEL';
const ANCHOR_FOURTH = '    // Fourth: a tag PRINTED as a verdict';

const ARMS = [
  { tag: 'A0', verdict: 'green', plants: [], note: 'control: HEAD as it stands charges nobody' },
  { tag: 'A1', verdict: '11.9b-R1', plants: ['R1'], note: 'a panel that keys its own caption on report.reason === the wire token' },
  { tag: 'A2', verdict: '11.9b-R2', plants: ['R2'], note: 'a switch over row.reason with a declared reason as a case label' },
  { tag: 'A3', verdict: '11.9b-R3', plants: ['R3'], note: 'a second word TABLE: two reason words as the keys of one object literal, no face declared' },
  { tag: 'A4', verdict: '11.9b-R4', plants: ['R4'], note: 'the whole reason list re-declared under a name §11.1 does not know' },
  { tag: 'A5', verdict: '11.9b-R5', plants: ['R5'], note: 'a JSX attribute named data-reason wearing a wire token' },
  { tag: 'A6', verdict: 'green', plants: ['INNOCENT'], note: 'DISCRIMINATION: a category list and label map that spell `other` in their own vocabulary' },
  { tag: 'A7', verdict: 'green', plants: ['SEED'], note: 'DISCLOSED BOUND: a seed ROW written with a reason word is data the service accepts, not a second speaker' },
  {
    tag: 'A8',
    verdict: '11.12-duplicate',
    plants: [],
    splice: () => ({ from: ANCHOR_1110, to: `    // 11.10 — the arm claims this label too.\n${ANCHOR_1110}` }),
    note: '§11.12 as 5a3a841 left it: a second block wearing a number the file already owns',
  },
  {
    tag: 'A9',
    verdict: '11.12-blind',
    plants: [],
    splice: () => ({ from: ANCHOR_1112, to: '// 11.12: a clause LABEL' }),
    note: 'the census grammar turned away from its own heading — the silent-grammar control that makes "no duplicates" a measurement',
  },
  {
    tag: 'A10',
    verdict: '11.12-endpoint',
    plants: [],
    splice: () => ({ from: '[§11.7-11]', to: `[§11.7-${undeclaredSuffixes[0]}]` }),
    note: `the run prints a range whose upper endpoint (${undeclaredSuffixes[0]}) no comment declares — coverage certified over clauses the census cannot see; the number is derived from the census's own count, because naming 13 here was true when this arm was written and stopped being true when the file granted 11.13`,
  },
  {
    tag: 'A11',
    verdict: 'green',
    plants: [],
    splice: () => ({
      from: ANCHOR_1110,
      to: `    const armMention = 'the census keys on a declaration, so this 11.${undeclaredSuffixes[1]} — mention inside a string is not a claim';\n${ANCHOR_1110}`,
    }),
    note: `DISCRIMINATION: an undeclared label (${undeclaredSuffixes[1]}) MENTIONED in a string stays uncharged, which is what separates a census from a word-hunt — A10 and A13 went green for naming 13 in prose, so this number is derived too`,
  },
  {
    tag: 'A12',
    verdict: '11.12-print',
    plants: [],
    splice: () => ({
      from: ANCHOR_FOURTH,
      to: '    console.log(`[§11.99] an arm prints a verdict with no clause behind it`);\n' + ANCHOR_FOURTH,
    }),
    note: 'the fourth carrier: a printed §11 tag with no declaration is a citation wearing a verdict\'s clothes',
  },
  {
    tag: 'A13',
    verdict: 'green',
    plants: [],
    splice: () => ({ from: ANCHOR_FOURTH, to: `${printedWithoutClause.join('\n')}\n${ANCHOR_FOURTH}` }),
    note: `DISCRIMINATION on ${PRINTED_WITHOUT_CLAUSE.slice(0, 7)}'s own bytes: the two lines that landed at v604 with no clause behind them are re-planted as they were, and today they are GREEN — because 11.13 and 11.14 were granted real clauses in the cycles after (v636/v637), which is exactly the difference between a tag that names a clause and one that does not. The carrier is not refuted by them; A14 charges the same bytes with the tags moved to numbers nothing declares.`,
  },
  {
    tag: 'A14',
    verdict: '11.12-print',
    plants: [],
    splice: () => ({
      from: ANCHOR_FOURTH,
      to: `${printedWithoutClause.map((line, i) => line.replace(/\[§11\.[0-9]+\]/, `[§11.${undeclaredSuffixes[i]}]`)).join('\n')}\n${ANCHOR_FOURTH}`,
    }),
    note: `REVERSE CONTROL kept alive: ${PRINTED_WITHOUT_CLAUSE.slice(0, 7)}'s two verdict lines, word for word, with their tags re-aimed at the numbers the census does not declare today (${undeclaredSuffixes.map((n) => `11.${n}`).join(', ')}) — the defect those bytes actually had is charged, and the arm cannot age into a green when the file grants another label`,
  },
];

let matched = 0;
for (const arm of ARMS) {
  create(arm.plants);
  if (arm.splice) spliceInto(arm.splice);
  const res = runProof(arm.tag);
  const verdict = classify(res);
  const ok = verdict === arm.verdict;
  if (ok) matched += 1;
  const charged = chargedCount(res.out);
  console.log(`[${arm.tag}] predicted ${arm.verdict} · observed ${verdict} · exit ${res.exit} · ${ok ? 'MATCHED' : 'MISMATCH'}`);
  console.log(`       ${Number.isNaN(charged.n) ? 'charge set not reached (a §11.12 red stops before the print)' : `charged: ${charged.n} (${charged.who})`} · ${arm.note}`);
  if (!ok) console.log(`       ${(res.out.split('\n').find((l) => l.includes('AssertionError')) || res.out).trim().slice(0, 260)}`);
  if (arm.splice) restoreProof();
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
