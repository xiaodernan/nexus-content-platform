#!/usr/bin/env node
/**
 * Section STRESS-2 row proof: the Redis L2 replay-cache read path, walked as a derived row.
 *
 * The v838 stress lane drove tools/stress/redis-l2.mjs by hand over the authoring box Redis and
 * wrote the raw numbers into docs/evidence/redis-l2-stress-2026-11-17.md. This row gives the tool a
 * door the proofs step owns: it spawns the tool against the local replay-cache plane and refuses any
 * run whose cleanup left a stress key behind.
 *
 *   Phase 1  SET       2,000 x 1 KB samples under nexus:llmc:stress:*   (TTL 30 s)
 *   Phase 2  GET       serial   500 (single-RTT semantics)             p50/p95/p99
 *   Phase 3  GET       pipelined 20,000 (100/batch)                    throughput
 *   Phase 4  SCAN + UNLINK, second SCAN confirms zero residue
 *
 * exit 0 = the tool ran clean and its own cleanup left no stress key behind; any error shape the run
 * prints is a red, never a silent skip.
 */

// sweep-budget-ms: 120000

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const TOOL = '../../../tools/stress/redis-l2.mjs';
const SELF = 'docs/evidence/stress/redis-l2-proof.mjs';

// Reach edge for the census: a LITERAL specifier (the tokenizer sees `import(` + a relative
// string), so the tools census derives this module as `reached`. The function is never called —
// the live run below spawns a child so the tool's async main() has settled before we read its JSON.
async function reach() {
  await import('../../../tools/stress/redis-l2.mjs');
}

const run = spawnSync(process.execPath, [join(root, 'tools/stress/redis-l2.mjs')], {
  cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
});
if (run.error) { console.error(`redis-l2-proof: could not spawn the tool: ${run.error.message}`); process.exit(1); }
if (run.status !== 0) { console.error(`redis-l2-proof: the tool exited ${run.status}`); console.error(run.stderr); process.exit(1); }
const out = JSON.parse(run.stdout);
assert.equal(out.setKeys, 2000, `the run did not plant its 2,000 samples (${JSON.stringify(out)})`);
assert.equal(out.serialGets, 500, `the run did not drive its serial GET pass (${JSON.stringify(out)})`);
assert.equal(out.pipelinedOps, 20000, `the run did not drive its pipelined GET pass (${JSON.stringify(out)})`);
assert.equal(out.keysLeft, 0, `the run left ${out.keysLeft} stress key(s) behind (${JSON.stringify(out)})`);
console.log(`OK redis-l2: SET 2000 / serial GET 500 / pipelined GET 20000 clean, keysDeleted=${out.keysDeleted}, keysLeft=0, ${out.pipelinedOpsPerSec} ops/s`);
