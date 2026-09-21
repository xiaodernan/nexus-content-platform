// NEXUS M2 v4 — persisted code-index snapshot proof (ADR 0016 amendment 4).
// Headless, offline, key-free. Ingests the real repo TWICE: first cold build is serialized
// through saveIndex into a jailed temp file (via node:fs — host side); a COLD reader reloads
// it with loadIndex and answers queries with byte-identical ranking; an unchanged rescan
// re-chunks ZERO files, and editing one file's content in-memory re-chunks exactly that one.
// Run from the repo root after `npm run build`:
//   node docs/evidence/agents/index-store-proof.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { collectTextFiles, buildIndex, queryIndex, fingerprintFiles, rescanIndex, saveIndex, loadIndex } = rt;

const JAIL = path.join(os.tmpdir(), 'nexus-index-store-proof').replace(/\\/g, '/');
fs.rmSync(JAIL, { recursive: true, force: true });
fs.mkdirSync(`${JAIL}/state`, { recursive: true });

const files = collectTextFiles('.', fs);
assert.ok(Object.keys(files).length > 50);

// 1) Cold build → persist → cold reload: identical index, identical ranking.
const cold = buildIndex(files);
const fp = fingerprintFiles(files);
saveIndex(fs, `${JAIL}/state/index.json`, cold, fp);
const loaded = loadIndex(fs, `${JAIL}/state/index.json`);
assert.equal(loaded.ok, true, `snapshot must reload: ${loaded.reason}`);
assert.deepEqual(loaded.index, cold, 'snapshot must be verbatim');

const QUERY = 'embedTokens bag of tokens normalization';
assert.deepEqual(queryIndex(loaded.index, QUERY, 3), queryIndex(cold, QUERY, 3), 'ranking is snapshot-independent');
console.log('[index-store] cold reload ranks identical —', queryIndex(loaded.index, QUERY, 1)[0].path);

// 2) Incremental rescan of the UNCHANGED repo re-chunks nothing but keeps full coverage.
const t0 = process.hrtime.bigint();
const rescan = rescanIndex(loaded.index, loaded.fingerprints, files);
const msUnchanged = Number(process.hrtime.bigint() - t0) / 1e6;
assert.deepEqual(rescan.rechunked, [], 'unchanged repo must reuse every chunk');
assert.deepEqual(rescan.index, cold);

// 3) One edited file re-chunks exactly it; result equals a cold rebuild.
const edited = { ...files, 'agents/runtime/src/codeIndex.ts': files['agents/runtime/src/codeIndex.ts'] + '\nexport const MARKER_V4 = 1;\n' };
const t1 = process.hrtime.bigint();
const partial = rescanIndex(rescan.index, rescan.fingerprints, edited);
const msEdited = Number(process.hrtime.bigint() - t1) / 1e6;
assert.deepEqual(partial.rechunked, ['agents/runtime/src/codeIndex.ts']);
assert.deepEqual(partial.index, buildIndex(edited), 'incremental output must equal cold build');
assert.ok(queryIndex(partial.index, 'MARKER_V4', 1)[0].path === 'agents/runtime/src/codeIndex.ts', 'new symbol is queryable after rescan');
console.log(`[index-store] rescan: unchanged=${msUnchanged.toFixed(0)}ms (0 rechunked), one-edit=${msEdited.toFixed(0)}ms (1 rechunked, cold rebuild would re-chunk ${Object.keys(files).length})`);

// 4) Corrupt snapshot fails honestly.
fs.writeFileSync(`${JAIL}/state/index.json`, 'nope');
assert.deepEqual(loadIndex(fs, `${JAIL}/state/index.json`), { ok: false, reason: 'not valid JSON' });

fs.rmSync(JAIL, { recursive: true, force: true });
console.log('[index-store] ALL ASSERTIONS PASSED (persisted snapshots, incremental fingerprint rescan, §60 controls)');
