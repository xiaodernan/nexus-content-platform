// NEXUS M2 v0/v1 — agent-runtime proof-of-work (§32/§60, ADR 0016).
// Runs headlessly against the BUILT packages (no browser, no network, no AI keys).
// Proves: deterministic plan -> registry-gated acts -> observed dataflow ->
// bounded auto-fix -> honest denial without a checkpoint. Since v1 the research step
// routes through the hybrid code index (fs.index) when it is registered. Run from the
// repo root:  node docs/evidence/agents/agent-proof.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { ToolRegistry, InMemoryWorkspace, registerWorkspaceTools, runTask } = rt;

const SEED = {
  'docs/widget.md': '# Widget\n\nThe widget system renders UI parts.\n',
  'docs/other.md': '# Other\n\nunrelated notes\n',
};

function harness() {
  const ws = new InMemoryWorkspace(SEED);
  const registry = registerWorkspaceTools(new ToolRegistry(), ws);
  const seenPermissions = [];
  registry.register(
    { name: 'test.run', description: 'verification: annotated file must carry a FIX line', permissions: ['exec'], args: [] },
    () => ({ ok: ws.read('docs/widget.md').includes('FIX'), detail: 'FIX line required' }),
  );
  const checkpoint = ({ call, permissions }) => {
    seenPermissions.push(`${call.tool}:${permissions.join('+')}`);
    return true;
  };
  return { ws, registry, checkpoint, seenPermissions };
}

const task = { id: 'proof-1', goal: 'add widget docs' };

// 1) Golden path with one auto-fix round (verify fails until the fix lands).
const h = harness();
const out = await runTask(task, { registry: h.registry, checkpoint: h.checkpoint });
assert.equal(out.status, 'completed');
assert.equal(out.provenance.mode, 'demo', 'must be honestly labelled demo (§60)');
assert.deepEqual(out.plan.steps.map((s) => s.stepId), ['search', 'read', 'annotate', 'verify', 'fix-1', 'verify-2']);
assert.ok(h.ws.read('docs/widget.md').includes('NOTE (DEMO MODE · agent proof-1'), 'annotation written');
assert.ok(h.ws.read('docs/widget.md').includes('FIX (DEMO MODE · attempt 1)'), 'fix written');
assert.ok(h.seenPermissions.includes('fs.append:write') && h.seenPermissions.includes('test.run:exec'), 'gates visited');

// 2) Observed dataflow: the read/annotate targets came from the live index hit.
assert.equal(out.plan.steps[0].tool, 'fs.index', 'v1 planner uses the code index when registered');
const searchResult = out.results.find((r) => r.tool === 'fs.index');
assert.equal(searchResult.output.hits[0].path, 'docs/widget.md');
assert.ok(out.results.every((r) => r.ok), 'all invocations succeeded');

// 3) Determinism: a fresh identical run yields an identical transcript.
const h2 = harness();
const out2 = await runTask(task, { registry: h2.registry, checkpoint: h2.checkpoint });
assert.deepEqual(
  JSON.parse(JSON.stringify({ plan: out2.plan, events: out2.events, results: out2.results })),
  JSON.parse(JSON.stringify({ plan: out.plan, events: out.events, results: out.results })),
  'same task must produce the same transcript',
);
assert.deepEqual(h2.ws.snapshot(), h.ws.snapshot(), 'workspaces converge identically');

// 4) Without a checkpoint, the write is denied and nothing changes (§28/ADR 0013).
const h3 = harness();
const out3 = await runTask(task, { registry: h3.registry });
assert.equal(out3.status, 'denied');
assert.deepEqual(h3.ws.snapshot(), SEED, 'denied run must leave the workspace untouched');

console.log('[agent-proof] golden path: completed, steps =', out.plan.steps.map((s) => s.stepId).join(' → '));
console.log('[agent-proof] gates seen:', h.seenPermissions.join(', '));
console.log('[agent-proof] determinism: identical transcripts across runs ✓');
console.log('[agent-proof] no checkpoint → status denied, workspace untouched ✓');
console.log('[agent-proof] ALL ASSERTIONS PASSED (demo mode, no network, no keys)');
