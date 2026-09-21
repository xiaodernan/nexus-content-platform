// NEXUS M2 v5 — snapshot-backed IndexProvider proof (ADR 0016 amendment 5).
// Headless, offline, key-free. One provider serves TWO agent tasks over the real repo:
// the second task's research costs ~0 re-chunking. Then a brand-new provider (a stand-in
// for a fresh process) restores the persisted snapshot, answers identically with 0
// re-chunked files, and the corrupt-snapshot fallback is exercised. Run from the repo
// root after `npm run build`:  node docs/evidence/agents/provider-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const {
  ToolRegistry, InMemoryWorkspace,
  registerWorkspaceTools, collectTextFiles, createIndexProvider, runTask,
} = rt;

const JAIL = path.join(os.tmpdir(), 'nexus-provider-proof').replace(/\\/g, '/');
fs.rmSync(JAIL, { recursive: true, force: true });
fs.mkdirSync(`${JAIL}/state`, { recursive: true });

const allow = () => true;
const files = collectTextFiles('.', fs);
const snap = `${JAIL}/state/index.json`;

// Task 1: cold provider (builds + persists the snapshot), research via fs.index.
const provider = createIndexProvider({ files, snapshotFile: snap, fsLike: fs });
const ws = new InMemoryWorkspace(files);
const reg1 = registerWorkspaceTools(new ToolRegistry(), ws, { indexProvider: provider });
const out1 = await runTask({ id: 'prov-1', goal: 'embedTokens bag of tokens normalization' }, { registry: reg1, checkpoint: allow });
assert.equal(out1.status, 'completed');
const hits1 = out1.results[0].output.hits;
assert.equal(provider.lastRechunked().length, Object.keys(files).length, 'first use is a cold build');
assert.ok(fs.existsSync(snap), 'snapshot persisted after first refresh');
console.log(`[provider-proof] task 1 cold: ${provider.lastRechunked().length} files chunked, top hit ${hits1[0].path}:${hits1[0].startLine}`);

// Task 2 (same session): shared provider rescans incrementally — 0 re-chunked, identical ranking.
const out2 = await runTask({ id: 'prov-2', goal: 'embedTokens bag of tokens normalization' }, { registry: reg1, checkpoint: allow });
assert.equal(out2.status, 'completed');
assert.deepEqual(out2.results[0].output.hits, hits1, 'same query, same hits');
assert.equal(provider.lastRechunked().length, 0, 'unchanged repo re-chunks nothing');

// Fresh provider (stand-in for a new process): restores the snapshot cold, 0 re-chunked.
const revived = createIndexProvider({ files, snapshotFile: snap, fsLike: fs });
revived.refresh();
assert.equal(revived.lastRechunked().length, 0, 'snapshot hit means zero re-chunking in a cold process');
assert.deepEqual(revived.index(), provider.index());

// Corrupt snapshot → honest cold fallback, and the file is repaired.
fs.writeFileSync(snap, 'garbage');
const fb = createIndexProvider({ files, snapshotFile: snap, fsLike: fs });
fb.refresh();
assert.ok(fb.lastRechunked().length > 0, 'fallback rebuilds');
const repaired = rt.loadIndex(fs, snap);
assert.equal(repaired.ok, true, 'fallback rewrote a valid snapshot');

fs.rmSync(JAIL, { recursive: true, force: true });
console.log('[provider-proof] task 2 incremental: 0 re-chunked, identical hits ✓');
console.log('[provider-proof] cold-process restore from snapshot: 0 re-chunked ✓ · corrupt file falls back + repairs ✓');
console.log('[provider-proof] ALL ASSERTIONS PASSED (DEMO MODE §60 — provider only ever serves the host-supplied file set)');
