// NEXUS v542 (docs/evidence/ci) — THE ARMS' RECEIPT IS A ROW: the arming tool's verdict is only as fresh as
// the bytes it graded, and this proof refuses when any of those bytes has moved since (ADR 0016 amendment 525).
//
// Why this exists, stated the way §60 requires: v540 measured the arming tool and found three arms that had
// gone stale under a table that kept quoting them — the tool is human-run by design, so the only thing between
// a green run and a silent rot was memory. This row is the memory made checkable: `ci-wiring-arms.mjs` writes
// `arms-receipt.json` on a full green run with the sha256 of every subject it read (the workflow, the gate, the
// tool, the runner, the sweep, the two script entries the gate names, this directory's rule, and the derived
// population with its budget markers), and this proof recomputes all of them. A subject that changed since the
// receipt reddens the build with the command that refreshes it — so a change to the wiring now carries either a
// re-run of the arms or a red build, which is the choice the rot never offered.
//
// The clauses are ordered refusals-first in the shape they were learned: the receipt must EXIST and claim a
// full green run (§1), its hashes must match the bytes (§2), its population must match the derivation (§3), and
// it must list this row among what it graded (§4 — amendment 102: the counter counts itself).
//
// The fixture arms at the bottom measure each refusal on a synthetic plane, so "the receipt is checked" is a
// fact about a red, not a reading of this paragraph.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareReceipt, FRESHNESS_ROW, makeReceipt, RECEIPT_FILE, SUBJECT_FILES,
} from './arms-receipt.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SELF = 'docs/evidence/ci/arms-freshness-proof.mjs';
const CLAUSES = ['§1', '§2', '§3', '§4'];

/**
 * The four clauses, as a function of a root, so the fixture arms below grade the same code the build runs. It
 * returns the clauses that printed; a refusal throws, and the arm reads how far it got (the frontier rule the
 * wiring arms use: everything below the aim printed, nothing above it did).
 */
function judge(root, log = () => {}) {
  const printed = [];
  const pass = (clause, line) => {
    printed.push(clause);
    log(`[${clause}] ${line}`);
  };

  let receipt = null;
  try {
    receipt = JSON.parse(readFileSync(join(root, RECEIPT_FILE), 'utf8'));
  } catch (e) {
    receipt = null;
    assert.fail(`${RECEIPT_FILE}: there is no readable receipt (${e.code === 'ENOENT' ? 'the file is not on disk' : e.message}) — run \`node docs/evidence/ci/ci-wiring-arms.mjs\` and commit the receipt a full green run writes`);
  }
  assert.ok(receipt && typeof receipt === 'object' && !Array.isArray(receipt),
    `${RECEIPT_FILE}: the receipt parses to ${JSON.stringify(receipt)}, not a record — a JSON value that is not an object carries none of the fields this row reads`);

  // §1 the receipt is the tool's, names a FULL run, and its own counts agree with its arm list.
  assert.equal(receipt.tool, 'docs/evidence/ci/ci-wiring-arms.mjs', `${RECEIPT_FILE}: the receipt names ${JSON.stringify(receipt.tool)} rather than the arming tool — a receipt from another instrument certifies nothing about this one`);
  assert.equal(receipt.scope, 'full', `${RECEIPT_FILE}: the receipt's scope is ${JSON.stringify(receipt.scope)} — a partial run (--only) must not be able to leave a receipt, because a subset that went green says nothing about the arms it skipped`);
  assert.ok(Number.isInteger(receipt.arms) && receipt.arms > 0, `${RECEIPT_FILE}: the receipt's arm count is ${JSON.stringify(receipt.arms)}, not a positive whole number`);
  assert.ok(Number.isInteger(receipt.matched) && receipt.matched === receipt.arms, `${RECEIPT_FILE}: the receipt says ${JSON.stringify(receipt.matched)} of ${JSON.stringify(receipt.arms)} arms matched — a receipt may only be written by a run where every arm matched`);
  assert.ok(Array.isArray(receipt.armNames) && receipt.armNames.length === receipt.arms, `${RECEIPT_FILE}: the receipt lists ${Array.isArray(receipt.armNames) ? receipt.armNames.length : 'no'} arm names for a count of ${receipt.arms} — the number and the names must be the same fact`);
  pass('§1', `receipt from a full run: ${receipt.arms}/${receipt.arms} arms, written ${receipt.ranAt ?? '(no date)'}`);

  // §2 every subject the arms read still has the bytes it graded.
  const missing = Object.entries(SUBJECT_FILES).filter(([, rel]) => !existsSync(join(root, rel))).map(([key, rel]) => `${key} (${rel})`);
  assert.deepEqual(missing, [], `subject(s) the receipt graded are not on disk: ${missing.join(', ')} — a subject that vanished is a stronger change than one that moved`);
  const cmp = compareReceipt(root, receipt);
  assert.deepEqual(cmp.mismatched, [], `the arming tool's subjects changed since its last green run (${receipt.ranAt ?? 'unknown date'}): ${cmp.mismatched.join(', ')}${cmp.extra.length ? ` · the receipt also names subject(s) this rule does not: ${cmp.extra.join(', ')}` : ''} — re-run \`node docs/evidence/ci/ci-wiring-arms.mjs\` and commit the receipt it writes; a stale receipt is the exact rot v540 found`);
  pass('§2', `${Object.keys(cmp.want).length} subject hash(es) match: ${Object.keys(cmp.want).join(', ')}`);

  // §3 the population the arms derive from — rows, files and budget markers — is the one in the receipt.
  assert.deepEqual(cmp.differing, [], `the derived population differs from the receipt's: ${cmp.differing.slice(0, 4).join(' | ')}${cmp.differing.length > 4 ? ` (+${cmp.differing.length - 4} more)` : ''} — a row that appeared, vanished or changed its budget marker changes what the arms grade, so the receipt must be refreshed`);
  pass('§3', `population ${cmp.now.length} row(s) match the receipt, budget markers included`);

  // §4 the counter counts itself: a receipt that does not list this row graded a population without it.
  assert.ok(
    receipt.population.some((r) => r.name === FRESHNESS_ROW && r.file === SELF),
    `${RECEIPT_FILE}: the receipt's population does not list ${FRESHNESS_ROW} -> ${SELF}, so it was written against a wiring that did not yet contain this door — the counter must count itself (amendment 102)`,
  );
  pass('§4', `${FRESHNESS_ROW} is in the population the receipt graded`);

  return { receipt, printed };
}

// ── the build's run ───────────────────────────────────────────────────────────────────────────────────
const { receipt } = judge(ROOT, (line) => console.log(line));
console.log(`\narms freshness: the receipt is from a full ${receipt.arms}-arm run and every subject it graded still has the bytes it read · ${receipt.ranAt}`);

// ── the fixture arms ─────────────────────────────────────────────────────────────────────────────────
const BASE_FILES = {
  'package.json': JSON.stringify({
    name: 'nexus-freshness-plane',
    private: true,
    scripts: {
      'verify:fx': 'node docs/evidence/fx/a.mjs',
      'verify:proofs': 'node tools/ci/proof-set.mjs',
      'verify:ci-wiring': 'node docs/evidence/ci/ci-wiring-proof.mjs',
      'verify:arms-freshness': `node ${SELF}`,
    },
  }, null, 2),
  '.github/workflows/ci.yml': 'on:\n  push:\n    branches: [master]\njobs:\n  quality:\n    runs-on: ubuntu-latest\n',
  'docs/evidence/ci/ci-wiring-proof.mjs': '// fixture: the gate the receipt names\n',
  'docs/evidence/ci/ci-wiring-arms.mjs': '// fixture: the tool the receipt names\n',
  'tools/ci/proof-set.mjs': '// fixture: the runner the arms exercise\n',
  'docs/evidence/agents/sweep.mjs': '// fixture: the budget grammar the gate borrows\n',
  'docs/evidence/fx/a.mjs': '// sweep-budget-ms: 5000\nconsole.log(1);\n',
};

function plane(files, receiptEdit) {
  const dir = mkdtempSync(join(tmpdir(), 'nexus-freshness-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text, 'utf8');
  }
  const receiptPath = join(dir, RECEIPT_FILE);
  try {
    const built = makeReceipt({ root: dir, armNames: ['F0-control', 'F1-witness'] });
    writeFileSync(receiptPath, JSON.stringify(receiptEdit ? receiptEdit(built, dir) : built, null, 2), 'utf8');
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
  return dir;
}

const editReceipt = (dir, fn) => {
  const p = join(dir, RECEIPT_FILE);
  const r = JSON.parse(readFileSync(p, 'utf8'));
  writeFileSync(p, JSON.stringify(fn(r), null, 2), 'utf8');
};

const ARMS = [
  { tag: 'F0-control', files: BASE_FILES, expect: null },
  {
    tag: 'F1-workflow-moved', files: BASE_FILES, expect: '§2', sig: /workflow/,
    mutate: (dir) => writeFileSync(join(dir, '.github/workflows/ci.yml'), 'on: pull_request\n'),
  },
  {
    tag: 'F2-budget-marker-changed', files: BASE_FILES, expect: '§3', sig: /verify:fx/,
    mutate: (dir) => writeFileSync(join(dir, 'docs/evidence/fx/a.mjs'), '// sweep-budget-ms: 9000\nconsole.log(1);\n'),
  },
  {
    tag: 'F3-receipt-deleted', files: BASE_FILES, expect: '§2'.replace('§2', '§1'), sig: /no readable receipt/,
    mutate: (dir) => rmSync(join(dir, RECEIPT_FILE)),
  },
  {
    tag: 'F4-scope-partial', files: BASE_FILES, expect: '§1', sig: /scope is "partial"/,
    mutate: (dir) => editReceipt(dir, (r) => ({ ...r, scope: 'partial' })),
  },
  {
    tag: 'F5-count-tampered', files: BASE_FILES, expect: '§1', sig: /arms matched/,
    mutate: (dir) => editReceipt(dir, (r) => ({ ...r, matched: r.arms - 1 })),
  },
  {
    tag: 'F6-freshness-row-unwired', files: { ...BASE_FILES, 'package.json': JSON.stringify({ name: 'nexus-freshness-plane', private: true, scripts: { 'verify:fx': 'node docs/evidence/fx/a.mjs', 'verify:proofs': 'node tools/ci/proof-set.mjs', 'verify:ci-wiring': 'node docs/evidence/ci/ci-wiring-proof.mjs' } }, null, 2) }, expect: '§4', sig: /does not list verify:arms-freshness/,
  },
  {
    tag: 'F7-subject-deleted', files: BASE_FILES, expect: '§2', sig: /sweep \(docs\/evidence\/agents\/sweep\.mjs\)/,
    mutate: (dir) => rmSync(join(dir, 'docs/evidence/agents/sweep.mjs')),
  },
];

let matched = 0;
for (const arm of ARMS) {
  const dir = plane(arm.files);
  try {
    arm.mutate?.(dir);
    let caught = null;
    // The clauses a refusal already printed live in the LOG, not in a return value: a throwing judge never
    // returns its array. Capturing the lines as they pass is what makes the frontier check read the truth —
    // without it every arm that reddens at §2 or later is misreported as "§1 did not print" (v542's first
    // fixture run: 4/8 matched, all four post-§1 arms misaimed by the harness rather than the proof).
    let printed = [];
    const capture = (line) => {
      const m = /^\[(§\d+)\]/.exec(line);
      if (m) printed.push(m[1]);
    };
    try {
      printed = judge(dir, capture).printed;
    } catch (e) {
      caught = e;
    }
    const bad = [];
    if (arm.expect === null) {
      if (caught) bad.push(`the control plane was refused at ${printed.length + 1}: ${caught.message.slice(0, 300)}`);
      else if (printed.join(' ') !== CLAUSES.join(' ')) bad.push(`the control printed [${printed.join(' ')}] rather than all four clauses`);
    } else {
      if (!caught) bad.push(`the arm was expected to redden at ${arm.expect} and the plane passed all four clauses`);
      else {
        const want = CLAUSES.slice(0, CLAUSES.indexOf(arm.expect));
        const missing = want.filter((c) => !printed.includes(c));
        const beyond = printed.filter((c) => CLAUSES.indexOf(c) > CLAUSES.indexOf(arm.expect));
        if (missing.length) bad.push(`${missing.join(' ')} did not print, so the red is EARLIER than this arm aimed · it threw: ${caught.message.split('\n')[0].slice(0, 240)}`);
        if (beyond.length) bad.push(`${beyond.join(' ')} printed after the aim, so the red is LATER than this arm aimed`);
        if (arm.sig && !arm.sig.test(caught.message)) bad.push(`the refusal does not carry the sentences ${arm.sig} · it said: ${caught.message.split('\n')[0].slice(0, 300)}`);
      }
    }
    if (bad.length) {
      console.log(`MISMATCH ${arm.tag.padEnd(28)} ${bad.join(' · ')}`);
    } else {
      matched++;
      console.log(`MATCHED  ${arm.tag.padEnd(28)} ${arm.expect === null ? 'all four clauses pass on a consistent plane' : `first red at ${arm.expect}, every clause below it printed`}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\n${matched}/${ARMS.length} fixture arms matched`);
assert.equal(matched, ARMS.length, 'a fixture arm that does not match its aim is a refusal nobody measured');
