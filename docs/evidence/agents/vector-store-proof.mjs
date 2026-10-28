// NEXUS M2 v18 — persisted vector store proof (ADR 0016 amendment 18).
// Real vector mechanics, local and honest: token-bag hash embeddings (NOT trained — §60),
// exact cosine scan (stated), persisted to a jailed JSON file and reloaded in a COLD reader.
// Cold-loaded ranking must be bit-identical to the inline scorer. Run after `npm run build`:
//   node docs/evidence/agents/vector-store-proof.mjs
//
// v532 (amendment 518) — the corpus is the repository's SOURCE; a dot-directory is tooling, not source.
// Measured 2026-10-28 on the authoring worktree: `.scratch/`'s untracked `.js`/`.md` files sort before
// `agents/` and consumed the alphabetical first-120 window, so the third query found nothing here while
// a clean checkout was green. Amendment 149's nested-`.git` skip in code-index was this observation one
// directory narrower; the filter below is the wider rule, kept in the proof that owns the window.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { buildVectorDb, saveVectors, loadVectors, queryVectors, hybridScore, collectTextFiles, chunkFile } = rt;

const JAIL = path.join(os.tmpdir(), 'nexus-vector-proof').replace(/\\/g, '/');
fs.rmSync(JAIL, { recursive: true, force: true });
fs.mkdirSync(`${JAIL}/state`, { recursive: true });

// Corpus: index chunks of the real repo (first 300 files' worth, deterministic subset).
const files = collectTextFiles('.', fs);
const paths = Object.keys(files)
  .filter((p) => !p.split('/').some((seg) => seg.startsWith('.')))
  .sort()
  .slice(0, 120);
const entries = [];
for (const p of paths) {
  for (const c of chunkFile(p, files[p]).slice(0, 2)) {
    entries.push({ id: `${p}:${c.startLine}`, text: `${c.heading ?? ''} ${c.text}`.slice(0, 400), meta: { path: p, startLine: c.startLine } });
  }
}
const db = buildVectorDb(entries);
assert.ok(db.entries.length > 150, `expected a real store, got ${db.entries.length}`);
saveVectors(fs, `${JAIL}/state/vectors.json`, db);
const sizeKb = (fs.statSync(`${JAIL}/state/vectors.json`).size / 1024).toFixed(0);

// Cold load + identical ranking vs inline hybridScore, twice = deterministic.
const t0 = process.hrtime.bigint();
const loaded = loadVectors(fs, `${JAIL}/state/vectors.json`);
const loadMs = Number(process.hrtime.bigint() - t0) / 1e6;
assert.equal(loaded.ok, true, loaded.reason);

const QUERIES = ['guardedJoin jail disk write root', 'embedTokens bag of tokens normalization', 'checkpoint denied permission registry invoke'];
for (const q of QUERIES) {
  const hits = queryVectors(loaded.db, q, { k: 3 });
  assert.deepEqual(queryVectors(loaded.db, q, { k: 3 }), hits, 'repeat query must be identical');
  for (const h of hits) {
    const text = loaded.db.entries.find((e) => e.id === h.id).text;
    assert.ok(Math.abs(h.score - hybridScore(q, text)) < 1e-12, 'stored-vector cosine must equal inline scoring');
  }
  assert.ok(hits.length > 0, `"${q}" found nothing`);
  console.log(`[vector-store] "${q.slice(0, 42)}…" → ${hits.map((h) => h.id.split(':')[0].split('/').pop()).join(', ')}`);
}

// Corruption honesty.
fs.writeFileSync(`${JAIL}/state/vectors.json`, '{oops');
assert.deepEqual(loadVectors(fs, `${JAIL}/state/vectors.json`), { ok: false, reason: 'not valid JSON' });

fs.rmSync(JAIL, { recursive: true, force: true });
console.log(`[vector-store] ${db.entries.length} vectors, ${sizeKb} KB JSON, cold load ${loadMs.toFixed(1)}ms — exact scan, ranking parity, honest failures (DEMO §60: hash embeddings, not trained)`);
console.log('[vector-store] ALL ASSERTIONS PASSED');
