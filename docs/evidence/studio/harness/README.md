# Reproducible browser verification (ADR 0017) — Proof of Work

Every earlier "browser-verified" claim in this repository was produced by a tool that lives
**outside** it, and that tool reported a hidden `0×0` viewport, a suspended
`requestAnimationFrame`, and refused pointer and screenshot actions. That is why §30's
"SCREENSHOT → INSPECT" half had never actually run.

These two scripts close that gap, and **you can re-run both**.

## 1. Prove the harness itself

```bash
npm run verify:harness          # node tools/harness/smoke.mjs
```

Measured output on this machine (Chrome 153, Windows):

```
PASS  js executes / selector counts — 2 .item nodes
PASS  viewport is REAL (non-zero, visible) — 1258x702 dpr=1 hidden=false
PASS  requestAnimationFrame runs — 17 frames in 250ms
PASS  canvas paint + pixel readback — 4096/4096 px non-transparent
PASS  Page.captureScreenshot accepted — 4260 bytes png
PASS  trusted pointer click reaches handlers — label=clicked
PASS  keyboard events type into inputs — value=nexus
PASS  console capture — 1 messages

8/8 harness capabilities verified
```

The three capabilities the project previously documented as **impossible** are lines 2–5.

## 2. Drive the unmodified Studio

Start the Studio, then run the golden path:

```bash
cd apps/studio && NODE_OPTIONS= ../../node_modules/.bin/next dev -p 3210   # terminal 1
npm run verify:studio                                                     # terminal 2
```

Measured output:

```
PASS  Studio loads in a REAL visible viewport — 1418x802 · document.hidden=false · dpr=1
PASS  document title
PASS  toolbar brand renders — brand="NEXUS Studio"
PASS  DEMO MODE badge present (§60 honesty) — 1 badge(s)
PASS  canvas element sized and mounted — {"w":878,"h":550,"cssW":878,"cssH":550}
PASS  read-only observability bridge exposes canonical model state (§56/§57)
        schema=1 mode=demo nodes=2 pages=1 types=[document,page]
PASS  fresh document is structurally empty (no content nodes yet)
        nodeCount=2 (document+page roots) · activePageNodeCount=0
PASS  prompt typed via real keyboard events — value="an analytics dashboard"
PASS  Compose produced real editable nodes in the canonical model
        activePageNodeCount 0 → 16 · nodeCount 2 → 18
        types=[document,ellipse,frame,page,rectangle,text]
PASS  composed nodes span multiple primitive types (composer is parameterised)
PASS  every composed content node has finite, positive model-derived geometry
        17 node(s) laid out, all positive
PASS  AI diff was recorded for the change (§36)
        lastDiff={"added":[…16 ids…],"nodeCountBefore":2,"nodeCountAfter":18}
        sample=[Page 1 | Dashboard | Top bar | title | avatar]
PASS  full-page PIXEL screenshot captured (§30 visual QA)
        100322 bytes → docs/evidence/studio/harness/studio-after-compose.png
PASS  canvas actually PAINTED (non-transparent pixels)
        482900/482900 px painted · 40 sampled colours · 878x550
PASS  Preview iframe renders content derived from the Design Model
        An analytics dashboard Revenue $48,920 Active users 3.7% Conversion …
PASS  Undo restores the exact baseline model state
        activePageNodeCount 16 → 0 · nodeCount 18 → 2 (baseline 2)
PASS  Redo returns to the composed state — activePageNodeCount=16
PASS  localStorage snapshot survives a real reload
        snapshot 8824 chars · activePageNodeCount after reload 16 (expected 16)
        docName="My First World"
PASS  no page exceptions / console errors during the run
        2 console messages, all non-error

19/19 golden-path assertions passed
```

`studio-after-compose.png` in this directory is the real captured screenshot from that run —
the first pixel-level evidence in this project.

## Why the assertions are about the MODEL, not the markup

`apps/studio/src/lib/observability.ts` exposes `window.__nexus` with `snapshot()`,
`nodeCount()` and `activePageNames()`. It is **frozen and has no mutators by construction**,
so verification cannot drive the product through a back door, and the bridge can never become
a second source of truth. Geometry comes from the same `layoutPage()` the canvas paints from
(§8), so a green run means *the canonical Design Model changed* — not merely that a button
was clicked. Its 9 unit tests live beside it in `observability.test.ts`.

## What is still NOT claimed

- **No screenshot baseline comparison.** The harness proves pixels were painted and captures a
  PNG for a human/§30 inspection step. It does not diff against a stored baseline, so it cannot
  yet *fail* on a visual regression. That is the next step.
- **This is not the §28 / ADR 0013 sandbox.** It is a local verification tool; `--no-sandbox`
  is passed for headless launch in this dev environment. Untrusted generated code is still the
  exec sandbox's problem, not this harness's.
- **Playwright remains the target for *agent-driven* browsing** (§29/§63) — a different job from
  verifying the app, and one that needs the ADR 0013 exec sandbox to own process spawning.
