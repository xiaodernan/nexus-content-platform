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

## Current honest status (2026-10-07)

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
  Still open: video generation, character consistency, asset update, and storyboard editing.
- **M4 — World Engine:** `@nexus/world-engine` (world/lore/character/location/faction + RAG + character
  agent) + agent doors (8) + product surface (`World` panel, v148). **Now a SIMULATION (v162):**
  `tickOnce()` + `executeAction`, two-sided relationship bonds with a decay floor, lossless save/load,
  a connected composition the panel steps (Step ×1/×5). Still open: real model behind the persona,
  factions/lore ticking, per-tick configuration, disk persistence.
- **M5 — Three.js Runtime:** `@nexus/three-runtime` scene graph/entities/cameras/lighting/animations +
  save/quest/combat/NPC type surface + document/op-log integration (v141+). Product surface (`3D`, v142),
  **now CONTROLLABLE (v161):** camera orbit (drag/wheel/reset) and add/remove body from the panel.
  **Now PERSISTENT (v163):** save/load through the runtime's own file format and 3D→document
  composition — authored bodies filed into the Design Document as one undoable `addSubtree`; agent
  doors 6 → 8 (`scene.save`/`scene.load`). **Now RELOAD-SAFE (v165/168/169/170):** the listing verb classifies
  refused names, the store itself answers `savePathRefusal`, the panel browses and loads a SELECTED
  save, and the backend is a namespaced localStorage store (`nexus-save:studio-scene`) — saves
  survive page reloads. Still open: pan + keyboard controls, per-body picker,
  lighting control, fs-backed persistence via a Node seam, unit coverage for the localStorage store.
- **M6–M10:** planned, not started (autonomous build, community, creator economy, ops, external agents).

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
| 9 | M7–M10 | Hosted publish + community; then creator economy, ops, external agents | Product-goal milestones; require `nexus-api` + real persistence |

## Guardrails (what "done" means here)

- Every feature lands with a runnable check: unit tests, a headless proof against the SHIPPED module,
  and (for product surfaces) a real-browser harness (ADR 0017).
- No fake implementations (§60): DEMO MODE is labeled, provenance is carried, and a surface never
  shows a size or an `<img>` that implies a model that is not attached.
- Regression is kept targeted: run the affected package/lane, not the whole monorepo, unless a change
  genuinely crosses boundaries.
- The ADR 0016 ledger is updated when a lane closes a bound; a bound is marked closed only after its
  proof is green.