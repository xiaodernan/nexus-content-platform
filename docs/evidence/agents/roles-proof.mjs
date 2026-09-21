// NEXUS M2 v8 — role capabilities + deterministic evaluation proof (ADR 0016 amendment 8).
// Headless, offline, key-free. The SAME task runs under two §24 roles projected from one
// host registry: `researcher` (no write tools at all — the plan step hits `unknown tool`
// and the run fails honestly) and `editor` (completes). Every finished run gets a
// deterministic rubric score, persisted to an evaluation JSONL and reloaded in order.
// Run after `npm run build`:  node docs/evidence/agents/roles-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { ToolRegistry, InMemoryWorkspace, registerWorkspaceTools, RoleRegistry, DEMO_ROLES, runTask, scoreRun, appendEvaluation, loadEvaluations } = rt;

const JAIL = path.join(os.tmpdir(), 'nexus-roles-proof').replace(/\\/g, '/');
fs.rmSync(JAIL, { recursive: true, force: true });

const roles = new RoleRegistry();
DEMO_ROLES.forEach((r) => roles.register(r));

const SEED = { 'docs/widget.md': '# Widget\n\nThe widget renders parts.\n' };
function host() {
  const ws = new InMemoryWorkspace(SEED);
  const registry = registerWorkspaceTools(new ToolRegistry(), ws);
  registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
    ok: ws.read('docs/widget.md').includes('NOTE (DEMO MODE'),
    detail: 'annotated',
  }));
  return { ws, registry };
}

const task = { id: 'role-task', goal: 'annotate widget docs' };
const allow = () => true;

// Researcher: capabilities are ABSENT, not merely denied — even with an approving checkpoint.
{
  const { registry } = host();
  const researcher = roles.scopedRegistry('researcher', registry);
  const out = await runTask(task, { registry: researcher, checkpoint: allow });
  assert.equal(out.status, 'failed_verification');
  const failed = out.results.find((r) => !r.ok);
  assert.match(failed.error, /unknown tool/, 'researcher must not even see fs.append');
  console.log('[roles-proof] researcher denied by absence:', failed.error);
}

// Editor: same host, same task, completes; scored twice ⇒ identical (deterministic rubric).
let editorEv;
{
  const { ws, registry } = host();
  const editor = roles.scopedRegistry('editor', registry);
  const out = await runTask({ ...task, snapshot: undefined }, { registry: editor, checkpoint: allow, snapshot: () => ws.snapshot() });
  assert.equal(out.status, 'completed');
  const ev1 = scoreRun(out);
  const ev2 = scoreRun(out);
  assert.deepEqual(ev2, ev1, 'rubric must be deterministic');
  assert.equal(ev1.score, 1, `clean run should score 1, marks: ${JSON.stringify(ev1.marks)}`);
  editorEv = ev1;
  console.log('[roles-proof] editor completed, score =', ev1.score, 'marks:', ev1.marks.map((m) => `${m.name}:${m.ok ? '+' : '-'}`).join(' '));
}

// Failed run scores strictly lower on the same rubric.
{
  const { registry } = host();
  const out = await runTask(task, { registry: roles.scopedRegistry('researcher', registry), checkpoint: allow });
  const low = scoreRun(out);
  assert.ok(low.score < editorEv.score, `${low.score} < ${editorEv.score}`);
  console.log(`[roles-proof] same task, weaker role ⇒ score ${low.score.toFixed(2)} vs ${editorEv.score.toFixed(2)}`);
}

// Evaluation persistence: both scores reload in order from JSONL through the injected fs.
const evFile = `${JAIL}/state/evaluations.jsonl`;
appendEvaluation(fs, evFile, editorEv);
const { registry } = host();
const lowOut = await runTask(task, { registry: roles.scopedRegistry('researcher', registry), checkpoint: allow });
appendEvaluation(fs, evFile, scoreRun(lowOut));
const loaded = loadEvaluations(fs, evFile);
assert.equal(loaded.ok, true);
assert.deepEqual(loaded.evaluations.map((e) => e.runId), ['role-task', 'role-task']);
assert.equal(loaded.evaluations[0].score, editorEv.score);
assert.ok(loaded.evaluations[1].score < editorEv.score);
console.log('[roles-proof] evaluations reload in order:', loaded.evaluations.map((e) => e.score.toFixed(2)).join(' , '));

fs.rmSync(JAIL, { recursive: true, force: true });
console.log('[roles-proof] ALL ASSERTIONS PASSED (§24 roles as data, capability-by-absence, honest §63 scoring)');
