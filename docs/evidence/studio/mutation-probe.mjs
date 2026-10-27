// NEXUS M8 — a MUTATION PROBE for the credits sub-system: deliberately break one rule at a time and
// prove the test suite CATCHES it. A suite that cannot kill a mutation is decoration, and this repo's
// verification discipline names the probe for exactly that reason.
//
// It never touches the real source. It copies the seven modules and their eight test files into a temp
// dir INSIDE `apps/studio` (vitest's root, so the suite resolves and `@nexus/design-model` resolves
// through the workspace's node_modules), applies ONE textual mutation, runs the suite, and records the
// verdict: non-zero exit = KILLED (the suite caught the break), zero = SURVIVED (a gap in the suite).
//
// The temp dir is removed in a `finally`, so a crash cannot leave a mutated copy in the tree.
//
// Run:  node docs/evidence/studio/mutation-probe.mjs

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from '../lib/syncproc.mjs';

const REPO = process.cwd();
const SRC = join(REPO, 'apps', 'studio', 'src', 'lib');
const STUDIO = join(REPO, 'apps', 'studio');
const BOX = join(STUDIO, '.nexus-mut-probe');
const VITEST = join(REPO, 'node_modules', 'vitest', 'vitest.mjs');

const MODULES = ['credits', 'templateCatalog', 'marketplace', 'creatorDashboard', 'settlement', 'templateRemix', 'walletView', 'ledgerStore', 'creditsStore', 'refund'];
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
  { id: 'M06', file: 'settlement', find: 'closing: opening + earned - spent,', replace: 'closing: opening + earned + spent,', why: 'the closing balance adds spends instead of subtracting them' },
  { id: 'M07', file: 'settlement', find: 'after += e.delta;', replace: 'after += 0;', why: 'entries after a bounded window are dropped from `after`' },
  { id: 'M08', file: 'walletView', find: 'if (templateById(catalog, ref)) owned.add(ref);', replace: 'owned.add(ref);', why: 'a subscription ref reads as template ownership (the 3ac210e bug)' },
  { id: 'M09', file: 'templateRemix', find: "if (listing.authorId === viewerId) return { ok: true, basis: 'owned' };", replace: '// mutation: the author branch is removed', why: 'an author loses ownership of their own listing' },
  { id: 'M10', file: 'templateCatalog', find: 'if (tokens.length === 0) return [];', replace: 'if (tokens.length === 0) return catalog.listings.map((listing) => ({ listing, score: 0 }));', why: 'an empty query answers the whole catalog instead of nothing' },
  { id: 'M11', file: 'ledgerStore', find: 'if (envelope.version !== LEDGER_FORMAT_VERSION) {', replace: 'if (false) {', why: 'the loader accepts a format version it does not know' },
  { id: 'M12', file: 'creditsStore', find: 'if (!loaded.ok) return { ok: false, reason: loaded.reason };', replace: "if (!loaded.ok) return { ok: true, ledger: emptyCreditLedger(), source: 'empty' };", why: 'a corrupt stored ledger is silently emptied (a balance erased)' },
  { id: 'M13', file: 'refund', find: "if (ledger.entries.some((e) => e.accountId === refund.buyerId && e.kind === 'refund' && e.ref === refund.templateId)) {", replace: 'if (false) {', why: 'a purchase can be refunded twice (the buyer is paid back twice for one sale)' },
];

function stage() {
  rmSync(BOX, { recursive: true, force: true });
  mkdirSync(BOX, { recursive: true });
  for (const module of MODULES) cpSync(join(SRC, `${module}.ts`), join(BOX, `${module}.ts`));
  for (const test of TEST_FILES) cpSync(join(SRC, test), join(BOX, test));
}

/** Run the temp suite; returns the spawn result. The filter keeps it to the copied files only. */
function runSuite() {
  return spawnSync(process.execPath, [VITEST, 'run', '.nexus-mut-probe', '--no-file-parallelism'], {
    cwd: STUDIO,
    env: { ...process.env, NODE_OPTIONS: '' },
    encoding: 'utf8',
  });
}

const results = [];
try {
  for (const mutation of MUTATIONS) {
    stage();
    const path = join(BOX, `${mutation.file}.ts`);
    const original = readFileSync(path, 'utf8');
    if (!original.includes(mutation.find)) {
      results.push({ ...mutation, verdict: 'ERROR', detail: 'the mutation target was not found in the source' });
      console.log(`${mutation.id} ERROR     ${mutation.file}: target not found`);
      continue;
    }
    writeFileSync(path, original.replace(mutation.find, mutation.replace), 'utf8');

    const result = runSuite();
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
