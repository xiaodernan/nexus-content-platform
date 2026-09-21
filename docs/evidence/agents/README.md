# M2 evidence — @nexus/agent-runtime (v0 loop · v1 index · v2 memory · v3 durability · v4 snapshots · v5 provider · v6 hybrid recall)

All checks are headless, offline, key-free, and reproducible from the repo root. Nothing here
claims model-quality planning or neural retrieval (§60): the planner is a deterministic
template and the index embedder is a hash-based bag-of-tokens stand-in — both say so in
every emitted artifact (`provenance.mode = "demo"`).

## Reproducible gates

```
npm test          # turbo: @nexus/agent-runtime 62/62 vitest among all packages
npm run build     # tsc dist for agents/runtime (build order via ^build deps)
node docs/evidence/agents/agent-proof.mjs
node docs/evidence/agents/code-index-proof.mjs   # requires `npm run build` first
node docs/evidence/agents/memory-proof.mjs       # requires `npm run build` first
node docs/evidence/agents/durability-proof.mjs   # requires `npm run build` first
node docs/evidence/agents/index-store-proof.mjs  # requires `npm run build` first
node docs/evidence/agents/provider-proof.mjs     # requires `npm run build` first
node docs/evidence/agents/recall-proof.mjs       # requires `npm run build` first
```

## Unit tests (vitest, `agents/runtime/test`)

| File | Covers |
| ---- | ------ |
| `registry.test.ts` (7) | arg validation (missing/unknown/type), unknown tool, checkpoint required for write/exec, deny ⇒ implementation never runs, approve ⇒ runs, impl throw ⇒ `ok:false` (never rejects), double-register refused |
| `workspace.test.ts` (4) | sorted/prefix listing, case-insensitive 1-based `search`, append/missing-file throw, registry wiring incl. gated `fs.write` |
| `agent.test.ts` (9) | stopword-aware keyword, plan determinism + seed stamp, golden path event order + `@search.hits.0.path` dataflow + note in file, denial leaves file untouched, failing verify → 1 fix round → pass, persistent failure → `failed_verification` after `maxFixRounds`, `maxSteps` → `budget_exhausted`, planner routes step 0 through `fs.index` when registered, warm memory outranks the index (`memory.recall` first) |
| `codeIndex.test.ts` (7) | extension → kind, TS symbol + markdown heading extraction, heading-section vs 40-line-window chunking, sorted file entries + coverage, hybrid query ranks the relevant chunk first and is deterministic, symbol query finds its file, empty index → no hits |
| `realfs.test.ts` (4) | extension/skip filtering with sorted slash keys, custom skipDirs + maxFiles cap, maxBytes drop, deterministic output independent of walk order — all against a fake fs (no host disk touched) |
| `memory.test.ts` (8) | save/list/recall scoping, deterministic tie-broken recall bounded by k, forget/clear counts, clone-in/clone-out immutability, registry round-trip with `"path:startLine"` refs, denied `memory.save` leaves memory empty + arg validation; v6 `compact()`: ≥50% ref-overlap merges within scope (listed, idempotent), cross-scope isolation |
| `embedding.test.ts` (4) | tokenizer rules, zero-shared-tokens ⇒ score exactly 0, more shared tokens ⇒ strictly higher, unit-length embeddings |
| `durability.test.ts` (8) | memory serialize/deserialize round-trip + version/schema rejection, `restore()` id high-water mark, save/load through an injected writable fake disk, corrupt-file honest failure, `guardedJoin` jail (absolute/`..`/drive-letter rejection, backslash folding), `disk.write` checkpoint gate + escape touches nothing, `disk.read`/`disk.list` confinement |
| `indexStore.test.ts` (11) | index snapshot serialize→deserialize verbatim + version/chunk schema rejection, save/load via injected fs, cold rescan equals `buildIndex`, unchanged files reuse chunks / edits rechunk exactly the changed paths / removals drop out, query ranking snapshot-independent; v5 provider: cold-first-build equals plain build, incremental refresh 0 re-chunked, edited file sole re-chunk, cross-provider snapshot restore, corrupt-snapshot fallback + repair, `fs.index` provider/default parity |

## Headless proof (`agent-proof.mjs`) against the built `dist/`

- Golden path transcript: `search → read → annotate → verify(fail) → fix-1 → verify-2(pass)`,
  status `completed`, gates visited: `fs.append:write`, `test.run:exec`. Since v1 the
  `search` step runs the `fs.index` tool (same stepId, same `hits.0.path` dataflow).
- **Determinism:** two fresh runs produce byte-identical `{plan, events, results}` JSON and
  identical workspace snapshots.
- **Honest denial:** with no checkpoint callback the write step returns
  `checkpoint required`, status `denied`, workspace snapshot equals the seed exactly.

## Real-repo index proof (`code-index-proof.mjs`, M2 v1)

Indexes the actual repository from disk via `node:fs` (125 files, 540 chunks as of this
writing; skips `node_modules/.git/.next/dist` and files > 256 KB) and answers
identifier-precise queries with the built hybrid scorer:

| Query | Definition file rank |
| ----- | -------------------- |
| `rigidRotateRect rotatePointAbout` | `packages/design-model/src/geometry.ts` #4 |
| `deserializeApp schemaVersion localStorage` | `apps/studio/src/lib/persist.ts` #4 |
| `DANGEROUS checkpoint ToolRegistry invoke` | `agents/runtime/src/registry.ts` #1 |

Top-5 (not top-1) is asserted deliberately: the demo scorer has no source-vs-test or
recency weighting, so files that import or exercise the same identifiers — including this
very evidence README, which quotes them — legitimately outrank definitions. Determinism
(identical hits across repeated queries) is asserted too.

## Real-repo ingestion + memory proof (`memory-proof.mjs`, M2 v2)

- **Run A (cold memory):** `collectTextFiles('.', node:fs)` ingests the real repository
  read-only (130+ files as of this writing), the planner researches via `fs.index` →
  `agents/runtime/src/embedding.ts` (v6 moved the scoring seam), annotates the **in-memory copy only** (§9 — the
  host disk is never written), verifies via the host predicate, and the host persists the
  finding through checkpoint-gated `memory.save` (gate observed as `memory.save:write`).
- **Run B (warm memory):** a fresh registry with **no `fs.index`** and a near-empty
  workspace containing only the remembered file — the planner's research step is served by
  `memory.recall` and the run completes. Two identical run-B harnesses produce identical
  transcripts (determinism).
- **§26 deletable:** after `store.clear(scope)`, the same run-B task *fails honestly*
  (`failed_verification`) instead of fabricating a result (§60).

## Durability proof (`durability-proof.mjs`, M2 v3)

The only NEXUS surface that writes the real disk anywhere in this repo: a `disk.write` call
confined by `guardedJoin` to a jailed temp root (`%TEMP%/nexus-durability-proof`, removed at
the end). Flow: run 1 completes a task with cold memory, the host persists the finding via
checkpoint-gated `memory.save`, then flushes `serializeMemory` to `state/memory.json`
through **`disk.write`** (gate observed as `disk.write:write`). A **separate `node` child
process** then reloads that file with `loadMemoryStore` and recalls the right path —
genuine cross-process durability, not an in-memory illusion. Two negative controls:
`../../nexus-escape.txt` is refused and provably never created, and a corrupted JSON file
returns `{ok:false, reason:'not valid JSON'}` instead of half-loading.

## Index snapshot proof (`index-store-proof.mjs`, M2 v4)

Cold-builds the real repo's index (129 files), serializes it via `saveIndex` through
`node:fs` into a jailed temp root, and reloads with a cold `loadIndex`: the index is
byte-identical and `queryIndex` rankings deep-equal. Incremental `rescanIndex` with
fingerprints: unchanged repo rescan re-chunks **0 files in ~3 ms**; a one-file edit
re-chunks exactly that file and the result deep-equals a full cold rebuild (which would
re-chunk all 129); the edited file's new symbol is queryable immediately. Corrupting the
snapshot file yields `{ok:false, reason:'not valid JSON'}` — no half-load.

## Provider proof (`provider-proof.mjs`, M2 v5)

One `createIndexProvider` serves two agent tasks over the real repo (129 files): task 1
cold-builds (129 re-chunked) and persists the snapshot; task 2's research is answered from
the same provider with **0 re-chunked files and deep-equal hits**. A brand-new provider —
the stand-in for a fresh process — restores the persisted snapshot cold with 0 re-chunked
files; a corrupted snapshot triggers an honest full rebuild and repairs the file.
`fs.index` with and without a provider returns identical hits, so the seam cannot silently
change retrieval behavior.

## Recall + consolidation proof (`recall-proof.mjs`, M2 v6)

Seeds five memory records from real-repo `fs.index` research (four distinct questions plus
one realistic rediscovery of the first finding). A **paraphrased probe** ("how does the code
index embed and score tokens") recalls the right record with identical results across runs;
the printed comparison shows the hybrid top against the lexical-only baseline. `compact()`
then merges the duplicate-research records (`mem-5→mem-1`, 5→4) — every merge listed, and
the probe's answer survives consolidation unchanged.

## Scope honesty

§63/§26 items *not* implemented (stated, not faked): general real-fs write tools (only
`disk.write` inside an explicit jail root, always checkpoint-gated), process execution,
browser automation, visual QA, git commit, live-model planning, multi-agent registry. The
`test.run` verification is a host-injected predicate — it verifies what the host checks.
Memory recall (v6) shares the index's deterministic token-bag hybrid score — a real
signature scheme, but still a stand-in for the pgvector hybrid retrieval of ADR 0012. The provider must be kept in sync with the workspace by the
host; it only ever sees the host-supplied file set (§60).
