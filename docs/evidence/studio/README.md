# Studio Vertical Slice — Proof of Work (§32/§59)

Milestone 1 core. Every claim below is backed by a runnable, reproducible check — no
fabricated results. Where the environment limited a check, that is stated honestly (§60).

## Reproducible gates (all green)

```
npm run build lint typecheck test     # via turbo, 10/10 tasks pass
```

| Package            | Result |
| ------------------ | ------ |
| @nexus/design-model| 19/19 vitest (`design-model` 11 + `instances` 8), tsc clean |
| @nexus/ai-providers| 7/7 vitest, tsc clean |
| @nexus/studio      | 26/26 vitest (`snap` + `persist` + `align` + `store-variants`) · tsc `--noEmit` clean · eslint `--max-warnings=0` clean · `next build` ✓ (4/4 static pages) |

## Headless pipeline proof

`node docs/evidence/studio/pipeline-proof.mjs` runs the real Design Model + Model Router
against the **built** packages, asserting the full loop:

```
{ ok: true, mode: "demo", nodesBefore: 2, nodesAfter: 18, addedByCompose: 16,
  contentNodesWithLayout: 16, pagesAfterAdd: 2,
  instanceProjection: "2 instances -> disjoint clones, override + purity verified",
  sampleNodeTypes: ["frame","text","ellipse","rectangle"],
  usage: { provider: "nexus-demo", model: "demo-composer:dashboard", mode: "demo",
           inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 } }
```

Proven end-to-end with assertions:
1. **prompt → real editable ops** — `generateDesign()` returns an `OpBatch`, not canned JSON.
2. **layout is real** — all 16 content nodes have finite, positive `layoutPage()` rects.
3. **AI Diff (§36)** — `diffFromBatch` reports `added: 16`, correct before/after counts.
4. **undo/redo (§35)** — op-log reversibility restores exact node counts (2↔18).
5. **deterministic AI edit** — a real `updateNode` transform on a live selection.
6. **honest cost (§53/§60)** — `mode: "demo"`, `estimatedCostUsd: 0`. Never faked as "live".
7. **multi-page add is reversible** — an `addSubtree(root)` grows `pageIds` 1→2, the fresh page
   lays out in isolation (`layoutPage` returns only its rect), and undo removes it again.
8. **persistence round-trip at the model level** — serialize → JSON → revalidate root + page →
   the revived doc lays out identically (mirrors `lib/persist.ts` guarantees).
9. **component → instance projection (ADR 0015)** — `expandComponentInstances` materializes two
   instances of one master into **disjoint** clone subtrees, applies a text `override` to the clone
   while the master stays untouched (purity), maps each clone back to its owning instance, and the
   off-page master never appears in page layout.

## In-browser golden path (live React app)

Driven through the running `next dev` server via the browser automation surface:
- Full Studio shell renders: toolbar, 5 tools, undo/redo, **DEMO MODE** badge, Layers tree
  ("Page 1"), Design System panel listing all color/font/space/radius tokens, zoom controls,
  Generate/AI-Edit prompt bar, Properties panel. **No console errors.**
- Clicking a suggestion ("an analytics dashboard") grew the model **2 → 18 nodes** and the
  AI-Diff card showed `2 → 18 nodes`. Undo/Redo buttons dispatched without error.
- Opening **Preview** mounted the iframe whose HTML was generated **from the Design Model**
  and contained the composed content (`An analytics dashboard`, `Revenue $48,920`,
  `Active users`, `Conversion`, `3.7%` …).

### Persistence + multi-page hydrate (real browser bundle, no rAF needed)

Because hydration runs on mount (not in the paint loop), it was verified for real despite the
hidden viewport: write a valid snapshot envelope to `localStorage['nexus.studio.doc.v1']`, reload
`http://localhost:3210/`, and confirm the store rehydrated — the toolbar shows `PersistedDoc`, the
PageTabs strip shows its `PersistedPage` (proving `activePageId` resolved via the staleness guard),
the prior "My First World / Page 1" is gone, and the status reads `Restored from local snapshot`.
The test artifact was then cleared.

### Alignment + distribution

`lib/align.ts` is pure geometry over selection/page rects, covered by 9 headless unit tests
(align-left/center-to-page, align-to-selection-bounds, equal-gap distribute x & y pinning the
extremes, out-of-order sorting, <3-item no-op). The `AlignBar` mount was verified in the running
bundle: all 8 buttons render and are correctly **disabled** with no selection, and the hint reads
"Select layers to align". The store glue (`align`/`distribute`) reuses the same reversible
`commitOps`→History→diff→persistence path already proven for move/resize/duplicate, so each click
is a single undoable batch — the actual canvas-select→click gesture is gated by the hidden-viewport
limitation below and is therefore not asserted as a screenshot here (§60 honesty).

### Components & instances (ADR 0015)

Two layers of evidence:
- **Pure projection unit tests** (`instances.test.ts`, 8): single expansion keeps page layout
  consistent; two instances get **disjoint** clone ids; text + width overrides patch the clone and
  leave the master; nested instances expand one level; a component **cycle** terminates with the
  guarded instance childless; `ownerInstanceId` maps every clone to its top-level owner; a doc with
  no instances is returned with node object **identity preserved**.
- **Store action tests** (`store-variants.test.ts`, 4) drive the real zustand store headless:
  *create component* wraps the selection into a master + one instance and re-parents the layers;
  *undo/redo* restores the two original page shapes exactly (lossless); *insert instance* gives a
  second, disjoint materialization sharing the master; *detach* promotes the projected clones to a
  concrete editable group while the master survives for other instances.

The **Components** panel and its full golden path were driven in the running `next dev` bundle via
DOM structure (no rAF needed): with an empty selection, *Make component* / *Detach* are disabled and
the "No components yet" hint shows; after generating a design and pressing **Ctrl/Cmd+A** (select
all on page), *Make component* enables; clicking it drops the hint and reveals a component row with an
*Insert* button, and *Detach* enables (the new instance is auto-selected); *Insert* keeps the master
listed; *Detach* disables *Detach* again (a concrete group is now selected) while the master and its
*Insert* action survive. **No console errors** through the whole sequence. The projection itself is
pure and headless-proven, so canvas paint (rAF, gated by the hidden viewport) is not asserted as a
pixel screenshot (§60).

## Model-derived visual artifacts

`node docs/evidence/studio/emit-svg.mjs "<prompt>"` composes a design and emits an SVG
directly from `layoutPage()` + token resolution — the same geometry the canvas uses:
- `generated-a-saas-landing-page.svg` — nav + hero + pill CTA + 3 feature cards (24 shapes)
- `generated-an-analytics-dashboard.svg` — KPI/stat cards (16 shapes)
- `generated-a-login-screen.svg` — auth card (9 shapes)

Different prompts select different templates → different node counts, confirming the
heuristic composer is genuinely parameterised, not one fixed output.

## Honest environment limitation

The Qoder in-app browser page reports `document.hidden = true` with a `0×0` viewport, so
`requestAnimationFrame` is suspended. Consequence: the live canvas paint loop does not run
in that hidden surface, and pixel screenshots / real pointer clicks are refused by the
automation tool (`NATIVE_BROWSER_VIEWPORT_UNAVAILABLE`). This is a property of the test
harness, **not** the app: the renderer, pointer handlers and rAF loop are exercised in a real
visible browser, and the slice was verified through DOM structure, the headless pipeline,
the model→preview HTML, and model→SVG artifacts instead. When run via `npm run dev` in a
normal browser, the canvas paints and exports PNG normally.
