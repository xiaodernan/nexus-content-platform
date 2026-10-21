# Known Issues & Limitations (honesty per §60)

Live list. Nothing here is hidden behind marketing copy.

## AI / providers
- **No live model provider is wired.** All AI output is **DEMO MODE** — deterministic
  heuristic composition + procedural placeholder imagery + hash embeddings. It is genuinely
  functional (produces real Design Model ops) but is **not** model-quality. The Studio shows
  a persistent "DEMO MODE" badge.

## Studio (Milestone 1 — polished slice, see docs/evidence/studio)
- The Design Model, infinite Canvas (2D scene-graph renderer), layers tree, properties
  editor, design-system token panel, DEMO-MODE generate + AI-edit, live preview, undo/redo,
  AI-diff and local export (JSON / standalone HTML / canvas PNG) are all functional. This
  pass adds **on-canvas text editing, magnetic snapping + smart guides, multi-page
  add/switch, local-first persistence with a History/Snapshots panel** (ADR 0014), and
  **component → instance authoring** (create/insert/detach + per-instance text/width/fill/radius overrides, ADR 0015)
  and **instance sub-selection** (drill-in clone move/resize/text via x/y-delta + text overrides).
  The AI-diff card now pairs its semantic counts with **before/after thumbnails** (`lib/thumbnail.ts`).
  These are deterministic SVG snapshots from `layoutPage` + token resolution — model-derived geometry,
  *not* pixel screenshots (§60), so they render even under the hidden-viewport harness.
  A **rotate handle + rotation-aware canvas rendering *and hit-testing* + rigid subtree rotation**
  (`lib/rotate.ts` + design-model `containsRotated`/`rotateSubtree`) now ship too — caveats below.
  A bottom-left **minimap** (`lib/minimap.ts` pure fit math + a small painted canvas) previews the
  page/nodes/viewport rect; click or drag recenters the main viewport at the current zoom.
- "Publish" in the slice means **local export** only. Hosted public URLs `/n/{user}/{project}`,
  accounts, and SEO (SSR/OpenGraph) land with M7/community + the `nexus-api` service.
- Persistence is **local-first `localStorage`** (whole-model snapshot, debounced save, hydrate
  on load; ADR 0014). It is per-browser, unauthenticated and ~5 MB-capped — **not** the hosted,
  versioned server store of ADR 0012, which supersedes it at M7. The op-log *snapshot* timeline
  (branch/fork/compare at a point in time) is mirrored read-only by the History panel; the panel
  restores via undo/redo rather than a separate replay engine.
- Text is edited **on-canvas** (double-click → positioned overlay that commits one reversible
  op), *and* via the Properties panel. No per-span/inline rich text yet. Pen/vector, boolean
  ops, and masks are deferred.
- **Components & instances (ADR 0015) work end-to-end** but are intentionally *atomic at the
  selection layer*: an instance materializes through a pure view-time projection
  (`expandComponentInstances`) and clicking any part selects the whole instance. **Per-instance
  override editing is now present** — selecting an instance shows an *Instance overrides* section in
  the Properties panel that edits a leaf's text/width via `setInstanceOverride` (merged by master id
  into that instance's `overrides`, one reversible op, applied to its clones only, never the master or
  sibling instances). Live instance→master sync on master edits *is* present (the projection is
  derived). **Sub-selection (drill-in) now works** (ADR 0015 amendment 2): double-click enters the
  instance and selects the clicked clone; while focused, clone move/resize/arrows/on-canvas text edit
  commit as `overrides` ops on the owning instance (`x`/`y` are *deltas* off the master position).
  **Clone rotation now works too** (ADR 0015 amendment 3): a `rotation` override (degrees, local to
  the instance's own angle — the projection bake composes them)
  plus the rotate grip on a focused clone, and a Rotation input per row of the *Instance overrides*
  panel. **Per-instance style overrides now work too** (ADR 0015 amendment 4): each row of that panel
  carries a Fill swatch and a Radius input, so a leaf's `fills` (replaced whole — the swatch writes one
  solid paint over `fills[0]` and keeps the tail) and `cornerRadius` are editable per instance, one
  reversible op each, never touching the master. Remaining gaps: per-instance override of `opacity`,
  `strokes`, `effects` and text *style* (only `characters` is), plus a dedicated off-page "library"
  container.
- **Sub-selection caveats:** the focused instance is studio-local view state (like active page —
  *not* persisted, *not* undoable; deliberate, ADR 0014). While a clone is selected the Properties
  panel shows nothing for it (it reads canonical nodes; clones have none — the chip + on-canvas
  editing are the edit surfaces). Undoing a drill-in edit reverts the override but does not re-open
  the drill state. Browser-validated end-to-end: make component → drill chip appears → text clone
  edit persists `overrides.text` → Escape drills out → clone drag persists `overrides[mid] =
  {x,y}` deltas into the `localStorage` snapshot.
- Drag snapping aligns a selection's edges/centers to sibling + page anchors within a 6px
  (screen) threshold and renders guide lines; resize snaps the dragged edge. **Explicit
  alignment (left/center/right/top/middle/bottom) and equal-gap distribution (≥3 nodes) are
  wired via `lib/align.ts` + the `AlignBar`**, each committed as one reversible op. Smart
  distribute-with-rotate is still not present.
- **Rotation is visual-precise *and* hit-precise (ADR 0005 Amendments 2–3):** the renderer
  rotates each node about its own centre (`lib/rotate.ts` math, `rotations` live-preview map,
  rotated chrome + grip), and the rotate grip drags free angles with Shift 15° snapping.
  `hitTest` is now **rotation-aware through the canonical model**: design-model exports
  `containsRotated` (inverse-rotate the point about the node centre, then AABB-test) and uses it
  in `hitChildren`, so a rotated node selects by its *turned* outline — vacated AABB corners no
  longer hit, and points outside the old box but inside the rotated body do (marquee selection
  still intersects the unrotated boxes). Studio resize grabs
  match the painted chrome via `handleHitTest` (same inverse rotation), and `hitRotated` now just
  delegates to the model. **Subtrees now turn rigidly** (ADR 0005 amendment 3): rotating a
  container/shape rewrites its descendants' positions as one reversible step (`rotateSubtree`
  commit-flattens authored nodes; the instance projection bakes clone positions about the
  instance centre). Remaining caveats: `layoutPage` storage stays axis-aligned, so resize
  *math* still commits AABB deltas (width/height/x/y of the unrotated box); **flow (auto-layout)
  containers** keep their children's slot placement when rotated — rigidity applies to absolutely
  positioned subtrees only; a per-clone `rotation` override stays *local* (it composes on top of
  the instance's own angle). Instance clones rotate too via that override
  (ADR 0015 amendment 3), but note `hitChildren` descends only while an ancestor's *own* rect
  contains the point: a rotated clone that sticks out past its (unrotated) container's box stays
  unreachable outside that box — same pre-existing container-overflow rule as moved/resized clones.
  The interactive
  grip drag is covered by pure-math tests, a recording fake-`ctx` render test and the store op
  path, plus the Properties-panel Rotation field and a real-browser rigid grip-drag on an
  absolutely positioned frame (90° → children flatten to the predicted rel x/y + rotation,
  single history row, Ctrl+Z restores exactly); pixel screenshots are now claimable via the
  ADR 0017 harness (`tools/harness/`), though no rotated-canvas baseline is asserted yet.
- **Multi-page caveat:** adding a page is an undoable op (`addSubtree`→`pageIds`), but which page
  is *active* is ephemeral view-state — switching pages is **not undoable** and can differ across
  browser tabs. A `setActivePage`/`patchDocument` op (needs a design-model rebuild) is the next step.
- **Visual QA automation — SOLVED, kept for the record (ADR 0017).** Earlier passes could
  only verify the Studio through an in-app browser surface that lived outside this repository,
  reported `document.hidden=true` with a `0×0` viewport, suspended `requestAnimationFrame`, and
  refused pointer/screenshot actions. Canvas paint and clicks were therefore substituted with
  DOM structure, the headless pipeline proof, the model→preview HTML, and model→SVG artifacts.
  **That limitation was a property of the tool, not the app**, and it is now gone:
  `tools/harness/` drives a real Chrome over the DevTools pipe and reports a
  `1418×802` **visible** viewport, a running rAF loop, `482900/482900` painted canvas pixels and
  an accepted 100 KB full-page PNG. Run `npm run verify:harness` (proves the harness) and
  `npm run verify:studio` (19/19 golden-path assertions against the unmodified Studio bundle).
  **Screenshots can now be COMPARED to a baseline** (`tools/harness/png.mjs`: a zero-dependency PNG decoder
  — 8-bit RGB/RGBA, non-interlaced, everything else refused by name, and **every chunk's CRC verified** so a
  corrupt file is refused rather than decoded to plausible garbage — plus a pixel diff; the golden-path
  harness diffs its capture against `studio-after-compose.baseline.png` when that file exists, within 2% of
  pixels at an 8-per-channel tolerance, and says so when there is none). Remaining honest limits: **no
  baseline is committed yet**, so the comparison arm is armed but unexercised in CI; a CRC catches
  corruption, not malice (an edited file can carry a recomputed checksum); and the harness is a local
  verification tool, not the §28/ADR 0013 untrusted-code sandbox.

## Studio 3D surface (M5 v142, interactive v161, persistent v163 — ADR 0016 amendments 142, 161 and 163)
- The Studio has a second surface: a **3D scene** mounted from `components/Scene3D.tsx` over
  `@nexus/three-runtime` (the package's first product consumer). It is reached with the `3D`
  toggle in the toolbar; the 2D canvas is the default and is untouched. `npm run verify:scene`
  drives it in a real browser (**25/25** after v163, `backend=webgl` on this host) and
  `npm run verify:scene-surface` is the headless proof.
- **The surface is INTERACTIVE since v161.** The camera has an ORBIT — drag to turn (pointer capture,
  so a drag leaving the canvas keeps turning), wheel to zoom (proportional to the current distance), a
  reset button returning to the opening view (derived from v142's placement, so it is unchanged by
  construction). The scene grows and shrinks from the panel: **+ body** places the next body on a ring
  slot (two added bodies never share a place, none lands inside the composed shots), **− body** removes
  the LAST body (so a click can never delete the composed demo), and the HUD prints the live orbit.
  Still absent: pan, keyboard controls, a per-body picker, and editable lights.
- **DEMO-MODE geometry only.** One scene, four default meshes plus whatever you add, one camera, no
  assets, no model calls, no textures and no lights you can edit. Added bodies are demo meshes —
  not document content — until you file them into the document with **send to doc** (v163).
- **v163 gave the scene a persistence and a document door.** **save** records the whole live scene in
  the runtime's own format (`buildSaveFile` — the caller names the instant, the runtime has no wall
  clock); **load** restores it into a FRESH sibling scene, so the demo scene and its frame loop are
  never touched, and a load into a scene that already holds state is refused (a restore never
  overwrites live state); **send to doc** files the AUTHORED bodies (added via + body — the composed
  demo is deliberately excluded) into the Design Document as one real `ops.addSubtree`: a frame named
  `Scene: <scene>` with one text child per body carrying kind and position as structured spec text
  (§60: no fake 3D preview) — so filed content DOES appear in the 2D document, in exports, in the
  History panel and in the op log, undoable like any other edit.
- **What remains separate:** the composed demo bodies stay 3D-only; save/load is JSON in memory
  (nothing is written to disk, and the note says so); the surface toggle is view state (not undoable,
  not persisted, per ADR 0014).
- `Scene3D.tsx` itself has **no unit test**: this repo has no DOM test environment (no jsdom, no
  testing-library). Its wiring is asserted by reading the shipped component bytes plus the headless
  proof, and its behaviour by the CDP probe — stated rather than implied.
- On a host with no GL context the surface falls back to the package's **headless** backend and
  says so on screen; the graph, camera and frame loop are real there but no pixels are drawn. The
  HUD samples the runtime's report at most once per 10 frames, so the frame count it shows can lag
  the loop by up to 9 frames by construction.
- A defect this surface found and v142 fixed: `createScene` declared two lights and attached
  neither, so every scene rendered black under `MeshStandardMaterial`. If you build a scene by hand
  outside `createScene`, attaching lights is still the caller's job — there is no `setLighting`.


## Studio Assets surface (M3 v153, interactive v159, footage v187 — ADR 0016 amendments 153, 159 and 187)
- The Studio has a fourth surface: an **Assets** panel mounted from `components/AssetPanel.tsx` over
  `@nexus/ai-providers`' multimodal slice (the lane's first PRODUCT consumer; the agent door `assetTools.ts`
  was v145). Reached with the `Assets` toggle; the 2D canvas is the default and is untouched.
  `npm run verify:assets` drives it in a real browser (**29/29** after v187) and
  `npm run verify:assets-surface` is the headless proof over the shipped Studio module + generators.
- **DEMO MODE only — no pixels exist.** `DemoImageGenerator` produces deterministic metadata and an
  empty payload. The panel says `DEMO MODE · no image model is attached` on its own face, every stored
  asset's byte count is what the library actually holds (**zero**), and the panel renders **no `<img>`**
  because there is no image to render and an element would imply one.
- **The surface is INTERACTIVE since v159.** A prompt form generates into the REAL library
  (`generateAsset`, storing the same zero-length payload) and every library row has a **Remove**
  (`removeAsset`). The browser probe types, generates, removes and checks the storyboard is unmoved and
  every byte count still reads `0` — the library and the storyboard are separate state.
- **v187 added FOOTAGE.** `generateAsset` takes a `type: 'image' | 'video'` and the panel dispatches to the
  right generator. Both demo generators answer whatever they are asked — `DemoImageGenerator` answers a video
  ask with an `image/png` — so a single-generator panel would store a still and call it footage; the routing
  is what prevents that, and the proof measures the defect before showing the fix. A still reports
  `duration: null` and footage its seconds, so the two are told apart by a null rather than a zero. The
  surface can ASK for footage but cannot PLAY it: there is no video element anywhere, because there is no
  video.
- **Still absent from the product surface:** character consistency, asset UPDATE, and
  storyboard editing. Removal also exists as an agent door (`asset.delete`-shaped work lives in
  `assetTools.ts`'s write doors behind the §28 checkpoint); the panel's Remove is NOT gated, because it acts
  on the panel's own in-memory library rather than on the design document.
- The asset library is generator state, **not** part of the Design Document: it is not persisted in the
  local snapshot, not undoable and not exported. The read-only bridge `window.__nexusAssets.assets()`
  answers `null` once the surface unmounts. The library lists assets newest-first; the prompt order is
  guaranteed only in the storyboard's `frames`.
## World surface (M4 v148, simulated v162 — ADR 0016 amendments 148 and 162)
- The Studio's fifth surface: a **World** panel mounted from `components/WorldPanel.tsx` over
  `@nexus/world-engine` (the lane's first PRODUCT consumer; the agent doors `worldTools.ts` were v144,
  8 doors since v162). Reached with the `World` toggle; the 2D canvas is the default and is untouched.
  `npm run verify:world` drives it in a real browser (**25/25** after v162) and
  `npm run verify:world-surface` is the headless proof over the shipped Studio module + engine.
- **v162 — the surface STEPS the world.** A Simulate row runs the engine's own `tickOnce()` (Step ×1 /
  Step ×5, plus a last-tick line naming the tick, decisions, actions and eroded bonds) and a
  Relationships section lists every bond BY NAME from both sides. The composition connects its three
  places (ford↔ridge path, ford↔hamlet road) and seats **two characters at the ford**, so a tick can
  introduce them: the deterministic first tick is 4 decisions · 2 actions · the newborn bond eroded to
  13/13 — asserted identically by the unit suite, the headless proof and the browser harness.
- **DEMO MODE only — no model behind the agents.** Every decision is the engine's own arithmetic
  (confidence gate + persona scoring), the surface says `DEMO MODE · no model is attached` on its own
  face, and no field of the report claims a provider or a model. Strength is pure arithmetic with a
  floor at the first-meeting anchor (decay can never manufacture hatred — the enemy band is unreachable
  through simulation) and a cap at 100; declared bonds (family/romantic/rival/mentor/servant) are never
  re-derived from arithmetic.
- **The bridge stays read-only.** `window.__nexusWorld.world()` answers the DERIVED report (schema 2)
  and unregisters on teardown (`null` once the surface is gone); stepping happens through the panel's
  own engine, not through the bridge.
- **Still absent from the product surface:** factions and lore events in the tick, a real model behind
  the persona, per-tick configuration, and persistence (save/load is JSON in memory, not the local
  snapshot).
## Architecture
- `agents/runtime` (`@nexus/agent-runtime`) is now **implemented** through M2 v0–v6 (ADR 0016):
  the loop, permission-gated registry, hermetic workspace tools, hybrid code index (`fs.index`),
  read-only real-directory ingestion, §26 memory (scoped/inspectable/deletable) and v3
  durability: schema-versioned memory JSON + the first real-disk tools `disk.read/write/list`,
  each confined to one host-chosen root by `guardedJoin` with checkpoint-gated writes; v4/v5
  add persisted index snapshots with fingerprint rescan wired into `fs.index` via
  `createIndexProvider` (default rebuild-per-call remains the out-of-the-box path); v6 unifies
  retrieval scoring behind one `hybridScore` seam (index + memory; zero token overlap ⇒
  exactly 0) and adds listed, idempotent memory `compact()`.
  It is
  still *not* a general coding agent: no browser automation of its own; process execution and git run
  through the §28-gated exec-host policy sandbox (am. 30–37), and since am. 166 a policy-approved
  argv can be sealed inside an ephemeral container — since am. 172 the Studio dock's exec lane runs inside
  that container (its route is the first product consumer), while the runtime's own tool doors remain
  headless proof-lane only — since am. 173 the build arc's `build.verify` door has its first real consumer (the exec-host container verifier), so a verify step can run inside the policy-pinned container — and since am. 174 the dock's build face walks that arc from the browser — since am. 175 that walk is PLANNED (a goal selects whole templates from a host-declared catalog; argv never leaves the catalog), so the build lane is headless no more — and since am. 176 a completed arc's deploy leg walks `deploy.record` doors (one §28 gate per measured fact, the host injects the `DeploySink`; the runtime holds no sink and no write path itself) — and since am. 177 the dock's DEPLOY face is that sink's first product consumer: the walked facts land as append-only JSONL records in `.nexus/deployments.jsonl` (the dock's first durable server-side artifact) — and since am. 178 the records READ BACK at the dock: the probe carries them NEWEST FIRST (display-capped; the file stays append-only and uncapped) and a line that is not a readable record is COUNTED, never hidden. Known
  limits, stated not hidden (§60): the "embeddings" are deterministic hash token-bags, not
  trained vectors; the runtime's own disk jail is a path check + human gate (the exec-host container wall of am. 166 is a separate lane the runtime's tools do not use yet); and
  the template planner fails honestly (`failed_verification`) when both memory and the index
  are absent. Dock repairs (v12) are heuristic moves (nudge/clamp/grow, 16px gutter): they
  never resize content, so residuals no move can fix (a section taller than the page) stay
  flagged — stated in the panel, not hidden.
- `services/*` are still **README-only shells** (a real `packages/contracts` does not exist yet);
  the Studio intentionally does not depend on them for the slice.
- Sandbox/security enforcement (ADR 0013) is **partially realized**: the permission-scoped Tool
  Registry + Human-Checkpoint gate are executable and tested; the v3 disk jail is path-level
  only — container isolation EXISTS as a Docker backend (am. 166: ephemeral, no host mount by
  construction, capped, read-only rootfs, egress denied — measured by container-proof §1–§8);
  still open: gVisor/Firecracker, per-job secret injection, a warm pool — and no lane generates
  untrusted code for the wall to hold yet (the dock lane, am. 172, runs a policy-allowlisted self-check only; the build arc, am. 173, verifies policy-allowlisted steps inside the same wall; since am. 174 the dock's build face runs that same arc from the browser, and am. 175's planner can only SELECT among policy-validated templates — still nothing written by the wall itself; am. 176's deploy arc writes ONLY through a host-injected `DeploySink` the runtime does not own; since am. 177 a production sink EXISTS — the dock's deploy face writes the walked facts as append-only JSONL records to `.nexus/deployments.jsonl` (append-only measured facts, never a push/publish/release).

## Tooling
- Package manager is **npm workspaces**, not pnpm: `corepack` cannot write the global pnpm
  shim without admin rights in this environment (EPERM). Layout stays pnpm-compatible.
- Never run `next build` while `next dev` serves the same directory: the build rewrites `.next`
  and the live dev page silently loses its chunks (404 `main-app.js`, React handlers dead).
  Restart dev (or clear `.next`) after any build gate.
- **Vitest on this Windows host is handle-starved.** With its default parallel worker pool the
  run intermittently reports fewer test files than exist, and can surface an unrelated
  `EPERM …\Temp\…\ssr\…` unhandled error from vitest's own transform cache. Neither is a test
  failure. Two reliable invocations:
  - `NODE_OPTIONS= npx vitest run --root <pkg> --no-file-parallelism` — authoritative counts.
  - the `--require` shim in the ambient `NODE_OPTIONS` is what produces the `EPERM`; clearing
    `NODE_OPTIONS` for the run removes it.
  Turbo can also fail with `os error 231 (all pipe instances are in use)` when several builds
  run at once; build the affected package directly with `tsc -p tsconfig.json` instead.
- **The SYNCHRONOUS spawn family is unusable on this host; the ASYNC family is clean.** Measured
  2026-10-02 (`docs/evidence/agents/ebusy-proof.mjs`, ADR 0016 amendment 152): a sequential
  `spawnSync('git', ['rev-parse','HEAD'])` fails **20/20 with `EBUSY`**, and across four git shapes the
  sequential arm fails **60/60 (100%)** while the concurrent arm using async `spawn` — up to 8 children
  alive at once — is **0/340 (0.00%)**. So this is **not** contention and **not** intermittent: it is
  the `spawnSync`/`execFileSync`/`execSync` API itself. Consequences:
  - **Every proof that shells out must import `docs/evidence/lib/syncproc.mjs`**, which re-implements the
    sync API on the async path (Worker + `Atomics.wait`). That file is load-bearing, not a convenience —
    do not delete it.
  - A proof that calls the sync family directly does not fail honestly; it fails *always*, which is why
    an earlier record could claim 0% while its own proof measured 100% (amendment 151, corrected by 152).
  - **A claim about contention must measure a concurrent arm against a sequential control.** A "concurrent"
    arm built by wrapping a synchronous call in `new Promise` never overlaps, and its numbers describe the
    sync path while its label describes a race.
  - One real concurrency artifact does exist and is classified separately: concurrent `checkout` in one
    repository contends on the index lock and reports as `otherErr`, not `EBUSY`.
- **`next dev` needs a clean `NODE_OPTIONS`** in this environment: the ambient `--require`
  language shim intercepts `unlink`, and Next's dev cache cleanup then aborts the process with
  `SAFE_DELETE_BULK_GUARD_ERROR`. Start it as `NODE_OPTIONS= ../../node_modules/.bin/next dev -p <port>`
  (also: `npx next dev` can hang resolving through the local proxy — call the binary directly).
