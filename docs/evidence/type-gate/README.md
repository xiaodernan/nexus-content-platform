# The TYPE GATE — `tsc` was reading the source and not the tests

This directory exists because the type-gate repair is **repo-wide infrastructure**, and until now its records
lived only in ADR 0016 — which grants amendment numbers but is not the corpus the doc gate reads for TITLES
(`table-recount-proof.mjs` §7 reads titles from `docs/evidence/` plus the ROADMAP). That is why amendments
**213, 214 and 215** appeared in its hole list while their records sat in the ADR: a grant with no title in the
corpus is a number a reader cannot find.

## The defect, in one sentence

Every package's `typecheck` script ran the SAME tsconfig as its `build`, and that config needs
`rootDir: "src"` so `dist/` mirrors `src/` — so `test/` was `exclude`d, which quietly removed **61 test files**
from every type gate except `apps/studio`'s (its tests live in `src/`, so it was the only package whose gate
read them). And the one gate that DID read tests was **red**.

Measured rather than guessed: **249 errors** were hiding —
`three-runtime 102 · agents/runtime 80 · exec-host 27 · ai-providers 22 · world-engine 14 · design-model 4`.

## Amendment 204 — the coverage hole, and the one gate that was red (M0/v204, repo-wide)

`apps/studio/src/lib/scene3dSurface.test.ts` had **6 errors** — five call sites passing `surface.sceneId` (a
`string`) where the runtime wants the branded `SceneId`, though the SAME file brands it with `toSceneId(...)`
eleven other times, plus one dereference of a possibly-undefined array slot. Every intervening commit's message
said "tsc clean". A gate is only worth the coverage it actually has.

The measurement took three attempts to trust, and each failure is worth keeping:

1. Widening a package's `include` alone measured `0` everywhere — **`extends` inherits `exclude`**.
2. Overriding `exclude` alone still measured `0` — the `include` was `["src"]` and **never named `test/`**.
3. Once tests were in the program, 47 of 48 errors were `TS6059` — **the gate complaining about its own
   `rootDir`**, not about code. Only widening BOTH `include` and `rootDir` measures the code.

A number produced by a config that cannot see the files is not a measurement.

**`three-runtime` was reported as `1` error, and that was the most misleading number of the lot.** Its first
error is `TS1005: ';' expected` — a PARSE error, which aborts TypeScript's analysis of the rest of that file, so
one unparseable annotation hid 101 others. The annotation was `typeof live.entities[0][1].position`: `typeof` in
a type position takes an entity NAME, and an indexed access is not one. `vitest` strips types instead of checking
them, so it ran happily for as long as it has existed.

**The design that closes it** — a dedicated `tsconfig.test.json` per package:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "rootDir": ".", "noEmit": true },
  "include": ["src", "test"],
  "exclude": ["node_modules", "dist"]
}
```

with `typecheck` pointed at it and `build` left alone. The build keeps the dist layout it needs; the gate gains
the 61 files. Test type-checking is NOT a weaker gate: it is the same `strict` + `noUncheckedIndexedAccess` the
source gets, because a test's array index that CAN be undefined is a real hazard too.

## Amendment 205 — exec-host: an assertion whose second half had never run (v205)

Gate **27 → 0**, suite **309/309**. Four files imported `SpawnLike` from `@nexus/agent-runtime`, **which does not
export it** — a type-only import ERASES at runtime, so the suites passed while four files typed their spawn mocks
against a symbol that was not there. (It is exec-host's own; `ExecPolicy` genuinely is the runtime's.)

`gitTools.test.ts` had `expect(env).toMatchObject(GIT_ISOLATION_ENV, forcedConfigEnv())` — and **`toMatchObject`
takes ONE argument**, so the second object was silently DROPPED and half that assertion never ran. Split into two
calls; the newly-live half PASSES. The same shape appears twice in `execTestRunner.test.ts` as
`expect(h.calls).toHaveLength(0, 'a message')` — there the second argument was a MESSAGE, so nothing was
unverified, but the sentence the author wrote to explain a failure could never appear.

Two tests also read `d.reason` off the `ExecDecision` union without narrowing, so a decision that came back `ok`
would have asserted against `undefined` and failed for the wrong reason.

## Amendment 213 — agents/runtime: a mock that satisfied its interface in six of eight suites (v213)

Gate **48 → 0**, suite **540/540** in 36 files.

- **One root cause, ~24 call sites.** `FsWriteLike` extends `FsLike`, which requires `readdirSync` and
  `statSync` — and **six of the EIGHT suites that define their own `MemDisk` mock had neither.** The completion
  THROWS rather than answering an empty listing: a mock that reports "no entries" for a disk that HAS entries is
  exactly the kind of lie a future test would pass against. The eight mocks have also drifted APART —
  `memory.test.ts` answers an empty listing, `pipeline.test.ts` answers a real one.
- **`toEqual` takes ONE argument, four more times** — the exec-host shape again, which makes it a habit rather
  than a one-off.
- **`PlannerOptions.hasVerify` is REQUIRED**, and three cases expressed "no verify tier" by OMITTING it. The
  planner reads it as a truthy check, so absent behaved as false — but "the host did not say" and "the host said
  no" are different statements, and the field is required precisely because the host is supposed to say.
- **Two unions read optimistically.** `chain.test.ts` did `expect(arc.arc).toEqual(res.release)` where
  `ChainResult` is a union and `release` is OPTIONAL even on the green branch; `pipeline.test.ts` read
  `res.editorOutcome` off `PipelineResult` the same way. Both now narrow with `if (!res.ok) throw …`, and the
  chain additionally asserts `res.release` is defined.
- **`TestRunner.run` is declared `TestReport | Promise<TestReport>`** and one test read `.ok` off the union. It
  is sync in that implementation so it passed — but a promise's `.ok` is `undefined`.

## Amendment 214 — three-runtime: 118 errors, and the repair closed (v214)

Gate **118 → 0**, suite **498/498** in 19 files. The count had GROWN from v204's 102, because the M5 line's
v206–v212 added tests to it — a number measured once and quoted later is a number about a tree that no longer
exists.

- **`ThreeRuntimeConfig` requires `maxLights` and `frustumCulling` and nothing reads either.** Declared,
  defaulted in the package's own `DEFAULT_THREE_CONFIG`, consulted nowhere — so every caller must state a value
  the runtime ignores. The fixtures take the package's own defaults, so behaviour is unchanged; the fields
  themselves are a separate open item, because wiring them or making them optional is a runtime decision.
- **`shadowMap.type` and `toneMapping` are THREE's union types**; the fixtures wrote raw `0`s. `BasicShadowMap`
  and `NoToneMapping` are both 0, so the named constants are the same values.
- **~20 event listeners had no contextual parameter type** and were implicitly `any`; annotated `unknown` where
  the body casts, and the array's own element type where it does not.
- **`SaveStore` grew two members and two mocks did not.** `savePathRefusal` (v169) and `rename` (v186) were added
  to the interface and the two deliberately-partial mocks were never updated. Both completed with stubs that
  THROW. This is the THIRD instance of the same shape — the `MemDisk` mocks (213), the `FsLike` mocks before them.
- **A gate that audits the package's export face had never been type-checked.** `packageFace.test.ts` reads the
  barrel's own bytes and checks that every module's declared names appear on the face; eight of its errors were
  in its own scanning helpers. A gate that grades others and is graded by nobody is the exact shape this repair
  exists to remove.

## Amendment 215 — `.scratch/` was not ignored, and it holds 879 copies of real test files (v215)

Not a milestone feature: this closes the MECHANISM behind an incident already in the ledger.

`.scratch/` is where the proof runs materialise a ref (a whole copy of the tree) and where ad-hoc probes are
written. Measured 2026-10-09: **879 `*.test.ts` files** live under the four `.scratch/` directories, every one a
STALE COPY of a real suite. Two failures were already happening:

1. A root-level `vitest` run would glob those 879 files and grade last week's code while reporting it as this
   tree's result — which is why a root `vitest.config.ts` existed, **UNTRACKED**. A guard against a real hazard
   that is not in git is a guard a fresh clone does not have.
2. A `git add -A` swept an in-flight doc edit into an unrelated commit: that is exactly how **amendment 196's
   record landed inside an M5 commit** (`8ebdd75`) and spent a while describing an artifact page the tree did
   not have.

Fixed both halves: `.scratch/` is in `.gitignore`, and the root `vitest.config.ts` is committed with the reason
written in it.

## The closure

`tsc -p <pkg>/tsconfig.test.json` is **0** for all six packages, and every suite was re-run:

| package | errors found | suite after |
| --- | --- | --- |
| design-model | 4 | 32/32 |
| ai-providers | 22 | 20/20 |
| world-engine | 14 | 43/43 |
| exec-host | 27 | 309/309 |
| agents/runtime | 48 | 540/540 |
| three-runtime | 118 | 498/498 |

`apps/studio` keeps its own config (its tests live in `src/`) and was **0** with **407/407**.

**Bounds (§60).** No runtime source changed in any of the seven increments — this closed TESTS being unread, not
behaviour. What the widened gate found is now visible and filed rather than silently absorbed: the eight drifted
`MemDisk` mocks, the two required-and-unread config fields, and `InstanceNode['overrides']` (which cannot express
a text override at all, because its `text` key must satisfy the index signature as well as the named field).
