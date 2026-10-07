# NEXUS — Long-Term Development Plan

> Working continuation plan for NEXUS. It is derived from `docs/PRODUCT.md`, the milestone table in
> `docs/ROADMAP.md` and the honest limits in `docs/KNOWN_ISSUES.md`. Status is kept truthful per §60 —
> nothing here is "done" just because it is listed; each row names the verifiable evidence that closes it.

## Purpose

NEXUS turns ideas into executable digital worlds. The plan is organized around the product pipeline
(`RESEARCH → PLAN → DESIGN → GENERATE → CODE → BUILD → TEST → SIMULATE → DEPLOY → OBSERVE → IMPROVE →
PUBLISH → REMIX`) and the spec's milestones. The working method is the repo's own **ADR 0016 cadence**:
one deep, *verified*, increment at a time — pure model layer → agent door (when a lane needs one) →
headless proof → product surface → real-browser verification → record the amendment in the ledger.

## Current honest status (2026-10-07, night)

- **M0 — Foundation:** done (git, monorepo, docs, CI, ADRs 0001–0017).
- **M1 — Studio Vertical Slice:** core + many polish passes done (canvas, layers, properties, design
  system, DEMO generate/edit, undo/redo, AI diff, live preview, local export, rotate, components &
  instances + per-instance overrides + nested sub-selection, rigid-subtree rotation, minimap, local-first
  persistence + History/Snapshots). Hosted publish deferred to M7.
- **M2 — Agentic Coding:** model/registry/workspace/planner/orchestrator, hybrid code index + memory,
  change-sets/ledger, roles + rubric, §25 pipeline, Studio dock + §28 checkpoint, visual QA + repair loop,
  browser-durable memory, role-chain editor, vector recall, near-miss QA lints + align-nudge proposals,
  UI-capable task running. **Exec sandbox: policy layer (v29–v37) + container isolation (v166, Docker backend, real-daemon proof §1–§8) + the dock's container lane (v172, first product consumer — the exec face is container-only from birth)** landed — ADR 0013 stays Proposed (gVisor/Firecracker, per-job secrets, warm pool open) and the runtime's own headless tool doors still have no consumer.
- **M3 — Multimodal Assets:** `@nexus/ai-providers` multimodal slice (asset library, demo image/video
  generators, character consistency, storyboard manager) + agent doors (`assetTools.ts`). **Product face
  now built (v153) and INTERACTIVE (v159):** Studio gains the `Assets` surface (asset/storyboard report,
  §60 byte-zero honesty) with a prompt form that generates into the real library and a per-row Remove.
  **Footage (v187):** the same surface can now ASK for video — `generateAsset` takes a type and the panel
  dispatches to the video generator (measured: the image generator answers a video ask with a still, so a
  single-generator panel would mislabel footage).
  **Editable board (v188):** frame rows carry remove/move controls — the manager's own verbs; a removal
  leaves the surviving order honest, a reorder rewrites it to the sequence given.
  **Characters (v189):** the consistency trio's product doors — a register form anchors a character to
  an asset the library ACTUALLY holds, the report reads what the register HOLDS (`null` where none was
  given), and apply answers the DERIVED REQUEST a generator would receive (no generator runs; the
  manager's own 0.8 default lands where the register held none).
  **Library edit (v190):** the `asset.update` door's product face — a select + three optional fields
  merge the FILLED fields over the metadata the library holds (name/description/tags; bytes and id are
  NOT editable), a patch that names nothing is refused in the door's own words (the library would call
  it a success), and the row reads its tags back while the bridge carries the description.
  Still open: none — M3's list is clear.
- **M4 — World Engine:** `@nexus/world-engine` (world/lore/character/location/faction + RAG + character
  agent) + agent doors (8) + product surface (`World` panel, v148). **Now a SIMULATION (v162):**
  `tickOnce()` + `executeAction`, two-sided relationship bonds with a decay floor, lossless save/load,
  a connected composition the panel steps (Step ×1/×5). **Now PERSISTENT (v191):** the engine's own
  save()/load() gain a disk lane — the same tested fs store the scene lane rides (root
  `.nexus/world-saves`), a file that carries no object `world` is refused before bytes move or reach
  the loader, and the panel's Persist row saves the engine's own file and loads a disk row back into
  the live world (harness 25/25 → 34/34, studio 349 → 364). Still open: real model behind the persona,
  factions/lore ticking, per-tick configuration.
- **M5 — Three.js Runtime:** `@nexus/three-runtime` scene graph/entities/cameras/lighting/animations +
  save/quest/combat/NPC type surface + document/op-log integration (v141+). Product surface (`3D`, v142),
  **now CONTROLLABLE (v161):** camera orbit (drag/wheel/reset) and add/remove body from the panel.
  **Now PERSISTENT (v163):** save/load through the runtime's own file format and 3D→document
  composition — authored bodies filed into the Design Document as one undoable `addSubtree`; agent
  doors 6 → 8 (`scene.save`/`scene.load`). **Now RELOAD-SAFE (v165/168/169/170):** the listing verb classifies
  refused names, the store itself answers `savePathRefusal`, the panel browses and loads a SELECTED
  save, and the backend is a namespaced localStorage store (`nexus-save:studio-scene`) — saves
  survive page reloads. **Now DRIVABLE (v179):** the localStorage save store takes an injected
  `options.storage` seam (the minimal `StorageLike`), so the same code is driven headlessly by tests
  while the browser default still probes `window.localStorage` and `Scene3D` is unchanged byte for
  byte — and the seam's first tests caught and fixed a real lie: `writeAtomic`'s `durable` was
  silently ignored, now refused like its siblings with a zero-write guarantee (three-runtime
  422 → **436**, harness **25/25** re-verified; ADR 0016 amendment 179). **Now PLAIN (v180):** a
  quota-shaped `setItem` throw is re-thrown with a sentence that names the quota AND that nothing
  was written (write / writeAtomic's temp step / rename; unclassifiable errors stay raw — no
  invented diagnosis), and the save note stops claiming "nothing written to disk" — it names the
  store: `persisted in this origin's localStorage (reload-safe), not on disk` (three-runtime
  436 → **440**, harness **25/25** re-verified; ADR 0016 amendment 180). **Now PANNABLE (v181):** the
  orbit target slides along the ground plane — `OrbitState` gains `panX`/`panZ`, pure `applyPan`
  converts camera-relative input (`forward`/`right`) with the orbit's own azimuth so W means "into the
  screen", each axis clamps at `±ORBIT_PAN_LIMIT`, a turn rides the offsets through untouched, and the
  surface grows `panBy` wired to SHIFT-drag and WASD/arrows (typing in a text field never pans) (studio
  256 → **263**, harness **25 → 30/30**; ADR 0016 amendment 181). **Now PICKABLE (v182):** a click
  names the body under it — the runtime's `pickAt` casts a real Raycaster into the live scene, the
  surface converts pixels to NDC, a release within 4 px of its press is a CLICK (longer travel was
  a drag), the report carries `selected`, empty sky clears it, and the HUD answers `picked: <name>`
  (three-runtime 440 → **448**, studio 263 → **274**, harness **30 → 33/33**; ADR 0016 amendment
  182). **Now LIGHTABLE (v183):** the declared lighting is CONTROLLABLE — the runtime's `setLightState`
  toggles a light by attaching/detaching the real `THREE.Light` (v142's rule through the gate) and
  writes live intensity, refusing a non-finite/negative ask whole; the surface folds every brightness
  ask into 0..2 (`clampLightIntensity`) BEFORE the host sees it, the report re-reads the live scene
  (`scene.lighting`), and the HUD gives each declared light an on/off toggle and −/+ brightness at
  0.1 a press (three-runtime 448 → **453**, studio 274 → **283**, harness **33 → 37/37**; ADR 0016
  amendment 183). **Now DISK-PERSISTENT (v184):** the save REALLY persists — v163–v180's note
  claimed localStorage persistence while nothing ever called `writeSaveFile` (the store stayed
  empty through every green run; the harness never looked); the panel's save now writes the store
  for real and reports the write report's own byte count, and the runtime's fs-backed `SaveStore`
  (v120) gains its first product consumer: a `save-fs` route over the runtime's own
  `createFsSaveStore` with node:fs injected as its `FsLike` (the naming rules stay the store's;
  saves land in gitignored `.nexus/scene-saves`), a fetch-only lane, and `save to disk`/`browse
  disk` HUD controls whose rows load a disk save into a fresh scene — the harness reads the file
  back off disk with node:fs (2307 bytes, 5 bodies), and the HUD panel gets a max width so it
  stops swallowing drags aimed at the canvas (studio 283 → **297**, harness 37 → **42/42**; ADR
  0016 amendment 184). **Now METERED (v185):** the save area measures what it holds instead of
  guessing — the store line sums the chars the decorated listing measured (a JS string's length,
  the unit localStorage quotas are counted in; `list()` still reads no bytes — the meter is the
  caller that pays that cost on purpose), the origin line carries the browser's own
  `storage.estimate()` labelled for what it covers (`browser estimate, all storage APIs`), a
  missing estimate is named rather than invented, the percent bar renders only when both halves
  are numeric, and every store mutation re-measures (studio 297 → **318**, harness 42 → **46/46**;
  ADR 0016 amendment 185). **Now MANAGEABLE (v186):** the disk rows carry delete and rename
  (`data-scene3d-disk-delete` / `data-scene3d-disk-rename`, `stopPropagation` so the row's
  click-to-load never fires beneath them) through the route's `delete | rename` actions — the
  server refuses only non-string paths itself and hands everything else to the store's own words
  (`delete` answers its boolean, "already gone" is `ok: true, deleted: false`; a rename's NEW name
  is a server-side creation under the store's creation rule, a missing OLD name refused by name),
  and the rows are re-probed after each verb, never hand-edited (studio 318 → **327**, harness
  46 → **53/53**; ADR 0016 amendment 186). **Now INSPECTABLE (v192):** the picked body has FACTS —
  `selectionFactsOf` reads the live scene at report time (kind, world position, visibility; `position`
  is `null` rather than invented when the host declares none, the `duration: null` rule one surface
  over), the HUD renders them, and a body that has LEFT the scene reports nothing while the selection
  stays the name it was (studio 327 → **369**, harness 53 → **55/55**; ADR 0016 amendment 192). **Now
  EDITABLE (v197):** two of the declared facts are writable through the runtime's own gates —
  `setEntityName` (stored AS GIVEN; blank/non-string refuses whole; the surface folds the trim first and
  re-points the pick record only on an ACCEPTED rename) and `setEntityVisible` (the both-records rule, so
  `pickAt` then skips the hidden body) — with rename/hide buttons on the inspector. The harness run also
  exposed the resolution plane: unit suites read the package's `src/`, the Studio build reads `dist/` —
  a stale dist silently no-op'd both gates in the real browser behind green suites (three-runtime 45 →
  **51**; scene3d 65 → **72**; surface 12 → **13**; harness 55 → **61/61**; ADR record owed, see below).
  Still open: the inspector reports what a host DECLARES — no components, materials, children or animation
  state, and no way to edit any of them.
- **M7 — Community:** 🟡 **STARTED (v193)** — `services/nexus-api` is a real Spring Boot 3.5.16 service on Java 25
  (ADR 0011's stack) with one aggregate and two endpoints: publish a project, read it back. Proven against a
  throwaway PostgreSQL in Docker, including that the publication SURVIVES A SERVICE RESTART.
  **The Studio CALLS it (v194):** the toolbar has a Publish control over a fetch-only lane, and
  `tools/harness/studio-publish.mjs` proves the whole path end to end (PostgreSQL + service + Studio, 11/11).
  **Now listable and removable (v195):** the service answers what is published (newest-first, capped) and can take
  one down, and the Studio's Published panel drives both.
  Still open: no auth/accounts/ownership, no paging beyond the cap, no soft delete or history, no migrations, a
  publication is replaced rather than versioned, and publishing is still a toolbar control rather than a
  product surface.
- **M8–M10:** planned, not started (creator economy, ops, external agents).

## Execution order (next increments)

The cadence is deliberately small and verifiable. The current priority queue, in order:

| # | Milestone | Increment | Why now |
|---|-----------|-----------|---------|
| ~~1~~ | M3 | ~~Asset surface `generate`/`delete` interaction~~ | **DONE — v159** (ADR 0016 amendment 159): `generateAsset`/`removeAsset` in the shipped module, a prompt form + per-row Remove in the panel, §5 of the headless proof growing and shrinking the REAL library, and the browser probe at **24/24** (it types, generates, removes, and checks the storyboard is unmoved and every byte count still reads 0) |
| ~~2~~ | M3 | ~~`asset.video.generate`, `asset.character.*` and `asset.delete`/`asset.update` doors~~ | **DONE — v160** (ADR 0016 amendment 160): the family went 6 → **13** doors (video, search, update, delete, the character trio), 41 unit cases, and §6–§8 of the proof over the REAL generators + library + consistency manager. The empty-patch no-op the LIBRARY calls a success is refused by the door; the panel's Remove and the agent's `asset.delete` now have their difference stated in the door's own description |
| ~~3~~ | M5 | ~~Camera orbit/zoom + add/remove-body on the `3D` surface~~ | **DONE — v161** (ADR 0016 amendment 161): a pure `OrbitState` (azimuth fold, elevation/distance clamps) whose default is DERIVED from v142's placement with a round-trip case; drag-to-orbit with pointer capture, proportional wheel zoom, reset view; **+ body**/**− body** through the surface (ring placement, `false` for foreign ids, last-body-only removal, composed scene provably untouched); `scene3d.test.ts` 16 → 30 (studio 187 → 201), headless proof §5 over the REAL camera (world matrix moved, distance preserved, graph 4→5→4), browser harness **19/19** |
| ~~4~~ | M4 | ~~Relationship simulation + `executeAction`/tick + save/load in the world engine~~ | **DONE — v162** (ADR 0016 amendment 162): `tickOnce()` consults every agent's own gate and decays unmaintained bonds (deterministic `TickReport`); `relationships.ts` makes strength pure arithmetic — bands, first-meeting floor (decay never manufactures hatred), declared bonds immune; speak writes BOTH sides; save/load is lossless; the composition connects its places and seats Mira & Toma at the ford so the panel's Step buttons can introduce them (`world-engine` 31 → 43, `agent-runtime` 492 → 498 with 8 world doors, studio 201 → 204, proofs §6–§8 + §4, browser harness 14 → **25/25**) |
| ~~5~~ | M5 | ~~3D save/load door + 3D→document composition~~ | **DONE — v163** (ADR 0016 amendment 163): `scene.save`/`scene.load` over the REAL runtime's `buildSaveFile`/`loadSaveFile` (doors 6 → 8; the file crosses as a JSON string the door parses, malformed/bare/array refused by name; a live scene refuses its own file — "a restore never overwrites live state"); the surface gains save/load/**send to doc** — load restores into a FRESH sibling scene, the demo never touched; `composeDocumentOps` files the AUTHORED bodies as one real `ops.addSubtree` (frame `Scene: <scene>` + one text child per body, §60 spec text not a fake preview), undoable; save-format consumers 0 → 2 (`scene3d.test.ts` 30 → 40 / studio 204 → 214, `agent-runtime` 498 → 506, proofs §6, harness 19 → **25/25**) |
| ~~6~~ | M2 | ~~Exec sandbox (ADR 0013): container isolation~~ | **DONE — v166** (ADR 0016 amendment 166): `createContainerExecHost` in `@nexus/exec-host` — the SAME `planExec` decision executed inside an EPHEMERAL container (10 isolation argv flags audited from the spawned argv, no mount flag the builder can emit, caps, read-only rootfs over noexec tmpfs, `--network none`, host wall-clock kill + `docker rm -f` by-name retirement), one `container.exec` door behind §28, 26 cases (exec-host 301/301), real-daemon proof §1–§8 ALL PASSED. The second half — routing the runtime's disk/git/exec duties through the container — is item 7 |
| ~~7~~ | M2 | ~~Route the runtime's disk/git/exec duties through the container host: the agent's file/git/exec work happens inside the jail-free container, not on the host~~ | **DONE — v172** (ADR 0016 amendment 172): the Studio dock's exec lane is BORN in the container — `containerServer.ts` + `app/api/agent/container` (pinned node:22-alpine, 2-rule allowlist, probe-fused GET) behind a fetch-only client lane and an Allow-once §28 face in the panel; studio 214 → **229**, headless proof §1–§6 vs daemon 29.8.2, harness **7/7**. Bounds: the runtime's headless tool doors stay unconsumed (proof-lane); the dock's file work is the in-browser corpus and its git duties are none |
| ~~8~~ | ~~M6~~ | ~~Autonomous build: end-to-end plan→deploy with checkpoints~~ | **DONE — four slices** — **headless build arc v173** (am. 173): `planBuildArc`/`runBuildArc` (blueprint→verify→record over ONE §28-gated `build.verify` door, receipts v50-rule) + the container verifier as its first wired runner (`containerVerifyRunner` over the SAME v166 wall); **product face v174** (am. 174): the dock build face — pinned two-step arc walked through the SAME wall, §28 receipts per door on record, harness 8/8; **planning backend v175** (am. 175): `templateBuildPlanner` — a goal selects whole templates from a host-declared catalog (argv never written, seed-as-provenance, unplanned is a normal answer); **deploy leg v176 + product face v177** (am. 176/177): the headless deploy arc (`planDeployArc`/`runDeployArc` — only a green arc deploys, only MEASURED facts deploy, each `deploy.record` door §28-gated, the host injects the `DeploySink`) and the dock's DEPLOY face — the build face's own walk redeployed through `planDeployArc`, facts landing as append-only JSONL records in `.nexus/deployments.jsonl` (studio 241 → **251**, `deploy-lane-proof` §1–§6 vs daemon 29.8.2, harness **8/8** — the dock's first durable server-side artifact); **records read-back v178** (am. 178): the read side of the sink — `readStudioDeployRecords` parses the file back (every field typed, malformed lines COUNTED never hidden), the GET probe carries the records NEWEST FIRST display-capped, and the panel renders the history under the status line (studio 251 → **256**, `deploy-lane-proof` §1–§7, harness **10/10**) |
| ~~9~~ | M7 | ~~First slice: publish a project and get a URL back~~ | **DONE — v193** (ADR 0016 amendment 193): `services/nexus-api` is a REAL Spring Boot 3.5.16 service on Java 25 with two endpoints and one aggregate; 14 unit cases with no Spring context, and `docs/evidence/m7/publish-proof.mjs` builds the jar, starts a throwaway PostgreSQL 16 in Docker, and proves the document round-trips as JSON, a re-publish UPDATES to version 2 with the DATABASE counted at exactly one row, refusals name their rule, and the publication SURVIVES A SERVICE RESTART. Four defects it found that reading would not: a receipt claiming nanosecond precision PostgreSQL had already dropped, a 400 on every well-formed publish, a signal-killed process reading as still alive, and an injected `SERVER_PORT` silently outranking the configured one |
| ~~10~~ | M7 | ~~The Studio CALLS the service~~ | **DONE — v194** (ADR 0016 amendment 194): the toolbar has a Publish control over a fetch-only lane (`publishServer.ts` / `api/publish` route / `publishLane.ts`), it passes the SERVICE's version+instant+URL through unchanged, and a down service is a normal answer. `tools/harness/studio-publish.mjs` stands up PostgreSQL + nexus-api + the real Studio and drives the button: **11/11**, including the row read back through the service independently of the UI |
| ~~11~~ | M7 | ~~Listing + unpublish~~ | **DONE — v195** (ADR 0016 amendment 195): `GET /projects?limit=N` (newest-first, metadata only, cap clamped and reported) and `DELETE /projects/{id}` in the service; the Studio's Published panel renders the service's rows and takes one down. 21 service cases · 17 lane cases · proof §6–§7 against the real database · E2E **15/15**. Also fixed a proof bug that had been hiding behind a green check (postgres was verified inside its container, not on the host port the service uses) |

## Guardrails (what "done" means here)

- Every feature lands with a runnable check: unit tests, a headless proof against the SHIPPED module,
  and (for product surfaces) a real-browser harness (ADR 0017).
- No fake implementations (§60): DEMO MODE is labeled, provenance is carried, and a surface never
  shows a size or an `<img>` that implies a model that is not attached.
- Regression is kept targeted: run the affected package/lane, not the whole monorepo, unless a change
  genuinely crosses boundaries.
- The ADR 0016 ledger is updated when a lane closes a bound; a bound is marked closed only after its
  proof is green.