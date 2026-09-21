// NEXUS M2 v2 — memory + real-repo ingestion proof-of-work (§26/§63, ADR 0016 amendment 2).
// Two agent runs over the REAL repository, headless, offline, key-free:
//   Run A ingests this repo from disk (read-only), researches via fs.index, annotates the
//         in-memory COPY (the host disk is never written, §9), and the host persists the
//         finding through the checkpoint-gated memory.save tool.
//   Run B has NO fs.index registered and a near-empty workspace — the planner's research
//         step is served from memory (§26) and the run completes anyway.
// Run from the repo root after `npm run build`:  node docs/evidence/agents/memory-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const {
  ToolRegistry, InMemoryWorkspace, MemoryStore,
  registerWorkspaceTools, registerMemoryTools, collectTextFiles,
  WORKSPACE_TOOL_SPECS, runTask,
} = rt;

const SCOPE = 'atlas';
const GOAL_A = 'embedTokens bag of tokens normalization';

function allowAll(seen) {
  return ({ call, permissions }) => {
    seen.push(`${call.tool}:${permissions.join('+')}`);
    return true;
  };
}

// ── Run A — discovery over the real repo ─────────────────────────────────────
const files = collectTextFiles('.', fs); // injects node:fs into the pure ingestion module
assert.ok(Object.keys(files).length > 50, 'expected to ingest the repo from disk');
const EXPECTED = rt.queryIndex(rt.buildIndex(files), GOAL_A, 1)[0]; // pre-computed: the verifier runs mid-loop
assert.match(EXPECTED.path, /agents\/runtime\/src\/codeIndex\.ts$/, `"${GOAL_A}" should surface the code index module, got ${EXPECTED.path}`);

const wsA = new InMemoryWorkspace(files);
const seenA = [];
// Memory deliberately absent from run A's registry: cold memory must fall through to fs.index.
const registryA = registerWorkspaceTools(new ToolRegistry(), wsA);
registryA.register(
  { name: 'test.run', description: 'verification', permissions: ['exec'], args: [] },
  () => ({ ok: wsA.read(EXPECTED.path).includes('NOTE (DEMO MODE'), detail: 'annotated copy must carry the note' }),
);
const outA = await runTask({ id: 'audit-A', goal: GOAL_A }, { registry: registryA, checkpoint: allowAll(seenA) });
assert.equal(outA.status, 'completed');
assert.equal(outA.plan.steps[0].tool, 'fs.index', 'cold memory must research through the index');
const topHit = outA.results[0].output.hits[0];
assert.equal(topHit.path, EXPECTED.path);
assert.ok(topHit.startLine >= 1);

// The host (not the agent) decides what enters memory, through the gated tool (§26 governance).
const store = new MemoryStore();
const registrySave = registerMemoryTools(new ToolRegistry(), store, SCOPE);
const saved = await registrySave.invoke(
  {
    callId: 'mem-save',
    tool: 'memory.save',
    args: {
      runId: 'audit-A',
      query: GOAL_A,
      summary: `top hit of run audit-A: ${topHit.path}:${topHit.startLine} (${topHit.snippet.slice(0, 40)}…)`,
      refs: [`${topHit.path}:${topHit.startLine}`],
    },
  },
  { checkpoint: allowAll(seenA) },
);
assert.ok(saved.ok, 'memory.save must go through the checkpoint');
assert.ok(seenA.includes('memory.save:write'), 'memory.save must be write-gated');

// ── Run B — recall without any index, near-empty workspace ───────────────────
function runBHarness() {
  const wsB = new InMemoryWorkspace({ [topHit.path]: files[topHit.path] }); // only the remembered file
  const reg = new ToolRegistry();
  reg.register(WORKSPACE_TOOL_SPECS.find((s) => s.name === 'fs.read'), (args) => ({ content: wsB.read(String(args.path)) }));
  reg.register(WORKSPACE_TOOL_SPECS.find((s) => s.name === 'fs.append'), (args) => {
    wsB.append(String(args.path), String(args.text));
    return { path: String(args.path) };
  });
  registerMemoryTools(reg, store, SCOPE); // same store the host persisted into
  assert.equal(reg.has('fs.index'), false, 'run B must not have an index');
  reg.register({ name: 'test.run', description: 'verification', permissions: ['exec'], args: [] }, () => ({
    ok: wsB.read(topHit.path).includes('NOTE (DEMO MODE'),
    detail: 'annotated copy must carry the note',
  }));
  return { wsB, reg };
}

const seenB = [];
const b1 = runBHarness();
const outB = await runTask({ id: 'audit-B', goal: 'how are embedTokens normalized for retrieval' }, { registry: b1.reg, checkpoint: allowAll(seenB) });
assert.equal(outB.status, 'completed');
assert.equal(outB.plan.steps[0].tool, 'memory.recall', 'warm memory must replace re-research');
assert.equal(outB.results[0].output.hits[0].path, topHit.path, 'research came from memory, not the workspace');
assert.ok(b1.wsB.read(topHit.path).includes('NOTE (DEMO MODE · agent audit-B'));

// Determinism: an identical run B from a fresh harness replays the same transcript.
const b2 = runBHarness();
const outB2 = await runTask({ id: 'audit-B', goal: 'how are embedTokens normalized for retrieval' }, { registry: b2.reg, checkpoint: allowAll([]) });
assert.deepEqual(
  JSON.parse(JSON.stringify({ plan: outB2.plan, events: outB2.events, results: outB2.results })),
  JSON.parse(JSON.stringify({ plan: outB.plan, events: outB.events, results: outB.results })),
);

// §26 deletable: after forgetting, run B can no longer research (cold memory ⇒ index absent ⇒
// the planner template still recalls, but the store hands it nothing).
store.clear(SCOPE);
assert.equal(store.list(SCOPE).length, 0);
const b3 = runBHarness();
const outB3 = await runTask({ id: 'audit-B', goal: 'how are embedTokens normalized for retrieval' }, { registry: b3.reg, checkpoint: allowAll([]) });
assert.notEqual(outB3.status, 'completed', 'cold memory with no index must fail honestly, not fake success');

console.log(`[memory-proof] ingested ${Object.keys(files).length} real files (read-only), run A → ${topHit.path}:${topHit.startLine} via fs.index`);
console.log('[memory-proof] memory.save gated:', seenA.filter((s) => s.startsWith('memory')).join(', '));
console.log('[memory-proof] run B completed from memory.recall alone (no fs.index registered) ✓');
console.log('[memory-proof] determinism: identical run-B transcripts ✓ · after clear() the run fails honestly ✓');
console.log('[memory-proof] ALL ASSERTIONS PASSED (DEMO MODE §60, host disk untouched §9)');
