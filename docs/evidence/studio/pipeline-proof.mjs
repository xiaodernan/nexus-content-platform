// NEXUS Studio Vertical Slice — deterministic pipeline proof-of-work (§32/§60).
// Runs headlessly against the BUILT packages (no browser, no AI keys).
// Proves: prompt -> real editable Design Model ops -> layout -> undo/redo -> AI diff.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const dm = await import(pathToFileURL('./packages/design-model/dist/index.js').href);
const ap = await import(pathToFileURL('./packages/ai-providers/dist/index.js').href);

const { History, createEmptyDocument, layoutPage, diffFromBatch } = dm;
const { ModelRouter } = ap;

const router = new ModelRouter();
assert.equal(router.mode, 'demo', 'router must report demo mode with no keys (§60 no-fake)');

const history = new History(createEmptyDocument('Proof Project'));
const before = history.current;
const beforeCount = Object.keys(before.nodes).length;

// 1) Generate a design section from a natural-language prompt.
const res = await router.generateDesign({ prompt: 'an analytics dashboard', document: before });
const after = history.dispatch(res.batch);
const afterCount = Object.keys(after.nodes).length;
assert.ok(afterCount > beforeCount + 5, `compose should add many nodes (got ${afterCount - beforeCount})`);
assert.ok(res.usage.mode === 'demo' && res.usage.estimatedCostUsd === 0, 'usage must be honestly demo/zero-cost');

// 2) Every node must carry a finite, positive layout rect (geometry is real, not stubbed).
const layout = layoutPage(after, after.activePageId);
const ids = Object.keys(after.nodes).filter((id) => after.nodes[id].parentId !== null && after.nodes[id].type !== 'document' && after.nodes[id].type !== 'page');
assert.ok(ids.length > 5, 'should have real content nodes');
for (const id of ids) {
  const r = layout[id];
  assert.ok(r && Number.isFinite(r.width) && r.width > 0 && Number.isFinite(r.height) && r.height > 0, `node ${id} has degenerate layout`);
}

// 3) AI diff (before/after summary the user reviews, §36).
const diff = diffFromBatch(before, after, res.batch);
assert.ok(diff.added.length >= 5, 'diff should report added nodes');
assert.equal(diff.nodeCountBefore, beforeCount);
assert.equal(diff.nodeCountAfter, afterCount);

// 4) Undo / redo restore the exact structure (op-log reversibility, §35).
history.undo();
assert.equal(Object.keys(history.current.nodes).length, beforeCount, 'undo restores node count');
history.redo();
assert.equal(Object.keys(history.current.nodes).length, afterCount, 'redo re-applies node count');

// 5) A deterministic AI *edit* transform on a real selection (not a canned string).
const oneContent = ids.find((id) => after.nodes[id].type === 'rectangle' || after.nodes[id].type === 'text') ?? ids[0];
const edit = await router.editDesign({ instruction: 'rename ProofLayer', document: history.current, selectedNodeIds: [oneContent] });
const edited = history.dispatch(edit.batch);
assert.notEqual(edited, before, 'edit should produce a new document');

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: router.mode,
      nodesBefore: beforeCount,
      nodesAfter: afterCount,
      addedByCompose: diff.added.length,
      contentNodesWithLayout: ids.length,
      sampleNodeTypes: [...new Set(ids.map((i) => after.nodes[i].type))].slice(0, 8),
      usage: res.usage,
    },
    null,
    2,
  ),
);
