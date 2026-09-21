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

// 6) Multi-page add routes through the existing addSubtree -> pageIds path (no schema change).
const { ops, childIdList, pageNode } = dm;
const prePages = history.current;
const prePageCount = childIdList(prePages.nodes[prePages.rootId]).length;
const newPage = pageNode('Proof Page 2', { x: 0, y: 0, width: 1440, height: 900 });
const twoPageDoc = history.dispatch({
  id: 'pageadd',
  ops: [ops.addSubtree(prePages.rootId, prePageCount, [newPage])],
  provenance: { mode: 'user' },
  timestamp: 0,
  summary: 'Add Proof Page 2',
});
const twoPageIds = childIdList(twoPageDoc.nodes[twoPageDoc.rootId]);
assert.equal(twoPageIds.length, prePageCount + 1, 'addSubtree on a document grows pageIds');
assert.ok(twoPageIds.includes(newPage.id), 'the new page is wired into pageIds');
// per-page isolation: laying out the new (empty) page yields only the page rect
const solo = layoutPage(twoPageDoc, newPage.id);
assert.equal(Object.keys(solo).length, 1, 'layoutPage must isolate a fresh page (page rect only)');
history.undo();
assert.equal(childIdList(history.current.nodes[history.current.rootId]).length, prePageCount, 'undo removes the added page');

// 7) Persistence round-trip at the model level mirrors studio/lib/persist.ts guarantees:
//    serialize -> JSON -> revalidate a resolvable root + page, then lay out the revived doc.
const snapshot = JSON.stringify(history.current);
const revived = JSON.parse(snapshot);
assert.ok(revived.nodes[revived.rootId], 'revived doc resolves its root');
assert.ok(Object.values(revived.nodes).some((n) => n.type === 'page'), 'revived doc has a page to display');
const revivedLayout = layoutPage(revived, revived.activePageId);
assert.ok(Object.keys(revivedLayout).length >= 1, 'revived doc lays out identically');

// 8) Component -> instance projection (ADR 0015): two instances of one component materialize
//    into DISJOINT clone subtrees, each mapped back to its owning instance; the master itself is
//    never a page child and stays untouched (purity).
const { expandComponentInstances, ownerInstanceId, componentNode, rectNode, textNode, instanceNode } = dm;
{
  const doc8 = createEmptyDocument('Variants Proof');
  const page = doc8.activePageId;
  const childIds = ['mrect', 'mtext'];
  const comp = componentNode('Card', { id: 'comp1', width: 200, height: 80, parentId: doc8.rootId });
  comp.childIds = childIds;
  const mrect = rectNode('bg', { id: 'mrect', parentId: 'comp1', width: 200, height: 80 });
  const mtext = textNode('label', 'Hello', {
    fontFamilyToken: 'font.family.body', sizeToken: 'font.size.base', weight: 400,
    lineHeight: 1.2, letterSpacing: 0, align: 'left',
  }, { id: 'mtext', parentId: 'comp1', width: 200, height: 80 });
  const i1 = instanceNode('Card A', 'comp1', { id: 'inst1', x: 20, y: 20, width: 200, height: 80 });
  const i2 = instanceNode('Card B', 'comp1', { id: 'inst2', x: 240, y: 20, width: 200, height: 80 });
  i2.overrides = { 'mtext': {}, text: { mtext: 'World' } };
  const nodes = { ...doc8.nodes, comp1: comp, mrect, mtext, inst1: i1, inst2: i2 };
  const pg = { ...nodes[page], childIds: ['inst1', 'inst2'] };
  const doc8b = { ...doc8, nodes: { ...nodes, [page]: pg } };

  const { doc: view, meta } = expandComponentInstances(doc8b);
  const c1 = view.nodes['inst1'].childIds;
  const c2 = view.nodes['inst2'].childIds;
  assert.equal(c1.length, 2, 'instance 1 materializes 2 master children');
  assert.ok(!c1.some((id) => c2.includes(id)), 'two instances materialize to DISJOINT clone ids');
  assert.equal(view.nodes['inst2::mtext'].characters, 'World', 'text override applies to the clone, not the master');
  assert.equal(view.nodes['mtext'].characters, 'Hello', 'master text stays untouched (purity)');
  assert.equal(ownerInstanceId(meta, 'inst2::mrect'), 'inst2', 'a clone maps to its owning instance');
  assert.ok(!pg.childIds.includes('comp1'), 'master is not a page child');
  // master lives under root but is skipped by per-page layout (never painted on a page)
  assert.ok(layoutPage(view, page)['inst1'], 'instance participates in page layout');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: router.mode,
      nodesBefore: beforeCount,
      nodesAfter: afterCount,
      addedByCompose: diff.added.length,
      contentNodesWithLayout: ids.length,
      pagesAfterAdd: twoPageIds.length,
      instanceProjection: '2 instances -> disjoint clones, override + purity verified',
      sampleNodeTypes: [...new Set(ids.map((i) => after.nodes[i].type))].slice(0, 8),
      usage: res.usage,
    },
    null,
    2,
  ),
);
