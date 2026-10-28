// NEXUS M8 — a MUTATION PROBE for the credits sub-system: deliberately break one rule at a time and
// prove the test suite CATCHES it. A suite that cannot kill a mutation is decoration, and this repo's
// verification discipline names the probe for exactly that reason.
//
// It never touches the real source. It copies the modules and their test files into a temp dir INSIDE
// `apps/studio` (vitest's root, so the suite resolves and `@nexus/design-model` resolves through the
// workspace's node_modules), applies ONE textual mutation, runs the suite, and records the verdict:
// non-zero exit = KILLED (the suite caught the break), zero = SURVIVED (a gap in the suite).
//
// The temp dir is removed in a `finally`, so a crash cannot leave a mutated copy in the tree.
//
// sweep-budget-ms: 1200000
// The budget above is the CI runner's and the agents sweep's to read (amendments 85 and 94), and it is
// measured, not comfortable: 23 mutations, each a serial `vitest run` of the copied suite — 166.2 s standing
// alone on 2026-10-28, all 23 KILLED. Readings move with host load, not with the arm count alone: the 18-arm
// sweep read 410.7 s standing alone and 404.9 s beside a concurrent `npm ci` earlier the same day on this
// Windows box. 1 200 000 ms remains ~2.9x the SLOWER reading and ~7.2x the standing one, which is the
// headroom a shared CI runner needs; a row killed for being slow is a TIMEOUT, and amendment 85 refused to
// let that be the same verdict as a failure.
//
// Run:  node docs/evidence/studio/mutation-probe.mjs

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from '../lib/syncproc.mjs';

const REPO = process.cwd();
const SRC = join(REPO, 'apps', 'studio', 'src', 'lib');
const STUDIO = join(REPO, 'apps', 'studio');
// One box per PROCESS, named in the argv filter too: a fixed `.nexus-mut-probe` let two concurrent runs
// (a human's and CI's, or two of this repository's lanes) share the directory, and the first to finish
// deleted the box under the other's feet — measured 2026-10-28 as ENOENT on the loser's restore write, a
// red that named the sandbox instead of any code. Two runs now own two boxes and neither can see the other.
const BOX_NAME = `.nexus-mut-probe-${process.pid}`;
const BOX = join(STUDIO, BOX_NAME);
const VITEST = join(REPO, 'node_modules', 'vitest', 'vitest.mjs');

const MODULES = ['credits', 'templateCatalog', 'marketplace', 'creatorDashboard', 'settlement', 'templateRemix', 'walletView', 'ledgerStore', 'creditsStore', 'refund', 'refundPolicy'];
const TEST_FILES = [...MODULES.map((m) => `${m}.test.ts`), 'm8Invariants.test.ts'];

/**
 * Each mutation breaks ONE rule and names the rule it breaks. The `find` strings are asserted present
 * before the write, so a typo is an ERROR rather than a silent "survivor".
 */
const MUTATIONS = [
  { id: 'M01', file: 'credits', find: 'sum += e.delta;', replace: 'sum += Math.abs(e.delta);', why: 'balance loses its sign (a spend adds)' },
  { id: 'M02', file: 'credits', find: 'if (balance + entry.delta < 0) {', replace: 'if (false) {', why: 'a spend may drive a balance below zero' },
  { id: 'M03', file: 'credits', find: 'if (ledger.entries.some((e) => e.id === entry.id))', replace: 'if (false)', why: 'the idempotency key is ignored (a retry applies twice)' },
  { id: 'M04', file: 'marketplace', find: 'delta: -listing.priceCents,', replace: 'delta: listing.priceCents,', why: 'the buyer is CREDITED instead of debited' },
  { id: 'M05', file: 'marketplace', find: 'if (listing.authorId === purchase.buyerId)', replace: 'if (false)', why: 'an author may buy their own listing' },
  { id: 'M06', file: 'settlement', find: 'closing: opening + earned - spent + refunded - clawedBack,', replace: 'closing: opening + earned + spent + refunded - clawedBack,', why: 'the closing balance adds spends instead of subtracting them' },
  { id: 'M07', file: 'settlement', find: 'after += e.delta;', replace: 'after += 0;', why: 'entries after a bounded window are dropped from `after`' },
  { id: 'M08', file: 'walletView', find: 'if (templateById(catalog, ref)) owned.add(ref);', replace: 'owned.add(ref);', why: 'a subscription ref reads as template ownership (the 3ac210e bug)' },
  { id: 'M09', file: 'templateRemix', find: "if (listing.authorId === viewerId) return { ok: true, basis: 'owned' };", replace: '// mutation: the author branch is removed', why: 'an author loses ownership of their own listing' },
  { id: 'M10', file: 'templateCatalog', find: 'if (tokens.length === 0) return [];', replace: 'if (tokens.length === 0) return catalog.listings.map((listing) => ({ listing, score: 0 }));', why: 'an empty query answers the whole catalog instead of nothing' },
  { id: 'M11', file: 'ledgerStore', find: 'if (envelope.version !== LEDGER_FORMAT_VERSION) {', replace: 'if (false) {', why: 'the loader accepts a format version it does not know' },
  { id: 'M12', file: 'creditsStore', find: 'if (!loaded.ok) return { ok: false, reason: loaded.reason };', replace: "if (!loaded.ok) return { ok: true, ledger: emptyCreditLedger(), source: 'empty' };", why: 'a corrupt stored ledger is silently emptied (a balance erased)' },
  { id: 'M13', file: 'refund', find: 'if (refunds.length >= purchases.length) {', replace: 'if (refunds.length >= 1) {', why: 'a re-purchase after a refund can never be refunded (the old per-ref bug)' },
  { id: 'M14', file: 'templateCatalog', find: '/[^\\p{L}\\p{N}]+/u', replace: '/[^a-z0-9]+/', why: 'the tokenizer deletes non-Latin text (a Chinese query finds nothing)' },
  { id: 'M15', file: 'refundPolicy', find: 'if (closesAt !== null && now > closesAt) {', replace: 'if (false) {', why: 'a closed refund window no longer refuses (the host policy is ignored)' },
  { id: 'M16', file: 'refundPolicy', find: 'now > closesAt', replace: 'now >= closesAt', why: 'the closing instant is treated as OUTSIDE the window' },
  { id: 'M17', file: 'refundPolicy', find: 'if (problem) return { ok: false, reason: problem };', replace: 'if (false) return { ok: false, reason: problem };', why: 'a policy that never declared a window is read as "no deadline"' },
  { id: 'M18', file: 'refund', find: 'return purchases[refunds.length] ?? null;', replace: 'return purchases[purchases.length - 1] ?? null;', why: 'the window is measured on the NEWEST purchase instead of the one FIFO reverses' },
  { id: 'M19', file: 'refundPolicy', find: 'closesAt: gate.closesAt,', replace: 'closesAt: null,', why: 'the preflight reports no closing instant even when the policy sets one (a surface promises "refundable forever")' },
  { id: 'M20', file: 'refund', find: "kind: 'clawback',", replace: "kind: 'spend',", why: 'the seller side of a refund is a purchase again (it reads as ownership, and a creator dashboard calls it spending)' },
  { id: 'M21', file: 'credits', find: "if (entry.kind === 'refund') return { kind: 'refunded', amount: Math.abs(entry.delta) };", replace: 'if (false) return { kind: \'refunded\', amount: Math.abs(entry.delta) };', why: 'the classifier stops reading the kind, so a refund is counted as earned income' },
  { id: 'M22', file: 'settlement', find: 'closing: opening + earned - spent + refunded - clawedBack,', replace: 'closing: opening + earned - spent,', why: 'the statement closing forgets the refund-shaped flows, so it stops reconciling' },
  { id: 'M23', file: 'creatorDashboard', find: 'else clawedBack += flow.amount;', replace: 'else spent += flow.amount;', why: 'a claw-back is reported as the creator spending their own credits' },
];

/**
 * Copy the suite ONCE. Deleting and re-copying it before EVERY mutation tripped the host's
 * safe-delete guard, which counts deletions per turn (3 mutations × 21 files = 63 > 50). Each
 * mutation now overwrites ONE file and restores it from the pristine source, so the only bulk
 * delete is the final cleanup (21 files, under the threshold).
 */
function stage() {
  mkdirSync(BOX, { recursive: true });
  for (const module of MODULES) cpSync(join(SRC, `${module}.ts`), join(BOX, `${module}.ts`));
  for (const test of TEST_FILES) cpSync(join(SRC, test), join(BOX, test));
}

/** Run the temp suite; returns the spawn result. The filter keeps it to the copied files only. */
function runSuite() {
  return spawnSync(process.execPath, [VITEST, 'run', BOX_NAME, '--no-file-parallelism'], {
    cwd: STUDIO,
    env: { ...process.env, NODE_OPTIONS: '' },
    encoding: 'utf8',
  });
}

const results = [];
stage();
try {
  for (const mutation of MUTATIONS) {
    const path = join(BOX, `${mutation.file}.ts`);
    const original = readFileSync(join(SRC, `${mutation.file}.ts`), 'utf8');
    if (!original.includes(mutation.find)) {
      results.push({ ...mutation, verdict: 'ERROR', detail: 'the mutation target was not found in the source' });
      console.log(`${mutation.id} ERROR     ${mutation.file}: target not found`);
      continue;
    }
    writeFileSync(path, original.replace(mutation.find, mutation.replace), 'utf8');

    const result = runSuite();
    writeFileSync(path, original, 'utf8'); // restore before the next mutation

    if (result.error || result.status === null) {
      results.push({ ...mutation, verdict: 'ERROR', detail: `vitest did not run: ${result.error?.message ?? 'no status'}` });
      console.log(`${mutation.id} ERROR     ${mutation.file}: vitest did not run`);
      continue;
    }
    const killed = result.status !== 0;
    results.push({ ...mutation, verdict: killed ? 'KILLED' : 'SURVIVED', detail: '' });
    console.log(`${mutation.id} ${killed ? 'KILLED  ' : 'SURVIVED'}  ${mutation.file}: ${mutation.why}`);
  }
} finally {
  rmSync(BOX, { recursive: true, force: true });
}

const killed = results.filter((r) => r.verdict === 'KILLED').length;
const survived = results.filter((r) => r.verdict === 'SURVIVED').length;
const errored = results.filter((r) => r.verdict === 'ERROR').length;

console.log(`\n${killed}/${results.length} mutations KILLED — ${survived} survived, ${errored} error`);
for (const r of results.filter((x) => x.verdict === 'SURVIVED')) console.log(`  SURVIVOR ${r.id} ${r.file}: ${r.why}`);
for (const r of results.filter((x) => x.verdict === 'ERROR')) console.log(`  ERROR    ${r.id} ${r.file}: ${r.detail}`);

if (survived > 0 || errored > 0) {
  console.log('The suite has a GAP (or the probe is broken) — see above.');
  process.exitCode = 1;
} else {
  console.log('ALL MUTATIONS KILLED — every rule above is pinned by a test that fails when it breaks.');
}
