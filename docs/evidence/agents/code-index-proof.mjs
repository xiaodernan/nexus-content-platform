// NEXUS M2 v1 — code-index proof-of-work over the REAL repository (§63, ADR 0016).
// Headless, hermetic: reads this repo's source files with node:fs, indexes them in
// memory with the built agent-runtime, and answers natural-language queries.
// Honesty (§60): the "semantic" signal is a deterministic bag-of-tokens hash embedding
// + token coverage — real retrieval plumbing, NOT a neural model and no AI keys.
// Run from the repo root:  node docs/evidence/agents/code-index-proof.mjs
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const rt = await import(pathToFileURL('./agents/runtime/dist/index.js').href);
const { buildIndex, queryIndex } = rt;

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.turbo']);
const TEXT_EXT = /\.(ts|tsx|js|jsx|md|json|css)$/i;
const MAX_BYTES = 256 * 1024;

function collect(root) {
  const files = {};
  const walk = (dir) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(abs);
      } else if (TEXT_EXT.test(ent.name) && statSync(abs).size <= MAX_BYTES) {
        files[path.relative(root, abs).split(path.sep).join('/')] = readFileSync(abs, 'utf8');
      }
    }
  };
  walk(root);
  return files;
}

const root = process.cwd();
const files = collect(root);
const index = buildIndex(files);
console.log(`[code-index] indexed ${index.files.length} files, ${index.chunks.length} chunks (no keys, no network)`);
assert.ok(index.files.length > 50, 'expected to index a meaningful slice of the repo');

const QUERIES = [
  ['rigidRotateRect rotatePointAbout', 'packages/design-model/src/geometry.ts'],
  ['deserializeApp schemaVersion localStorage', 'apps/studio/src/lib/persist.ts'],
  ['DANGEROUS checkpoint ToolRegistry invoke', 'agents/runtime/src/registry.ts'],
];

for (const [query, expected] of QUERIES) {
  const hits = queryIndex(index, query, 5);
  const again = queryIndex(index, query, 5);
  assert.deepEqual(again, hits, 'same query must return identical hits (deterministic)');
  const paths = hits.map((h) => h.path);
  // Top-5 (not top-1): the demo scorer has no src-vs-test weighting, so files that
  // import or exercise the same identifiers legitimately tie at the top. §60 honesty.
  assert.ok(paths.includes(expected), `"${query}" must surface ${expected} in the top 5, got ${paths.join(', ')}`);
  console.log(`[code-index] "${query}" → ${expected} at #${paths.indexOf(expected) + 1}`);
  for (const h of hits) {
    console.log(`    ${h.score.toFixed(3)}  ${h.path}:${h.startLine}${h.heading ? ` (${h.heading})` : ''}`);
  }
  const top = hits[0];
  assert.ok(top.snippet.length > 0 && top.snippet.length <= 120, 'snippet bounded');
}

console.log('[code-index] ALL ASSERTIONS PASSED (DEMO MODE: deterministic hash embeddings, ADR 0010)');
