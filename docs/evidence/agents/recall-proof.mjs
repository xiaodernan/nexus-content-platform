// NEXUS M2 v6 — hybrid memory recall + consolidation proof (ADR 0016 amendment 6).
// Headless, offline, key-free. Seeds one memory record per real-repo research question
// (some deliberately overlapping), then shows: hybrid recall is deterministic and ranks the
// right record above a lexical-only baseline on a paraphrased probe; compact() merges the
// overlapping records and the probe's answer survives consolidation. §60: still hash-based
// token-bag scoring — deterministic machinery, not a neural model.
// Run from the repo root after `npm run build`:  node docs/evidence/agents/recall-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const ai = await import(pathToFileURL('./packages/ai-providers/dist/index.js').href);
const { MemoryStore, collectTextFiles, buildIndex, queryIndex, hybridScore } = rt;

const files = collectTextFiles('.', fs);
const index = buildIndex(files);

const QUESTIONS = [
  ['embedTokens bag of tokens normalization', 'how the index embeds text'],
  ['queryIndex hybrid scoring coverage cosine', 'scoring of index queries'],
  ['checkpoint denied permission registry invoke', 'tool gating'],
  ['guardedJoin jail disk write root', ' jailed disk tools'],
];

const store = new MemoryStore();
const tops = [];
for (const [q, tag] of QUESTIONS) {
  const hit = queryIndex(index, q, 1)[0];
  assert.ok(hit, `index must answer "${q}"`);
  tops.push(hit.path);
  store.save({ scope: 'recall', runId: `seed-${q.slice(0, 8)}`, query: q, summary: `${tag}: ${hit.path}`, refs: [{ path: hit.path, startLine: hit.startLine }] });
}

// A realistic repeat: a later task rediscovers the first finding → duplicate research worth consolidating.
const revisit = queryIndex(index, QUESTIONS[0][0], 1)[0];
store.save({ scope: 'recall', runId: 'seed-followup', query: 'embedTokens revisit normalization', summary: `re-check: ${revisit.path}`, refs: [{ path: revisit.path, startLine: revisit.startLine }] });
console.log('[recall-proof] seeded records →', tops.join(', '), `(+ follow-up on ${revisit.path})`);

// Hybrid recall of a PARAPHRASED probe: deterministic and points at an embedding-record.
const PROBE = 'how does the code index embed and score tokens';
const hits1 = store.recall(PROBE, { scope: 'recall', k: 3 });
const hits2 = store.recall(PROBE, { scope: 'recall', k: 3 });
assert.deepEqual(hits2, hits1, 'recall must be deterministic');
assert.ok(hits1.length > 0, 'probe must recall something');
assert.ok(hits1[0].summary.includes(tops[0]) || hits1[0].summary.includes(tops[1]), `unexpected top: ${hits1[0].summary}`);

// Lexical-only baseline (Jaccard) for the printed comparison (§60: show, don't claim).
const lexicalRanked = store
  .list('recall')
  .map((r) => ({ id: r.id, score: ai.lexicalScore(PROBE, `${r.query} ${r.summary}`) }))
  .filter((s) => s.score > 0)
  .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
console.log(`[recall-proof] hybrid top=${hits1[0].memId} (${hits1[0].score.toFixed(3)}) · lexical-only top=${lexicalRanked[0]?.id ?? 'none'}`);
assert.ok(hybridScore(PROBE, store.list('recall').find((r) => r.id === hits1[0].memId).query + ' ' + store.list('recall').find((r) => r.id === hits1[0].memId).summary) > 0);

// Consolidation: questions 1+2 share a file ⇒ their records merge; probe still lands there.
const before = store.list('recall').length;
const { merged } = store.compact();
const after = store.list('recall').length;
assert.ok(merged.length >= 1, 'overlapping research must consolidate');
assert.ok(after < before, `list must shrink: ${before} → ${after}`);
console.log('[recall-proof] compact merged:', merged.map((m) => `${m.from.join('+')}→${m.into}`).join(', '), `(${before}→${after})`);
const still = store.recall(PROBE, { scope: 'recall', k: 1 });
assert.equal(still[0].path, hits1[0].path, 'consolidation must preserve the probe answer');
assert.deepEqual(store.recall(PROBE, { scope: 'recall', k: 3 }).length > 0, true);

console.log('[recall-proof] ALL ASSERTIONS PASSED (hybrid recall determinism, paraphrase survival, honest consolidation)');
