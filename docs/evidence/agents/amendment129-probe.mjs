// NEXUS M2 v154 — Amendment 129 behavioral probe: the reason field in diagnoseSaveFiles is mutation-resistant.
// Amendment 129 recorded a debt: the mutation probe harness could not be applied due to CRLF line-ending conflicts.
// This proof applies the mutation programmatically (no patch, no heredoc) and asserts the three-runtime tests catch it.
// Run: node docs/evidence/agents/amendment129-probe.mjs
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from '../lib/syncproc.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(REPO_ROOT, 'packages/three-runtime/src/threeRuntime.ts');

const REASONS = [
  { original: "'not-json'", mutated: "'not-json-mutated'", label: 'not-json' },
  { original: "'listed-then-missing'", mutated: "'listed-then-missing-mutated'", label: 'listed-then-missing' },
  { original: "'name-not-reenterable'", mutated: "'name-not-reenterable-mutated'", label: 'name-not-reenterable' },
];

function runTests() {
  try {
    // Through the syncproc bridge, not node:child_process's own sync API: on this host the sync family fails
    // EBUSY (KNOWN_ISSUES, amendment 152 — 60/60 sequential vs 0/340 async), and the house rule is that every
    // proof which shells out imports that bridge. `shell: true` because Windows resolves npx.cmd through a
    // shell; the CVE-2024-27980 fix blocks a direct spawn of it.
    execFileSync('npx', ['vitest', 'run', 'packages/three-runtime/test/saveSnapshot.test.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120000,
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
  console.log('[v154] Amendment 129 behavioral probe: mutating reason field in diagnoseSaveFiles');
  const original = readFileSync(SRC, 'utf8');
  let allCaught = true;

  for (const r of REASONS) {
    console.log(`\n[mutate] ${r.label}: ${r.original} -> ${r.mutated}`);
    const mutated = original.replace(r.original, r.mutated);
    if (mutated === original) {
      console.log(`  FAIL: pattern not found: ${r.original}`);
      allCaught = false;
      continue;
    }
    writeFileSync(SRC, mutated, 'utf8');
    const result = runTests();
    if (result.spawnFailed) {
      // Restore FIRST, then report — a probe that cannot run must never leave the tree mutated.
      writeFileSync(SRC, original, 'utf8');
      console.log(`  ERROR: the runner could not run (${result.output}) — that is NOT a caught mutation`);
      allCaught = false;
      continue;
    }
    if (result.passed) {
      console.log(`  FAIL: tests PASSED with mutated ${r.label} — mutation NOT caught!`);
      allCaught = false;
    } else {
      console.log(`  OK: tests FAILED as expected (mutation caught)`);
    }
    writeFileSync(SRC, original, 'utf8');
  }

  console.log('\n[v154] Summary:', allCaught ? 'ALL MUTATIONS CAUGHT' : 'SOME MUTATIONS NOT CAUGHT');
  if (!allCaught) process.exit(1);
}

await main().catch(e => { console.error(e); process.exit(1); });