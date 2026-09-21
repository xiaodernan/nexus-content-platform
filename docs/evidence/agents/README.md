# M2 evidence — @nexus/agent-runtime (v0 loop + v1 code index)

All checks are headless, offline, key-free, and reproducible from the repo root. Nothing here
claims model-quality planning or neural retrieval (§60): the planner is a deterministic
template and the index embedder is a hash-based bag-of-tokens stand-in — both say so in
every emitted artifact (`provenance.mode = "demo"`).

## Reproducible gates

```
npm test          # turbo: @nexus/agent-runtime 26/26 vitest among all packages
npm run build     # tsc dist for agents/runtime (build order via ^build deps)
node docs/evidence/agents/agent-proof.mjs
node docs/evidence/agents/code-index-proof.mjs   # requires `npm run build` first
```

## Unit tests (vitest, `agents/runtime/test`)

| File | Covers |
| ---- | ------ |
| `registry.test.ts` (7) | arg validation (missing/unknown/type), unknown tool, checkpoint required for write/exec, deny ⇒ implementation never runs, approve ⇒ runs, impl throw ⇒ `ok:false` (never rejects), double-register refused |
| `workspace.test.ts` (4) | sorted/prefix listing, case-insensitive 1-based `search`, append/missing-file throw, registry wiring incl. gated `fs.write` |
| `agent.test.ts` (8) | stopword-aware keyword, plan determinism + seed stamp, golden path event order + `@search.hits.0.path` dataflow + note in file, denial leaves file untouched, failing verify → 1 fix round → pass, persistent failure → `failed_verification` after `maxFixRounds`, `maxSteps` → `budget_exhausted`, planner routes step 0 through `fs.index` when registered |
| `codeIndex.test.ts` (7) | extension → kind, TS symbol + markdown heading extraction, heading-section vs 40-line-window chunking, sorted file entries + coverage, hybrid query ranks the relevant chunk first and is deterministic, symbol query finds its file, empty index → no hits |

## Headless proof (`agent-proof.mjs`) against the built `dist/`

- Golden path transcript: `search → read → annotate → verify(fail) → fix-1 → verify-2(pass)`,
  status `completed`, gates visited: `fs.append:write`, `test.run:exec`. Since v1 the
  `search` step runs the `fs.index` tool (same stepId, same `hits.0.path` dataflow).
- **Determinism:** two fresh runs produce byte-identical `{plan, events, results}` JSON and
  identical workspace snapshots.
- **Honest denial:** with no checkpoint callback the write step returns
  `checkpoint required`, status `denied`, workspace snapshot equals the seed exactly.

## Real-repo index proof (`code-index-proof.mjs`, M2 v1)

Indexes the actual repository from disk via `node:fs` (121 files, 523 chunks as of this
writing; skips `node_modules/.git/.next/dist` and files > 256 KB) and answers
identifier-precise queries with the built hybrid scorer:

| Query | Definition file rank |
| ----- | -------------------- |
| `rigidRotateRect rotatePointAbout` | `packages/design-model/src/geometry.ts` #4 |
| `deserializeApp schemaVersion localStorage` | `apps/studio/src/lib/persist.ts` #3 |
| `DANGEROUS checkpoint ToolRegistry invoke` | `agents/runtime/src/registry.ts` #1 |

Top-5 (not top-1) is asserted deliberately: the demo scorer has no source-vs-test or
inverse-document-frequency weighting, so files that import or exercise the same
identifiers legitimately tie at the top. Determinism (identical hits across repeated
queries) is asserted too.

## Scope honesty

§63 items *not* implemented (stated, not faked): real fs/exec tools (no `child_process`,
index is rebuilt in memory per call, not persisted), browser automation, visual QA, git
commit, live-model planning, multi-agent registry, agent memory. The `test.run`
verification is a host-injected predicate — it verifies what the host checks.
