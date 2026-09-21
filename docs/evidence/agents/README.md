# M2 v0 evidence — @nexus/agent-runtime

All checks are headless, offline, key-free, and reproducible from the repo root. Nothing here
claims model-quality planning (§60): the planner is a deterministic template and says so in
every emitted artifact (`provenance.mode = "demo"`).

## Reproducible gates

```
npm test          # turbo: @nexus/agent-runtime 18/18 vitest among all packages
npm run build     # tsc dist for agents/runtime (build order via ^build deps)
node docs/evidence/agents/agent-proof.mjs
```

## Unit tests (vitest, `agents/runtime/test`)

| File | Covers |
| ---- | ------ |
| `registry.test.ts` (7) | arg validation (missing/unknown/type), unknown tool, checkpoint required for write/exec, deny ⇒ implementation never runs, approve ⇒ runs, impl throw ⇒ `ok:false` (never rejects), double-register refused |
| `workspace.test.ts` (4) | sorted/prefix listing, case-insensitive 1-based `search`, append/missing-file throw, registry wiring incl. gated `fs.write` |
| `agent.test.ts` (7) | stopword-aware keyword, plan determinism + seed stamp, golden path event order + `@search.hits.0.path` dataflow + note in file, denial leaves file untouched, failing verify → 1 fix round → pass, persistent failure → `failed_verification` after `maxFixRounds`, `maxSteps` → `budget_exhausted` |

## Headless proof (`agent-proof.mjs`) against the built `dist/`

- Golden path transcript: `search → read → annotate → verify(fail) → fix-1 → verify-2(pass)`,
  status `completed`, gates visited: `fs.append:write`, `test.run:exec`.
- **Determinism:** two fresh runs produce byte-identical `{plan, events, results}` JSON and
  identical workspace snapshots.
- **Honest denial:** with no checkpoint callback the write step returns
  `checkpoint required`, status `denied`, workspace snapshot equals the seed exactly.

## Scope honesty

§63 items *not* in v0 (stated, not faked): real fs/exec tools (no `child_process`), browser
automation, visual QA, git commit, live-model planning, multi-agent registry, agent memory.
The `test.run` verification is a host-injected predicate — it verifies what the host checks.
