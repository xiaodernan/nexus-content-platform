# 0017 — Reproducible browser verification: a zero-dependency CDP harness

- **Status:** Accepted
- **Date:** 2026-09-23

## Context
Spec §29 makes browser automation a first-class agent capability, §30 requires visual QA for
every significant frontend change, §31 gates publication on *visual quality* and *runtime
behavior*, §32 demands evidence rather than the word "Done", and §59 fixes the loop as
OBSERVE → PLAN → IMPLEMENT → RUN → TEST → **SCREENSHOT** → INSPECT → FIX → RETEST → COMMIT.

Through M1 and M2 (v0–v57) the Studio was repeatedly described in `docs/evidence/**` as
"browser-verified" / "in-browser". Those claims were produced through an **in-app browser
surface that is not part of this repository and cannot be invoked from it**, and they came
with a standing caveat that it reported `document.hidden = true` with a `0×0` viewport,
suspended `requestAnimationFrame`, and **refused pointer and screenshot actions**. Two
consequences followed, both recorded honestly in `docs/KNOWN_ISSUES.md` at the time:

1. **No pixel evidence could ever be produced.** Canvas paint and visual QA were substituted
   with model→SVG artifacts and DOM-structure inspection. §30's "screenshot → inspect" half
   was never actually executed.
2. **The evidence was not reproducible.** A reader of this repository could not re-run the
   claimed browser checks, because the tool that ran them lives outside it. For an
   autonomous, long-running project whose entire credibility rests on §32 proof-of-work, a
   non-reproducible verification claim is worse than no claim: it cannot be falsified.

Separately, §57 asks for an Evaluation Framework and §56 for observability, and neither can
be built on scraped DOM text — "how many nodes does the canonical Design Model hold right
now" is not a question markup can answer reliably.

## Decision
Add `tools/harness/` — a **zero-dependency** browser verification harness, and a read-only
observability bridge in the Studio for it to assert against.

1. **`tools/harness/cdp.mjs`** speaks the Chrome DevTools Protocol directly over
   `--remote-debugging-pipe` (stdio fd 3 in / fd 4 out). No Puppeteer, no Playwright, no
   install step: the milestone gates must stay `npm ci && node …` in a clean checkout. It
   launches the local Chrome/Edge, opens page targets, and exposes `navigate`, `evaluate`,
   `type`, `click`, `canvasStats`, `viewport`, and `Page.captureScreenshot`.
   **The wire format was pinned empirically** (`<json>\0`, both directions — see the
   doc-comment in `cdp.mjs`); the intuitive `<length>\0<json>` framing is wrong here and
   fails in a maximally confusing way, so the finding is written down rather than lost.
2. **`tools/harness/smoke.mjs`** proves the harness itself before it is trusted: JS execution,
   a **real non-zero visible viewport**, a **running `requestAnimationFrame`**, canvas paint +
   pixel readback, an **accepted screenshot**, trusted pointer clicks, keyboard typing, and
   console capture.
3. **`tools/harness/studio-golden-path.mjs`** drives the **unmodified** Studio bundle and
   asserts the §62 golden path end to end, writing real PNG evidence.
4. **`apps/studio/src/lib/observability.ts`** exposes `window.__nexus` — a **strictly
   read-only**, frozen, JSON-serialisable snapshot of editor state (`snapshot()`,
   `nodeCount()`, `activePageNames()`), with geometry taken from the same `layoutPage()` the
   canvas paints from. It has **no mutators by construction**, so verification cannot drive
   the product through a back door, and the bridge can never become a second source of truth.

This ADR **supersedes the "no pixel screenshots / hidden viewport" limitation** as an
environmental fact. It was never a property of the application: the app was always fine, the
tool was the problem. The obsolete caveats are removed from `docs/KNOWN_ISSUES.md` and the
evidence README, and the remaining honest limits are stated below.

## Options
- **Playwright / Puppeteer.** The spec names Playwright for M2 (§50) and its browsers are
  already cached on this machine. Rejected *as the harness for these gates* because it adds a
  heavyweight dependency and an install step to the verification path, and because the
  interesting failure mode here (does the app really paint?) is fully answerable over raw CDP.
  Kept as the intended target for **agent-driven** browser automation (§29/§63), which is a
  different job from *verifying* the app and lands with the exec sandbox work.
- **Keep the external in-app browser.** Rejected: unreproducible by definition, and it refused
  the screenshot and pointer operations §30/§29 exist to provide.
- **Assert on rendered DOM text only.** Rejected: cannot express model-level facts, and it
  couples every test to markup that is free to change. This is what the earlier milestones did.
- **Assert on an in-page test-only hook that can also mutate.** Rejected: a verification
  surface with write access is a second, unaudited control path into the product.

## Reason
The harness makes §30's screenshot step real and §32's evidence **re-runnable by anyone**
(`node tools/harness/studio-golden-path.mjs`). It removes a dependency from the gate path
rather than adding one, and the read-only bridge converts "did the UI change?" into "did the
canonical Design Model change?" — which is the question §8 and §57 actually care about. The
first run immediately produced capability the project had documented as impossible:

```
PASS  viewport is REAL (non-zero, visible)   1258x702 · document.hidden=false
PASS  requestAnimationFrame runs             17 frames in 250ms
PASS  canvas paint + pixel readback          4096/4096 px non-transparent
PASS  Page.captureScreenshot accepted        4260 bytes png
```

and, against the live Studio, **19/19** golden-path assertions including a 100 322-byte
full-page PNG, `482900/482900` painted canvas pixels, a preview iframe rendered from the
model, exact undo/redo restoration, and a `localStorage` snapshot surviving a real reload.

## Tradeoffs
- **Chrome/Edge must be installed and findable.** `NEXUS_CHROME` overrides the search; the
  harness states a clear error otherwise. A headless-only CI image needs a browser binary.
- **Hand-rolled CDP is a smaller surface than Playwright's**, deliberately: no tracing, no
  network interception, no auto-waiting beyond the explicit `until`/`waitForSelector` helpers.
  New needs are added explicitly rather than inherited implicitly.
- **`--no-sandbox` is passed in headless mode**, matching the local dev environment; this is a
  *local verification* tool and must not be mistaken for the §28/ADR 0013 untrusted-code
  sandbox, which remains the place where generated code is isolated.
- **The bridge adds a global to the page.** Mitigated by being frozen, read-only, and
  documented as an observation surface only; it carries no secrets and no mutators.
- **Screenshot bytes are not a visual assertion.** The harness proves pixels were *painted*
  and captures a PNG for a human/§30 inspection step; it does not yet compare screenshots
  against a baseline. Perceptual diffing is the next step, not a claim made here.

## Follow-ups (stated, not implied)
- Wire the golden path into the milestone gate list and keep it green per increment.
- Perceptual screenshot diffing for §30 regression detection.
- The same harness is the intended substrate for §29/§63 *agent-driven* browsing, once the
  ADR 0013 exec sandbox owns process spawning.

## Amendment 1 (v549, evidence/studio) — the package table is a claim, and a claim nobody re-computes is decorative

**The gap, where it stood.** This ADR decided how the studio directory *proves* things: a real
browser, a read-only bridge, a runnable row per claim. Above that section sits a table that proves
nothing, because no command produces it — `docs/evidence/studio/README.md` stated the case count and
file count of all seven workspace packages in hand-typed digits, under a sentence calling them
"authoritative". By v548 every one of those seven rows was wrong, and one was wrong by an order of
magnitude: `@nexus/studio` claimed 369/369 over 29 files while the suite it describes answered
2840/2840 over 142; `@nexus/ai-providers` claimed 20 where the run answers 95; `@nexus/three-runtime`
453 vs 635; `@nexus/world-engine` 43 vs 109; `@nexus/agent-runtime` 540 vs 658;
`@nexus/exec-host` 309 vs 358; `@nexus/design-model` 32 vs 169. A reader who quoted the table was
quoting a measurement of a suite that no longer existed, and the README's own drift note ("RE-MEASURED
at M5 v192") is what made the decay look maintained.

**The verb.** The table became a GENERATED block between two markers:

1. `docs/evidence/studio/package-counts-proof.mjs` boots each package with the invocation the README
   already names — `vitest run --root <pkg> --no-file-parallelism --reporter=json` — and reads
   `numPassedTests`, `numTotalTests` and `testResults.length` out of vitest's own report. `--no-file-parallelism`
   is load-bearing here for the measured reason the agents lane recorded: a parallel pool silently drops
   files on this host, and a dropped file would render as a drifted row rather than a missing one.
2. `--write` re-renders the marked block from that run; the default mode is a CHECK, and it refuses a
   block that differs in any column, in any row, in row order, or carries a package the gate never ran
   (and names which). A hand-typed number cannot survive it.
3. The checker is witnessed before it grades: §0 renders a sample block, calls the comparator clean on
   it, then mutates a copy five ways that a hand-edit really produces — a count +1, a file count +1, a
   deleted row, an invented `@nexus/ghost` row, and a reshuffle with every number right — and requires
   each mutation to be caught by name. A checker that cannot be red is the same decoration in a new place.
4. Check mode digests the README before and after and requires the digest unchanged: a gate that edits
   its subject cannot report drift honestly.

**Files.** `docs/evidence/studio/package-counts-proof.mjs` (new), `docs/evidence/studio/README.md`
(the block plus the drift note rewritten to say the table is generated), root `package.json`
(`verify:package-counts`).

**Measured (2026-10-29, this host).** Seven arms, all exit 0, all cases passing: design-model
169/169 in 16 files (7.9–12.7 s), ai-providers 95/95 in 9 (4.9–5.5 s), three-runtime 635/635 in 30
(16.1–16.9 s), world-engine 109/109 in 4 (3.5–3.8 s), agent-runtime 658/658 in 46 (17.8–21.7 s),
exec-host 358/358 in 14 (10.9–24.6 s), studio 2840/2840 in 142 (61.1–131.6 s) — 4864 cases in 261 files
in total; write mode and check mode both run, the check-mode README digest `d6d2f2e70a7c6b7b` unchanged
across the run, and 5/5 mutations caught.

**Bounds, stated rather than implied.** The gate measures the seven packages hard-coded in `PKGS`; a new
workspace package is invisible to it until someone adds a row, and the "a row for a package this gate
never measured" refusal is what makes that omission loud rather than silent. `testResults.length` counts
JSON result entries, not distinct test files, so a package that splits one source file into several result
entries would report more "files" than a human would count by hand. `--write` is a manual act — nothing
regenerates that block on its own, so a change that moves suite counts without anyone running the gate is
still head-typed until CI runs it. The block grades counts only: `tsc --noEmit` and lint stay separate
gates, and the timing above is a serial sum, not a wall-clock claim about a parallel machine.
