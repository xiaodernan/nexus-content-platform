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

## Current honest status (2026-10-08)

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
  **The resolution plane gets a gate (v198):** `test/distSync.test.ts` — every 2-space method
  declaration in `threeRuntime.ts` (154 names by the gate's own scan; overload signatures excluded) must
  appear in `dist/threeRuntime.js` or the gate reddens naming the gap and the rebuild command; a
  never-built plane skips and is named (three-runtime 459 → **463**; witness arm red → restored → green).
  **The inspector reads the component registry (v199):** `entityComponentsOf` decodes the three registry
  spellings (live `Map` / save-shape entry array / stringify object) with the `enabled !== false` default,
  the HUD names each component (disabled as `(off)`) only when the registry is non-empty, and the layers
  prove it — pure 72 → **74**, surface 13 → **16** over the real runtime (`addComponent` answered in order,
  `removeComponent` followed), harness 61 → **62/62** (empty fact + no HUD segment; the frozen read-only
  bridge cannot attach components), proof §7 drives both verbs through the shipped dist runtime. Child
  counts stay uncounted on purpose: the scene graph is flat, there is no entity parent/child API, and a
  number invented from renderer internals would be the fake-fact move this lane refuses. Studio suite
  404/404 on this host.
  **The registry becomes EDITABLE and gates behaviour (v200–v203):** `setComponentEnabled` (runtime) +
  `toggleComponentEnabled` (surface) put a write verb over the registry the inspector reads, and the flag then
  gates query participation, material visibility (`targetObject.visible`) and animation playback.
  **Every eviction door releases what it evicted (v205/v206/v208):** removal, entity removal, and
  `addComponent`'s same-type replace; a component filed DISABLED declares its gates at file time (v209).
  **The silent verbs get voices (v210–v218):** the component events get a subscriber, `setEntityName`/
  `setEntityVisible` announce themselves, and `setPixelRatio` — which wrote the REPORTED `pixels.pixelRatio`
  in silence — emits after the backend takes the value. The surface watches the bus in FIVE pairwise-disjoint
  legs (`watchComponents`/`watchEntities`/`watchBodies`/`watchScenes`/`watchPixels`), each name set decided
  by a WRITE CENSUS of the report fields it covers, and the disjointness pin re-widens with each leg.
  Still open: the inspector reports what a host DECLARES — no materials, children or animation state
  (children stay uncounted while the graph is flat), and there is no way to edit position or any other
  declared fact beyond name and visibility.
  ⬜ **STATED GAP:** this bullet's per-increment detail stops at v199 and the ROADMAP's M5 row stops at v202,
  while v200–v218 are committed and carry ADR records. Filed as a plan item rather than backfilled here.
- **M7 — Community:** 🟡 **STARTED (v193)** — `services/nexus-api` is a real Spring Boot 3.5.16 service on Java 25
  (ADR 0011's stack) with one aggregate and two endpoints: publish a project, read it back. Proven against a
  throwaway PostgreSQL in Docker, including that the publication SURVIVES A SERVICE RESTART.
  **The Studio CALLS it (v194):** the toolbar has a Publish control over a fetch-only lane, and
  `tools/harness/studio-publish.mjs` proves the whole path end to end (PostgreSQL + service + Studio, 11/11).
  **Now listable and removable (v195):** the service answers what is published (newest-first, capped) and can take
  one down, and the Studio's Published panel drives both.
  **Now OPENABLE (v196):** `GET /p/{id}` is the ARTIFACT PAGE — the half M1 deferred, since every other door needs
  a client that already knows the id. It answers the document drawn by the Studio's OWN `renderPreviewHtml` (the
  same function the local Preview and the HTML export use), 404 when nothing is published, and **503 when the
  service is unreachable** — not a 404, because those are different facts. 5 rendering cases; the E2E probe draws
  a rectangle, publishes, then opens `/p/{id}` in a REAL browser (200 + a non-empty stage) and checks an
  unpublished id answers 404 with its own page rather than the service-down page (**21/21**).
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
| ~~12~~ | M7 | ~~The artifact page: a published project at a URL a person can open~~ | **DONE — v196** (ADR 0016 amendment 196): `GET /p/{projectId}` renders the publication with the Studio's OWN `renderPreviewHtml`, so the published bytes and the previewed bytes are the same code rather than two renderers that drift. Three answers with the status codes carrying the difference: 200 the artifact · 404 nothing is published here · **503 the SERVICE is not answering** (not a 404 — a reader given the wrong one looks for the problem in the wrong place). The lane reports the 404 STRUCTURALLY (`notFound`) so the route cannot start answering 503 because someone reworded a sentence. 5 rendering cases · E2E **15 → 21/21** (draws a rectangle, publishes, opens `/p/{id}` in a real browser, and checks an unpublished id gets its OWN page)
| ~~13~~ | M0 | ~~The type gate does not read TESTS in six of seven packages~~ | **STARTED — v204** (ADR 0016 amendment 204): `build` and `typecheck` shared one tsconfig, and that config needs `rootDir: "src"` for the dist layout — so `test/` was `exclude`d and **61 test files** fell out of every gate except studio's. Measured, not guessed: **249 type errors** hide there. A dedicated `tsconfig.test.json` (`rootDir: "."`, `noEmit`, `include: ["src","test"]`) lets `build` keep its layout while the gate reads tests. **Closed: studio (6, and it was RED at HEAD), design-model (4), ai-providers (22), world-engine (14)** — including a world-engine test that imported `createWorldId` and then shadowed it with its own local `(id) => id as any`, so the library's constructors were never exercised |
| ~~14~~ | M2 | ~~Finish the type-gate coverage: agents/exec-host~~ | **DONE — v205** (ADR 0016 amendment 205): gate **27 → 0**, suite **309/309**. Four files imported `SpawnLike` from `@nexus/agent-runtime`, which **does not export it** — a type-only import erases at runtime, so the suites passed while four files typed their spawn mocks against a symbol that was not there (it is exec-host's own; `ExecPolicy` genuinely is the runtime's). `gitTools.test.ts` had `expect(env).toMatchObject(A, B)` — **the matcher takes ONE argument**, so B was dropped and half the assertion never ran; split into two calls, and the newly-live half PASSES. Two tests read `d.reason` off the `ExecDecision` union without narrowing, so a non-refusal would have asserted against `undefined`
| ~~15~~ | M2 | ~~Finish the type-gate coverage: agents/runtime~~ | **DONE — v213** (ADR 0016 amendment 213): gate **48 → 0**, suite **540/540**. The dominant defect was ONE root cause across ~24 call sites — `FsWriteLike` extends `FsLike`, which requires `readdirSync`/`statSync`, and **six of the eight suites that define their own `MemDisk` mock had neither**; the completion THROWS rather than answering an empty listing, because a mock that reports "no entries" for a disk that HAS entries is what a future test would pass against. Also: `toEqual` takes ONE argument and four messages were being dropped (`expect(h.actions).toEqual([...], 'why')`); three cases expressed "no verify tier" by OMITTING a REQUIRED `hasVerify`, which is not the same statement as `false`; `res.release` (optional on `ChainResult`'s green branch) and `res.editorOutcome` were read off unions without narrowing; and `TestRunner.run` is declared `TestReport \| Promise<TestReport>` while a test read `.ok` off it |
| ~~16~~ | M5 | ~~Finish the type-gate coverage: three-runtime~~ | **DONE — v214** (ADR 0016 amendment 214): gate **118 → 0**, suite **498/498** — **the repair is CLOSED: 249 errors found across six packages, all fixed, all six \`typecheck\` scripts wired to a \`tsconfig.test.json\` that reads \`test/\`.** Three root causes: \`ThreeRuntimeConfig\` requires \`maxLights\`/\`frustumCulling\` that **nothing reads** (added at the package's own defaults); \`shadowMap.type\`/\`toneMapping\` are THREE's union types and the fixtures wrote raw \`0\`s; ~20 event listeners had no contextual param type. Plus \`SaveStore\` grew \`savePathRefusal\`/\`rename\` and two mocks were never updated — the THIRD instance of that shape. And \`packageFace.test.ts\`, which AUDITS the package's export face, had never itself been type-checked |
| 17 | M1 | **`InstanceNode['overrides']` cannot express a text override** | Found by v204's widened gate. The type is `Record<NexusId, Partial<Pick<NodeBase, …>>> & { text?: Record<NexusId, string> }`, so an object literal's `text` key must satisfy the INDEX SIGNATURE too, and no correctly-typed code can write one — `readOverrides` casts around it. The format ALSO lets a master child whose id is literally `text` be unreachable for geometry patches, because `readOverrides` skips that key. Both need a canonical-model decision (ADR 0004/0015 territory), so the test carries the same cast with the reason written down instead of a rushed fix | **DONE — v231** (ADR 0016 amendment 231): the reserved `text` sibling is folded into `InstanceChildOverride.text?`; an override is a patch, so `text` is just another patchable field. No index-signature trap, and a master child named `text` is patchable for the first time. Legacy snapshots are a lossless encoding folded on read by `normalizeInstanceOverrides` (no `SCHEMA_VERSION` bump — `persist.ts` refuses unknown versions, so a bump would orphan local docs). design-model 34/34, Studio 484/484, both tsc 0 |
| ~~18~~ | M5 | ~~Seven M5 increments landed with NO ADR amendment (206–212)~~ | **DONE — the seven records, written from their commits as ADR 0016 amendments 206, 207, 208, 209, 210, 211 and 212** — a documentation increment with no code, the pattern v156 set for amendment 82. Each record is TITLED, quotes its suite totals as the readings taken on its own landing day (2026-10-09), and re-verifies every line citation on the tree these records land in: three had already drifted (the component emits 1625/1643/1699 → 1633/1651/1707 under v211's eight lines, v209's enforcement call 1624 → 1632, `restoreEntity`'s fresh-file line 1755 → 1790), and two records say plainly that no mutation arm was scored in them (v206, v207) rather than inventing one — invention is what amendment 90's title warns against. Measured after landing: `table-recount-proof.mjs` §7 dangling 0, and all seven grants carry a corpus TITLE. That run is still RED on `unrecordedNewest:215` — v215 is named by no title in 113 corpus files, and this lane did not perform that increment, so its own cycle has to title it |
| ~~19~~ | M2 | ~~**Eight `MemDisk` mocks, two behaviours**~~ | **DONE — v229** (ADR 0016 amendment 229): it was **eleven** suites, not eight, and they answered `readdirSync` **three** ways (five threw, two `[]`, three real byte-identical) plus `durability`'s fourth shape (a `dirs` set + `withFileTypes`) — so "the mock" meant four different things. `agents/runtime/test/memDisk.ts` is now ONE `createMemDisk({ listing, seed })` whose listing policy is a NAMED per-suite choice (`'refuse'`/`'empty'`/`'real'`); eleven suites migrated (refuse = testRunner/ledger/vectordb/chain/evaluate · empty = memory/vectorStore · real = durability/indexVectors/indexStore/pipeline). The migration caught a real defect in the helper's own first draft: its seed did not derive parent dirs, so a walk reading `readdirSync('out')` found nothing for a nested seed — now fixed. `agents/runtime` **540/540** (36 files) green, `tsc` 0, **no test added or removed** (the unchanged count is the proof the migrations are behaviour-preserving). `realfs`'s `FakeFs` implements `FsLike` with a `root`-prefix `strip` — a different seam, deliberately not migrated |
| ~~20~~ | M5 | ~~`ThreeRuntimeConfig.maxLights` and `.frustumCulling` are REQUIRED and read by nothing~~ | **DONE — v221** (ADR 0016 amendment 221): the two fields split by what is honest for each. `frustumCulling` is now **APPLIED** — `threeObject.frustumCulled = this.config.frustumCulling` at `insertEntity`, the one funnel both `createEntity` and `restoreEntity` pass through, so a restored body carries the runtime's config rather than whatever the object arrived with; THREE's own default is `true`, so the default path is behaviour-unchanged (suite 505 → **510** with no existing case moving). `maxLights` is now **OPTIONAL and documented as unhonored**, because there is no light-creation API for a cap to cap (`createScene` builds exactly two lights; `setLightState` only toggles or dims them). 5 cases · mutation probe 2/2 MATCHED (the assignment removed → `expected true to be false`; the value hard-coded true → the same two cases) |
| ~~21~~ | M5 | ~~**The ROADMAP's M5 row stops at v202 and the plan's M5 bullet at v199 — 19 increments are unrecorded**~~ | **DONE — amendments 197–203 backfilled** (a docs increment with no feature version, the v156 / v219 pattern): the premise was **half wrong**. The ROADMAP body had since been extended to v197–v228 and the plan's M5 bullet to v222 — but the ADR 0016 ledger was **missing seven M5 records entirely**: `grep -E "^#{2,3} Amendment (197\|…\|203)"` matched NOTHING, so v197–v203 had landed with no amendment at all (their own commits say so — "ADR 0016 amendment 197 is OWED", "the record is owed" — and v200's commit even miscited the number as "201", which is v201's own grant). This increment writes all seven (**amendments 197–203**), quoting each grant's real measurements from its own commit and the existing `docs/evidence/studio/README.md` sections; it also updates those sections' "owed" notes to point at the written records and fixes the ROADMAP M5 row's stale header range (v108–v186 → **v108–v228**). The doc gate's §7 titles all seven positionally — the README headings `## … (M5 v197…v203)` already carried the version labels, so adding the ADR headings made them titled at once. The reason to do it is the one this repo keeps rediscovering: a milestone row (or a ledger) nobody updates stops being a record of the milestone |
| 23 | — | **The doc gate's §4 can go red on a LOADED box, and it cannot tell that from a regression** | Measured 2026-10-10: a run failed §4 on `execHost.test.ts > the process tree (v55): what a timeout kill stops` — a spawn-heavy case that takes ~3.7 s alone. Standalone the same file is **39/39 green**; the same gate run also reported `runtime: vitest exit -1` (its 240 s arm budget exceeded). Re-run on a quieter box: **exit 0**. So a red §4 has two possible causes and the gate names neither. The honest fix is for §4 to state the wall-clock it measured per arm and to say when a red coincides with a timed-out sibling arm — a gate whose reds cannot be told from the host's noise is the failure mode amendment 152 warned about for `--no-file-parallelism`, one layer up | **DONE — v232** (ADR 0016 amendment 232): §4 times every arm and prints the wall-clock; a pure `classifyArm` answers `ok`/`regression`/`incomplete` (non-zero vitest exit, or fewer owned files than HEAD owns); a regression beside a timed-out arm NAMES the coincidence. Box-safe (healthy arms exit 0 and report exactly their owned files). Witnessed by §4b on five synthetic arms. Measured this run: `runtime 106102ms exit 0 · exec-host 27946ms exit 0` |
| ~~24~~ | M7 | ~~**The publish E2E proof leaks its throwaway container when it is killed mid-teardown**~~ | **DONE — v222** (ADR 0016 amendment 222): a name-based sweep at the START of `studio-publish.mjs` retires any `nexus-publish-e2e-db-*` it owns — by OWNER (the name carries the creating pid; a gone owner is retired `owner-gone`, a live owner is a concurrent run and is left alone) and by AGE (`MAX_AGE_MS = 6h`, for a recycled pid → `stale`). `tools/harness/leakSweep.mjs` is a pure decision module (no `child_process`, no `process.exit`) proven over 9 synthetic listings plus a real staged orphan (`docs/evidence/m7/leak-sweep-proof.mjs` §1–§6, ALL PASSED), wired before the port is taken (verified at offset 7815 < 8352 < 8429) and added as `verify:leak-sweep` to root `package.json`. The 2026-10-10 corpse was removed by hand; this run also retired a fresh leftover (`nexus-publish-e2e-db-1791649277835-999999999`, owner-gone, 1s old) |
| 25 | — | **The studio README still says "owed" for increments whose amendments exist** | Found while backfilling 197–203 (item 21). The `docs/evidence/studio/README.md` sections for **v204–v212** — and the **v204/v205** pair, whose M5 records are the collision-numbered amendments **219/220** — still end "The ADR 0016 amendment record for this grant is owed." But those amendments DO exist, so the note is a stale present-tense claim. Fixing 197–203's notes was part of item 21; the rest is a separate sweep, and it is the same "a note nobody updates stops being a record" failure as item 21, one layer down. A section that says a record is owed when the record exists sends a reader looking for something that is already there | **DONE:** the nine narrative notes (v204→219, v205→220, v206→206, v207→207, v208→208, v209→209, v210→210, v211→211, v212→212) now name the amendment that exists; the only remaining "owed" string is line 1734, which quotes the old commit message inside the v204 title heading (honest history, not a claim). `grep -rE "ADR 0016 amendment record for this grant is owed"` now matches only that quote |
| 26 | M7 | **The Studio could publish but never read a publication back in its own UI** (a stated M7 bound; `readPublished` had zero consumers) | **DONE — v233/v234** (ADR 0016 amendments 233 and 234): v233 wires remix into the Studio's Published panel — `remixLane.ts` (pure `extractRemixDocument` + a fetch adapter) hands the document back, and the store's `remixDocument` FORKS it (`forkDocument` gives the copy a fresh DOCUMENT id, because `doc.id` IS the publish projectId, so a remix can never re-publish over its source); a down service and a no-document publication are distinct refusals. v234 completes the loop for a VISITOR: the artifact page injects a `/?remix=<id>` bar (`injectRemixBar`, pure), the route passes the projectId, and the Studio reads the intent on mount (`remixIdFromSearch`, pure), forks, and drops the query. design-model 34 → 40, Studio 484 → 499 (32 files), both `tsc` 0, `remix-proof.mjs` 6/6 |
| ~~27~~ | M7 | ~~**M7 still has no auth, accounts or ownership**~~ | **DECIDED — v235** (ADR 0018 + ADR 0016 amendment 235). The canonical decision the item demanded is written: **option C, a local UNSIGNED identity that produces a CLAIM**, over OAuth (needs an IdP + client registration + a token store, and a half-wired one produces a badge), passwords (a security surface this repo is not ready to own while ADR 0013 is Proposed), and doing nothing. The boundary is in the type system, not in a comment: `apps/studio/src/lib/accounts.ts` holds **no password, no token, no session, no signature and no cryptography** and the suite proves it by reading its own source; every record carries `assurance: 'unsigned-local'`; `ownerClaim` names itself `kind: 'owner-claim'`; `isOwnerClaim` refuses every near-miss; and the module **reserves no names**, because a reserved list the client enforces and the service does not is a refusal nobody agreed to. 10/10 unit cases, `tsc` 0, studio 499 → 509 tests across 32 → 33 files. **STILL OPEN, and now correctly filed:** a claim is forgeable by anyone who can call the API; the device seed is per-browser so one human gets two ids until the service merges them; **no publication carries a claim yet** (`publishDocument`/`readPublication`/`DELETE` unchanged, no UI implies the service agrees). **DONE — v242 (service half: owner field, owner-checked unpublish, remix lineage) + v244/v245/v246/v247 (studio half: Studio sends `OwnerClaim`/`?claimer=`, `/explore` and `/p/{id}` show `by <handle> · <assurance>` and `remixed from <id>`).** profiles/follow/likes/comments are now buildable honestly once an account UI wires a current account into `publishDocument`/`unpublishProject`; until then the Studio attaches no claim by default, and the service still verifies nothing (ADR 0018 Proposed). A half-auth that lets a UI *look* owned while the service enforces nothing remains the §60 failure this item exists to prevent |
| 28 | M7 | **What is published had no PUBLIC door — the service could LIST since v195 and only the author's own panel consumed it** | **DONE — v241** (ADR 0016 amendment 241): `/explore` is a server-rendered gallery. `explore.ts` is a PURE renderer (`renderExploreHtml`/`renderExploreUnavailable`); `app/explore/route.ts` (Node runtime) lists, reads each row for its document (the listing carries none), draws a real thumbnail (`docToSvg` → `svgToDataUri`), and renders. Each card carries `open` (`/p/{id}`) and `remix` (`/?remix={id}`); the id is encoded in both links, caller text is escaped, `count` AND `limit` are both shown, an empty listing is its own state, and a down service is a 503 page distinct from an empty gallery. The HTML escaper moved to a shared `pageShell.ts` used by BOTH this page and `artifact.ts` (one rule, not two). Studio 509 → 516 (34 files), `tsc` 0, `explore-proof.mjs` 4/4. Bounds: `1 + N` service calls, capped at 24; no paging/search/sort; no byline |
| ~~29~~ | — | ~~**The ledger carries record debt: the v239 and v240 records are OWED, and 13 grants still have no corpus title**~~ | Two gaps, both §60. (a) The v239 commit (a cameraRemoval test fix) and the v240 commit (four world-engine `create*` verbs refusing taken ids) landed with **no ADR record** — their own commit messages are the only witness, and the numbering note under the v241 record states the gap rather than inventing their facts. (b) The gate's §7 names **13 grants with no record TITLE**: `[21, 164, 178, 181, 182, 183, 184, 185, 186, 188, 189, 190, 191]`. The facts for 181–186 (three-runtime) and 188–191 (world-engine) live only in the ADR and the ROADMAP — the three-runtime README stops before v181 and world-engine has no evidence dir — so titling them is a reconstruction, which is why this is filed rather than rushed. The gate does not refuse these (it only refuses the NEWEST grant), so the debt is visible but not blocking | **DONE:** all 13 grants now carry a corpus title (v21/v164 → `docs/evidence/agents/README.md`; v181–v186 → `docs/evidence/three-runtime/README.md`; v178/v188–v191 → `docs/evidence/studio/README.md`), each written from its own amendment heading and the ROADMAP, not invented. The v239/v240 records are written as **pointer-records** (amendments 239 and 240): their commits carried no message bodies and no measured totals, so each states what `git show --stat` shows and claims no suite count or mutation arm it did not measure |
| ~~30~~ | M7 | ~~**The service half of ADR 0018: a publication has an OWNER**~~ | **DONE — v242** (ADR 0016 amendment 242). The half item 27's record named as "the next increment": `PublishedProject` gains four NULLABLE owner columns (so every pre-existing row is `hasOwner() == false` and stays under the pre-v242 rule — locking an anonymous publication to nobody would make everything unpublishable by anybody); `OwnerClaim` rides in on `PublishRequest` and out on `Receipt`/`Publication`/`ListingEntry` through ONE `claimOf` mapper; `unpublish(id, claimer)` requires the matching account id for an owned row (`NotTheOwner`, 403) and accepts anyone for an ownerless one; a re-publish naming a DIFFERENT account is refused (`OwnerTaken`, 403) with **the row not saved**, and one naming nobody **keeps the owner** rather than orphaning the publication; `requireClaimable` refuses every field by name and accepts exactly ONE assurance (`unsigned-local`), because widening that set is what "the service now verifies claims" would MEAN. The suite found a real defect before landing: `Set.of(...).contains(null)` throws NPE instead of returning false, so a null assurance CRASHED rather than refusing — the null check now comes first and the case stays. Measured: `mvn -o test` **37/37** (21 existing + 16 new; the 4 new cases pin that a remix forks into an ownerless, anyone-may-takedown publication and records `_lineage`), BUILD SUCCESS. **Bounds:** a claim is forgeable by anyone who can call the API (the check is id equality, not identity — `assurance` says so on every answer); no accounts/sessions/tokens exist server-side and ADR 0018 stays Proposed; **the Studio now SENDS a claim on publish/unpublish** (v244: `publishDocument` attaches `OwnerClaim`, `unpublishProject` sends `?claimer=`, the route passes them through); the public gallery (`/explore`, v245) and the artifact page (`/p/{id}`, v246) show `by <handle> · <assurance>` and a clickable `remixed from <id>`; remix lineage is recorded by `service.remix` and read back (v245/v246). **Item 31 DONE — v244/v245/v246/v247 (Studio sends + displays the claim). The client half now also carries a current-device account module (`currentAccount.ts`, localStorage-persisted, `unsigned-local` assurance) and `publishLane`/`unpublish` accept optional `owner`/`claimer` so a real device account can be attached.** |


## Blocked / forthcoming increments (long-term cadence continues)

The M7 ownership core is landed (items 27/30/31). What remains is blocked on the ADR 0018 account
decision — there are no server-side accounts, sessions or tokens yet, and a `signedIn` badge would
violate §60. Once ADR 0018 merges (option A or B), the cadence resumes one verified increment at a
time, each with a gate, each recorded in the ADR 0016 ledger and here:

### Stage B — verified assurance (blocked: ADR 0018 Proposed, no server-side accounts)
- Widen `KNOWN_ASSURANCES` beyond `unsigned-local` to include `verified`, backed by a minimal
  server-side account/credential store. This is what "the service now verifies claims" means — it is
  a security decision, not a UI feature, so it lands only with the account decision.
- Studio shows a `verified` marker on /explore and /p/{id} when `assurance === 'verified'`.

### Stage C — M7 community surface (blocked: same account dependency)
- Profiles: an account's page and the publications it owns.
- Follow: follow / unfollow another account, and a following feed.
- Likes: like / unlike a publication, and a like count per row.
- Comments: comment on a publication (author can delete), shown under the artifact page.

### Stage D — M8–M10 (not yet scheduled)
- Creator economy, ops, external agents — per the milestones, untouched.

Rule carried from ADR 0016: one deep, verified increment at a time. No `signedIn` badge, no session,
no cookie, and no half-wired OAuth that produces a badge the service never validates.

## Guardrails (what "done" means here)

- Every feature lands with a runnable check: unit tests, a headless proof against the SHIPPED module,
  and (for product surfaces) a real-browser harness (ADR 0017).
- No fake implementations (§60): DEMO MODE is labeled, provenance is carried, and a surface never
  shows a size or an `<img>` that implies a model that is not attached.
- Regression is kept targeted: run the affected package/lane, not the whole monorepo, unless a change
  genuinely crosses boundaries.
- The ADR 0016 ledger is updated when a lane closes a bound; a bound is marked closed only after its
  proof is green.