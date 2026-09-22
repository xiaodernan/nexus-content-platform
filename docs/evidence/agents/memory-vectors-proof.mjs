// NEXUS M2 v19 — vector-backed memory proof (ADR 0016 amendment 19).
// §26 memory recall served from a PERSISTED vector db: cold reader (fresh MemoryStore +
// loadVectors) must return the SAME ranking as inline hybrid scoring — switching the
// mechanics must not shift semantics. Engine is reported honestly per call (vectors vs
// inline fallback). Run after `npm run build`:  node docs/evidence/agents/memory-vectors-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { MemoryStore, ToolRegistry, registerMemoryTools, saveVectors, loadVectors, queryVectors } = rt;

const JAIL = path.join(os.tmpdir(), 'nexus-memvec-proof').replace(/\\/g, '/');
fs.rmSync(JAIL, { recursive: true, force: true });
fs.mkdirSync(JAIL, { recursive: true });
const VF = `${JAIL}/vectors.json`;

const store = new MemoryStore();
store.save({ scope: 'studio', runId: 'a', query: 'guardedJoin jail disk write', summary: 'handoff: durability.ts', refs: [{ path: 'agents/runtime/src/durability.ts', startLine: 12 }] });
store.save({ scope: 'studio', runId: 'b', query: 'token bag embeddings normalization', summary: 'handoff: embedding.ts', refs: [{ path: 'agents/runtime/src/embedding.ts', startLine: 1 }] });
store.save({ scope: 'other', runId: 'c', query: 'unrelated soup recipe', summary: 'kitchen', refs: [{ path: 'cook.md' }] });
saveVectors(fs, VF, store.toVectorDb());

// Cold process analogue: empty store + persisted vectors + same tool surface.
const cold = new MemoryStore();
for (const r of store.list()) cold.restore(r);
const loaded = loadVectors(fs, VF);
assert.equal(loaded.ok, true);

for (const q of ['disk write jail', 'embedTokens normalization', 'soup']) {
  const vec = cold.recallVectors(loaded.db, q, { scope: 'studio' });
  const inline = cold.recall(q, { scope: 'studio' });
  assert.deepEqual(vec.map((h) => [h.memId, h.path]), inline.map((h) => [h.memId, h.path]), `parity broke for "${q}"`);
}
console.log('[memvec] parity: vector-backed recall == inline recall for all probes (scope-filtered) ✓');

// The tool reports its engine honestly, including the inline fallback.
const regV = registerMemoryTools(new ToolRegistry(), cold, { scope: 'studio', vectorsFile: VF, fsLike: fs });
const viaV = await regV.invoke({ callId: 'v', tool: 'memory.recall', args: { query: 'jail disk write' } }, {});
assert.equal(viaV.output.engine, 'vectors');
assert.equal(viaV.output.hits[0].path, 'agents/runtime/src/durability.ts');

const broken = `${JAIL}/broken.json`;
fs.writeFileSync(broken, '{oops');
const regB = registerMemoryTools(new ToolRegistry(), cold, { scope: 'studio', vectorsFile: broken, fsLike: fs });
const viaB = await regB.invoke({ callId: 'b', tool: 'memory.recall', args: { query: 'jail disk write' } }, {});
assert.equal(viaB.output.engine, 'inline', 'corrupt vector file ⇒ honest inline fallback, never a fake answer');
assert.equal(viaB.output.hits[0].path, 'agents/runtime/src/durability.ts');

fs.rmSync(JAIL, { recursive: true, force: true });
console.log('[memvec] ALL ASSERTIONS PASSED (persisted-vector §26 recall, stated engine, honest fallback §60)');
