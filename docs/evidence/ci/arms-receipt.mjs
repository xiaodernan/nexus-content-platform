// NEXUS v542 (docs/evidence/ci) — THE ARMS' RECEIPT: a green arming run leaves a hash of every subject it
// graded, and the build refuses when any of them has changed since (ADR 0016 amendment 525).
//
// Why this exists, stated the way §60 requires: v540's first re-run since v531 found that the arming tool
// itself had gone stale — A8 could not even load since v531's docker pre-pull moved its needle, A14 had
// stopped reaching its clause when the population grew from one budget declarer to six, and the README kept
// quoting a count measured at v528. The tool is human-run by design (it spawns a gate per arm and a stub per
// runner case; scheduling it would double the build), so the rot was structural: NOTHING compared the tool's
// last verdict with the bytes it graded. This module is that comparison, in one place, imported by both sides:
// the tool writes the receipt on a full green run, and docs/evidence/ci/arms-freshness-proof.mjs refuses when
// a subject's hash no longer matches. The subjects are exactly what the arms read: the workflow, the gate, the
// tool, the runner, the sweep whose budget grammar §9 borrows, the two script entries the gate names, the
// population the derivation sees (name + budget marker, because A14 derives from it), and this rule's own bytes
// — a rule that could be weakened silently would be the receipt's own unopened door.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePopulation } from '../../../tools/ci/proof-set.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export const RECEIPT_FILE = 'docs/evidence/ci/arms-receipt.json';
export const RULE_FILE = 'docs/evidence/ci/arms-receipt.mjs';
export const TOOL_FILE = 'docs/evidence/ci/ci-wiring-arms.mjs';
export const FRESHNESS_ROW = 'verify:arms-freshness';

export const SUBJECT_FILES = {
  workflow: '.github/workflows/ci.yml',
  gate: 'docs/evidence/ci/ci-wiring-proof.mjs',
  arms: 'docs/evidence/ci/ci-wiring-arms.mjs',
  runner: 'tools/ci/proof-set.mjs',
  sweep: 'docs/evidence/agents/sweep.mjs',
};

// Line endings are canonicalised before hashing: this receipt is written from a Windows checkout and read on
// the ubuntu runner, so a hash over raw bytes would stamp the PLATFORM rather than the content — green here,
// red in CI, for a file nobody changed. The arms' own needles are normalised the same way.
const sha = (text) => createHash('sha256').update(String(text).replace(/\r\n/g, '\n')).digest('hex');
const readOf = (root, rel) => readFileSync(join(root, rel), 'utf8');

/** The marker line a row uses, as text — the same shape §9 reads, kept as text so a receipt can be diffed. */
export function markerLine(text) {
  const m = String(text).match(/^\/\/ sweep-budget-ms: .*$/m);
  return m ? m[0].trim() : null;
}

/** The population the arms derive from: the rows, their files, and their marker lines. */
export function populationOf(root) {
  const scripts = JSON.parse(readOf(root, 'package.json')).scripts ?? {};
  return derivePopulation(scripts)
    .map((d) => ({
      name: d.name,
      file: d.file,
      marker: existsSync(join(root, d.file)) ? markerLine(readOf(root, d.file)) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every subject the arms read, as name -> sha256. A missing subject is named, never silently skipped. */
export function subjectsOf(root) {
  const scripts = JSON.parse(readOf(root, 'package.json')).scripts ?? {};
  const subjects = {};
  for (const [key, rel] of Object.entries(SUBJECT_FILES)) subjects[key] = sha(readOf(root, rel));
  subjects.scripts = sha(JSON.stringify({ 'verify:proofs': scripts['verify:proofs'] ?? null, 'verify:ci-wiring': scripts['verify:ci-wiring'] ?? null }));
  subjects.rule = sha(readFileSync(join(HERE, 'arms-receipt.mjs'), 'utf8'));
  return subjects;
}

/** The receipt the tool writes after a full green run. `ranAt` moves on every run; the hashes do not. */
export function makeReceipt({ root, armNames, ranAt = new Date().toISOString() }) {
  return {
    tool: TOOL_FILE,
    scope: 'full',
    ranAt,
    arms: armNames.length,
    matched: armNames.length,
    armNames,
    subjects: subjectsOf(root),
    population: populationOf(root),
  };
}

/**
 * The comparison the freshness row reports. `mismatched` names the subjects whose bytes moved; `differing`
 * gives the first population difference in a sentence, because "the population hash changed" is a number and
 * "verify:x now declares a budget" is a fact.
 */
export function compareReceipt(root, receipt) {
  const want = subjectsOf(root);
  const stamped = receipt && typeof receipt.subjects === 'object' && receipt.subjects ? receipt.subjects : {};
  const mismatched = Object.keys(want).filter((k) => stamped[k] !== want[k]);
  const extra = Object.keys(stamped).filter((k) => !(k in want));
  const now = populationOf(root);
  const stampedRows = Array.isArray(receipt?.population) ? receipt.population : [];
  const key = (r) => `${r.name} ${r.file} ${r.marker ?? '(no marker)'}`;
  const differing = [...new Set([...now.map(key), ...stampedRows.map(key)])].filter(
    (k) => !now.some((r) => key(r) === k) || !stampedRows.some((r) => key(r) === k),
  );
  return { want, mismatched, extra, now, stampedRows, differing };
}
