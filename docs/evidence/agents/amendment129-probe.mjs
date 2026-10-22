// NEXUS M2 v154 — Amendment 129 behavioral probe: the reason field in diagnoseSaveFiles is mutation-resistant.
// Amendment 129 recorded a debt: the mutation probe harness could not be applied due to CRLF line-ending conflicts.
// This proof applies the mutation programmatically (no patch, no heredoc) and asserts the three-runtime tests catch it.
// Run: node docs/evidence/agents/amendment129-probe.mjs
//
// REWRITTEN 2026-10-22, because an audit found the probe was measuring the wrong bytes three ways over:
//   1. It replaced the FIRST occurrence of each reason string in the source — which is the TYPE UNION
//      (`reason: 'not-json' | 'listed-then-missing' | 'name-not-reenterable'`), not the runtime value. Types
//      are erased by esbuild, so a mutated union changed nothing and two of three mutations "survived" for a
//      reason that had nothing to do with the tests. Each target is now the runtime push site
//      (`reason: 'X', why:`), which is unique in the file.
//   2. It ran ONLY `saveSnapshot.test.ts`, but `name-not-reenterable` is asserted in `saveNameSpelling.test.ts`
//      — so that mutation could not have been caught by the file the probe chose. It now runs the whole
//      `@nexus/three-runtime` suite, which is the honest question: would ANYTHING notice?
//   3. A kill mid-run left the source mutated. The restore is now registered on `exit` and on the catchable
//      signals, and the mutation is written only after the backup is held. SIGKILL still cannot be caught —
//      that bound is stated rather than pretended away.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from '../lib/syncproc.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(REPO_ROOT, 'packages/three-runtime/src/threeRuntime.ts');

/** The RUNTIME reason values, each targeted at the push site that emits it — unique in the file. */
const REASONS = [
  { pattern: "reason: 'not-json', why:", mutated: "reason: 'not-json-mutated', why:", label: 'not-json' },
  { pattern: "reason: 'listed-then-missing', why:", mutated: "reason: 'listed-then-missing-mutated', why:", label: 'listed-then-missing' },
  { pattern: "reason: 'name-not-reenterable', why:", mutated: "reason: 'name-not-reenterable-mutated', why:", label: 'name-not-reenterable' },
];

// ── the restore, registered before anything is mutated ──────────────────────────────────────────────
let pristine = null;
const restore = () => {
  if (pristine === null) return;
  writeFileSync(SRC, pristine, 'utf8');
  pristine = null;
};
process.on('exit', restore);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    restore();
    process.exit(130);
  });
}

function runTests() {
  try {
    // Through the syncproc bridge, not node:child_process's own sync API: on this host the sync family fails
    // EBUSY (KNOWN_ISSUES, amendment 152 — 60/60 sequential vs 0/340 async), and the house rule is that every
    // proof which shells out imports that bridge. `shell: true` because Windows resolves npx.cmd through a
    // shell; the CVE-2024-27980 fix blocks a direct spawn of it.
    execFileSync('npx', ['vitest', 'run', '--root', 'packages/three-runtime', '--no-file-parallelism'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 600000,
      shell: true,
    });
    return { passed: true, output: '' };
  } catch (e) {
    // A SPAWN failure is not a test failure. Reading one as "the mutation was caught" is the false green this
    // whole arc exists to prevent, so the two are separated by shape: a spawn error has no exit status, a
    // failing test run has a non-zero one and vitest's output.
    if (e.status === null || e.status === undefined) {
      return { spawnFailed: true, output: `${e.code ?? 'unknown'}: ${e.message}` };
    }
    return { passed: false, output: e.stdout?.toString() ?? e.stderr?.toString() ?? e.message };
  }
}

async function main() {
  console.log('[v154] Amendment 129 behavioral probe: mutating the RUNTIME reason field in diagnoseSaveFiles');
  const original = readFileSync(SRC, 'utf8');
  let allCaught = true;

  for (const r of REASONS) {
    if (!original.includes(r.pattern)) {
      // The target moved: say so rather than reporting a vacuous pass over bytes that no longer exist.
      console.log(`  ERROR: the runtime push site ${r.pattern} is not in the source — the target moved, so this arm cannot run`);
      allCaught = false;
      continue;
    }
    console.log(`\n[mutate] ${r.label}: ${r.pattern} -> ${r.mutated}`);
    pristine = original;
    writeFileSync(SRC, original.replace(r.pattern, r.mutated), 'utf8');
    const result = runTests();
    restore();
    if (result.spawnFailed) {
      console.log(`  ERROR: the runner could not run (${result.output}) — that is NOT a caught mutation`);
      allCaught = false;
      continue;
    }
    if (result.passed) {
      console.log(`  FAIL: the whole three-runtime suite PASSED with mutated ${r.label} — mutation NOT caught!`);
      allCaught = false;
    } else {
      const sawReason = result.output.includes(r.label);
      console.log(`  OK: the suite FAILED as expected (mutation caught)${sawReason ? '' : ` — though the output does not name ${r.label}, so check what it did catch`}`);
      if (!sawReason) allCaught = false;
    }
  }

  assert.equal(readFileSync(SRC, 'utf8'), original, 'the source must be restored byte-identical at the end');
  console.log('\n[v154] Summary:', allCaught ? 'ALL MUTATIONS CAUGHT' : 'SOME MUTATIONS NOT CAUGHT');
  if (!allCaught) process.exit(1);
}

await main().catch((e) => {
  restore();
  console.error(e);
  process.exit(1);
});
