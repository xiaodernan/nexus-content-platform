// NEXUS M2 v16 — agent-driven UI proof (§63 browser automation, checkpoint-gated; ADR 0016 amendment 16).
// Headless, offline, key-free. The runtime's ui.* tools drive an injected UiDriver over a
// fake page. Every click/type is an exec-permission action, so each one pauses for the human
// decider. The run must: log gated actions in order when allowed, STOP mid-run when denied
// (earlier actions stand, later ones never happen), and never invent missing labels.
// Run after `npm run build`:  node docs/evidence/agents/dom-ui-proof.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { ToolRegistry, registerUiTools, findLabel } = rt;

const PAGE = [
  { kind: 'input', label: 'analytics dashboard' },
  { kind: 'button', label: 'Compose' },
];
function fakeDriver() {
  const calls = [];
  return {
    calls,
    elements: () => PAGE,
    click: (i) => { const s = `click:${PAGE[i].label}`; calls.push(s); return s; },
    type: (i, t) => { const s = `type:${PAGE[i].label}=${t}`; calls.push(s); return s; },
  };
}
const STEPS = [
  { tool: 'ui.type', label: 'analytics dashboard', text: 'an analytics dashboard' },
  { tool: 'ui.click', label: 'Compose' },
];

async function runUi(steps, decide) {
  const d = fakeDriver();
  const registry = registerUiTools(new ToolRegistry(), d);
  const actions = [];
  for (const step of steps) {
    const index = findLabel(d.elements(), step.label);
    if (index < 0) return { ok: false, actions, d, stoppedAt: step.label, reason: 'label not found on page' };
    const args = step.tool === 'ui.type' ? { index, text: step.text } : { index };
    const res = await registry.invoke(
      { callId: `ui:${step.label}`, tool: step.tool, args },
      { checkpoint: async ({ call }) => decide({ tool: call.tool, label: step.label }) },
    );
    if (!res.ok) return { ok: false, actions, d, stoppedAt: step.label, reason: res.error };
    actions.push(String(res.output.log));
  }
  return { ok: true, actions, d };
}

// 1) Full allow: both gated actions, in order, via the registry (nothing bypasses it).
const askedA = [];
const a = await runUi(STEPS, (p) => { askedA.push(p.tool); return true; });
assert.equal(a.ok, true);
assert.deepEqual(a.actions, ['type:analytics dashboard=an analytics dashboard', 'click:Compose']);
assert.deepEqual(askedA, ['ui.type', 'ui.click'], 'every exec action paused for the decider');

// 2) Deny the second: first stands, second NEVER happens, run stops with the reason.
const b = await runUi(STEPS, (p) => p.tool !== 'ui.click');
assert.equal(b.ok, false);
assert.equal(b.stoppedAt, 'Compose');
assert.match(b.reason, /denied at checkpoint/);
assert.deepEqual(b.d.calls, ['type:analytics dashboard=an analytics dashboard']);

// 3) Missing label: fails before any checkpoint ask — no invented UI (§60).
let asked = 0;
const c = await runUi([{ tool: 'ui.click', label: 'Nonexistent' }], () => { asked++; return true; });
assert.equal(c.ok, false);
assert.equal(c.reason, 'label not found on page');
assert.equal(asked, 0);

console.log('[dom-ui-proof] allowed run:', a.actions.join(' → '));
console.log('[dom-ui-proof] denial stops mid-run, earlier action stands ✓ · missing label asked nobody ✓');
console.log('[dom-ui-proof] ALL ASSERTIONS PASSED (ui.* gated by the same registry + checkpoint as every other tool)');
