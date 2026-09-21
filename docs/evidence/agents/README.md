# M2 evidence — @nexus/agent-runtime (v0 loop + v1 code index + v2 ingestion & memory)

All checks are headless, offline, key-free, and reproducible from the repo root. Nothing here
claims model-quality planning or neural retrieval (§60): the planner is a deterministic
template and the index embedder is a hash-based bag-of-tokens stand-in — both say so in
every emitted artifact (`provenance.mode = "demo"`).

## Reproducible gates

```
npm test          # turbo: @nexus/agent-runtime 37/37 vitest among all packages
npm run build     # tsc dist for agents/runtime (build order via ^build deps)
node docs/evidence/agents/agent-proof.mjs
node docs/evidence/agents/code-index-proof.mjs   # requires `npm run build` first
node docs/evidence/agents/memory-proof.mjs       # requires `npm run build` first
```

## Unit tests (vitest, `agents/runtime/test`)

| File | Covers |
| ---- | ------ |
| `registry.test.ts` (7) | arg validation (missing/unknown/type), unknown tool, checkpoint required for write/exec, deny ⇒ implementation never runs, approve ⇒ runs, impl throw ⇒ `ok:false` (never rejects), double-register refused |
| `workspace.test.ts` (4) | sorted/prefix listing, case-insensitive 1-based `search`, append/missing-file throw, registry wiring incl. gated `fs.write` |
| `agent.test.ts` (9) | stopword-aware keyword, plan determinism + seed stamp, golden path event order + `@search.hits.0.path` dataflow + note in file, denial leaves file untouched, failing verify → 1 fix round → pass, persistent failure → `failed_verification` after `maxFixRounds`, `maxSteps` → `budget_exhausted`, planner routes step 0 through `fs.index` when registered, warm memory outranks the index (`memory.recall` first) |
| `codeIndex.test.ts` (7) | extension → kind, TS symbol + markdown heading extraction, heading-section vs 40-line-window chunking, sorted file entries + coverage, hybrid query ranks the relevant chunk first and is deterministic, symbol query finds its file, empty index → no hits |
| `realfs.test.ts` (4) | extension/skip filtering with sorted slash keys, custom skipDirs + maxFiles cap, maxBytes drop, deterministic output independent of walk order — all against a fake fs (no host disk touched) |
| `memory.test.ts` (6) | save/list/recall scoping, deterministic tie-broken recall bounded by k, forget/clear counts, clone-in/clone-out immutability, registry round-trip with `"path:startLine"` refs, denied `memory.save` leaves memory empty + arg validation |

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
  read-only (125 files as of this writing), the planner researches via `fs.index` →
  `agents/runtime/src/codeIndex.ts:121`, annotates the **in-memory copy only** (§9 — the
  host disk is never written), verifies via the host predicate, and the host persists the
  finding through checkpoint-gated `memory.save` (gate observed as `memory.save:write`).
- **Run B (warm memory):** a fresh registry with **no `fs.index`** and a near-empty
  workspace containing only the remembered file — the planner's research step is served by
  `memory.recall` and the run completes. Two identical run-B harnesses produce identical
  transcripts (determinism).
- **§26 deletable:** after `store.clear(scope)`, the same run-B task *fails honestly*
  (`failed_verification`) instead of fabricating a result (§60).

## Scope honesty

§63/§26 items *not* implemented (stated, not faked): real fs/exec **write** tools (ingestion
is read-only injection; the runtime never touches the host disk), persisted memory (the
store lives in-process — cross-run durability here is proven within one process), persisted
code index (rebuilt per `fs.index` call), browser automation, visual QA, git commit,
live-model planning, multi-agent registry. The `test.run` verification is a host-injected
predicate — it verifies what the host checks. Memory recall is lexical
(`lexicalScore` over query+summary), which is a stand-in for the pgvector hybrid retrieval
of ADR 0012.
