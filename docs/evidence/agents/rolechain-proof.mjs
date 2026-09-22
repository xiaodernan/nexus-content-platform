// NEXUS M2 v14 — role-chain + computed-contrast proof (ADR 0016 amendment 14).
// Headless, offline, key-free. Four §24 roles run one goal in sequence over a mini corpus
// (researcher → designer → qa → editor), each transition journaled as a structured
// HandoffRecord; the QA stage additionally computes WCAG 2.1 contrast on real hex pairs
// (pure math — not an aesthetic opinion, §60). A denied designer checkpoint must stop the
// chain at exactly that stage. Run after `npm run build`:
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

console.log('[rolechain] ALL ASSERTIONS PASSED (§24 four-role chain as data, computed WCAG contrast, honest stops)');
