// NEXUS M2 v14 + v22 — role-chain + computed-contrast + UI-editor proof
// (ADR 0016 amendments 14 and 22).
// Headless, offline, key-free. Four §24 roles run one goal in sequence over a mini corpus
// (researcher → designer → qa → editor), each transition journaled as a structured
// HandoffRecord; the QA stage additionally computes WCAG 2.1 contrast on real hex pairs
// (pure math — not an aesthetic opinion, §60). A denied designer checkpoint must stop the
// chain at exactly that stage. v22: with a host-injected UI driver the editor stage drives
// a fake page (observe→type→click→verify) — every exec action still passes the checkpoint,
// the caller's registry is never mutated, and the engine used is recorded in the handoffs.
// Run after `npm run build`:
//   node docs/evidence/agents/rolechain-proof.mjs
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const {
  ToolRegistry, InMemoryWorkspace, MemoryStore, RoleRegistry, DEMO_ROLES,
  registerWorkspaceTools, registerMemoryTools, runRoleChain, contrastRatio,
} = rt;

const roles = new RoleRegistry();
DEMO_ROLES.forEach((r) => roles.register(r));
assert.deepEqual(roles.list().map((r) => r.id), ['archivist', 'designer', 'editor', 'qa', 'researcher']);

function host() {
  const ws = new InMemoryWorkspace({ 'docs/widget.md': '# Widget\n\nwidget rotation notes\n', 'docs/extra.md': '# Extra\n\nmisc\n' });
  const store = new MemoryStore();
  const registry = registerMemoryTools(registerWorkspaceTools(new ToolRegistry(), ws), store, 'chain-pro');
  registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
    ok: ws.read('docs/widget.md').includes('NOTE (DEMO MODE'),
    detail: 'annotated',
  }));
  return { ws, registry, store };
}

const task = { id: 'rc-14', goal: 'annotate widget rotation docs' };
const qaInput = {
  page: { x: 0, y: 0, width: 100, height: 100 },
  rects: {
    'docs/widget.md': { x: 0, y: 0, width: 50, height: 50, fill: '#777777', bg: '#888888' }, // low contrast (computed)
    'docs/extra.md': { x: 60, y: 10, width: 30, height: 20, fill: '#000000', bg: '#ffffff' }, // 21:1 fine
  },
};

// Happy chain: four stages, three handoffs, QA reports overlap-free but contrast-flagged.
const h = host();
const res = await runRoleChain(task, { roles, registry: h.registry, store: h.store, scope: 'chain-pro', checkpoint: () => true, snapshot: () => h.ws.snapshot(), qaInput });
assert.equal(res.ok, true, JSON.stringify(res));
assert.deepEqual(res.handoffs.map((x) => `${x.from}→${x.to}`), ['researcher→designer', 'designer→qa', 'qa→editor']);
assert.ok(res.qa.flags.some((f) => f.code === 'low-contrast' && f.severity === 'warn'));
assert.ok(!res.qa.flags.some((f) => f.ids.includes('docs/extra.md')));
assert.equal(res.editorOutcome.status, 'completed');
assert.equal(res.editorOutcome.plan.steps[0].tool, 'memory.recall');
assert.equal(res.evaluation.score, 1);
assert.ok(h.ws.read('docs/widget.md').includes('DESIGN (DEMO MODE · rc-14)'));
console.log('[rolechain] 4-stage chain completed; QA flags:', res.qa.flags.map((f) => `${f.code}(${f.ids})`).join(', '));

// Contrast math sanity on the very pairs above (§60: numbers, not opinions).
assert.ok(contrastRatio('#777777', '#888888') < 3);
assert.ok(contrastRatio('#000000', '#ffffff') > 20);

// Denied designer checkpoint: chain stops at the right stage with prior handoffs intact.
const h2 = host();
const blocked = await runRoleChain({ id: 'rc-block', goal: task.goal }, { roles, registry: h2.registry, store: h2.store, scope: 'chain-pro', checkpoint: ({ call }) => call.tool !== 'fs.append' });
assert.equal(blocked.ok, false);
assert.equal(blocked.stage, 'designer');
assert.equal(blocked.handoffs.length, 1);
assert.equal(blocked.handoffs[0].from, 'researcher');
assert.ok(!h2.ws.read('docs/widget.md').includes('DESIGN'));
console.log('[rolechain] denied designer checkpoint stops chain honestly:', blocked.reason);

// ── v22: the editor stage acts through gated ui tools (ADR 0016 amendment 22) ──────────
function uiHost() {
  const ws = new InMemoryWorkspace({ 'docs/widget.md': '# Widget\n\nwidget rotation notes\n', 'docs/extra.md': '# Extra\n\nmisc\n' });
  const store = new MemoryStore();
  const registry = registerMemoryTools(registerWorkspaceTools(new ToolRegistry(), ws), store, 'chain-pro');
  const els = [
    { kind: 'input', label: 'goal composer' },
    { kind: 'button', label: 'Compose' },
  ];
  const page = { prompt: '', layers: 1 };
  const driver = {
    elements: () => els,
    click: (i) => {
      if (page.prompt.length > 0 && els[i].kind === 'button') page.layers++;
      return `click:${els[i].label} layers=${page.layers}`;
    },
    type: (i, t) => {
      page.prompt = t;
      return `type:${els[i].label}=${t}`;
    },
    layerCount: () => page.layers,
  };
  registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
    ok: page.layers > 1,
    detail: `layers now ${page.layers}`,
  }));
  return { ws, registry, store, driver, page };
}

const uiGoal = { id: 'rc-ui-22', goal: 'compose widget rotation report' };
const hu = uiHost();
const namesBefore = hu.registry.list().map((s) => s.name);
const ures = await runRoleChain(uiGoal, {
  roles, registry: hu.registry, store: hu.store, scope: 'chain-pro', checkpoint: () => true,
  uiDriver: hu.driver, uiInputLabel: 'goal composer', uiButtonLabel: 'Compose',
});
assert.equal(ures.ok, true, JSON.stringify(ures));
assert.deepEqual(ures.editorOutcome.plan.steps.map((s) => s.tool), ['ui.observe', 'ui.type', 'ui.click', 'test.run']);
assert.equal(ures.editorOutcome.status, 'completed');
assert.equal(hu.page.prompt, uiGoal.goal);
assert.equal(hu.page.layers, 2, 'the click must actually have reached the page');
assert.deepEqual(ures.handoffs.map((x) => `${x.from}→${x.to}`), ['researcher→designer', 'designer→qa', 'qa→editor', 'editor→host']);
assert.equal(ures.handoffs[3].via, 'ui:ui.observe+ui.type+ui.click', 'engine used is recorded, not assumed (§60)');
assert.deepEqual(hu.registry.list().map((s) => s.name), namesBefore, 'the caller registry is never mutated — ui tools live on the chain copy');
assert.ok(!roles.scopedRegistry('researcher', hu.registry).has('ui.click'), 'researcher keeps no UI capability (absent, not denied)');
console.log('[rolechain] v22 ui-editor chain completed; handoff via:', ures.handoffs[3].via);

// Deny ONE action: refusing ui.click stops the editor mid-plan; nothing touched the button,
// and the handoff states honestly which ui tools DID run.
const hd = uiHost();
const dres = await runRoleChain(uiGoal, {
  roles, registry: hd.registry, store: hd.store, scope: 'chain-pro',
  checkpoint: ({ call }) => call.tool !== 'ui.click',
  uiDriver: hd.driver, uiInputLabel: 'goal composer', uiButtonLabel: 'Compose',
});
assert.equal(dres.ok, true);
assert.equal(dres.editorOutcome.status, 'denied');
assert.equal(hd.page.layers, 1, 'a denied click must never reach the page');
assert.equal(hd.page.prompt, uiGoal.goal, 'the earlier, approved typing did happen');
assert.equal(dres.handoffs[3].via, 'ui:ui.observe+ui.type');
console.log('[rolechain] v22 per-action denial honored; partial engine stated:', dres.handoffs[3].via);

console.log('[rolechain] ALL ASSERTIONS PASSED (§24 four-role chain as data, computed WCAG contrast, honest stops, v22 gated UI editor)');
