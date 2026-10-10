# @nexus/three-runtime — evidence for v108 (host seams), v114 (character controller), v115 (the entity save format), v116 (the scene's physics world), v117 (the cinematic sequence), v118 (the save that reads it back), v119 (the file it survives on disk), v120 (the bytes, through a store), v121 (the id comes back), v122 (a save taken back), v123 (what it holds), v124 (written atomically), v125 (flushed when asked), v126 (the debris swept), v127 (a file asked what it is worth), v128 (the listing surveyed), v129 (the survey's reason becomes a field), v131 (the NPC record gets a body and a file), v134 (the world bag gets an owner), v135 (one refusal table, read per plane), v136 (the player record gets a body and a file), v137 (the player's declared numbers get operations), v138 (the COMBAT record gets a body, two operations, one death transition and a field audit), v139 (the package face stops being a hand-copied list), and v142 (the declared lights are ATTACHED, found by the surface that consumes the package)

_Numbering note: v138 was AUTHORED before v139 and landed after it. The v139 section below measures the
live worktree it was written in and says so in its own words ("v138's in-flight names are in those
bytes"), so the out-of-order landing is recorded rather than tidied away._

**v142 — the PRODUCT face, and the defect the first consumer found (amendment 142).** v140's section below
closes with the bound every M5 section after v108 writes: *"the PRODUCT face (a Studio surface, a HUD, a user
who can open it) is still open."* v142 closes it — `apps/studio` now depends on this package, and its
`src/components/Scene3D.tsx` mounts a real runtime on a real canvas — and the first thing a consumer that
looks at a scene instead of a config found was a defect in THIS package:

`createScene` built two `THREE.Light` objects through `createDefaultLighting`, stored them in
`LightingConfig.lights`, and **attached neither to the scene**. `lighting` was written once and read by
nothing. Every mesh this package creates is a `MeshStandardMaterial`, whose colour is a function of the
lights in its scene, so every scene from this runtime rendered **black** — and 362 green cases could not see
it, because each one asserted the CONFIG (`lights.length === 2`) rather than the SCENE. `createScene` now
attaches every `enabled` light to `threeScene` and stores that same `lighting` value; three new cases in
`test/threeRuntime.test.ts` assert the scene rather than the config — both declared lights are children,
each is retrievable by id, a second scene gets its OWN lights, and every non-light child of a fresh scene is
still a registered body (attaching lights moves the object count v140's proof records, so that boundary is
pinned). Package suite **362/362 → 364/364** across 7 files, `tsc -p tsconfig.json --noEmit` exit 0.

The measurement is repeated where a consumer can run it: `docs/evidence/studio/scene-surface-proof.mjs` §2
computes the package's own lighting term over the package's own light objects and gets
**1.316496580927726** with the lights attached versus **exactly 0** without them, with every body's
`emissive` black. The browser probe's screenshot shows four LIT boxes rather than a black frame. Bounds: the
surface composes DEMO-MODE geometry only (four default meshes, one camera, no assets), it does not reach
save/load, combat, physics, controllers or cinematics, and nothing it composes reaches the Studio's Design
Document.

**v140 — the FIRST CONSUMER (amendment 140).** Every section below ends with the same bound: *"nothing
outside `@nexus/three-runtime` imports it … the roadmap's M5 entry is still a runtime with tests, not a
feature a user can open."* v140 closes the **agent** half. `agents/runtime/src/sceneTools.ts` declares a
narrow `SceneDriver` and a `scene.*` tool family over it, and the host supplies this package behind that
seam — so the lane is consumed WITHOUT `agents/runtime` depending on `@nexus/three-runtime`, and the two
stay separable. The family composes and inspects; it does not render, and it has no door that could be
mistaken for a picture. Evidence lives in the agent lane: `agents/runtime/test/sceneTools.test.ts` (20
cases) and the runnable `docs/evidence/agents/scene-tools-proof.mjs`, which wires the REAL `ThreeRuntime`
behind the driver and cross-checks every tool answer against this package's own graph. The PRODUCT face (a
Studio surface, a HUD, a user who can open it) was still open at v140 — v142 is what closed it, above.

This directory records the 3D runtime lane (ROADMAP M5). Every claim here is read back out of the
shipped source and the package's own vitest suite — `packages/three-runtime/src/*.ts` and
`packages/three-runtime/test/*.test.ts` — not from a description of intent. The package is `@nexus/`
private, DEMO-MODE by construction, and depends on nothing but `three` (ADR 0016 amendment 108 granted
the two host seams; amendment 114 is the controller below).

## v108 — the two host seams that made the runtime runnable outside a browser

Before v108, `WebGLRenderer` and `requestAnimationFrame` were hard-wired into the constructor and the
frame loop, so 26 of 27 tests died at `initialize()` in Node and only the constructor passed. Two
injection points (`ThreeRuntimeOptions`) fixed that, both exported from `src/renderBackend.ts`:

- `RenderBackend` / `RenderBackendFactory` — `createWebGLBackend` is the production default;
  `createHeadlessBackend` records every `render(scene, camera)` call into `frames` with no GL object,
  and says so: `getRenderer()` returns `null` under it rather than handing back a fake one.
  `webglAvailable()` lets a caller pick honestly instead of learning the answer through a thrown
  constructor (it is `false` in Node — which is exactly why the suite injects a backend).
- `FrameScheduler` — `defaultFrameScheduler()` uses `requestAnimationFrame` when present and falls back
  to a timer; `manualFrameScheduler()` gives a test `step()` and `pending()` so the loop is steppable
  and `stop()` provably cancels the outstanding frame.

Verified in `packages/three-runtime/test/threeRuntime.test.ts`: 29 cases, `tsc -p tsconfig.json
--noEmit` clean.

## v114 — `CharacterController` is stepped by the frame loop, and names what it still ignores

`types.ts` declared `CharacterController` and `ControllerInput`, but `updateControllers` was a comment
saying "would go here" — the types were read by nothing. v114 makes the integrator real in
`packages/three-runtime/src/threeRuntime.ts`:

- A per-entity **registry** (`Map<EntityId, {controller, groundY}>`), because `groundY` is a world
  property and does not belong on the character's own object. Public surface: `attachController(scene,
  entity, options)` (throws naming a missing scene or entity, refuses a second controller on one entity,
  and DERIVES `grounded` from `position.y <= groundY` rather than assuming the entity is standing),
  `detachController`, `getController`, `setControllerInput`.
- `simulateFrame(delta)` advances animations / physics / controllers / cinematics with an explicit delta,
  and `animate()` now CALLS `simulateFrame` — so the wall-clock loop and a deterministic test run the
  same code; the only thing a test cannot control (the clock's delta) is out of the path it asserts on.
- Movement is plane-aware (`MOVEMENT_PLANE`): `firstPerson`/`thirdPerson` steer by the active camera's
  yaw on XZ, `topDown`/`custom` use world XZ, `sideScroll` lives in XY so its forward/backward keys have
  no axis to push against. Input is normalised BEFORE scaling, so a diagonal is not `sqrt(2)` faster than
  a cardinal direction; `airControl` scales horizontal intent while airborne.
- Gravity/jump/landing: a jump frame pays no gravity (it leaves with `jumpForce`); a mid-air jump is
  refused; landing clamps `position.y` to `groundY` exactly and re-grounds. The declared state machine
  (idle/walk/run/crouch/jump/fall) transitions one step per frame, while `type: 'custom'` keeps whatever
  state its owner wrote, so that literal stays reachable.
- Orphan handling: an entity removed from a scene drops its registry entry and emits
  `controllerOrphaned {entityId}`; `dispose()` clears the registry directly (a teardown is not a caller
  losing one live entity, so it emits no orphan event).

The controller suite is `packages/three-runtime/test/characterController.test.ts`: 39 cases, all driven
through `simulateFrame` with an exact `delta`. Package total: **68/68** vitest (29 + 39), `tsc` clean.
A behavioral control was run at the fix ref: removing the diagonal normalisation reddened exactly ONE
case (`a diagonal travels the SAME distance…`, 38 passed / 1 failed), proving the integrator is the live
path and not a parallel copy.

### What v114 still does NOT honor — stated by name

`controllerFieldAudit(entity)` derives its answer from `Object.keys` of the live controller against the
shipped field tables, so a field declared on the type with no implementation surfaces in `untouched`
automatically rather than being ignored in silence. Measured from the shipped code, a default
controller's `untouched` list is exactly `[slopeLimit, stepOffset]` — both need collision geometry this
package does not have (`scene.physics` / `PhysicsConfig` is still read by nothing). The suite pins that
this is not decoration: two controllers differing only in `slopeLimit`/`stepOffset` produce BYTE-IDENTICAL
30-frame trajectories, while the `speed` positive control does not.

Honest bounds, unchanged: `updatePhysics` and `updateCinematics` are still empty stubs; there is no
Studio surface driving this runtime; and the cinematic slice is not built. This record claims only the
controller and the two seams it stands on.

## v115 — the save format got a writer and a reader, and an audit of what it still cannot carry

`SerializedEntity`, `SerializedSceneGraph` and `SaveData` were declared in `types.ts` and constructed or
consumed by nothing: a save format nobody could write. v115 makes the **entity half** of it real and
refuses to pretend about the rest.

| what | measured |
| --- | --- |
| suite | `test/saveSnapshot.test.ts`, 42 cases; package total **110** (29 runtime + 39 controller + 42 save), `tsc` clean |
| writer | `snapshotEntity(sceneId, entity)` → a `SerializedEntity`: position/rotation/scale **cloned**, so moving the live entity after the snapshot does not move the saved number |
| reader | `restoreEntity(sceneId, snapshot)` → a NEW entity under the **saved id** (`SerializedEntity.id` is only worth storing if a load hands back the same address) |
| refusal | a restore onto a live id throws (`already in scene … a restore never overwrites live state`); an unknown scene throws naming both the scene and the entity |
| data rule | `userData` and each `EntityComponent.data` are checked before copying: a live `THREE.Vector3` is refused with its **path** (`userData.meta.tag`), an array element by index (`userData.list[1]`), a `Map` by class name, a function by kind |
| audit | `saveFeasibilityAudit(sceneId, entity)` → `{dropped, aliased, savable, blocked}` for a live entity; `undefined` when the entity is absent |

Two things the audit says that a passing test suite would not:

* `layers` is part of an entity's state, so `SerializedEntity` had to grow a `layers` field — and the
  alias claim for `threeObject` is checked against the record `snapshotEntity` actually builds. Patch the
  builder to forget `layers` and the audit answers `['layers', 'threeObject (layers not carried)']`
  instead of restoring channel 0 in silence.
* `SaveData` is **not** savable yet. `savable: ['entities']` against
  `blocked: [sceneGraph, npcs, quests, player, worldState, cinematic]`, each with the reason named
  (`NPCSystem`/`QuestSystem` are declared and implemented by nothing; `SerializedScene` stores a
  `LightingConfig` whose lights hold live `THREE.Light` objects). A whole-game save written today would be
  a file full of empty maps that opens as an empty world.

What v115 still does **not** do, stated by name: no geometry and no material are in the shape, so a
restored mesh is the default `BoxGeometry(1,1,1)` with a `MeshStandardMaterial` — a test measures both
vertex counts rather than asserting they differ in prose; nothing is serialised to JSON or to disk (the
snapshot is an in-memory `SerializedEntity`); the restored entity also fires `entityCreated`, because a
load really does add an object to the scene; and `SaveData`'s blocked six fields stay blocked.

The last section of the suite does not restate the production tables. It reads `src/types.ts` from disk
and requires that `snapshotEntity` produces **exactly** the fields `SerializedEntity` declares, that every
declared field of `ThreeEntity` is either carried or explicitly aliased, and that `savable ∪ blocked` is an
exact partition of the fields `SaveData` declares — so a shape that drifts from its writer is a red test,
not a save that quietly restores a default.

## v116 — the scene's declared physics gets readers: a validating world, a frame that runs the step size it was given, and an audit of what a world still cannot buy

`PhysicsConfig` declared five fields and `ThreeScene.physics` was an optional slot on every scene. Nothing read
either: `updatePhysics` was a comment saying it was a stub, and a character fell with `DEFAULT_CONTROLLER.gravity`
— a package-level constant no scene could change. v116 turns that into three readers in
`packages/three-runtime/src/threeRuntime.ts`.

| what | measured |
| --- | --- |
| suite | `test/scenePhysics.test.ts`, 30 cases; package total **140** (29 runtime + 39 controller + 42 save + 30 physics), `tsc` clean |
| setter | `setScenePhysics(sceneId, physics)` — refuses an unknown scene by name; refuses `gravity.y` unless `<= 0`, which is one guard that rejects BOTH an upward vector and a `NaN` (no defaulting); refuses horizontal components by name; requires `timeStep > 0` and an integer `maxSubSteps >= 1`. Returns the scene's **own** object, and stores a **clone** of the gravity vector |
| reader | `updatePhysics(delta)` is now the only reader of `scene.physics`. It pushes `-gravity.y` into every controller whose caller named no gravity (active scene only), then converts the frame into `min(floor(available/timeStep), maxSubSteps)` slices of `timeStep` and hands the array to `updateControllers` |
| bounds | the per-scene backlog is capped at `maxSubSteps * timeStep`, and what the cap refuses is reported as `droppedTime` rather than kept — an uncapped accumulator loses nothing until it spends a frame simulating ten seconds of world, which is a teleport with a nicer name |
| audit | `physicsFieldAudit(sceneId)` → `{declared, consulted, unhonored, effectiveGravity, stepping:{timeStep, maxSubSteps, lastFrame}}`; `undefined` for a scene that does not exist, and `stepping.lastFrame` is read per scene so an audit of a DORMANT world cannot answer with the active one's numbers |

Three things worth the sentence it costs:

* **A scene with no world takes the v114 path byte-for-byte.** `updatePhysics` returns `[delta]` when the active
  scene declares nothing, so it is one slice of the whole frame, exactly as before. The evidence for that is not a
  new test — it is the 39 controller cases from v114 still passing untouched, plus the case that names the default
  as the fallback.
* **The substepping claim is derived, not restated.** One frame of `1.0` in a `0.5`-step world must land where two
  frames of `0.5` land in a world-less scene: the test runs the same production integrator twice and compares the
  heights, so it stays true if the arithmetic in `advanceController` changes. Its control asserts the opposite
  direction — a substepped fall is SHORTER than one big slice of the same second — because "equal to two small
  steps" is only interesting if small steps differ from a big one.
* **v116 makes one v115 sentence stale, and the shipped audit was fixed rather than annotated.** `SerializedScene`
  carries `physics?: PhysicsConfig`, so the `sceneGraph` entry in `SAVE_DATA_FEASIBILITY.blocked` named only the
  live `THREE.Light` objects — true when v115 wrote it, incomplete the moment gravity gained a reader. It now
  names both live objects, and a case in this suite requires the reason to contain `THREE.Vector3` as well as
  `THREE.Light`. A hand-written reason string is the one part of an audit that cannot derive its own truth, so it
  gets a test instead of a comment.

### How the probe ran, and what it said

15 behavioral arms over the final source, each target string required to match exactly once in the file BEFORE
any test ran, against an unmutated control that collected **140 cases with 0 red**. Reds per arm, in order:
1, 1, 4, 3, 3, 2, 1, 2, 1, 2, 1, 2, 1, 1, 1 — no survivor, and no arm below the minimum written down for it
before measuring. Three arms reddened MORE than predicted (the sign flip reddened two substepping cases, the
ignored-slices arm one more than claimed, the thrown-away backlog arm one more), and the reason is the same in
all three: a case that compares a world-driven fall against a run where the controller declares its own gravity
is coupled to the sign convention and the step plan at once. Under-predicting the coupling in my own tests is a
reading error, so it is recorded rather than counted as a win. The fifteenth arm is not a physics arm at all: it
restores v115's shorter `sceneGraph` refusal sentence, which is the edit this section describes above.

### What v116 still does NOT honor — stated by name

`broadphase` and `solverIterations` stay in `unhonored`, each with a reason that is a sentence rather than the
field's own name: a broadphase is a search over candidate contact pairs and this package has no collision geometry
to search among, and solver iterations count passes over existing contacts while a character is held up by the
`groundY` plane, not by a solver. `slopeLimit`/`stepOffset` (v114's confession) wait on the same missing geometry.
The no-declared-world path still has no `timeStep`, so a scene without a world keeps variable-step integration —
fixed stepping is a property of a declared world, not of the runtime. And **the world is read for the ACTIVE scene
only**: a dormant scene's gravity does not push anything, and its characters do not move.

### Two sentences this record retires

Both are left in place where they were written — shared documents are append-only — and both are quoted here so
a reader who stops at the earlier sections is not misled:

* v114, "What v114 still does NOT honor": *"`scene.physics` / `PhysicsConfig` is still read by nothing"*. Since v116
  `setScenePhysics`, `updatePhysics`, `worldGravityFor` and `physicsFieldAudit` all read it.
* v114, "Honest bounds": *"…`updatePhysics` and `updateCinematics` are still empty stubs"*. `updatePhysics` is now a
  subsystem; `updateCinematics` is still a stub, and `SaveData.cinematic` stays blocked for that reason.

## v117 — the cinematic sequence gets a player: a timeline that refuses what this renderer cannot show, a camera that actually moves, and the first writer `SerializedCinematic` ever had

`CinematicSequence` and `CinematicShot` were declared at `types.ts:125` and `types.ts:134`, `SerializedCinematic`
at `types.ts:488`, and `updateCinematics` was the last comment-shaped hole inside `simulateFrame`. Amendment 116's
`Next:` named it, so this is a promise being paid. The subsystem now lives in
`packages/three-runtime/src/threeRuntime.ts` as five surfaces: `defineCinematic`, `playCinematic`/`stopCinematic`,
`updateCinematics`, `cinematicSnapshot` and `cinematicFieldAudit`.

| what | measured |
| --- | --- |
| suite | `test/cinematicSequence.test.ts`, 39 cases; package total **179** (39 controller + 42 save + 30 physics + 29 runtime + 39 cinematic), `tsc --noEmit` exit 0 |
| registrar | `defineCinematic(sceneId, input)` — **14 refusals**, each naming the number or name it was given: unknown scene, duplicate id (there is no unregister), no shots, first shot not opening at 0, a shot starting at or before its predecessor's end, a shot not ending after it starts, a camera that is not in THAT scene, a transition that is not `'cut'`, a non-zero `transitionDuration`, `"fov"` animated on an orthographic camera, an fov outside `(0, 180)` or non-finite, an easing name not in `CINEMATIC_EASINGS` (the message lists the keys of that table, so the list cannot go stale in prose), a path whose `getLength()` is not > 0, and a declared `duration` that disagrees with the one the shots produce |
| derivation | `duration` is `max(shot.endTime)`. A caller who names a different number is refused rather than believed: the field the type declares and the shots that fill it are one fact, and two owners of it is exactly the shape of the bug this lane keeps relearning |
| player | `playCinematic(id)` throws for an unregistered id and for a sequence whose scene is not active, and answers `false` when the single active slot is taken — because `SerializedCinematic.activeSequence` is ONE id, so a runtime able to play two at once would have nothing honest to put there. Replaying a FINISHED sequence rewinds it; `stopCinematic(id)` does not, because a stop is someone interrupting a cutscene, not a request to watch it again |
| frame | `updateCinematics(delta)` advances `min(time + delta, duration)`, cuts when the shot INDEX changes (event + `setActiveCamera` + the declared `currentShot`), samples `cameraPath`/`targetPath` with `getPointAt` so the shot's window says WHEN and the curve's arc length says HOW FAST, eases `fovAnimation` onto a `PerspectiveCamera`, and at the end stops playing and emits `cinematicFinished`. Six events in total: defined, played, stopped, shotChanged, finished, interrupted |
| scoping | when the sequence's scene stops being the active one the playhead is stopped and `cinematicInterrupted` names the reason, but the position is KEPT — a shot's `cameraId` addresses one scene's camera set, and a dormant scene is not being drawn |
| save shape | `cinematicSnapshot()` is the first writer the declared `SerializedCinematic` has ever had, and it fills all three fields from the registry: `sequences` from the map, `activeSequence`/`currentTime` from `playingCinematic()`, which is DERIVED from `sequence.playing` rather than stored beside it |
| audit | `cinematicFieldAudit(id)` → `{consulted, unhonored, sequenceRead, sequenceWritten, playhead}`; `undefined` for an unregistered id, and `playhead` carries both the declared `currentShot` and the audit's own `shotId`/`cameraId`/`blockedBy`, because `currentShot: 0` cannot say "nothing has been shown yet" |

Three things worth the sentence it costs.

* **The refusals are read off the renderer, not off taste.** A `'fade'` is a blend of two rendered images and this
  runtime draws one active camera per frame, so `defineCinematic` refuses the word rather than renaming a cut; and
  `transitionDuration` must be 0 because after that refusal there is no interval left for the number to control.
  An audit that says a field is "unhonored" while the player silently accepts it is describing a lie in the
  timeline; refusing at registration is what makes the audit's sentence true.
* **`getPointAt`, not `getPoint`.** A shot's window is in seconds, and a caller who adds control points unevenly
  should not find the camera crawling near a dense cluster of them; `getPointAt` samples by arc length, so the
  move is even in the one unit the shot declares. This is also why a path with no arc is refused at define time —
  the call divides by it.
* **A stale sentence inside a shipped audit was repaired in the code, and then pinned.** `SAVE_DATA_FEASIBILITY`
  (v115) kept `cinematic` blocked with the reason "`updateCinematics` is an empty stub, so there is no sequence
  state to save". v117 made that false, and the row is now blocked for the reason that is still true: the
  `sequences` map `cinematicSnapshot()` fills holds LIVE `CinematicSequence` objects whose shots carry
  `THREE.CatmullRomCurve3` paths, and nothing here rebuilds a curve from stored points. A hand-written reason
  string is the one part of an audit that cannot derive its own truth, so it got a test requiring the row to name
  `THREE.CatmullRomCurve3` AND to not read like an empty stub, plus a probe arm that restores the v116 wording.

### How the probe ran, and what it said

The probe is `mutate-v117.mjs (scratch)`: 27 arms, each anchor required to match the shipped source exactly once before its
run, each arm's minimum red written down before measuring, the pristine source restored in a `finally`. Controls:
the two-file plane collected **81** with 0 red, and the whole package collected **179** with 0 red and
`tsc --noEmit` exited 0. Reds per arm, in order: 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 10, 3, 1, 1, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1. No arm survived. One arm reddened MORE than written down for it: `14-end-clamp-never-reached` was credited 2 and reddened 3. The third red is `updateCinematics — the playhead, the cut, and where the camera ends up keeps the playhead when stopped, and rewinds only a finished sequence on replay` — its title is about stopping and rewinding, and its BODY asserts that the playhead lands exactly on `duration`, so the clamp is one of its assertions too. I predicted from the case's name instead of reading its assertions, which is the error amendment 116 recorded for the same reason. Two harness
refusals came first, and they belong in the record rather than in a footnote: `spawnSync('npx', …)` cannot exec a
Windows `.cmd` without a shell, and the vitest banner spells its summary line two different ways, so the banner
parser was replaced by the JSON reporter — which additionally refuses any arm that does not collect the control's
full 81, turning a mutant that crashes at import into a REFUSED measurement instead of a fake "caught".

### What v117 still does NOT honor — stated by name

* `transition` (anything but `'cut'`), `transitionDuration` (anything but 0) and `postProcessing` are in
  `unhonored` with a reason each, and each is refused at registration — the declared words remain in the type so a
  future compositor can fill them in, not because anything here interprets them.
* `SerializedCinematic` has a writer and **no reader**. There is no `restoreCinematic`: the missing piece is
  rebuilding a `CatmullRomCurve3` from stored points, and until that exists `SaveData.cinematic` stays in `blocked`
  — with six blocked fields, exactly as before v117.
* Playback drives a CAMERA and nothing else. A sequence moves no character, plays no audio, and cannot change a
  material; `postProcessing` is the declared name for that gap.
* One sequence at a time, one scene per sequence, no unregistering, and four easings (`linear`, `easeIn`,
  `easeOut`, `easeInOut`) — anything else is refused by name rather than approximated.
* An orthographic camera cannot be fov-animated, and a `fovAnimation` on one is refused; a `fov` value outside
  `(0, 180)` would make `updateProjectionMatrix` build a degenerate matrix, so it never reaches a camera.
* There is no Studio surface for any of this: the sequence is authored by code, as it was in v108-v116.

### One measurement error worth keeping in the record

While the probe was mid-run I opened `threeRuntime.ts` to quote it and read `activeSequence: null,` in
`cinematicSnapshot` — a one-line lie about the playhead, and I began writing that up as a defect. It was arm 22
(`activeSequence-always-null`) being applied to disk at the moment I read the file. The suite was green on the real
source, and the same line read AFTER the run says `playing?.sequence.id ?? null`. The lesson is the one this lane
keeps paying for in a new costume: a measurement taken off the plane it describes is not a measurement, and a probe
that mutates tracked files makes every concurrent read part of its plane. Re-read after the run.

### Sentences this record retires

Left in place where they were written (shared documents are append-only), quoted so a reader who stops earlier is
not misled:

* v114, "Honest bounds": *"…`updatePhysics` and `updateCinematics` are still empty stubs"*. v116 made the first
  false; v117 makes the second false, so the whole sentence is now retired.
* v116, "What v116 still does NOT honor": *"…`updateCinematics` is still an empty stub, and `SaveData.cinematic`
  stays blocked for that reason"*. The blocker is real but the reason moved: it is the live curves, not the stub.
  That is the sentence probe arm 27 exists to redden.
* ROADMAP M5, honest bounds: *"`updateCinematics` is still an empty stub"* and *"the cinematic slice is not
  built"*. Both were swapped in the same edit that added this section. The slice now has a runtime player and no
  authored-content surface, which is what the cell says instead.
## v118 — the cinematic save shape gets a reader: a curve that round-trips through points, a snapshot that stopped aliasing the running game, and a guard that had to be rewritten because it could not see methods

Amendment 117's `Next:` named three `SaveData` fields still waiting on a system, and one field — `cinematic` —
waiting only on a reader. v118 is that reader. The codec lives in `packages/three-runtime/src/threeRuntime.ts`
as five module functions (`curveToData`, `curveFromData`, `shotToData`, `shotFromData`, `savedSequences`) and
one method (`restoreCinematic`), and it turned `SerializedCinematic` from a shape with a writer into a shape
with both directions — which moved a field out of `SAVE_DATA_FEASIBILITY.blocked` for the first time since v115
wrote that table.

| what | measured |
| --- | --- |
| suite | `test/cinematicSequence.test.ts`, 74 cases; package total **214** (74 cinematic + 39 controller + 42 save + 30 physics + 29 runtime), `tsc --noEmit` exit 0 |
| declared shape | `types.ts` gains `SerializedCurve` (points + `closed` + `curveType` + `tension`), `SerializedCinematicShot` and `SerializedCinematicSequence`, and `SerializedCinematic.sequences` is re-pointed at the serialized record instead of at the live `CinematicSequence` |
| writer | `cinematicSnapshot()` now builds a new record per sequence with cloned point arrays. **5** refusals on the way OUT, each naming the value it found — because `defineCinematic` copies the shot ARRAY but not the shot OBJECTS, so `shot.startTime = NaN` after registration is reachable from outside, and a snapshot that wrote it would be a save its own reader refuses |
| reader | `restoreCinematic(snapshot)` → `{restored, activeSequence, playheads}`. **27** refusals naming the value, and only three of them are new rules: the shape's self-agreement (`activeSequence` vs the `playing` set, map key vs the record's own `id`), the playhead's bounds, and the resumed `playing` being handed to `playCinematic`. Every timeline question goes through `defineCinematic`, including the saved `duration`, which is passed through as a claim to be checked rather than believed |
| codec | 33-arm probe below; the curve's four fields are carried because three.js reads them. Measured on the path the fidelity cases use: changing `curveType` in a save moves the sampled camera by 0.0289 world units and changing `tension` by 0.0029 world units — on a near-straight path the same two edits move it by nothing, which is the trap the first control case fell into |
| one door corrected | v117's `defineCinematic` claimed it refused "a zero-length path". Measured: `getLength()` on a curve with one control point does not return 0, it throws `TypeError: Cannot read properties of undefined (reading 'x')` from inside three.js — so the door CRASHED on the input it said it was refusing. v118 asks the control-point count BEFORE the length, and the refusal now names the path and how many points it has |
| scene | `SerializedCinematicSequence.sceneId`, declared because a reader needed it. A shot's `cameraId` addresses one scene's camera set; the live type keeps that fact on the registry entry, and the save shape had nowhere to put it — the same class of hole `SerializedEntity.layers` was in v115 |
| camera naming | `createCamera(sceneId, name, type, params, id?)`. Without it a saved cinematic could only ever be read by the process that wrote it: ids were invented per call, and the door refuses a shot naming a camera the scene lacks. `createScene(name, id?)` has taken a name since v108 |
| all or nothing | a failed restore deletes every sequence it had registered before rethrowing, with the count in the message — and the message also says the rollback cannot reach the event log, because `cinematicDefined` already fired |
| table | `SAVE_DATA_FEASIBILITY.savable` is `['entities', 'cinematic']`, and `blocked` is five rows. `SaveData.cinematic` is the first field to leave `blocked` because of work in this lane |

Three things worth the sentence it costs.

* **A snapshot that aliases the game is not a snapshot.** v117's `cinematicSnapshot` filled its Map with the
  live `CinematicSequence` objects, and the suite *pinned* that: `expect(snapshot.sequences.get('seq')).toBe(
  runtime.cinematicSnapshot().sequences.get('seq'))` — identity, twice. v118 asserts the opposite in both
  halves (deep-equal across calls, never the same object) and adds the observable that makes it matter: take a
  snapshot, stop the sequence, and the snapshot still says `playing: true`.
* **The refusals are partitioned by what the alternative would be.** The codec refuses the inputs that would
  CRASH the player — a shot that is not an object, one control point, a `curveType` three.js answers with NaN
  coordinates, a truthy `closed` — and `defineCinematic` keeps every decision it already owned: windows,
  overlaps, cameras, transitions, easings, arcs, and the derived `duration`. A save whose `duration` was edited
  to 99 is refused in `defineCinematic`'s own words, printing 99 and 2, because the reader passes the number
  through instead of reading a second rule into itself.
* **The `blocked` list can no longer sit still beside a shipped implementation — and the guard that claimed it
  could not see one.** `saveSnapshot.test.ts` had a case named "nothing in the package's exported surface yet
  implements a blocked half", whose comment promised "the `blocked` list cannot go stale by an implementation
  shipping and the table staying put". It compared `Object.keys(publicSurface)` — module-level exports — while
  every implementation in this package is a method on `ThreeRuntime`. v117's `cinematicSnapshot` and v118's
  `restoreCinematic` both sailed through it. The rewritten case reads the prototype, keeps the two verbs the
  entity pair uses (`snapshot`/`restore`) as the only thing that counts as implementing a half, and requires a
  `savable` field to have BOTH a writer and a reader while a `blocked` field has neither — so the table and the
  surface are now checked against each other in both directions.

### How the probe ran, and what it said

The probe is `mutate-v118.mjs (scratch)`: 33 arms, each anchor required to match the shipped source exactly once
before any run (a separate `--anchors` pass does that check in milliseconds, so a mistyped anchor is a load-time
refusal rather than a silent no-op), each arm's minimum red written down before measuring, and the pristine
source restored in a `finally` — the run ended with `restored the target byte-exactly: true`. Controls: the
two-file plane collected **116** with 0 red, the whole package **214** with 0 red, and
`tsc --noEmit` exited 0 — where the last line needs its plane stated, because this package's tsconfig
`include`s `src/**/*` and `exclude`s `test`, so the typecheck gate covers the shipped source only and the test
file is type-checked by nothing but vitest running. Reds per arm, in order: 20, 9, 1, 5, 3, 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 8, 1, 2, 3, 1, 8, 8, 1, 3, 4, 1. No arm survived.
No arm reddened fewer than claimed. 12 of the 33 arms reddened MORE than written down for them (01-snapshot-aliases-live-sequences: 4→20, 02-shot-objects-aliased-into-save: 2→9, 04-writer-hardcodes-curveType: 3→5, 05-writer-hardcodes-tension: 1→3, 06-writer-hardcodes-closed: 1→2, 13-reader-accepts-one-control-point: 1→2, 23-restore-skips-playhead: 3→8, 25-restore-writes-playing-directly: 1→2, 26-restore-does-not-rollback: 2→3, 28-snapshot-currenttime-always-zero: 3→8, 29-snapshot-active-always-null: 3→8, 32-table-claims-npcs: 3→4). The over-predictions are one failure wearing many costumes: I predicted the
assertion that names the mutated clause and not the cases downstream that consume its output. Restoring v117's
aliasing in `cinematicSnapshot` is the extreme: I credited it four and it reddened the whole reader, because
every `restoreCinematic` success case in the file consumes the shape that clause writes. Hardcoding `tension`
reddened the geometry cases as well as the field case; dropping the "fewer than two control points" refusal
reddened the rollback case too, since a second sequence that used to fail now registers.
A reader's clauses have more consumers than a writer's, and that is what the over-predictions measured. The
first draft of this harness never ran at all: the anchors were written inside JavaScript template literals, so
the `${id}` inside a quoted production line was interpolation, and the script died at load with
`ReferenceError: id is not defined` — a crash in my own quoting, one edit short of looking like a mutation that
found nothing. The last two arms are not codec arms. `31-table-leaves-cinematic-behind` restores the `savable`
list as v117 wrote it, which is the edit this grant makes, and reddens three cases: the cinematic suite's own
table-row case, `saveSnapshot`'s savable-vs-blocked list, and the gate that requires the two halves to partition
the fields `SaveData` declares. `32-table-claims-npcs` adds a fourth — the guard that reads
`ThreeRuntime.prototype` — because a field declared savable with no writer AND no reader named after it is the
other half of the same promise.

### What v118 still does NOT honor — stated by name

* `SaveData` as a whole is still not a file. `postProcessing` stays uninterpreted, `transition` stays `'cut'`,
  `transitionDuration` stays 0, and `npcs`/`quests`/`player`/`worldState`/`sceneGraph` are still blocked on
  systems that do not exist. Nothing here writes a `SaveData` end to end.
* The envelope is a `Map`, and `JSON.stringify` writes a Map as `{}`. `restoreCinematic` refuses that rather
  than reporting a successful restore of nothing, so the values inside the cinematic shape survive disk and the
  container still does not — a codec for the container is a separate piece of work.
* One playhead for the whole shape. `currentTime` belongs to whichever sequence is active, so a STOPPED
  sequence resumes at the start of the shot its `currentShot` names, not where its playhead stood. v117's
  stop-keeps-position behavior is real at runtime and unrepresentable in the declared shape; `playheads` prints
  where each one landed instead of hiding it.
* `restoreCinematic` rolls the registry back, not the event log: a listener was told about the sequences that
  landed before the failure, and no rollback says so afterwards.
* A save cannot create a camera. It names ids, and `createCamera(…, id)` lets a caller re-issue them — but a
  runtime that has since made its cameras some other way has no way to be told, so a drifted save is refused by
  `defineCinematic` ("not in scene"), which is the honest answer and not a helpful one.
* There is still no Studio surface: a sequence is authored by code, as it was in v108-v117.

### Measurement errors, kept in the record

Four of them, all of the same family — a number that meant something other than what I took it for.

* **A v117 test went accidentally green.** Four assertions broke when the snapshot stopped aliasing, and the
  runner reported exactly those four reds. A fifth had been reading live state through the snapshot —
  `sequence.playing` after a finish — and now passed because it was reading a frozen copy of a value that had
  been false when the copy was made. The suite could not tell me; only reading the case did.
* **The probe harness died at load, not at measurement.** Its anchors are quoted bytes of production code, and
  I wrote them inside JavaScript template literals, so the `\`…${id}…\`` in a quoted line was INTERPOLATION and
  the script threw `ReferenceError: id is not defined` before touching a file. The anchor list now builds by
  concatenation and a `--anchors` pass checks every one matches exactly once before any vitest run.
* **The round trip's control case was measuring a camera nobody moved.** It edits `curveType` in the save and
  expects the camera to land elsewhere; the first draft left the save with `activeSequence: null`, so the
  restored sequence was never playing, no frame placed a camera, and `toBeGreaterThan(0.001)` was satisfied by a
  camera still at its origin. What caught it was the out-of-band script written to supply the prose's numbers:
  asked to confirm that two curve types differ by more than 0.001 on the points the suite uses, it refused with
  8.881784197001252e-16. Both measurements are right — `getPointAt` re-maps its parameter through the curve's own
  arc-length table, so two schemes sampled at the same ARC fraction on a near-straight path land nearly together
  — and the fix was a path that turns plus a restore that is actually playing. The case now asserts not "some
  different number" but "exactly where an honest curve of the other word is", to the last bit.
* **A curve mutated after registration is a different curve, and how different depends on the path.** Assigning
  `curveType` after `defineCinematic` has called `getLength()` leaves the live object sampling through a table
  computed under the word it no longer carries; three.js does not set `needsUpdate` on assignment. Measured
  against an honest curve of the new word, the gap is 3.768222e-15 world units on the straight path and 0.0214 world units on
  a turning one. So the codec's promise is "rebuilds the curve the save describes", not "reproduces whatever the
  live object was doing" — and the fidelity case is written on a curve that was honest from the start, where the
  two are bit-identical.
* **The §7 title count is derived, not guessed.** v117 predicted two title lines for its newest grant and the
  door measured three; the third was the subheading `### What v117 still does NOT honor`, because the gate reads
  ANY `#{1,6} ` line in a `.md` as a title. This cycle the rule was read out of
  `docs/evidence/agents/table-recount-proof.mjs:344` first, and the prediction says three for the same reason.

### Sentences this record retires

Left in place where they were written (shared documents are append-only), quoted so a reader who stops earlier
is not misled:

* v117, "What v117 still does NOT honor": *"`SerializedCinematic` has a writer and **no reader**. There is no
  `restoreCinematic`… until that exists `SaveData.cinematic` stays in `blocked` — with six blocked fields,
  exactly as before v117."* The reader exists, and the count is five.
* v117's ADR grant: *"the honest summary of v117 is that the declared save type has a writer and still has no
  reader."* Retired by v118; the other half of that sentence — that the writer aliased live objects — is retired
  with it.
* ROADMAP M5, honest bounds: *"…`SerializedCinematic` has a writer and still has no reader…"* and *"…and
  `SaveData`'s six blocked fields stay blocked."* Both were swapped by the edit that added this section — the
  first because `restoreCinematic` exists, the second because `cinematic` is no longer one of the rows. What the
  cell says instead is that the shape round-trips, that its `Map` envelope is still not JSON-safe, and that five
  fields stay blocked on systems rather than on readers.
* v117's `defineCinematic` docstring: *"…and a zero-length path (an arc parameter divided by the arc it does not
  have)."* True as a claim about arcs, false as a claim about the door: a one-point path never reached the length
  test, because asking it for a length throws inside three.js. Corrected in the shipped comment and pinned by a
  test that requires the refusal to name the control-point count.
* `saveSnapshot.test.ts`, the guard's comment: *"Narrow but real: this proves the PUBLIC surface has no
  NPC/quest/player/cinematic implementation."* It proved no such thing for methods; the rewritten case says what
  it reads.
* ROADMAP M5, honest bounds: *"`SerializedCinematic` has a writer since v117 and still no reader"*. Swapped in
  the same edit that added this section. What the cell says instead is that the cinematic shape round-trips and
  the remaining blocked halves are waiting on systems.

Next: the same question v117 and v118 answered for `cinematic` is still open for the four `SaveData` fields
whose blocker is a missing SYSTEM rather than a missing reader — `npcs`, `quests`, `player`, `worldState` are
declared in `types.ts` and implemented by nothing. The cheap adjacent hole is the `Map` envelope: one
`encodeSaveData`/`decodeSaveData` pair over `SaveData` would make `savable` mean "survives a disk" instead of
"survives a process", and the two directions have exactly one honest shape each — Maps to arrays of entries and
back. And `slopeLimit`/`stepOffset`/`broadphase`/`solverIterations` still wait on collision geometry.
## v119 — the save becomes a FILE: every `Map` and every live `THREE` object leaves the save shape, the entity transform becomes data, and the loader refuses a field it cannot read instead of loading a smaller game

v118 gave the cinematic shape a reader and left one sentence standing: `savable`. This grant went and read
what that word had been promising, and it had been promising too little. Measured at `4496b22`, with the code
as it shipped: `snapshotEntity` → `JSON.stringify` → `JSON.parse` → `restoreEntity` threw
`TypeError: snapshot.components is not iterable`, because `SerializedEntity.components` was a `Map` and a
`Map` is written by JSON as `{}`; and `rotation`, declared as a live `THREE.Euler`, arrived as
`_x/_y/_z/_order/isEuler` — the private fields — which `Euler.copy` reads as `x: undefined`. Nothing in the
runtime could see either failure, because nothing had ever tried to write a save to a disk and read it back.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 56 cases, `test/cinematicSequence.test.ts` 74, package total **228** (56 save + 39 controller + 74 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` (the package's tsconfig excludes `test/`, so the test file is typed by nothing but vitest running) |
| the rule | nothing reachable from `SaveFile` is a `Map` or a live object: `SerializedEntity.position`/`scale` → `SerializedVector3`, `rotation` → `SerializedEuler` (**order included**, because three.js composes a quaternion from it), `components` → `[name, component][]`, `SaveData.entities` and `SerializedCinematic.sequences` → arrays of `[key, value]` pairs |
| the shape gate | a test walks the type closure from `SaveFile` through `types.ts` — following every interface a field annotation names — and requires no `: Map<` and no `THREE.` anywhere in it. The closure is computed, so a new field whose type drags in a live object reddens the gate rather than joining the shape quietly |
| the file | `buildSaveFile(sceneId, savedAt)` → `{format, version, savedAt, carries, doesNotCarry, entities, cinematic}`. `carries` is read out of `SAVE_DATA_FEASIBILITY.savable` and `doesNotCarry` out of its blocked rows, so the file states which halves it omits and why — the audit table and the file cannot drift apart |
| the loader | `loadSaveFile(file, sceneId)` → `{sceneId, entities, sequences, carries}`. **44** reader refusals now, each naming the value found: unknown format or version (both problems printed at once), a `carries` entry the runtime cannot fill, a field named as both carried and withheld, content under any blocked name, a `Map`/class instance/`NaN` anywhere inside (path named), a pair whose key disagrees with the record's own id, a target scene that does not exist, a live entity id |
| atomicity | the entity ids are pre-checked before anything is written; entity inserts are rolled back by removing what this call added; `restoreCinematic` rolls back its own registry. What no rollback reaches is the event log and the sequences that landed before an entity failure — the message says so, because this runtime still cannot unregister a sequence |
| the writer | `assertDiskSafe` runs over the finished file too, so a value no per-record writer checks (a live `layers` number set to `NaN`) is refused at the file, naming `file.entities[0][1].layers` |
| the record | `saveFeasibilityAudit`'s own docstring used to say the declared `SaveData` asks for "a cinematic state the runtime does not implement… a file full of empty maps". Both halves of that are now false, and a test reads the shipped comment and says so |

Three things worth the sentence it costs.

* **A loader that ignores a field it cannot read is a loader that deletes content.** The five blocked halves are
  not silently absent from a file — they are named in `doesNotCarry` — and a file that arrives with content
  under any of those names is refused with the field printed. `"npcs": [["npc-1", {}]]` in a save is not
  something to load and forget.
* **The Euler was the loudest bug, and the quietest.** A `Map` fails loudly (`not iterable`). A rotation
  flattened into `_x/_y/_z` fails silently: the restore succeeds, the entity exists, and it points at
  nothing. That is why the shape now names the four values a pose actually has, why
  `eulerFromData` refuses an order outside `EULER_ORDERS` rather than letting three.js keep the previous
  composition, and why the case asserts a `YXZ` save and an `XYZ` save produce **different quaternions** —
  if the order were decoration, that control would be indistinguishable.
* **One rule, no exemptions.** `savable` says a field survives a disk trip, and the fields that do not are in
  `blocked`, where the runtime writes nothing. The disk-safety claim is therefore not a hand-written list of
  "fields we remember to check": the gate reads `SAVE_DATA_FEASIBILITY` for its population, and the closure
  gate reads `types.ts` for its shape.

### How the probe ran, and what it said

The probe is `mutate-v119.mjs (scratch)`: 23 arms, each anchor required to match the shipped source exactly once
before any run (a `--anchors` pass checks that in milliseconds, so a mistyped anchor is a load-time refusal
rather than a silent no-op — one arm's two-line anchor did not match the shipped indentation and the whole run
was refused before it produced a number), each arm's minimum red written down in the script before measuring,
and the pristine source restored in a `finally` (`restored the target byte-exactly: true`). Controls: the
two-file plane collected **130** with 0 red, the whole package **228** with 0 red, and
`tsc --noEmit` exited 0 over `src`. Reds per arm, in order: 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5, 1, 1, 10. No arm survived.
No arm reddened fewer than claimed. 2 of the 23 arms reddened MORE than written down for them (21-producer-invents-a-carried-field: 1→5, 24-table-claims-npcs-savable: 2→10).

This cycle's probe earned its keep on the first run and not the second. Arm
`02-loader-accepts-a-non-array-envelope` — delete the check that a save's `sequences` is an array at all —
**survived the entire plane**: the reader's other branch is a `Map` refusal and its happy path is an array, so
nothing in the suite ever handed it a string, and with the check gone the `for…of` would have thrown a
`TypeError` instead of refusing. That is the same class of hole this lane keeps finding from the other
direction: not a wrong assertion, an absent one. The case was added (one `expect`, a string and the message it
must produce), the arm was re-run, and it now reddens like its neighbours. Every other arm was caught by
exactly one case or by more than it was credited; the two that reddened most were the producer inventing a
`carried` field and the audit table claiming `npcs` is savable, both because a `SaveFile`'s `carries` list is
read by the loader, the table's own gates and the file cases at once. The pattern behind the over-predictions
is v118's, unchanged: I predict the assertion that names the mutated clause, and the cases downstream that
consume its output are the ones that actually redden.

### What v119 still does NOT honor — stated by name

* A `SaveFile` is a value, not a file: nothing here writes bytes. What v119 made true is that
  `JSON.stringify(buildSaveFile(...))` can be parsed and loaded, which is the property a writer needs before
  it exists.
* Entities are saved per scene and restored into a scene the caller names, because `SerializedEntity` carries
  no scene id — that address belongs to `SaveData.sceneGraph`, which is still blocked. Sequences do carry
  their scene (v118), which is why the two halves are addressed differently.
* Rollback is per half. A load whose entity pass fails after the cinematic pass leaves the sequences
  registered, and the message says that out loud: there is still no unregister.
* `npcs`, `quests`, `player`, `worldState` and `sceneGraph` stay blocked on systems that do not exist. Five
  rows, unchanged since v118 moved `cinematic` out.
* `postProcessing` is still uninterpreted, `transition` is still only `'cut'`, and there is still no Studio
  surface for any of it.

### Measurement errors, kept in the record

* **A mutation survived, and it was the suite's fault, not the code's.** The first run's arm
  `02-loader-accepts-a-non-array-envelope` deleted the check that a save's `sequences` is an array at all and
  reddened nothing: the reader's other branch refuses a `Map`, its happy path takes an array, and no case had
  ever handed it a string. With the check gone a `for…of` would have thrown a `TypeError` rather than
  refusing, and the suite could not tell. One `expect` later the arm reddens like its neighbours. The hole was
  not a wrong assertion but an absent one, which is the harder kind to see from a green run.
* The probe harness's first draft carried an arm whose two-line anchor did not match the shipped
  indentation — the `--anchors` gate refused the run before it produced a number, which is the only reason a
  mistyped anchor cannot become a fake "caught".
* One new case initially asserted `rotation.quaternion.z` on a bare `THREE.Euler`, which is `undefined`
  unless the Euler is wired to an `Object3D`. The assertion was about the right mechanism and the wrong
  object; it now composes a `Quaternion.setFromEuler` of each pose.
* Two test regexes were written against messages I had intended rather than shipped
  (`layers: NaN` vs `layers holds NaN`, `which is the shape a file writes as {}` vs `which JSON.stringify
  writes as {}`). Both were fixed on the test side except the second, where the shipped sentence was the
  weaker one and got rewritten.

### Sentences this record retires

* v115's shipped comment on `saveFeasibilityAudit`: *"…the declared `SaveData` asks for npcs, quests, a player
  and a cinematic state the runtime does not implement, so a whole-game save written today would be a file full
  of empty maps."* A test now reads that docstring and refuses both halves of the sentence.
* v118's "What v118 still does NOT honor": *"The envelope is a `Map`, and `JSON.stringify` writes a Map as
  `{}`… the values inside the cinematic shape survive disk and the container still does not."* The container
  was changed instead of the reader being loosened.
* v118's declared `SerializedEntity`: `position: THREE.Vector3`, `rotation: THREE.Euler`,
  `components: Map<string, EntityComponent>` — the three fields this cycle found were never file-safe, and
  `saveSnapshot.test.ts` had been *requiring* them to be live objects (`toBeInstanceOf(THREE.Vector3)`). That
  assertion is retired and inverted in place, with the reason in its comment.
* ROADMAP M5, honest bounds: *"a save is still in-memory only — no disk…"*. Swapped in the edit that added this
  section; the cell now says a save file survives JSON and that five fields stay blocked on systems.

Next: the file has an author and a reader but no writer of bytes — a `writeSaveFile`/`readSaveFile` pair over
an injected `FsWriteLike` (the pattern the M2 lane already uses) is the smallest unit that makes "save game"
a feature rather than a value. Then the four `SaveData` fields that need a subsystem, then collision geometry
for `slopeLimit`/`stepOffset`/`broadphase`/`solverIterations`.
## v120 — the save file gets bytes: an injected storage seam, a write that reports what it stored, and a reader that will not guess between a missing file and an empty one

v119 proved the shape survives `JSON.stringify` and stopped there: "a save is still in-memory only — no
disk". v120 adds the seam and nothing else — `packages/three-runtime/src/saveStore.ts` with `SaveStore`,
`createMemorySaveStore`, `createFsSaveStore(fs, root)` and `resolveSavePath`, plus `writeSaveFile` /
`readSaveFile` / `saveStore()` on the runtime. The package still imports no filesystem: the injected object is
as small as `writeFileSync`/`readFileSync`/`existsSync`, which is also what a `localStorage` shim can
implement, so the same seam serves a browser tab, a Node process and a test.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 63 cases, `test/cinematicSequence.test.ts` 74, package total **235** (63 save + 39 controller + 74 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` |
| headline case | one memory store, two runtimes: the writer builds a scene (an entity with a `YXZ` rotation, a component, userData, and a cinematic sequence with a path), writes `saves/hero.json`, and a SECOND runtime that never saw it reads the path back — position, rotation order, component keys and data all equal, and the rebuilt camera lands at a distance of exactly 0 from the original's after a zero-delta frame |
| write | `writeSaveFile(path, sceneId, savedAt)` → `{path, store, bytes, sceneId, entities, sequences, carries, doesNotCarry}`; `bytes` is the length of the string the call produced, and the case asserts it against `store.read(path).length` rather than a literal |
| read | `readSaveFile(path, sceneId)` tells apart the three failures a disk produces: **no file at that path**, **bytes that are not JSON** (with the parser's own complaint quoted, and an empty file named as empty rather than as a syntax error), and **a file that parses but cannot be loaded** — the last wrapped with the path attached around `loadSaveFile`'s own refusal, so the door stays in one voice and the disk trip adds the address |
| no store | a runtime created without `{ storage }` refuses both directions ("this runtime has no SaveStore — create it with `{ storage }`, or keep using buildSaveFile"), and `saveStore()` reports `null` instead of a caller guessing |
| paths | `resolveSavePath` is the only owner of the confinement rule: absolute forms (`/x`, `C:\x`), `..` segments, empty and `.` segments and an empty name are refused, and both stores call it — the case loops the same six bad names through the fs store and the memory store so neither can grow its own rule |
| the fs store | an injected fake records the joined paths: root `saves/root/` writes `saves/root/a/deep/b.json`; `existsSync` false is `null` from `read`, not an empty string; a root that itself contains `..` is refused at construction |
| refusals | **48** reader-side, **12** writer-side and **5** seam-side refusal sites in the shipped source, each naming the value, path or name it found — the count is a regex over the message prefixes the doors actually print |

Three things worth the sentence it costs.

* **A missing file and an empty file are different diagnoses.** A store that answered `''` for an absent path
  would make every "no save here" read as "corrupt save", and the caller would try to repair something that
  was never broken. So `read` returns `null` for absent, and `readSaveFile` keeps the two branches apart.
* **The bytes are not trusted because they were written here.** The reader re-parses whatever the store hands
  back and runs it through every v119 refusal — so a file edited, truncated, or copied from elsewhere is met
  by the same door. The case writes a smuggled `"npcs": [["npc-1", {}]]` into a copy of a real save and the
  read refuses it by name, with the path in the sentence.
* **A load cannot rewrite the file it read.** Two runtimes read the same path and get equal reports; a second
  read into the first runtime then hits the live-id refusal (a restore never overwrites), and the stored bytes
  are byte-for-byte what they were before either attempt — so the store is not a scratch buffer.

### How the probe ran, and what it said

The probe is `mutate-v120.mjs (scratch)`: 15 arms across TWO shipped files — the runtime's `writeSaveFile` /
`readSaveFile` / `saveStore` and the seam module itself — each anchor verified to match exactly once before any
run, each arm's minimum red written down in the script beforehand, the control fixing the population at
**137** with 0 red, and both files restored byte-for-byte in a `finally`. Reds per arm, in order:
1, 1, 1, 1, 2, 2, 1, 4, 1, 2, 2, 2, 2, 2, 2. No arm survived. No arm reddened fewer than claimed. 9 of the 15 arms reddened MORE than written down for them (05-load-refusal-loses-the-path: 1→2, 06-write-report-claims-zero-bytes: 1→2, 08-file-written-as-a-stringified-object: 1→4, 10-escaping-root-accepted: 1→2, 11-root-keeps-its-trailing-separator: 1→2, 12-absent-path-reads-through-the-fs: 1→2, 13-memory-store-skips-path-rules: 1→2, 14-dot-segments-accepted: 1→2, 15-fs-store-escapes-its-root: 1→2). The whole package was re-run separately at
**235** with 0 red, and `tsc --noEmit` exited 0 over `src`.

The arms split the way the code does. Nine of them are in the runtime — deleting the "this runtime has no
SaveStore" refusal, treating an absent file as an empty string, calling a whitespace-only file a syntax error,
dropping the path from a wrapped load refusal, reporting zero bytes, `String(file)` instead of
`JSON.stringify`, renaming the `saveFileWritten` event, and hollowing out `saveStore()` — and six are in the
seam: accepting an escaping root, keeping the root's trailing separator, reading through `existsSync`,
skipping `resolveSavePath` on write, accepting `.` segments, and joining an unvalidated path in the fs store.
Every one was caught by at least the case it aimed at. The over-credited arms are named in the sentence above;
the shape of that miss is the one v118 wrote down and v119 re-wrote: a report, an event payload or a joined
path is consumed by more cases than the assertion that names the mutated clause, so a reader-side deletion
reddenes two or four cases while the prediction was sitting on one.

### What v120 still does NOT honor — stated by name

* Still no unregister, so a read whose second half fails after the sequences land leaves them in the registry,
  and the thrown message says which half stayed (v119's boundary, unchanged).
* The store has no delete, no list and no versioning. `overwrite` is what `write` does; the runtime reports
  the path it wrote and the bytes it put there, nothing more.
* Nothing here compresses, encrypts, or atomic-saves (write-to-temp-then-rename); a half-written file is
  exactly the "not valid JSON" case above, which is refused — but the refusal is not a repair.
* An entity still names no scene, so a file is written for ONE scene and read back into a scene the caller
  names. `SaveData.sceneGraph`, which would carry the mapping, is still blocked.
* `postProcessing`, every transition but the cut, and any Studio surface: unchanged.

### Measurement errors, kept in the record

The harness, three times before it measured anything — and each one was a bug in the script, not a fact about
the code, which is why they are listed rather than glossed:

* The probe is a `.mjs`, not a `.ts`, and the first draft carried two TypeScript-isms (`new Map<string, string>`
  and a non-null `!`). Both are syntax errors at load: the run produced no arms and no numbers, and only
  `node --check` said so in one line.
* One anchor was written between backticks because the production line it quotes contains backticks; the
  anchor therefore looked for `` `saveFileWritten` `` where the source holds `'saveFileWritten'`, and matched
  nothing. Quote-style drift in an anchor is invisible until a `hits !== 1` guard refuses the run.
* One two-line anchor was indented as if its `if` were nested one level deeper than it is. The anchor gate
  caught that too, before any file was written — the same gate that saved v119 from an arm whose anchor never
  matched, and the reason the gate exists at all.

Nothing above produced a number. The numbers in this section came from the run after them.

### Sentences this record retires

* v119's "What v119 still does NOT honor": *"…`SaveData` as a whole is still not a file… Nothing here writes a
  `SaveData` end to end."* The file methods now write and read one end to end, through a store.
* ROADMAP M5, honest bounds: *"a save file survives JSON in both directions but no code writes bytes yet"*.
  Swapped by the edit that added this section; the cell now says a save is written and read through an injected
  store and names the holes that remain.
* `saveFeasibilityAudit`'s docstring (v119's fix): *"…`buildSaveFile` emits a `SaveFile`…"* — still true, now
  with a writer and a reader beside it; the sentence was extended rather than replaced.

Next: `removeSequence`/unregister is the smallest hole with the widest consequence — it is what keeps a
half-failed load from being fully reversible, and what keeps `defineCinematic`'s "choose a new id" refusal as
the only answer to a duplicate. Then the four `SaveData` fields that need a subsystem, then collision geometry
for `slopeLimit`/`stepOffset`/`broadphase`/`solverIterations`.
## v121 — the registry can give an id back: `removeCinematic`, a load that rolls back both halves, and two shipped sentences that were retired by name

v117 wrote it into a refusal ("this runtime has no way to unregister one — choose a new id"), v119 wrote it
into a rollback message ("the sequence(s) restored ahead of them stay registered"), and v120 quoted the same
thing as a limit of the disk path. All three were true then. v121 makes them false, and the interesting part of
the cycle is the retirement: two thrown messages that now lie, one test that had been written to prove the
limitation, and a rollback that could finally be described as complete.

| what | measured |
| --- | --- |
| suites | `test/cinematicSequence.test.ts` 78 cases, `test/saveSnapshot.test.ts` 64, package total **240** (64 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` |
| removal | `removeCinematic(id)` → `true` when a sequence was un-registered, `false` when nothing is registered under that id. It **refuses a playing sequence** ("call stopCinematic first") — `playing` belongs to `playCinematic`/`stopCinematic`, and a removal that stopped a cutscene on the way out would emit a `cinematicStopped` nobody asked for. Emits `cinematicRemoved` with the scene it was registered against |
| batch | `clearCinematics()` → `{removed, stillPlaying}`: the idle ones go, the playing one is reported and left alone. Removal of each is the same code path, so the event log is the same either way |
| the load is atomic now | `loadSaveFile`'s catch stops and removes every sequence it had restored, so a load that fails in its second half leaves neither half behind. The message changed with the behavior: "the 1 entity(ies) and the 1 sequence(s) this load had registered were removed again; a load is all or nothing" |
| the id comes back | after a removal, `defineCinematic` accepts the same id again — which is the capability the duplicate-id refusal used to say did not exist, and the reason its message now points at `removeCinematic` |
| the retirement is pinned | a test reads the shipped source, takes only its `throw new Error(` lines, and requires that none of them says "no way to unregister" — because a comment is allowed to quote a retired sentence in order to explain the retirement, and a refusal is not |

Three things worth the sentence it costs.

* **An absent id answers `false`; a playing one throws.** Those are different shapes on purpose. "There was
  nothing to remove" is a fact about the world that a caller may act on, and `stopCinematic` already answers
  that way — the removal API inherits it rather than inventing its own. "This is playing" is a request the
  runtime will not satisfy by doing something you did not ask for. The case asserts both, and asserts that no
  `cinematicStopped` fires when a removal is refused.
* **The rollback needed the removal to exist, not the other way round.** v119's load could undo entities and
  could not undo sequences, and it said so. Nothing about that was a design choice; it was the shape of the
  registry. Adding `removeCinematic` did not "fix a bug" — it removed the reason a correct-sounding message had
  to exist. The test that had asserted `cinematicFieldAudit('seq')` survived the failed load was flipped in
  place, with the reason in a comment, because deleting it would have hidden what changed.
* **A stale message is a lie with a timestamp.** Every refusal sentence this package writes is a claim about
  what the runtime can do; two of them kept making it after the capability landed. They were re-worded by hand,
  but the guard against the next one is a test that reads the shipped source and refuses the phrase in a
  message — prose in a docstring is allowed to remember history, an error is not.

### How the probe ran, and what it said

The probe is `mutate-v121.mjs (scratch)`: 8 arms, each anchor verified to match the shipped source exactly once
before any run, each arm's minimum red written down in the script beforehand, the control fixing the population
at **142** with 0 red, and the file restored byte-for-byte in a `finally` (`restored the target
byte-exactly: true`). Reds per arm, in order: 2, 1, 1, 2, 1, 1, 1, 1. No arm survived. No arm reddened fewer than claimed.
2 of the 8 arms reddened MORE than written down for them (01-removing-a-playing-sequence-is-allowed: 1→2, 04-load-rollback-leaves-sequences-registered: 1→2). The whole package was measured separately at **240** with 0 red and
`tsc --noEmit` exited 0 over `src`.

The arms are the retirement, tested from the other side. Deleting the playing-sequence refusal, turning the
absent-id answer into `true`, making `clearCinematics` stop the sequence it should leave alone, dropping either
half of the load's new rollback (the stop, or the remove), and silencing `cinematicRemoved` in both the single
and the batch path — each is caught, and the pattern is the one this lane wants: one clause, one witness.

Two of them were not caught on the first run, and both were absent cases rather than wrong ones, which is the
failure mode v119 recorded and v121 keeps meeting. Arm `05-load-rollback-forgets-to-stop-first` survived
because every rollback case loaded an IDLE sequence, so the stop was never needed; the new case loads a file
whose cutscene is playing and asserts the `cinematicStopped` that the rollback must emit on the way out. Arm
`08-clear-removal-is-silent-on-the-bus` survived because the `clearCinematics` case checked the return value and
not the event bus; it now counts one `cinematicRemoved` per removed id and none for the playing one. Both arms
redden on the run reported above.

The seventh arm is the interesting one: it restores the old duplicate-id message verbatim, including "no way to
unregister", and is caught by the case that greps the shipped `throw new Error(` lines. A refusal sentence is a
claim about what the runtime can do, so it is testable the same way a behavior is — and unlike a docstring, it
is not allowed to keep saying something that stopped being true in a previous commit.

### What v121 still does NOT honor — stated by name

* A removed sequence's *camera* stays where the last frame left it. `updateCinematics` owns the camera;
  removal un-registers a timeline, it does not rewind a pose — no undo path exists for that.
* `removeCinematic` does not touch the event log: listeners have already been told about the sequence, and a
  removal emits its own event rather than pretending the history is clean.
* Nothing here deletes a scene or an entity-record's scene address; a `SaveFile` still carries entities for one
  scene and the caller names where they land.
* `npcs`, `quests`, `player`, `worldState` and `sceneGraph` stay blocked on systems that do not exist; no
  delete, list, atomic rename or repair exists for files.

### Sentences this record retires

* `defineCinematic`'s duplicate-id refusal, as shipped since v117: *"…is already registered, and this runtime
  has no way to unregister one — choose a new id"*. Now: *"…is already registered; removeCinematic it first, or
  choose a new id"*, asserted by a case that removes and re-registers under the same id.
* `loadSaveFile`'s rollback sentence (v119, restated by v120): *"…but the N sequence(s) restored ahead of them
  stay registered: this runtime has no way to unregister a sequence"*. Gone, replaced by the all-or-nothing
  message quoted above.
* v120's README, "What v120 still does NOT honor": *"…a read whose second half fails after the sequences land
  leaves them in the registry, and the thrown message says which half stayed"*. It no longer stays — the case
  that pinned it now asserts `cinematicFieldAudit('seq') === undefined`, with the reversal explained inline.
* ROADMAP M5, honest bounds: *"…a rollback reaches neither the event log nor a sequence registered before a
  later half failed"*. The event-log half is still true and stays in the cell; the sequence half was swapped out
  by the edit that added this section.

Next: the removal makes a *whole-game* load reversible, which is the last excuse the file layer had for not
having a delete — a `deleteSaveFile(path)` on the store seam is now the smallest honest gap, then the four
blocked `SaveData` halves that need a subsystem, then collision geometry.
## v122 — the store learns to take a save back: `deleteSaveFile`, a no-op that answers `false`, and a host that cannot delete saying so instead of succeeding

v120 wrote the seam and its own record said what it lacked: "no delete, no list and no atomic rename". v121
removed the last reason a delete would be unsafe — a load that fails partway now takes back both halves, so a
save file is the only artifact in this lane that could still outlive the decision to discard it. v122 adds the
delete, and the two interesting questions are what a no-op means and what a missing capability means.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 69 cases, `test/cinematicSequence.test.ts` 78, package total **245** (69 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` |
| seam | `SaveStore.delete(path): boolean`; `FsLike` grows an **optional** `unlinkSync`, because the shim that made this seam worth having (a `localStorage`-shaped host, v120) may not be able to delete |
| no-op | deleting a path that holds nothing returns `false` — the same answer shape as `removeCinematic` and `stopCinematic`, so "there was nothing there" reads identically across the package instead of being an exception in one corner and a boolean in another |
| missing capability | an `fs` host without `unlinkSync` **throws**, naming both the missing method and the fact that the save is still there. A `delete` that reported `true` on a host that cannot delete is the lie this whole lane is built to catch, and the case asserts the bytes are still readable afterwards |
| confinement | the fs store resolves through `at(path)` before anything else, so `delete('../outside.json')` is refused by `resolveSavePath` and the case asserts the host's `unlinkSync` was never called |
| pair agreement | after a successful delete, `readSaveFile` on the same path produces the "no save file at" refusal — the two methods must describe one world, and a delete the reader does not honour is a delete that did not happen |
| runtime | `deleteSaveFile(path)` → `{path, store, removed}`, emits `saveFileDeleted`; a runtime built without a store refuses, and deleting a file leaves the live scene untouched (one entity still in it) |

Three things worth the sentence it costs.

* **`false` is the answer, not the error.** Three separate APIs in this package now say "there was nothing to
  remove" the same way, which matters because the alternative — throwing — teaches callers to wrap a question in
  a try/catch and to treat an idempotent operation as a failure.
* **An optional method on an injected interface is a capability question, and it has to be asked where the
  caller can hear it.** The alternative designs were all worse: a `delete` that silently no-ops (a lie), one
  that throws a `TypeError` from inside the host (a message about the shim's internals — exactly the mistake
  v118 found in `getLength()`), or a required `unlinkSync` that would have made `localStorage` hosts unable to
  build a store at all.
* **Deleting is not undoing the game.** The case that loads a file, deletes it and then counts the scene's
  entities is there because "delete save" and "reset session" are two operations, and this one is the first.

### How the probe ran, and what it said

The probe is `mutate-v122.mjs (scratch)`: 7 arms across the seam (`saveStore.ts`) and the runtime method
(`threeRuntime.ts`) — anchors verified to match exactly once before anything ran, each arm's minimum red
written down in the script first, the control fixing the population at **147** with 0 red, both files
restored byte-for-byte in a `finally`. Reds per arm, in order: 1, 1, 1, 1, 1, 2, 2. No arm survived.
No arm reddened fewer than claimed. 2 of the 7 arms reddened MORE than written down for them (06-runtime-delete-without-a-store-pretends: 1→2, 07-delete-event-renamed: 1→2). The whole package was measured separately at **245** with 0 red and
`tsc --noEmit` exited 0 over `src`.

Five of the seven arms aim at the two decisions this grant was actually about: making `delete` report success
for a path that held nothing, making it forget to remove, skipping the `unlinkSync` capability check, treating
an absent path as present, and bypassing `resolveSavePath` so an escaping name reaches the host. Each is caught
by exactly the case that pins that decision, which is the pairing this lane wants — a clause with one witness,
not a behaviour covered by three unrelated assertions. The remaining two (a missing-store refusal turned into a
crash, and the `saveFileDeleted` event renamed) are the runtime-side mirrors of v120's arms.

### What v122 still does NOT honor — stated by name

* The store has no list and no atomic rename, so there is no "most recent save", and a half-written file is
  still only refused, never repaired. `delete` is not `rename`, and neither is a backup.
* Deleting does not touch what a load installed: sequences, entities and cameras stay where they are —
  `clearCinematics`/`removeEntity` are the tools for that, and they are in-memory operations.
* `deleteSaveFile` cannot distinguish "absent" from "present but unreadable" beyond what `existsSync` says; a
  host that lies about existence will produce a `false` that was not earned.
* `npcs`, `quests`, `player`, `worldState` and `sceneGraph` remain blocked on systems that do not exist;
  removal still does not move a camera it had aimed; there is no Studio surface for any of this.

### Sentences this record retires

* v120's README, "What v120 still does NOT honor" and "Next": *"the store has no delete…"* and *"`deleteSaveFile`
  … needs no new shape"* — the shape arrived, and the sentence it was waiting for is now retired in place.
* v121's README next-step line, same wording.
* ROADMAP M5, honest bounds: *"the store has no delete, no list and no atomic rename"*. Swapped by the edit
  that added this section; what the cell now says is that a save can be taken back and still cannot be listed
  or renamed atomically.

Next: `listSaves()` — the seam still cannot say what is in it, which is the first thing a save-picker needs and
the last of the three gaps v120 named; then the four blocked `SaveData` halves that need a subsystem, then
collision geometry.
## v123 — the store says what it holds: `listSaveFiles`, `latestSaveFile`, and a newest that is the file's own claim rather than a clock the runtime does not have

v120 named its own three gaps — "no delete, no list and no atomic rename". v122 closed the first; v123 closes
the second, and in doing so answers the question a save picker has to ask: which of these is the one to
continue from. Two rules decide the shape of the grant, and both are about what a store is allowed to claim.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 76 cases, `test/cinematicSequence.test.ts` 78, package total **252** (76 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` |
| seam | `SaveStore.list(): string[]` — names, sorted, relative to the store's namespace; `FsLike` grows **optional** `readdirSync` and `statSync`, and the fs store throws naming BOTH when either is missing, because `[]` would be a claim that no saves exist |
| cost | the listing reads no bytes: a fake fs counts its own `readFileSync` calls and the case asserts the list came back with **zero** of them — a menu that costs O(total bytes) is the wrong seam |
| absent root | a root directory that does not exist yet lists `[]`: that is a fact about an empty store, distinguishable from a host that cannot browse, which throws |
| newest | `latestSaveFile()` orders by the `savedAt` **inside each file**, not by a clock: this runtime owns a frame clock and no wall clock, so a file written with a made-up timestamp wins honestly and the caller who wrote it knows why. Ties break by path and are counted (`ties: 2`) so "which one did you pick" is answerable |
| undecipherable files | never fatal, never hidden: a save that is not JSON, is an array, carries a foreign `format`, a `version` this runtime does not read, or a `savedAt` that is not a finite number lands in `unreadable: {path, why}[]` with its reason, and the answer is still the newest readable one |
| pair agreement again | after `deleteSaveFile` takes the newest away, `latestSaveFile` moves to the next candidate — the same rule v122 pinned for `readSaveFile`, now across listing |

Three things worth the sentence it costs.

* **`[]` and a throw are different sentences.** An empty store genuinely has no saves; a host that cannot
  browse does not know whether it has any. The memory store can answer both questions itself, the fs store
  can only answer the second by asking the host — so `list()` throws naming `readdirSync` and `statSync`,
  and the case asserts the refusal reaches `listSaveFiles`/`latestSaveFile` intact rather than being caught
  into an empty menu.
* **`savedAt` is the file's claim, and the reader says whose claim it is.** No clock is consulted, so no
  timezone, no skew and no "newer than the last one I saw" state enters the decision; the docstring says out
  loud that a made-up timestamp wins, because a caller that later wants monotonic ordering has to compare
  `savedAt` values it wrote itself.
* **A corrupt member does not own the collection.** Five unreadable files each get a reason and the answer
  still names the good one. The alternative — the parser's `SyntaxError` escaping, or the loop skipping
  silently — fails in the two directions a report must not: a menu that dies, or a menu that quietly lost a
  save. The case asserts the exact reason strings, including v119's version comparison ("version is 2, and
  this runtime reads exactly 1"), so the reporting itself cannot rot.

### How the probe ran, and what it said

The probe is `mutate-v123.mjs (scratch)`: 11 arms over the seam (`saveStore.ts`) and the runtime (`threeRuntime.ts`) —
anchors verified to match exactly once before anything ran, each arm's minimum red written down in the script
first, the control fixing the population at **154** with 0 red, both files restored byte-for-byte in a
`finally`. Reds per arm, in order: 2, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2. No arm survived. No arm reddened fewer than claimed. 10 of the 11 arms reddened MORE than written down for them (01-memory-list-forgets-to-sort: 1→2, 03-latest-picks-the-oldest: 1→2, 04-tie-break-flipped: 1→2, 05-ties-always-one: 1→2, 06-version-not-checked: 1→2, 07-format-not-checked: 1→2, 08-savedAt-not-checked: 1→2, 09-unreadable-not-reported: 1→2, 10-listing-without-a-store-works-anyway: 1→2, 11-latest-without-a-store-works-anyway: 1→2). The
whole package was measured separately at **252** with 0 red and `tsc --noEmit` exited 0 over `src`.

The arms follow the two decisions. On the seam: forgetting to sort the memory listing, and skipping the
capability check so a browsing refusal becomes a `TypeError` out of the host. On the reader: picking the oldest
instead of the newest, flipping the tie-break, hardcoding `ties`, dropping each of the three header checks
(`format`, `version`, finite `savedAt`) so an undecipherable file becomes a candidate, swallowing the
not-JSON reason instead of reporting it, and hollowing each of the two no-store refusals. each is caught by the case that pins that clause — usually by one more as well, which is what the over-prediction
count above is measuring. That pairing is what this grant wanted: the interesting behaviour is the report, and a
report nobody can break is a report nobody can trust.

### What v123 still does NOT honor — stated by name

* No atomic rename, so no "save then replace safely": a half-written file is refused with a reason, never
  repaired or renamed out of the way, and `list` will happily show it as unreadable.
* No size, mtime, or directory metadata is read: ordering is only ever what the files claim, so a save whose
  `savedAt` was never set (written by another tool) sorts wherever its bytes say.
* Listing is not filtering by scene or by playhead — `latestSaveFile` answers "newest", not "the one you mean".
* The five blocked `SaveData` halves, the missing collision geometry, the camera a removal leaves where it was:
  all unchanged from v122.

### Sentences this record retires

* v122's "Next" line: *"`listSaves()` — the last of v120's three named gaps and the first thing a save-picker
  needs"* — arrived, with the newest-save question it unlocks.
* v122's README bounds and the ROADMAP cell: *"the store cannot list its saves"*. Swapped by the edit that
  added this section; the cell now says the store can list, and still cannot rename atomically.
* v120's README, "What v120 still does NOT honor": *"The store has no delete, no list and no atomic rename."*
  Two of three now retired, in the two grants that took them.

Next: the third gap, an atomic write (temp + rename), which needs `renameSync` on the injected host and a
decision about what `writeSaveFile` reports when the rename fails halfway. Then the four `SaveData` halves that
need a subsystem, then collision geometry.
## v124 — the save is written atomically: a temp file and a rename, a capability asked for before any byte moves, and a failure that reports its own debris

v123 retired the listing gap and left the last sentence it had written about itself: *"the write is not atomic,
so a half-written file is listed as unreadable and never repaired."* Refusing a truncated save is honest, but a
save screen that shows "unreadable" next to the file the player just wrote has lost the game anyway. v124 makes
the write either arrive or not arrive.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 82 cases, `test/cinematicSequence.test.ts` 78, package total **258** (82 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` |
| seam | `SaveStore.writeAtomic(path, contents)`; `FsLike` grows a third optional method, `renameSync`, alongside `unlinkSync`/`readdirSync`/`statSync` |
| order | the capability is asked for **before a single byte is written**: an fs host without `renameSync` throws (`no renameSync; nothing was written`) and the case asserts the host recorded **no operations at all** and its tree gained no key — discovering the gap after the temp exists would leave a `.tmp` for `list()` to explain |
| failure | when the rename itself fails, whatever was at the real path is untouched (the old save still reads back byte-for-byte), the temp is unlinked, and the ops log shows the unlink; when the unlink also fails the message names the leftover path (`it is left at "x.json.tmp"`) and the listing indeed shows it |
| runtime | `writeSaveFile` now goes through `writeAtomic`, and the case asserts the host saw `rename:saves/root/slot.json.tmp->saves/root/slot.json` — because a store-level test alone would stay green if the runtime quietly went back to plain `write` |
| memory store | one map mutation, documented as atomic **within this process** and not a durability claim; it leaves no temp to list |
| plain `write` | still there and still direct: the atomic path is a choice at the call site, asserted by an ops comparison rather than by comment |

Three things worth the sentence it costs.

* **Ask about a missing capability before you need it.** v122's delete and v123's listing both threw when the
  host could not do the job; the write has a sharper version of the same rule, because a *partially performed*
  operation is worse than a refused one. The case does not merely assert the throw — it asserts `ops` is empty
  and the host's tree is unchanged, which is the difference between "refused" and "failed halfway".
* **The point of a temp-and-rename is the file you did not touch.** The failure case asserts the previous bytes
  still read back, and separately that the temp is gone. A test that only checked "an error was thrown" would
  pass on an implementation that clobbered the real file first.
* **The rename is asserted at the runtime boundary, not only the seam.** That is the same lesson v118 learned
  about guards (a rule only a regex can see is testing the author, not the feature): the store can be perfect
  while `writeSaveFile` calls the wrong method, and the case that would catch it had to be written against the
  call path.

### How the probe ran, and what it said

The probe is `mutate-v124.mjs (scratch)`: 6 arms over the seam (`saveStore.ts`) and the runtime's write
(`threeRuntime.ts`) — anchors verified to match exactly once before anything ran, the control fixing the plane at
**160** with 0 red, both files restored byte-for-byte in a `finally`. Reds per arm, in order: 1, 4, 1, 1, 2, 3.
No arm survived. No arm reddened fewer than claimed. 3 of the 6 arms reddened MORE than written down for them (02-rename-replaced-by-a-second-write: 2→4, 05-real-file-overwritten-before-rename: 1→2, 06-runtime-bypasses-the-atomic-path: 1→3). The whole package was measured separately at
**258** with 0 red, and `tsc --noEmit` exited 0 over `src`.

This is the first probe in the lane whose predictions were written as **case names** rather than red counts —
the v123 record caught that habit for what it was: "at least one, got three" tells you nothing about whether the
right test exists. Each arm names the case that must go red (skip the capability check, rename into a second
write, leave the temp after a failed rename, hide the leftover path, overwrite the real file before the rename,
bypass the atomic call from the runtime), and the harness grades both directions: did that case fail, and did
nothing else. Three arms came back exactly as predicted. Three reddened their named case **plus** neighbours —
`02` also broke the two failure cases, because they read the same ops log and the same listing, and `06` (the
runtime calling plain `write`) broke the ops assertion in the success case as well. That is a wider blast radius
than I claimed, and the honest reading is that the atomic path is asserted from several angles at once.

The harness needed a fix before any of that was visible: its first run reported "0 of 1 predicted cases hit" for
every arm, because failure strings were truncated to 110 characters and the case title sits at the end of a long
describe name. A prediction that cannot be read is not a wrong prediction — but it is also not a checked one, and
the fix had to be made before the numbers meant anything.

### What v124 still does NOT honor — stated by name

* Atomicity is per store, not across them: the memory store's guarantee is one process, and an fs host that
  lies about `renameSync` (accepting a cross-device rename, or silently doing a copy) is outside what this
  package can detect.
* No `fsync`, so a power loss between the temp write and the rename can still lose the new save — the old one
  survives, which is the promise, but the new one is gone without a word.
* A failed cleanup leaves a `.tmp` that `list()` reports as a save and `readSaveFile` refuses; the message names
  it, but nothing sweeps it. `deleteSaveFile` is the only way back.
* Still no Studio surface, no scene address on an entity record, and the five blocked `SaveData` fields stay
  blocked on systems that do not exist.

### Sentences this record retires

* v123's README and the ROADMAP cell: *"the write is not atomic… a half-written file is listed as unreadable
  and never repaired"*. Swapped by the edit that added this section; the cell now names `fsync` and cross-device
  rename as the remaining gaps.
* v120's original three-gap sentence — *"no delete, no list and no atomic rename"* — is now retired in full,
  across v122, v123 and this grant.

Next: `fsync`-or-equivalent durability (which the injected `FsLike` cannot express yet, so it needs a decision
about how far a seam should pretend), or the four blocked `SaveData` halves that need a real subsystem.
## v125 — the durability boundary is chosen, not assumed: `durable` asks for a flush, the memory store refuses the word, and the rename is left honestly unflushed

v124 retired the atomicity gap and wrote the next one itself: *"there is no `fsync`, so a power loss between the
temp write and the rename can still lose the new save"*. v125 closes the gap that can be closed and names the
one that cannot, in a seam that has no directory handle and will not pretend to have one.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 86 cases, `test/cinematicSequence.test.ts` 78, package total **262** (86 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` |
| seam | `FsLike` gains a fourth optional method, `flushSync?`; `writeAtomic(path, contents, durable?)` orders the work as write temp → **flush temp** → rename |
| refusals | a host without `flushSync` is refused **before a byte moves** (`nothing was written`), and the case asserts the host logged zero operations and the previous file is untouched; the memory store rejects `durable: true` outright — `there is no device behind it to flush` |
| report | `writeSaveFile(..., { durable })` returns `durable: true/false`; `false` is the default and is not a failure (the caller asked for atomic, not durable), and `true` always means a flush actually happened, because every path that cannot flush throws instead of downgrading |
| failure | a flush that throws rides the same path as a failed rename: old bytes intact, temp unlinked, and the message says **"flushing and renaming"** so the reader knows which half broke; a leftover temp from a double failure is still named and still shown by `list()` |
| what is NOT claimed | the rename itself is not flushed: durability of a directory entry needs a directory handle this seam does not have, and the docstring says so rather than shipping a `flushSync('.')` nobody can check |

Three things worth the sentence it costs.

* **The choice was between a promise and a refusal, and a seam that can be handed a `localStorage` object
  cannot promise.** Option (b) on the task — stamp `flushed: false` into the file — would have recorded a fact
  the writer already knew and left callers to parse it. Option (a) — an optional verb plus a refusal — makes
  the limitation someone's problem at the moment it matters: the caller who asked, not the reader who guessed.
* **`false` in a report has to mean something.** v118's audit lesson was that a field carrying the same value on
  every path is a field that is not consulted; `durable` earns its place because the same call answers `true`
  only when a flush happened, and the case that asserts `durable: true` also asserts the host saw exactly one
  `flush:` operation — the report and the world are checked against each other.
* **Refusing before writing is a different claim than refusing after.** Three of this lane's grants now check a
  capability first (delete, list, flush), each with a case asserting the host recorded *nothing*: "we did not do
  the thing" is only as strong as the evidence that no half of it happened.

### How the probe ran, and what it said

The probe is `mutate-v125.mjs (scratch)`: 5 arms over the seam and the runtime, anchors verified exactly-once before
anything ran, the control fixing the plane at **164** with 0 red, both files restored byte-for-byte in a
`finally`. Reds per arm, in order: 2, 3, 3, 2, 3. No arm survived. No arm reddened fewer than claimed. 5 of the 5 arms reddened MORE than written down for them (01-runtime-ignores-the-durable-flag: 1→2, 02-flush-never-issued: 1→3, 03-flush-capability-not-checked: 1→3, 04-memory-store-accepts-a-durability-promise: 1→2, 05-flush-failure-reported-as-a-rename: 1→3). The
whole package was measured separately at **262** with 0 red; `tsc --noEmit` exited 0 over `src`.

Predictions were written as case names, as in v124, and the outcome is the honest version of that experiment:
**all five arms reddened the case they named**, and every one of them also reddened at least one neighbour. The
neighbours are not noise — they are the same claim seen from another angle: ignoring the runtime's `durable`
flag also breaks the memory store's refusal (because the call reaches a store that must never accept the
request), skipping the flush breaks the double-failure case (the temp is renamed unflushed and the ops log
loses its `flush:` entry), and removing the capability check breaks the success case, because the flush then
happens inside the try and turns into a rename failure. What the naming exercise bought, compared with a red
count, is that I can say which behaviour is load-bearing rather than how many assertions happened to notice.

### What v125 still does NOT honor — stated by name

* The rename is unflushed, so a power loss can still drop a completed-looking save; `fsync` on the containing
  directory is the missing verb, and it needs a handle, not a path.
* A host whose `flushSync` is a no-op wearing a name cannot be detected from here: the seam records that it
  *asked*, not what the device did.
* Durability is per file; nothing sweeps a leftover temp, and `list()` will keep showing it until `delete` does.
* Unchanged from v124: removal leaves the camera where it was, `SaveData`'s five blocked fields wait on
  subsystems, and there is no Studio surface for any of it.

### Sentences this record retires

* v124's README bounds and the ROADMAP cell: *"there is no `fsync`, so a power loss between the temp write and
  the rename can still lose the new save"*. The flush exists now; what survives in the cell is the narrower,
  true sentence — the rename itself is not flushed.
* v124's "Next" line (*"…a `fsync`-or-equivalent durability … needs a decision about how far a seam should
  pretend"*) — decided here, in favour of refusing.

Next: the directory-handle question is the only durability step left and it changes what the seam injects, so
the better next move is the thing this lane has been routing around — `npcs`, `quests`, `player` and
`worldState` need subsystems, and four of the five blocked rows in the audit table are waiting on them.
## v126 — the sweeper for the debris v125 named: `sweepTempFiles`, deleting through the delete it already had

v125 closed its own record with a leftover: *"a temp left by a double failure is named and listed until someone
deletes it."* Naming it was right; leaving a save screen to show a file that no reader can use was not. v126
adds the sweeper, and the interesting part is what it refuses to invent.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 89 cases, `test/cinematicSequence.test.ts` 78, package total **265** (89 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` |
| seam | `SAVE_TEMP_SUFFIX` is exported and is the only place the suffix is written — the writer that produces the temp and the sweeper that looks for it cannot drift apart by spelling |
| runtime | `sweepTempFiles()` → `{store, removed, kept}`: it filters `list()` by the suffix and removes each through **`deleteSaveFile`**, not a second unlink path, so confinement, the `false`-means-nothing-there answer and the `saveFileDeleted` event all have one owner |
| events | one `saveFileDeleted` per swept name, asserted from the bus rather than from the return value |
| race | `kept` is the honest acknowledgement that a listing is a snapshot: a name `list()` returned and `delete` could not find is reported, and the case proves it with a stub store whose `delete` answers false — not by sleeping on a real filesystem |
| untouched | the swept save is asserted by content (`"savedAt":1` still in the host's tree), and a second sweep answers `{removed: [], kept: []}` |

Three things worth the sentence it costs.

* **A sweeper that reaches past the delete API is a second owner of deletion.** The obvious implementation —
  `fs.unlinkSync` on a path the sweeper assembled — would bypass `resolveSavePath`, the no-op answer, and the
  event, giving the store two rules about removal and one of them untested. Routing through `deleteSaveFile`
  costs a line and keeps the confinement in one place; the probe's first arm is exactly that bypass, and it is
  caught by the event assertion.
* **`kept` exists because a listing goes stale.** Reporting a name that vanished between `list()` and `delete`
  is the difference between a report and a wish; the case uses a stub whose delete always answers false, which
  is a legitimate way to make a state that a real host would race into existence.
* **The suffix is a shared constant, not a coincidence.** `SAVE_TEMP_SUFFIX` is exported so the producer and
  the sweeper ask the same question; a probe arm that changes the sweeper's filter to `.bak` is caught, which
  is the only proof that a constant is load-bearing rather than decorative.

### How the probe ran, and what it said

The probe is `mutate-v126.mjs (scratch)`: 5 arms, anchors verified exactly-once before anything ran, the control
fixing the plane at **167** with 0 red, and the target restored byte-for-byte in a `finally`. Reds per arm,
in order: 1, 2, 1, 1, 1. No arm survived. No arm reddened fewer than claimed. 1 of the 5 arms reddened MORE than written down for them (02-suffix-filter-blind: 1→2). The whole package was measured
separately at **265** with 0 red; `tsc --noEmit` exited 0 over `src`.

Predictions were case names again, and all five arms reddened the case they named: bypassing `deleteSaveFile`
for a raw store delete, changing the sweeper's suffix filter, deleting every listed name, swallowing a vanished
name instead of reporting it, and removing the no-store refusal. One arm (the suffix filter) also reddened a
neighbour, which is the same-claim-different-angle pattern v124 and v125 recorded rather than a surprise. The
value of naming cases instead of counts showed up concretely here: the bypass arm's own named case is the event
assertion, so the record can say *which* claim defends the "one owner of deletion" decision rather than
"something went red".

### What v126 still does NOT honor — stated by name

* The sweep is by suffix only. A save a player legitimately named `ending.tmp` is debris-shaped and gets
  deleted: the seam has no metadata to distinguish them, and writing a marker file to solve that would be a
  bigger lie than the one it fixes.
* Nothing schedules a sweep — a leftover waits until a caller asks, and no background timer exists in this
  package.
* A store whose `delete` throws (a host that cannot unlink) propagates: the sweep does not decide which
  failures are acceptable, and `kept` is only for names that turned out to be absent.
* The rename is still unflushed, the five blocked `SaveData` halves are still blocked, and there is still no
  Studio surface for any of it.

### Sentences this record retires

* v125's README bounds and the ROADMAP cell: *"a temp left by a double failure is named in the message but
  never swept"*. It is swept now, on request.
* v125's "Next" line, which pointed at the directory-handle question; the sweeper came first because it
  closed a gap a previous grant had already written down.

Next: the directory-handle durability step (the only remaining file-layer gap, and it changes what the seam
injects), or stop circling and fill in one blocked `SaveData` half — `npcs` first, which the audit table has
been honestly reporting as waiting on a nonexistent system since v115.
## v127 — a file's own claims get an answer: `diagnoseSaveFile`, and a verdict that has to agree with the load

v119 gave a `SaveFile` its `carries` / `doesNotCarry` lists so a file could say what it held, and v123 let a
caller see which files exist. What nobody could answer was the question those two features create: **a file
written by an older runtime disagrees with the table that exists now, and until you try to load it you cannot
tell whether the result will be a refusal, a partial restore, or a clean read.** v127 adds the diagnosis, and
ties it to the load so it cannot drift into opinion.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 93 cases, `test/cinematicSequence.test.ts` 78, package total **269** (93 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` |
| method | `diagnoseSaveFile(path)` → `{path, bytes, loadable, problems, carriedButUnreadableHere, readableNowButNotCarried}`, reading the file's own `format`/`version`/`carries`/`doesNotCarry` and comparing them to the live `SAVE_DATA_FEASIBILITY` |
| both directions | a field the file carries that this runtime cannot read ⇒ `loadable: false` with the reason; a field this runtime **can** write that the file does not carry ⇒ a *warning* with `loadable` still true, because the file is older, not broken — "the file predates that capability" |
| refusals | an absent path, bytes that are not JSON, and a runtime with no store each get their own sentence; a file with a foreign `format` or an unread `version` gets both problems listed at once rather than one per attempt |
| the pair | the load case asserts the actual `loadSaveFile` refuses for the same reason the diagnosis named, and the healthy case asserts the load really succeeds — the verdict is the operation's verdict, not a parallel opinion about it |

Three things worth the sentence it costs.

* **The useful half is the direction nobody expected.** "The file claims it carries something you cannot read"
  is a refusal you were already going to get. "The file does not carry something you have learned to write" is
  the silent one: the load succeeds, and the missing half stays empty with no word said. That is the same
  family as v119's loader that "ignores what it cannot read", arriving from the other side — a file that
  predates a capability.
* **`problems` is ordered and asserted as an array, not as a substring.** Both directions in one file produce
  two lines in a fixed order, and the case compares the whole array. A report whose items can be reshuffled
  without the suite noticing is a report whose meaning is in the reader's head.
* **`loadable` is computed from the same table the loader consults, and checked against it.** One arm inverts
  the filter, one hardcodes `true`, one drops the omission reporting, one drops the version check, one drops
  the missing-file branch, one drops the no-store refusal — each is caught by the case that owns that claim.
  That is six clauses, six witnesses, and no arm that survives by being equivalent to nothing.

### How the probe ran, and what it said

The probe is `mutate-v127.mjs (scratch)`: 6 arms on `threeRuntime.ts`, anchors verified exactly-once before anything
ran, the control fixing the plane at **171** with 0 red, the file restored byte-for-byte in a `finally`.
Reds per arm, in order: 1, 1, 1, 1, 1, 2. No arm survived. No arm reddened fewer than claimed. 1 of the 6 arms reddened MORE than written down for them (06-unreadable-filter-reversed: 1→2). The whole package
was measured separately at **269** with 0 red; `tsc --noEmit` exited 0 over `src`.

Six clauses, six named witnesses: stop reporting omissions, hardcode `loadable`, drop the version check, drop
the no-store refusal, drop the missing-file branch, invert the unreadable filter. Five arms reddened exactly the
case that owns the claim; the sixth (inverting the filter) also reddened a neighbour, because the healthy-file
case asserts the omission list is empty and an inverted filter fills it — the same-claim-different-angle pattern
recorded in v124-v126 rather than a surprise. The predictions being case names again meant the harness could say
*which* claim each arm defends, which is the point of the practice: an over-count tells you nothing, a named
case tells you the guard is load-bearing.

### What v127 still does NOT honor — stated by name

* It diagnoses one named file; there is no "which of my saves can I actually open" pass over `listSaves()`.
* It reads the file's claims, not its content: a file that says it carries `entities` and holds an empty list
  is reported as loadable, because the empty list is exactly what the writer was able to write.
* A format change that keeps `version: 1` while altering meaning is beyond any check here — the version is
  the only promise the file makes about itself.
* `npcs`, `quests`, `player`, `worldState` and `sceneGraph` remain blocked on systems that do not exist; the
  rename is unflushed; there is no Studio surface for any of it.

### Sentences this record retires

* Nothing wholesale — v126's bounds stay as written. What v127 fills in is the gap v119 left implicit: it made
  a file *state* its coverage, and said nothing about how a reader finds out whether that statement still
  matches the runtime.

Next: the same comparison run over `listSaves()` (a save-picker needs "which of these can I open"), or the
blocked `SaveData` halves themselves, which is the only way `readableNowButNotCarried` ever stops being empty
for a file written today.
## v128 — the listing gets a verdict of its own: `diagnoseSaveFiles`, partitioned so "could not look" and "looked and refused" cannot be confused

v127 answered the question for one named path; a save-picker does not have a named path, it has a store. v128
runs the same judgement over everything `list()` returns, and the part worth writing down is how the answer is
shaped: three buckets that must add up, and a reason given for keeping two of them apart.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 96 cases, `test/cinematicSequence.test.ts` 78, package total **272** (96 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` |
| method | `diagnoseSaveFiles()` → `{store, total, loadable, unloadable, unreadable}`, calling `diagnoseSaveFile` per listed name — one owner of the verdict, not a second implementation of the same claims |
| the partition | the case asserts `total` equals the three buckets summed, and asserts the three names appear **once between them** (`new Set(names).size === names.length`), so a file cannot be both "loadable" and "unloadable" |
| three answers | `loadable` (claims match this build), `unloadable` (read, and refused — with the reasons carried through), `unreadable` (bytes that could not be looked at at all, e.g. not JSON, kept separate because the fix differs: one needs a newer runtime or a different slot, the other needs repair) |
| probe | 4 arms, no survivor, all four red on exactly their named case with **zero unexpected reds** — collapsing the two verdict buckets, swallowing the unreadable bucket, deleting the no-store refusal, and inverting the bucket choice each break the partition case and nothing else |

Three things worth the sentence it costs.

* **A bucket you cannot name is a bucket you will merge.** The tempting implementation was
  `{paths, ok, bad}`; "bad" would then have meant both "this file cannot be opened here" and "this file has no
  bytes I could read", and the difference between those is the difference between "pick another slot" and
  "the save is damaged". The case asserts the three counts separately so the taxonomy cannot quietly collapse.
* **Delegating is the point.** Every arm that breaks the verdict — bucket collapse, inversion, swallowing a
  throw — shows up in exactly one case, because `diagnoseSaveFile` remains the single place the claims are
  checked. Had the listing version re-implemented the comparison, four arms would have needed eight cases to
  say the same thing, and the two copies would drift (v117/v118 learned that with `duration`, twice).
* **Zero unexpected reds is a result, not luck.** The prior three probe cycles all over-predicted because
  claims were asserted from several angles; here each mechanism has one owner and one witness, which is what
  "one clause, one case" looks like when it is actually arranged rather than asserted afterwards.

### How the probe ran, and what it said

The probe is `mutate.mjs (scratch)`: 4 arms on the listing-wide survey, anchors verified exactly-once
before anything ran, the control fixing the plane at **174** with 0 red, the file restored byte-for-byte in
a `finally`. Reds per arm, in order: 1, 1, 1, 1. No arm survived. No arm reddened fewer than claimed. No arm over-predicted. The
package as a whole was measured at **272** with 0 red and `tsc --noEmit` exited 0 over `src`.

This is the first run in the lane with **no unexpected reds at all**: every arm reddened exactly the case that
owns the claim it broke. That is not a virtue in itself — it is the measurement of a decision made earlier,
namely that the survey delegates to the one-place checker instead of restating the rules. Restating them
would have made each clause provable twice, and the three previous cycles' over-prediction came precisely
from claims being asserted from several angles at once.

### What v128 still does NOT honor — stated by name

* `list()` is the population: a store that cannot browse contributes nothing to the listing, so an fs host
  without `readdirSync` still gets a refusal rather than a partial survey — by design, but it means
  "which saves exist" remains unanswerable there.
* `unreadable` carries a `why` string, not a structured reason; a caller that wants to branch on
  "not JSON" versus "path vanished" has to read prose. The next grant should make that a field, not a sentence.
* Nothing is repaired, migrated or opened twice for verification; this is a survey, not a doctor.
* `npcs`, `quests`, `player`, `worldState` and `sceneGraph` are still blocked on systems that do not exist, and
  a pre-v128 file still shows up in `readableNowButNotCarried` for `npcs` — which is the honest warning, not a
  defect.

### Sentences this record retires

* v127's README next-step line: *"the same comparison run over `listSaves()`"* — run, with a partition to keep
  it honest.

## v129 — the survey's "could not look" answer becomes a field: `unreadable[].reason`, derived from which check failed rather than from a sentence a caller would have to string-match

v128 named this gap by hand in its own bounds: *"`unreadable` carries a `why` string, not a structured reason; a
caller that wants to branch on 'not JSON' versus 'path vanished' has to read prose. The next grant should make
that a field, not a sentence."* v129 does that and nothing else.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 97 cases, package total **273** (97 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` |
| method | `diagnoseSaveFiles()` → `unreadable: { path, reason, why }[]` with `reason: 'not-json' \| 'listed-then-missing'` |
| the rule | `reason` is set by WHICH check failed, never by what a message said: bytes the store returned that threw in `JSON.parse` are `not-json`; a name `list()` returned whose `read()` came back `null` is `listed-then-missing` |
| who does the reading | the survey calls `this.storage.read(path)` itself rather than delegating to `diagnoseSaveFile`, so it OBSERVES the stale name instead of inferring it from an error string |
| `why` stays | the sentence is kept beside the field — the field is what a caller branches on, the sentence is what a person reads |
| probe | **none ran.** The scratch mutation harness would not apply against this working copy (a two-line anchor never matched) and the commit landed without it, so this row is a measurement, not a mutation result |

Two sentences worth the space.

* **Derived beats matched.** A branch on `"Unexpected token"` breaks the first time a different store phrases the
  same failure differently; a branch on `reason` cannot, because the code path that failed is what sets it. That
  is v127's rule — tie the verdict to the operation — applied one layer down.
* **The debt is written down rather than hidden.** Without the probe the new cases are witnesses, not evidence of
  kill-power, and the record says so instead of implying a probe ran.

### What v129 still does NOT honor — stated by name

* The taxonomy is closed at two entries on purpose: a store that throws its own error kind, or bytes that are
  valid JSON of the wrong shape, land in the nearest bucket rather than a third one of their own.
* `why` is still unconstrained prose; nothing checks that it carries the same information as `reason`.
* Nothing is retried or repaired — a `listed-then-missing` name is reported, not re-listed.

### Measurement error, kept in the record

Amendment 129's own prose says "**2 new cases** for the two reasons, plus existing 271". The tree disagrees: the
case count in `test/saveSnapshot.test.ts` is **96** at `e2fb5ec` (v128) and **97** at `ca3932d` (v129) — one case
ADDED and one case AMENDED, which is exactly what the amendment's own next bullet describes. So "2 new cases /
271 existing" contradicts the sentence beneath it and the diff. Measured for this record: 96 → 97, and package
272 → **273**. The 272 in v128's table is 96+39+78+30+29, which is correct at v128's OWN ref.

### Sentences this record retires

* v128's "What v128 still does NOT honor" line: *"`unreadable` carries a `why` string, not a structured
  reason"* — it now carries both, and a caller branches on the field.

## v131 — the NPC record gets a body and a file: `attachNPC`/`npcSnapshot`/`restoreNPC`, five declared fields named as gaps, and the old-file rule that keeps a pre-v131 save loadable

`SaveData.npcs` was declared in `types.ts` and backed by nothing — no record, no writer, no reader — so the field
sat in `SAVE_DATA_FEASIBILITY.blocked` with "implemented by nothing" beside it and every file had to omit it.
v131 adds the RECORD and its SHAPE, and the shape had to be repaired before it could be one.

| what | measured |
| --- | --- |
| suites | `test/saveSnapshot.test.ts` 112 cases, package total **288** (112 save + 39 controller + 78 cinematic + 30 physics + 29 runtime), `tsc --noEmit` exit 0 on `src` — **+15 net** over v129's 273 (16 cases added, 1 renamed) |
| registry | `attachNPC(sceneId, entity, options)` / `detachNPC` / `getNPC` / `setNPCReputation`, keyed by entity id, each entry remembering the SCENE it was attached in — an `NPC` names no scene of its own |
| the shape repair | the declared `SerializedNPC` held `reputation: Map<string, number>` (`JSON.stringify` writes it as `{}` — the v119 lesson, one level down) and `currentTask`/`schedule`, which hold a live `THREE.Vector3` and an `onComplete` CALLBACK. The file shape now holds identity, the personality numbers, `homeLocation` as three numbers, faction, wander radius and `reputation` as a sorted `[faction, value]` ARRAY |
| defaults READ, not assumed | `name` falls back to the entity's own name and `homeLocation` to where the entity STANDS, cloned in BOTH directions, so a snapshot stops moving when the live record does |
| the orphan | `removeEntity` drops the record of the body it removes and emits `npcOrphaned` — nothing runs an NPC per frame, so that is the moment a record can lose its subject and say so |
| the audit | `npcFieldAudit` names the gap from the LIVE record against the SNAPSHOT rather than from a second list: `currentTask`, `dialogueTree`, `inventory`, `quests`, `schedule`, each with what it waits on. A field added to `NPC` tomorrow lands there automatically; a field that gets carried stops being reported |
| the file | the file carries `npcs: [EntityId, SerializedNPC][]`, scoped to the scene like `entities` (a record names an entity, so records for bodies the file does not carry would restore records about nothing), and `savable` gains `npcs` |
| the loader | pre-checks before ANY half runs: the pair's key must equal the record's own `entityId`, the record's entity must be among the file's entities, and an entity that already has a record here is refused. Records restore AFTER the entities and a failure rolls both back |
| the old-file rule | the FILE's own claim decides: a file whose `carries` does not name `npcs` is read as carrying none — it loads, because `diagnoseSaveFile` calls that file loadable and refusing it would make the diagnosis disagree with the operation it describes (the defect v127 closed one layer up); a file that DOES claim them and ships no list is refused for the claim it cannot back up |
| probe | 7 arms, one control: **6 caught, 1 missed**, 2 over-predicted. The miss is the finding — see below |

### How the probe ran, and what it said

The probe is `probe.mjs` in scratch: 7 arms, the control fixing the plane at **288 with 0 red**, the source
restored byte-for-byte in a `finally` (verified: `source restored: byte-identical`).

Reds per arm, in order: 01 homeLocation-is-an-alias **1**; 02 snapshot-emits-the-live-`Map` **6**; 03
audit-hides-one-gap-by-hand **2**; 04 removal-leaves-the-record-registered **1**; 05
loader-drops-the-records-body-check **1**; 06 missing-npc-list-ignores-the-files-claim **2**; 07
rollback-forgets-the-records **0**.

* **Arm 02 over-predicted, and the extra reds are the honest part.** Emitting a `Map` also reddens the FILE cases,
  because `buildSaveFile` runs `assertDiskSafe` over the finished file and a `Map` in the record stops the write —
  the same claim seen from a second angle.
* **Arm 07 reddened NOTHING**, and that miss is a result rather than an embarrassment. It deleted the rollback's
  `detachNPC(id)` loop and no verdict moved, because `removeEntity` already takes the record with the body. A
  second owner of one cleanup is how one of them eventually drifts, so the loop was **REMOVED** rather than
  defended, and the rollback's record cleanup is now asserted through the removal path (the orphan case) instead
  of through a detach the loader no longer performs.
* **Arm 03's two reds** are the audit's two readers: `every declared NPC field is either carried or named as a
  gap` (read out of `types.ts`) and `npcFieldAudit names every declared NPC field the file shape does not carry`.

### What v131 still does NOT honor — stated by name

* **A record drives nothing.** Nothing reads `schedule`, `currentTask`, `dialogueTree`, `inventory` or `quests`,
  so an NPC does not move, talk, trade or want anything. This half is a record and a file, not a system.
* **A record is scoped to ONE scene.** `npcSnapshot`/`restoreNPC` take a `sceneId`, and an entity id that exists
  in two scenes resolves against the record's own scene rather than against the body nearest the caller.
* **No geometry travels.** `npcSnapshot` carries no mesh, so a restored merchant is a record about the default box
  `restoreEntity` builds.
* The old-file rule is a compatibility choice, not a migration: nothing rewrites a pre-v131 file, so it keeps
  reporting `npcs` in `readableNowButNotCarried` every time it is diagnosed.
* `sceneGraph`, `quests`, `player` and `worldState` remain blocked on systems that do not exist or on live objects
  the shape cannot hold.

### Sentences this record retires

* v128's README next-step line: *"make the structured-reason gap above real …, then the `npcs` subsystem
  (#183)"* — the first half is v129 above, the second is this section. `readableNowButNotCarried` still names
  `npcs` for an old file, but the reason is now a version boundary rather than a field nobody can write.

Next: give the record something to DO — the smallest honest subsystem behind one of the five gaps, so an NPC
moves or speaks rather than merely being filed — or take the next blocked `SaveData` field (`player`, the
smallest of the four) now that `npcs` has shown what "record first, behavior later" costs and buys.

## v134 — the scene's declared world state gets an owner: the value is checked at the SET, the getter hands back a copy, and the bag goes last in a load

**Provenance, because it changed what was measured.** This section is not written by the run that wrote the
code. The increment's implementation and cases arrived in the working tree at 00:11 on 2026-09-28 from a run of
this lane that then stopped with its mutation probe still reporting a MISSED arm: the arm that replaces the
per-scene bag lookup was predicted to redden `world state is scoped to the scene that set it`, and no case of
that name existed. The run that follows this one found the tree dirty, measured it before touching anything,
wrote the missing case, discovered that the case AS ADDED still did not catch that arm, strengthened it, added a
second arm for the half the first arm cannot reach, and re-ran the probe. What is recorded below is that last
measurement, not the interrupted one.

The version is v134 rather than the v132 the draft's own scratch header called it, because this repository runs
ONE grant counter shared by the lanes: 132 had already been granted to the M2 lane before the world-bag draft was
written, and 133 is that lane's drafted-but-uncommitted grant. So this increment takes the next free number, and
the ledger is expected to show a hole where 133 sits until that grant lands.

Two shared documents are deliberately not written here: the ADR record for v134, and the ROADMAP cell. Both
files carry the other lane's uncommitted draft, and `git add` is file-granular — staging either would publish a
claim about code that has not landed. They are owed, and the sentence above is what says so.

`SaveData.worldState` is declared as `Record<string, unknown>` in `src/types.ts` and, up to this increment, was
read by nothing and written by nothing: the field joined the two others still in
`SAVE_DATA_FEASIBILITY.blocked` on the argument that a scene's world state has no owner in this runtime. It now
has one, and the row moves to `savable` — the fourth field a file carries, after `entities` (v119), `cinematic`
(v118) and `npcs` (v131).

**The methods.** `setWorldState(sceneId, key, value)` is the only door that writes a value, `getWorldState`
reads one, `getWorldStateKeys` answers the population sorted, `deleteWorldState` answers `true`/`false` for
"removed"/"was not there", `worldStateSnapshot(sceneId)` produces the FILE shape, `restoreWorldState` replaces a
scene's bag and answers the keys that landed, and `worldStateFieldAudit(sceneId)` reports `carried` beside
`untouched`.

**Checked at the set, not at the write.** A value that is not data a file can hold — a `Map`, a class instance,
an `undefined` leaf — is refused by `setWorldState` with the key path in the message. `assertDiskSafe` at
`buildSaveFile` would also have caught it, and that is exactly the problem: by then the caller has already
stored something this runtime can never restore. This is v117's rule ("a value this renderer cannot perform
refuses at registration") moved from the cinematic table onto the world bag, and the case that holds it says so:
`refuses a value a file could not hold, at the set rather than at the write`.

**A getter that copies.** `getWorldState` re-clones what it reads. The reason is in its own comment: if
`setWorldState` clones on the way in but the getter hands back the stored object, a caller can move the scene's
state through a READ, which is the one property the input clone was there to buy. `the snapshot is data —
sorted, deep-copied, and a shared branch copied twice rather than mistaken for a cycle` is the case that pins
both halves, and it is deliberately one case with three claims: sorted, because a bag whose key order follows
insertion order makes a save's bytes depend on the order the game happened to run in; deep-copied, for the
reason above; and a shared branch copied TWICE rather than refused as a cycle, because a world bag in which two
keys point at the same object is a thing a caller can legitimately have, and `assertDiskSafe`'s `seen` set is
there to stop infinite recursion, not to police aliasing.

**An empty bag is written, not omitted.** `worldStateSnapshot` returns `{}` for a scene that holds nothing, so
`a scene with no world state writes an empty bag, not an absent field`. The field's presence is a fact about the
FORMAT and its content is a fact about the world; collapsing the two is how a loader ends up unable to tell "the
player left no notes" from "this save predates notes".

**The file's own claim decides a missing bag.** `loadSaveFile` reads `carries` before it looks at the field
(measured: `threeRuntime.ts:1450` `claimsWorldState`), and a missing `worldState` is a refusal when the file
claims it and an ordinary old file when it does not — `an OLD file carries no bag, and the file's own claim is
what decides how that reads`. This is v131's rule for `npcs` applied a second time, now with the sentence
shared: `worldState is missing … and the file CLAIMS to carry worldState, so a bag is owed rather than optional`.

**The bag goes last.** In a load, entities first, then records, then the bag — so a failure in an earlier half
leaves no world state behind (`a load that fails on the entity half leaves no world state behind, because the bag
goes last`), and a load into a scene that already holds keys is refused BEFORE anything runs, because replacing a
live bag with a file's is a decision a caller has to make by name rather than one a loader makes on their
behalf (`refuses to load a bag into a scene that already holds one, before anything runs`).

**`restoreWorldState` replaces and answers the keys.** A merge would leave the previous state's keys standing
beside the loaded ones with nothing saying which is which; the answer is a key list rather than a boolean so
"restored an empty bag" is not reported as "nothing happened".

**The audit needs no second list.** `worldStateFieldAudit`'s `carried` is read out of the store itself, sorted,
and `untouched` is `UNTOUCHED_WORLD_STATE_FIELDS` minus whatever the scene actually holds — so a key a caller
set stops being reported, and a name added to the gap table shows up without anyone remembering to announce it.
`the audit names the keys the scene holds and the names this package refuses to keep` is the case; the probe arm
that hides one refused name from the list reddens exactly it.

**Scoping, which the probe had to be told about twice.** The bag is keyed by scene, so two scenes cannot step on
each other's facts. This came out of the probe rather than out of a design. The first run had no case of that
name at all, so the arm's prediction had nothing to grade; the case was written; and the SECOND run still did not
redden it — because the case as first written set one key per scene, and a setter that throws away the scene's
bag and builds a fresh one on every call passes that test while losing every key the scene said before. The case
now sets two keys in each of two scenes and asserts both survive and both stay separate, and a second arm breaks
only the lookup that answers a scene's keys, so each half of the sentence has an arm that reaches it.

**Measured.** 9 arms · 9 caught · no arm survived (control 0 red, exit 0) · 1 arm (08-writer-omits-the-bag) reddened 31 cases BEYOND its prediction, and the reason is shipped code rather than a loose case: that arm deletes a field from a file whose `carries` still names it, which is the refusal v131's rule produces (`threeRuntime.ts:1450` reads the claim, `1455` refuses the missing bag), so every case that loads a built file reddened beside it. An over-red is a witness, not a miss — but it is reported, not folded into the prediction. · no arm reddened FEWER cases than predicted.

The package runs 300/300 green across 5 files with `tsc --noEmit` exit 0, and this increment adds 12 cases to `test/saveSnapshot.test.ts` and renames one (`carries the four fields it can fill and names the three it leaves out`) so its title states the table's real shape: entities, cinematic, npcs, worldState on the savable side, sceneGraph, quests, player on the blocked one.

The arm that rebuilds a scene's bag on every set is the one that taught the case: arm 06 reddened three cases and NOT `world state is scoped to the scene that set it`, because that case wrote one key per scene, and a setter that throws the bag away and builds a fresh one passes that test while losing every key the scene said before. Arm 09 (keys answered from the wrong scene's bag) exists because the OTHER half of the sentence — which scene is asked — needs an arm that breaks only it.

## v135 — the three refusal accounts get ONE table, and every row says WHICH account refuses it

`npcFieldAudit`, `worldStateFieldAudit` and the save file's `doesNotCarry` each print a list of names this
package refuses to keep. Until this increment the three lists were typed by hand beside each other, so `quests`
appeared in all three with three different sentences and `player` in two, and nothing in the package could tell
you whether the accounts still described the same refusal. Worse, a caller reading ONE of them got a flat answer
to "is `quests` refused?" — a question with no flat answer, because refusal is a property of an account, not of
a name.

**The table.** `REFUSALS` at `threeRuntime.ts:125` is 8 rows, each declaring `planes` — which
of the 3 accounts refuse the name — and `needs` keyed **by plane**, so a row cannot assert a reason
for one account while staying silent about whether another agrees. `refusalsFor(plane)` at
`threeRuntime.ts:191` answers the account; it throws rather than emitting a blank when a row declares a plane
and withholds that plane's sentence, because a refusal a caller cannot read is a refusal that will be worked
around. Each account is now one derivation call:

| account | reads the table as | rows |
| --- | --- | --- |
| `npc-record` | `UNTOUCHED_NPC_FIELDS = refusalsFor('npc-record')` | 5 |
| `world-state` | `UNTOUCHED_WORLD_STATE_FIELDS = refusalsFor('world-state')` | 4 |
| `save-file` | `SAVE_DATA_FEASIBILITY.blocked = refusalsFor('save-file')`, which `buildSaveFile` copies into `doesNotCarry` | 3 |

**`refusalCensus()` is the reason the table exists.** At `threeRuntime.ts:2772` it answers, per row,
`refusedBy` and `notRefusedBy` across the whole plane list. A flat refusal list is a claim that every account
agrees, and the census makes that claim impossible to make by accident: 12 refusing sentences, each
owned by exactly one (name, plane) pair, each appearing exactly once in the file.

**The witness row is `entities`.** The world bag refuses it — the bodies a scene holds *are* the scene graph, so
mirroring them would be a second owner of one list — while the save file carries it for real, which is what v119
and v134 built. One flat "refused names" list would have to make one of those two readings false, and this very
table lists `entities` as `savable`.

**A table cannot honour three hand-written orders.** The accounts used to ship in three different orders; a
derivation gives one, so the published order is alphabetical by field name. This is a user-visible change to
`doesNotCarry`, and it went in only after being measured: 5 cases pinned the old orders and went
red, with no other case moving, and each was then updated with a comment saying *why* the order it expects is
alphabetical rather than by editing it to whatever the run printed. The reorder is safe for old files because
`diagnoseSaveFile` reconciles `carries` against `doesNotCarry` by membership only — the one positional check it
makes is the refusal at `threeRuntime.ts:1493` ("appears both as carried and as not carried"), which a
reorder cannot reach. Every old-file case stayed green through all 8 arms.

**Measured.** 308 cases across 5 files, 0 red, with `tsc -p tsconfig.json` (declaration
emit, which `--noEmit` skips) exit 0; `test/saveSnapshot.test.ts` gains 8 cases and
`test/cinematicSequence.test.ts` one expectation. `src/threeRuntime.ts` +160/−21,
`src/index.ts` one re-export line (its types were already public, so the door that answers a plane ships with
them), the two test files +160/−8.

### How the probe ran, and what it said

**9 arms including the control · control 0 red of 308 · 8 arms
caught · 0 survived** (`probe.mjs`, `probe-run3.log`). The arms are behavioural: each leaves the
module loadable and every case collectable, so a red is a case's assertion rather than an import crash. An arm
that *deleted* a `needs` sentence would throw while the top-level consts initialised and report 0 reds, so the
throw is graded a different way — inside a case that hands `refusalsFor` a bad row, leaving the shipped table as
the only thing the arms touch.

What the arms were chosen for, in the order they bit:

- dropping one plane from `quests`, mirroring `notRefusedBy` off `refusedBy`, and shortening one plane's
  sentence each reddened only the census and the account that reads it — the table is consistent with itself and
  still wrong, which is the drift the old three-list shape could not report at all.
- **retyping the NPC account as a correct-by-hand literal reddened exactly one case**, and every behavioural
  case stayed green. That single case is the whole grant: a retyped account that happens to agree today is
  green today, and only a derivation check can see the copy.
- making the file refuse `entities` too reddened 26 cases, 19 of them beyond the
  7 it was predicted to touch. That is shipped code, not a loose case: the arm puts a name in `doesNotCarry`
  that `carries` also names, which is the refusal at `threeRuntime.ts:1493`, so every case that loads a built
  file reddened beside it. An over-red is a witness, not a miss — but it is reported, not folded into the
  prediction.
- making `buildSaveFile` write its own excuse sentence at the call site, and making `npcFieldAudit` stop quoting
  the table, each reddened the case that compares an audit's words against the census rather than against a
  hand-picked string.
- turning the audit's fallback into a crash (`?.needs` → `!.needs`) reddened one case: the one that puts a
  property on the LIVE record that no row refuses. That branch is what honours the audit's own promise that a
  field added tomorrow "shows up here without anyone remembering", and before this grant grep found no test
  anywhere containing its sentence.

### Measurement error, kept in the record

This file is CRLF (3241 CR-LF pairs, no lone CR and no lone LF, read raw by node). Two of the probe's
arms anchor on a multi-line block, and an anchor written with `\n` inside matches nothing in a CRLF file: the
first attempt reported both as "anchor found 0 times", which is indistinguishable in the log from "the code
changed". The probe now re-writes every anchor in the ending it read from the file and prints which ending it
detected, so the next such report is attributable, and it keeps the bytes otherwise as read so the restore is
byte-identical rather than a line-ending rewrite of a tracked file.

Then the correction was wrong, and it is worth more than the first error. Before this section was written, a
shell-based reading of the same file reported 0 CR bytes, and on the strength of that a scratch note declared the
CRLF story deleted — while `toEol` was, on that reading, a no-op that had somehow fixed two arms. The
contradiction is what forced the re-measure above, and the answer is that the file is CRLF and the shell reading
was the error. The lesson is not "grep lies" but narrower and more checkable: **a line-ending measurement has to
come from the same reader that will act on the answer**, because the two disagreed here and only one of them
decided whether an arm ran.

### What v135 still does NOT honor — stated by name

- **`player` is still a name with two refusals and no owner.** `SerializedPlayer` is declared in `types.ts`, and
  nothing in this package fills one or reads one, so the row stays in `blocked` for both accounts that refuse
  it. Making it real is the next grant's subject, not this one's.
- **The shipped table's own refusal has no reader.** A `needs` sentence missing from the shipped table is a
  throw during module initialisation, so it is graded through an injected row and not through the file: no case
  can show what a broken *shipped* table looks like at runtime, because nothing with one never runs.
- **Nothing outside a test reads `refusalCensus()`.** It is the grant's point and its only consumer is
  `saveSnapshot.test.ts`; the Studio has no face that shows which account refused which name.
- **The ADR record and the ROADMAP cell are owed, as they were for v134.** Both shared files carry the other
  lane's uncommitted draft, and `git add` is file-granular: staging either would publish a claim about code that
  has not landed.

### Sentences this record retires

- Any reading of "`quests` is refused" as an answer. It is refused three times, by three accounts, for three
  different reasons, and the census is now the only shape that says which one a caller is holding.
- `README.md:95` at v115's section enumerates `blocked` as `[sceneGraph, npcs, quests, player, worldState,
  cinematic]`. That order is a history of when each row arrived, and from v135 the field itself answers in
  alphabetical order; a doc that repeats a derived order by hand will disagree with the derivation forever, so
  this section names the rule instead of re-listing the rows.

## v136 — the scene has one player, and a file can carry it

`SerializedPlayer` was declared in `types.ts` and filled by nothing: `player` sat in `blocked` under two
accounts, and `SaveData.player` had no writer and no reader. This grant gives the record an owner and a half in
the file, and it turns up a second thing — a report that had been agreeing with the loader by accident.

**What landed.** `attachPlayer` / `getPlayer` / `detachPlayer` / `playerSnapshot` / `restorePlayer` /
`playerFieldAudit`, with `players: Map<SceneId, Player>` — one player per scene, keyed by the scene and not by
the entity, because the record is "who is being controlled here", and a second owner of that would be a second
opinion about the same body. `attachPlayer` reads the body it is attached to (`position` cloned, `rotation`
copied, so a later transform of the entity is not a change to the player's saved stance), refuses a hotbar slot
that names no body in the scene, refuses a non-finite number at the door naming the field it would have turned
into `null` in a file, and refuses a second record naming the owner it would displace. `SaveFile` gains
`player: SerializedPlayer | null`, and `null` is WRITTEN, not omitted: a file that says `player: null` claims it
looked and found none, which is a different statement from a pre-v136 file that has no such key — the same
old-file rule the npcs half (v131) and the world bag (v133) already obey, and `carries` names the half so the
loader can tell the two apart rather than guessing from a missing field. A fourth refusal plane,
`'player-record'`, joins `REFUSAL_PLANES`, and `UNTOUCHED_PLAYER_FIELDS = refusalsFor('player-record')`:
`inventory` is now refused by three planes with three different sentences, and `player` itself is refused only
by `'world-state'`, because a bag key of that name would be a second owner of one player.

**Suite at this follow-on: 5 files / 322 cases / 0 red and `tsc --noEmit` exit 0 (114s), graded from HEAD's own bytes materialised into `.scratch/v136/headpkg/packages/three-runtime` with the write-side CRLF restored on 5 of its 12 files, and a before/after digest over every graded file saying nothing moved.** An earlier draft of this line said "322 passed / 5 files, 0 failed" and no kept artifact backed it: the two collections that exist are `5 files / 321 cases / 0 red` (`full-after-diagfix.json`, before the new case) and `5 / 322 / 1 red` (`fix-run.json`, with it — that red being the wording iteration), both taken mid-fix.

### The hole the probe found, in the order it was found

The first probe run (`.scratch/v136/probe.mjs`, 12 arms + control, `probe-run.log`) graded the source before
this fix: **control 0 red of 321, 11 arms caught, 1 survived**. The survivor was the arm that deletes the
writer's `player: this.playerSnapshot(sceneId),` line. It reddened 16 cases — every case that loads a file it
had just built, because the loader refuses a claim without its half — but it left
`atomic save writes: … > the whole listing is partitioned: loadable, unloadable and unreadable are three
different answers` **green**, which is what the arm was chosen for.

That green was not a loose prediction; it was a mechanism. `diagnoseSaveFile` graded a file's `carries` against
`SAVE_DATA_FEASIBILITY.savable` — the file's VOCABULARY — and never against the halves actually in the bytes. So
a file naming `player` and shipping no `player` key was reported `loadable: true` while `loadSaveFile` refused
it at `threeRuntime.ts:1659`. The docstring above that function says the two must not be free to disagree, and
the arm proved the sentence was unenforced: every case that paired the two happened to use a file where the
claim and the bytes agreed. Fixed at `threeRuntime.ts:1982` by `claimsWithoutBytes`, and the problem sentence is
the loader's own wording (`the file CLAIMS to carry player but ships no player half`) rather than a paraphrase,
for the reason v127's `noclaims` case already gives: two readers of one file should not produce two descriptions
of one refusal. `null` stays loadable — it is a value, so the check reads the key, not the name.

### The second probe run, at the fixed source

**13 arms including the control · control 0 red · 12 caught · 1 arm predicted-but-not-red · 5 arms that
reddened more than predicted · 0 that reddened fewer** (`probe-fixed.log`). Say the denominator, because the two
probe runs do not share one: this version runs `test/saveSnapshot.test.ts` alone, whose population is **146 cases**
(`npx vitest list test/saveSnapshot.test.ts`, read after the run), while the first run's harness collected across
all five files and printed 321. A draft of this sentence put "0 red of 322" beside the control, which is a borrowed
population — the package total at this ref is 322 and is reported as that, separately, one section above. The writer-omits arm
is now caught: its 18 reds include the partition case and the new claim-vs-bytes case. Its one miss is
`an OLD file that says nothing about the player is read as carrying none` — and that is my prediction being
wrong, not the suite: deleting the writer's line does not merely omit a half, it puts `player` in `carries` with
no key behind it, which is exactly the mismatch that case's hand-built old file exists to survive. The
mutation is broader than the mechanism it aimed at, and it is reported as a witness rather than folded into the
prediction. New arm `13-diagnosis-grades-words-not-bytes` puts the diagnosis back to grading vocabulary alone and
reddens exactly the one case that pins the new check.

### Measurement error, kept in the record

Two of these readings were wrong before they were corrected, and both were mine.

- A test run started ~15 s after an edit to `src/threeRuntime.ts` reported **1 failed** at a case that passes
  both before and after (`refuses a player whose body the file does not carry BEFORE any half runs`, which
  received a rollback message from `restorePlayer` instead of the loader's pre-check). The source was graded
  while it was being rewritten. A re-run of the same command on the same bytes reported 0 failed, and the whole
  JSON report was then used instead of a tail. **A suite run is a reading of bytes, so it has to come after the
  bytes stop moving.**
- The same rewriting erased a landed edit: the Edit tool reported success, the harness reported "the file
  baseline was refreshed", and `grep -c claimsWithoutBytes` came back 0 after the run. From that point the src
  file is written by a script that asserts its own anchor count, writes, re-reads, and counts the marker
  (`.scratch/v136/applyDiagnosisFix.mjs`), and the marker is counted again AFTER the test run rather than only
  before it. The earlier scare that the tracked source had lost `player: this.playerSnapshot(sceneId),` is the
  same event seen from the other side: the line was there, a reader had caught the file mid-rewrite.

- The whole-file writer that restored the erased Edit read `src/threeRuntime.ts` off the disk, and a concurrent M5
  run was writing v137 (player operations: `damagePlayer`/`healPlayer`/`spendMana`/`gainExperience`) into that same
  file at that moment, so `git add <file>` handed those hunks to `1e729f5`, whose message describes only the
  diagnosis fix. Measured at the ref: the four operations have **0** hits in the committed `saveSnapshot.test.ts`
  and 16/8/8/6 hits in its uncommitted worktree copy — v137's own run is still writing them. Not reverted (a shared
  tree does not get cleaned by `git checkout`), and now the rule: in a shared worktree, staging by file is not
  enough when the FILE is shared — read the staged hunks against the grant being committed first.
- `git show HEAD:docs/ROADMAP.md` is **not** the worktree's bytes: `core.autocrlf=true` hands back LF-normalised
  content, so a raw equality check against a CRLF copy reports a difference (measured: exactly the file's 24 CRLF
  pairs) with nobody writing. A shared doc's stale-base guard is `git status --porcelain -- <path>` empty AND an
  EOL-normalised comparison.
- Measuring a ref means materialising it, and the copy has to keep the repository's DEPTH: laid flat, the
  package's `extends: ../../tsconfig.base.json` cannot resolve, vite fails to transform, and every test file
  collects **0** cases behind `runnerExit 1` with empty per-file `failureMessage`s — a green-shaped artifact that
  grades nothing. The gate script now refuses to call a 0-case collection a result.
- **`c506d00` published v137's own evidence section, and `522b9c7` could not take it back.** The v137
  account of itself is 76 lines of this file (HEAD 1746–1821) that were sitting UNCOMMITTED in the
  worktree while the follow-on landing script read it in order to patch it. `git add <file>` stages the whole
  file, so a commit whose message says it pays the v136 follow-on records also carried another grant's prose:
  `114 added / 9 deleted` lines here, and all 76 of the section's lines are among those additions
  (measured by intersecting the section with the commit's `+` lines — the direction is fixed by `## v137` being absent
  from `1e729f5`'s copy). Read from the other side: `git show --name-only 522b9c7`, v137's own commit, lists this
  README **0** times and `packages/three-runtime/src/` **0** times — by then every byte of its evidence
  section was already in history under someone else's name, so its author had no diff left to stage. This is the second
  time in a night, and the `1e729f5` bullet above already states the rule that was broken: in a shared worktree,
  staging by file is not enough when the FILE is shared — read the staged hunks against the grant being committed.
  What was missing was a check that can FAIL before the commit happens. This landing ends in one, and it has now
  failed once on this script's own arithmetic — it printed numstat's DELETIONS field (9) where it meant its
  additions (114), and the guard refused the stage rather than letting the wrong number into the
  record. A record of a whole-file-stage accident that is itself written by a whole-file stage has to name its own
  diff line by line: single file, staged additions equal to the drafted count, and no `+` line of a docs commit
  may open a `## v` section.
- **The §7 door re-ran at `c506d00` and cannot be paid while this package has a live writer.** 73 rows in
  4082 s: 3 FAIL (bridge-report-proof.mjs, confession-proof.mjs, drive-axis-proof.mjs), 4 KILL (cwd-axis-proof.mjs, index-vectors-proof.mjs, provenance-proof.mjs, tree-axis-proof.mjs), 66 OK. The summary's `failed 7` and
  this row-level FAIL count differ by 4, and the runner's source arbitrates instead of my arithmetic:
  `sweep.mjs:1842` — `const failed = results.filter((r) => !r.ok);` — counts a kill as not-green, while `sweep.mjs:1673` is where
  the word `killed` is minted, so a killed row gets its own verdict and never enters the FAIL count. The summary's `failed`
  means "not 66 OK", and 3 is the number of rows that failed an assertion. All 4 kills are at the runner's own
  240000 ms default (241660 / 240744 / 242566 / 240710 ms), none at a budget a row named, so none of them belongs to three-runtime.
  And the summary says `tree … (MOVED mid-run)`: attributable rather than a mystery. `522b9c7` landed at 04:39 and the
  next grant rewrote `src/threeRuntime.ts` at 05:16, both inside this 68-minute walk — and note that
  `[identity] dirty tracked sources under packages: 0` is printed once, at identity time, so `dirty-sources 0` is true of
  the first second of the run and says nothing about the rest of it. The promise in this file that
  "the door re-runs at the docs commit" is retired here and replaced by its condition: the door is paid at the
  next ref where nothing under `packages/` is dirty at the moment the run STARTS and stays dirty-free throughout,
  which the summary's own MOVED flag is now the only honest witness for.

### What v136 does NOT honor — stated by name

- **`SaveFile`'s five halves are not all graded the same way.** `claimsWithoutBytes` refuses a claim with no key
  for every name in `carries`, but the loader is stricter on two of them: a missing `entities` or `cinematic` is
  refused whatever the file claims, while the diagnosis still calls such a file loadable through
  `readableNowButNotCarried`. The disagreement the arm found is closed for the shape v136 made reachable, not for
  every shape a hand-written file can wear.
- **A player still has no `inventory` writer.** The field is refused by three planes and stays refused; this
  grant made the record real, not the bag real.
- **`detachPlayer` has no Studio face.** Nothing outside a test attaches or detaches a player.
- **The ADR record, the ROADMAP cell and the §7 evidence-door run were owed at v136 and are paid by this
  follow-on**: amendment 136 carries an addendum, the ROADMAP M5 cell re-attributes its measurement, and §7 ran at
  `1e729f5` — 73 rows: 3 FAIL (confession-proof.mjs, drive-axis-proof.mjs, report-kill-proof.mjs) and 4 KILL.
  Two of the FAILs read `docs/evidence/agents/*`, which is the M2 lane's own surface and not three-runtime's, so
  they are recorded here rather than edited; the kills belong to the runner's own 240000ms default rather than to
  any assertion, because that run shared the box with the package gate, and the door re-runs at the docs commit.
  The reason the clause could not be paid at v134/v135 — the M2 lane holding uncommitted drafts in the shared
  docs — is gone at this landing: `git status --porcelain` lists 4 tracked modification(s)
  (docs/ROADMAP.md, docs/decisions/0016-agent-runtime-hermetic-demo-loop.md, docs/evidence/three-runtime/README.md, packages/three-runtime/test/saveSnapshot.test.ts), and the ADR and ROADMAP are not among them, so this append cannot sit on a stale
  base. Note that §7's identity line says `dirty tracked sources under packages: 0` and cannot mean the same
  thing: `sweep.mjs:233` `dirtySources()` keeps only paths under a `src/` directory, so it reads 0 beside a
  modified test file — which is why this clause cites `git status`, not the sweep.


### Sentences this record retires

- "`player` is a name with two refusals and no owner" — v135's closing bullet, and true when it was written. It
  now has an owner, a half in the file, and one remaining refusal (`world-state`), which says why the bag may not
  hold a second one.
- "the diagnosis's verdict is the load's verdict" as a description of the code before this fix. It was a
  promise in a docstring, enforced only by cases whose files happened to be self-consistent; from v136 the
  claim-vs-bytes check makes it a property the suite can redden.


## v136 — the player record gets a body and a file: `attachPlayer`/`playerSnapshot`/`restorePlayer`, a fourth refusal plane, and `player: null` as a claim the writer makes

`SaveData.player` was declared as `SerializedPlayer` and backed by nothing: the shape named a live
`THREE.Vector3`, a live `THREE.Euler` and a `Map`, no record held one, no writer wrote one and no reader read
one — so the field sat in `blocked` for two accounts and a file could only ever name it as an omission. This
grant gives it the three halves the save lane has needed every time, plus the fourth account the refusal table
gained for it.

**The record.** `attachPlayer(sceneId, entity, options)` holds ONE player per scene, keyed by scene; position
and rotation default to where the body ALREADY stands and are cloned in both directions; `getPlayer` answers
`undefined` and DROPS a record whose body has left the scene (emitting `playerOrphaned`), so a caller is never
handed a player that cannot be anywhere. A scene that already has a player refuses a second one BY NAME
(`detachPlayer` first): one scene is played as one body, and two records would leave every later question about
the controls with two answers. `removeEntity` drops the scene's record with the body it removes — the rule v131
gave NPCs, one layer up, because a player is keyed by SCENE rather than by entity.

**Refused at the door, not at the write.** A hotbar slot naming a body the scene does not hold, and a
non-finite number in any of the six scalars or in a skill level, are refused by `attachPlayer` with the field
named. `JSON.stringify` writes `NaN`/`Infinity` as `null`, so a record that accepted one would come back off a
file holding a DIFFERENT number than the caller put in — the drift `setNPCReputation` already refuses a
standing for. `inventory` starts empty and STAYS empty: it is the one declared field the file shape does not
carry, and `playerFieldAudit` names it from the refusal table rather than from a second list.

**The file shape.** `SerializedPlayer` holds eleven of the twelve declared fields: position and rotation as
plain numbers, `skills` as a sorted ENTRY ARRAY (a `Map` is written `{}`), and a `hotbar` copied rather than
aliased. `playerSnapshot` returns `null` for a scene with no player, and `restorePlayer` pre-checks the shapes,
the scene, the body and the live conflict BEFORE it registers anything, in the same order `loadSaveFile` uses
for the record it was handed: "these bytes are not a player half" stays true whatever the scene holds, while
the state conflict is the one that tells the caller to detach and retry.

**`player: null` is a claim; an absent key is an OLD file.** `buildSaveFile` writes the half either way, so
`null` is this format saying "looked for a player and found none" — a different statement from a pre-v136 file
with no `player` key at all. `loadSaveFile` reads the FILE's own `carries` first: a missing half is a refusal
when the file claims it and an ordinary old file when it does not, and `diagnoseSaveFile` reports that same file
loadable with `player` in `readableNowButNotCarried`. Both directions are pinned by name, because v127's rule is
that a diagnosis may not call loadable a file the load would refuse — or refuse one it would load. Every id the
player names (the body it is played as, and every non-empty hotbar slot) is checked against the bodies THIS FILE
carries before any half runs.

**The fourth account.** `RefusalPlane` gains `player-record` by lengthening the declaration and nothing else,
which is the shape v135 built the table for: the plane set, the census, the per-plane reason and every case that
enumerates the plane set move in the same commit. `savable` gains `player`, so a file carries five fields
(`entities`, `cinematic`, `npcs`, `worldState`, `player`) and the two left out are `sceneGraph` and `quests`.

**Measured.** 321 vitest cases across 5 files, 0 red (`test/saveSnapshot.test.ts` 145, was 132 — 13 new cases,
one of them the renamed v134 case, `carries the four fields it can fill and names the three it leaves out` →
`carries the five fields it can fill and names the two it leaves out`, so its title states the table's real
shape); `tsc -p tsconfig.json --noEmit` exit 0.

### How the probe ran, and what it said

**11 arms including the control · control 0 red of 145 on the one file the arms live in · 11 caught · 0 missed ·
3 arms reddened MORE than predicted · 0 fewer.** The source was restored byte-for-byte in a `finally` and the
restore verified against a digest taken before the first arm.

Arms, and the case each was predicted to redden — all caught: 01 aliasing the body's transform instead of
cloning it; 02 letting a scene hold a second player; 03 skipping the hotbar slot check; 04 accepting a
non-finite number; 05 emitting the live `Map` for `skills`; 06 hiding the `inventory` gap from
`playerFieldAudit`; 07 ignoring the file's own claim about a missing player half; 08 skipping the pre-check that
the player's body is among the file's entities; 09 keeping the record in `removeEntity`; 10 letting
`restorePlayer` overwrite a live player; 11 dropping `player-record` from `REFUSAL_PLANES`.

The three over-reds are witnesses, not misses, and each is attributed rather than folded into the prediction:

- **05** (`skills` as a live `Map`) reddened 4 cases instead of 2. The two extras are `assertDiskSafe` seen from
  a second angle: the file handed to `buildSaveFile` holds a Map, so every case that builds or loads a file with
  a player reddens with `file.player.skills holds a Map, which JSON.stringify writes as {}`.
- **06** (hiding the `inventory` gap) reddened 3 instead of 2. The extra is the shared `the audits answer in the
  table's own sentences for their own plane` case, which asserts the `player-record` audit carries gaps at all —
  the same claim as the case the arm was predicted against.
- **11** (dropping the plane from the list) reddened 4 instead of 1. The three extras are the shared census
  cases: a `refusedBy` that no longer mentions `player-record` is a census answering a different question.

### Measurement error, kept in the record

The probe's first run reported **17** reds for arm 01 against a prediction of 1, and 16 of them were not about
the aliased transform at all: the working copy of `threeRuntime.ts` was missing the line
`player: this.playerSnapshot(sceneId),` from `buildSaveFile` — a mutation shaped exactly like an arm, left
behind by an interrupted run rather than by this one. The line was restored, the file went back to 321/321, and
the arm was re-run from a verified-clean baseline, where it reddened its one predicted case. The lesson is the
one v134 already put in this directory: **a probe that writes the shipped source has to be re-run from a
baseline whose digest was taken after the tree was verified clean, because a mutation left behind is
indistinguishable from a defect until someone measures it.** The 17-red first run is recorded rather than
deleted, because it is the reason the second run's numbers can be trusted.

### What v136 still does NOT honor — stated by name

- **The record is filed and never driven.** Nothing reads `health`, `mana`, `experience`, `level`, `skills` or
  `hotbar` to change anything: the player does not move by its own record, does not spend mana, does not level,
  and no control, HUD or hotbar binds to it. `attachPlayer` is a fact about a scene, not a step of a game.
- **`inventory` is still refused everywhere.** `InventoryItem` holds two `Map`s and no inventory system fills
  or reads one, so the field is named by the fourth plane's own sentence while the record ships an empty array
  nothing ever changes.
- **A restored player is carried as DATA, not as geometry.** `playerSnapshot` carries position and rotation, so
  a restored player stands where the file says, but the body it is played as is whatever `restoreEntity` built.
- **The lazy drop is a second owner of one cleanup.** `getPlayer` removes a record whose body has left the
  scene and `removeEntity` does the same eagerly; arm 09 shows the event assertion is what makes the eager half
  non-vacuous, and both are kept because a caller who removes an entity by another route still must not be
  handed a player that cannot be anywhere.
- **Nothing outside a test reads `refusalCensus()` or `SAVE_DATA_FEASIBILITY`**, and the Studio has no surface
  for any of this: no panel shows a player, and no file's `player` half is editable in the browser.
- **`sceneGraph` and `quests` remain blocked** — and they are the whole of the blocked list for the first time
  since `savable`/`blocked` was written.

### Sentences this record retires

- v135's bound: *"`player` is still a name with two refusals and no owner. `SerializedPlayer` is declared in
  `types.ts`, and nothing in this package fills one or reads one, so the row stays in `blocked` for both accounts
  that refuse it. Making it real is the next grant's subject, not this one's."* — that is this section, and the
  row now sits on the savable side.
- v131's `Next` line offering *"take the next blocked `SaveData` field (`player`, the smallest of the four)"* —
  `player` is carried; `sceneGraph` and `quests` are what is left.
- The M5 ROADMAP cell's *"`SaveData`'s four remaining blocked fields stay blocked"*, and the evidence header
  line's grant list ending at v135 — the header now names v136, and the blocked count is two.

## v137 — the player record's declared numbers get operations: damage / heal / mana / experience / level, each refusing by name what a drive would otherwise invent

v136 gave the record a body and a file and wrote its own loudest bound in the same breath: *"the record is FILED
AND NEVER DRIVEN — nothing reads `health`, `mana`, `experience` or `level` to change anything"*. This grant
drives them, and the drive is deliberately smaller than a game: five operations that move the declared numbers
and nothing else, each with the refusal that keeps it honest.

**The door every operation goes through.** `requirePlayerForOperation` refuses a scene with no player (naming
the scene) and an amount that is not a finite non-negative number (naming the operation). The second refusal is
`attachPlayer`'s rule moved onto the operation: `JSON.stringify` writes NaN as null, so an amount this door
accepted would come back off a file as a different number. A NEGATIVE amount is refused rather than interpreted
as its opposite — a caller who means "heal" has `healPlayer`, and a sign that silently reverses an operation is
how a damage call becomes a healing one.

**Damage reports what LANDED.** `damagePlayer` subtracts `min(amount, health)`, so an overkill blow reports the
health that was actually there. `died` is true only on the call that crossed from positive to zero: a
zero-damage blow is not a death and a blow on a corpse is not a second one. The caller's own `reason` rides
along in the report and the event and is never read by the runtime — a listener that has to guess why a blow
landed is a listener reading a different event than the one that fired.

**Health clamps; mana refuses.** `healPlayer` clamps at `maxHealth` and answers a report of zero when the record
is already full — asking for health it has is an answer, not an error. `spendMana` REFUSES a spend larger than
the pool, naming both numbers. The difference is deliberate and stated: an overkill blow has an obvious reading
(the target is dead) while a spell the player cannot afford does not, so the caller is told instead of being
handed a spell nobody paid for.

**Experience moves experience, and nothing else.** `gainExperience` adds and does NOT touch the level, and the
report carries the unchanged level so a caller cannot read the silence as a curve that fired. There is no
threshold table in this package on purpose: an experience curve is a design decision, and the honest place for
one is a caller that says out loud when a level is owed. `setPlayerLevel` is therefore the ONLY door a level
changes through, and it refuses a zero, a fractional or a non-finite level rather than flooring one.

**Measured.** 333 vitest cases across 5 files, 0 red (`test/saveSnapshot.test.ts` 157, of which this grant's
describe holds 11); `tsc -p tsconfig.json --noEmit` exit 0.

### How the probe ran, and what it said

**10 arms including the control · control 0 red of 157 · 10 caught · 0 missed · 2 arms reddened MORE than
predicted · 0 fewer.** The source was restored byte-for-byte in a `finally` and the restore verified against a
digest taken before the first arm.

Arms and the case each was predicted to redden — all caught: 01 letting damage land more than the player had;
02 accepting a negative amount; 03 firing the death boundary on a corpse; 04 not clamping a heal; 05 clamping a
spend the pool cannot cover; 06 dragging a level along with experience; 07 accepting a level below one; 08
inventing a player for a scene that has none; 09 moving the report without moving the record; 10 emitting no
event.

The two over-reds are the same claim seen from a second angle, and neither is folded into the prediction:

- **01** reddened 2 cases instead of 1, the extra being `a dead record is still a record: health never goes
  below zero` — the arm drives health to `-97`, which is the other half of "an overkill blow clamps".
- **09** reddened 4 instead of 1, because "the record IS the numbers the report describes" is asserted by the
  death-boundary case and by both save cases as well as by the damage case.

### A measurement note from this grant's own accounting

The runner's line for `saveSnapshot.test.ts` read **145** at the v136 commit, while that commit's own file holds
**146** blocks and every one of them is collected today. The current file's block count and the runner's count
agree exactly (157 / 157), so the earlier line is one short of its own file. It is recorded rather than
reconciled, and it is the shape this host is already known for — vitest under-reporting on this Windows box —
arriving one layer down, at a case instead of a file.

### What v137 still does NOT honor — stated by name

- **No game reads these numbers.** An operation moves a declared field; nothing in this package decides what a
  dead player may do, what a spell costs, when experience is earned, or what a level unlocks. There is no combat
  step, no cooldown, no turn and no damage formula: the runtime moves numbers a caller names.
- **No curve and no automatic level.** `gainExperience` never changes a level and `setPlayerLevel` never reads
  experience. The two are joined by a caller, not by this runtime.
- **`mana` has no producer.** `spendMana` takes mana and nothing puts it back: there is no `regainMana`, no
  regeneration tick, and no link between the pool and `maxMana` beyond the setter that already existed.
- **Equipment, buffs and resistances do not exist**, so nothing modifies an amount between the caller and the
  record: `damagePlayer` subtracts exactly what it is handed.
- **`inventory` is still refused on every plane**, and `sceneGraph` and `quests` are still the blocked `SaveData`
  fields.
- **No Studio surface**: no panel shows a player's numbers and no control drives one.

## v138 — `CombatSystem`/`CombatEntity` stop being declared words: a body's record gets an owner, two operations, one death transition, and an audit that says which of the thirteen declared fields nothing reads

`types.ts` declared `CombatEntity` (13 fields) and `CombatSystem`, and **no code in this package constructed
either** — the M5 goal names `combat` among its nouns, and until this grant the only health this runtime held
was the player's own record. v138 makes one body's record real, and it is the same shape v136/v137 gave the
player, one plane over.

**A record needs an owner and a scene.** `attachCombatant(sceneId, entity, options)` refuses a scene or a body
that is not there, by name. It refuses a body that is the scene's **player**, because the player's numbers
already have an owner in `attachPlayer`/`damagePlayer`: one health with two records is the drift this package
keeps naming, and routing a blow through whichever record a caller happened to reach would make the number
depend on the call. It refuses a **second** record on one body. Every declared number is checked at the DOOR —
a non-finite one because `JSON.stringify` writes it as `null`, so a record would come back off a file holding a
different value than the one written; a negative one because no rule here reads a negative health, armor or
power as anything but a record already at its floor; and `health > maxHealth` is **refused rather than
clamped**, because a record that starts above its own maximum is a claim no heal could honour.

**`strike` states its arithmetic instead of tuning it.** `damage` is what LANDED after armor, not what the
attacker asked for — the word `PlayerDamageReport` uses, for the same reason: a blow and an overkill are two
different claims and a report that conflated them would make armor unmeasurable. Armor subtracts and a
non-zero blow lands **at least one**, so armor is a mitigation rather than an immunity; a zero blow lands zero.
With no `amount`, the attacker's own `attackPower` is used and the report carries the number that was used.
An overkill blow reports less than it asked for; a blow on a corpse reports zero. `died` is true only on the
call that took health from a positive number to zero.

**Death is ONE transition, entered and left by exactly two calls.** `strike` sets `aiState` to `dead`; only
`healCombatant` crossing health back above zero leaves it (to `idle`), and `revived` is true only there. A
**corpse does not strike** — refused by name, because "the state a dead body is in is the one transition this
runtime keeps, and this is it being read". A heal at full health answers a report of zero rather than refusing,
exactly as `healPlayer` does, and clamps at `maxHealth`.

**A body may not be its own target** (added while landing this grant). The refusal comes BEFORE the striker's
own state is read: "you named one body twice" is a fact about the call while "that body is dead" is a fact about
the world, and a malformed call should not be reported as a world condition. Without it a caller who transposed
two arguments halved their own health and got a report that looked like a hit. There is no precedent either way
in `damagePlayer`, which takes no attacker at all.

**The audit is read from the type, not restated.** `combatFieldAudit` answers `consulted` / `unhonored` in the
shape `physicsFieldAudit` uses, and the last section of the suite **reads `src/types.ts` off disk** and requires
the two lists to partition the declared `CombatEntity` — no overlap, no gap. 6 fields are consulted
(`aiState`, `armor`, `attackPower`, `entityId`, `health`, `maxHealth`) and 7 are not, each with what it is
waiting on: `attackRange` (a strike NAMES its target, so a range has no reader), `attackSpeed` (nothing
schedules a second blow), `attackType` (the door refuses a fifth word, but no rule differs between melee and
ranged), `cooldowns` (a clock, and the frame loop is the only one here), `faction` (stored and consulted by
nothing), `statusEffects` (`StatusEffect` holds `onApply`/`onRemove`/`onTick` FUNCTIONS — a record carrying one
is a record no file can hold and no tick here would run), and `target` (a strike keeps none). A field added to
the type tomorrow lands in one of those lists or the suite is red.

**A record dies with its body.** `resolveCombatant` drops an entry whose entity has left the scene, emitting
`combatantOrphaned` — the rule `resolveNpc` runs by — so no caller is ever handed a combat record with nothing
left to be a body. A record attached in ANOTHER scene is a stated refusal rather than an answer about this one.

Verified in `packages/three-runtime/test/combatRecord.test.ts`: **22 cases**, `tsc -p tsconfig.json` clean,
package suite **361/361** across 7 files.

### What v138 still does NOT cover — stated by name

- **No turn, no initiative and no AI decision.** `strike` happens when a caller makes one. `aiState` is read
  (a corpse cannot strike) and written (death, revival) but nothing chooses a target, and `target` is named as
  an unhonored field above.
- **No damage formula beyond `max(1, amount - armor)`.** No resistances, no criticals, no damage types:
  `attackType` is stored as a declared word and no rule reads it.
- **Armor never reaches immunity** — the floor of 1 is deliberate and stated, not a bug, but it does mean a
  sufficiently armored body still takes 1 per non-zero blow.
- **No regeneration and no tick.** `cooldowns` and `statusEffects` are unhonored for the reason given, so
  nothing in this package advances a combat state over time.
- **Self-inflicted damage has no operation.** It is refused at `strike` rather than supported by a second
  door; a caller who wants it must say so in a future grant.
- **No Studio surface and no agent tool**: no panel shows a combat record and no tool drives one.

## v139 — the package face stops being a hand-copied list: four wholesale re-exports, 6 derived cases that read the modules instead of repeating them, and a probe that puts the old list back

`src/index.ts` is what a caller of `@nexus/three-runtime` can spell. Until this grant it spelled
three of its four modules' exports out by hand (`./types.js` was already starred, which is why
nobody looked twice at the three that were not), which made every grant two grants: add the export
to the module, then remember the barrel line. The second half had no gate, no checklist and no
failure mode — it just quietly decided that a name was private.

**The accident this grant found.** v135 added `refusalsFor` and its row type `RefusalRow`,
documented the row in the module, and never wrote the barrel line. Measured at `9bf77b1` (the ref
before this landing) the reader prints `holes=1` and names it: `RefusalRow`. Every call site that
could have noticed — the refusal census, its three accounts, the tests that build a table by hand —
either lives inside the module or spells the fields out, so nothing imported the type and nothing
reddened.

**The rate, measured rather than asserted.** The first landing of this section claimed the list was
"losing names at roughly one per grant" while quoting a fresh worktree reading as if it were a
historical one. So the claim got a second reader: `.scratch/v139/measureOldListVsWorktree.mjs`
grades the hand-copied list exactly as it stood at `9bf77b1` against the module bytes as they stand
in the worktree NOW — where the v138 writer's combat names are still uncommitted. It reports
`holes=4`: `CombatAttachOptions`, `CombatantFieldAudit`, `DEFAULT_COMBATANT`, `RefusalRow`. The same
modules through this grant's face report `holes=0`. The four are not one kind of mistake — one is
this lane's own forgotten line, three are a live neighbour's in-flight work that no checklist in
this repository could have caught, because the barrel's owner cannot see a module it does not read.
That asymmetry is the argument for `export *` over "remember to update the list", and it is now
re-runnable instead of remembered.

**The repair removes the class.** The face is now four `export *` clauses — the union of its modules
— so a module cannot declare a name the barrel omits. The reason it had not been done is real and is
now measured rather than weighed: two starred modules that both own a name make that name disappear
with only a TS2308 note to prove it was ever ambiguous. At `c30f592` the four modules own 123 names
(`types 75`, `threeRuntime 31`, `saveStore 6`, `renderBackend 11`) with zero pairwise collisions;
the same reader on the live worktree counts 129, because v138's in-flight names are in those bytes.
The one name two of them touch, `DEFAULT_THREE_CONFIG`, is owned at `types.ts:774` and merely
forwarded at `threeRuntime.ts:49` — one binding, one owner. `tsc -p tsconfig.json --noEmit` exits 0
on the wholesale barrel, which settles the question by asking the compiler rather than me.

`test/packageFace.test.ts` holds the rule as 6 cases that derive their expectations from the module
bytes and the barrel bytes, with no literal name list anywhere: reachability of every owned export,
every module mentioned, no two owners of one name, a forwarded name resolving to its owner and
forwarded from that owner's file, and the imported namespace's value layer equalling exactly the
modules' own values plus their forwards. The sixth case is the one that makes the other five
believable: it feeds the same finders a synthetic hand-listed barrel and requires them to name the
shapes they exist to catch — a module the face never mentions, an owned name left off the list, and
a name the list spells that no module declares. It runs in-process against a table rather than by
editing a module, because `src/types.ts` and `src/threeRuntime.ts` are held by a live v138 writer
and no arm of mine may touch them.

**How the probe ran.** 10 reported lines over 3 arms, each mutating only `src/index.ts` and each
asserting its own byte-change before grading: [summary] 3 arms, 0 mismatched · index.ts restored
byte-exactly: true · original sha 57e2cc864d79. Arm A put the v135 list back; it reddened the
reachability case and the value-layer case and nothing else — 361 cases collected, 2 failed, 0 red
outside `packageFace`. That is the accident reproduced on purpose, and the suite's blindness
reproduced with it. Arm B dropped one module's clause and reddened 3 cases; arm C named a member the
module had stopped declaring and reddened 2 while `tsc` exited 2 (TS2305). Round 1 of this probe
predicted 1/3/0 reds and measured 2/4/2; the three misses were mine (the old list also hides v138's
`DEFAULT_COMBATANT` — now measured at four names — so the value case reddened too; case 6 read the
real barrel for its clean direction and so duplicated case 1; and esbuild does not typecheck, so a
ghost name is a behavioural red rather than a load failure), and round 2 hit all three. Round 1 is
left in the log rather than retro-fitted.

**Measured.** 361/361 vitest cases across 7 files, 53/53 suites, 0 failed, at the landing; `tsc`
exit 0; staged diff +198/−27 over 2 files. The 7-file figure is a WORKTREE reading: it includes the
v138 writer's uncommitted `test/combatRecord.test.ts`; 6 test files are tracked at the landing ref.
That distinction is the same one amendment 137 had to state, and it is stated here rather than
smoothed over.

**Correction on re-read (recorded, not smoothed).** This section and amendment 139 were first landed
by `15ebe8e` with one sentence that interpolated a FRESH worktree reading (`holes=0`) into a clause
about the HISTORICAL pre-swap state — the exact confusion this lane's own trap list names, caught by
reading back my own committed text. The fix is not to delete the sentence but to make the claim
derivable, which produced the `measureOldListVsWorktree` reader above. The same landing's mechanical
reflow also dropped two-space bullet continuations and doubled two `- ` markers, so the whole region
was rewritten rather than poked; every deleted line of the correction lies inside this section, and
the bytes before it are byte-identical to their HEAD state.

### What v139 still does NOT cover — stated by name

- **No consumer was broken, because there is no consumer.** Nothing outside `packages/three-runtime`
  imports the package yet, so `RefusalRow` being unreachable cost a caller nothing but a type they
  could not write. This grant prevents the next one; it does not repair an outage.
- **The gate is a regex reader.** It understands `export const/function/class/interface/type/enum`,
  `export { a, b as c } from` and `export * from`. A name any of the modules produces by another
  route — a computed re-export, a namespace object, an `export { * as ns }` — is invisible to it,
  and the case that proves the finders can see the broken shape covers only the shapes this package
  actually uses.
- **A wholesale face has no editorial voice.** Every exported name of every module is now public API
  of the package. Anything that should stay internal must stop being exported at the module, which
  is the honest place for that decision but also a decision nobody has had to make for this package
  yet.
- **The package face is not the product face.** No Studio surface, HUD or agent tool imports
  `@nexus/three-runtime`; the roadmap's M5 entry is still a runtime with tests, not a feature a user
  can open.

## v146 — a save may not be created on a name that debris already owns: the store seam stops one atomic write from deleting two saves

`src/saveStore.ts` owns `SAVE_TEMP_SUFFIX`, `writeAtomic` writes its half-written file at
`${path}.tmp`, and
`sweepTempFiles` (`threeRuntime.ts:2006` at `2017f5c`) deletes every listed name ending in that
suffix.
`resolveSavePath` is the
boundary every path crosses — the module says so twice, and both stores obey it — and it refused
absolute forms,
`..`, `''` and `.` segments. It never mentioned the suffix, so `x.json.tmp` was a legal save name
and the temp of
the save called `x.json` at the same time.

**Measured on a probe, not on a feeling.** `.scratch/vnext/collisionProbe.mjs` runs against the
built store seam
and prints what the seam actually does: `resolveSavePath ACCEPTS "x.json.tmp"` on both planes; then
a plain
`writeAtomic("x.json")` puts its temp on that name and renames it away, so the hand-written save's
bytes are
replaced and the name stops existing — the probe's `store.list() now = []` is one call deleting two
saves with no
throw anywhere. A second direction replays the sweeper's own predicate over a listing: a
caller-written
`real-save.tmp` is IN the deletion set. And the repository had been demonstrating this in its own
suite: v126's
sweep test planted its debris with `store.write('x.json.tmp', 'half-written junk')`.

**The repair is on creation, and the narrowness is the finding.** `resolveNewSavePath` adds one
clause to
`resolveSavePath` and both stores' `write`/`writeAtomic` go through it, while `read`, `exists`,
`list` and `delete`
keep the plain boundary. That line was drawn by a counter-example rather than by taste: widening the
same rule to
`resolveSavePath` makes `latestSaveFile` throw while it reads the header of every name it lists, so
the store would
trade a silent loss for a crash in a caller that did nothing wrong — a leftover is a fact about the
host. Arm W5
runs exactly that widening and reddens 9 of these cases, which is how this section can say the
narrowness
is tested instead of merely asserted.

**10 cases in `test/saveNameCollision.test.ts`**, every expectation derived from `SAVE_TEMP_SUFFIX`
instead
of a typed-out `'.tmp'`, and paired in both directions: the refusal and the message that names the
save whose temp
the worn name is; the suffix-not-substring direction (`a.tmp.json`, `progress.tmp2`,
`x.json.tmp.bak` stay legal);
the unconstructibility of the measured collision, asserted as an `ops` log rather than a promise —
the temp is
still made under that name, because the rule did not blind the writer it protects; and the four
verbs that must
keep accepting the name, including `delete` taking debris back and still refusing `../escape.tmp`.

**Arms: 5 of 5 matched their predicted red case names.** - W1 · MATCHED · collected 375 · red in
saveNameCollision.test.ts: saveStore: a save may not be created on a name debris owns (v-next)
creation refuses a name that is another save half-written file, and says which save it would land
on; saveStore: a save may not be created on a name debris owns (v-next) a name that is nothing but
the suffix is refused too, admitting the save it collides with is not a name; saveStore: a save may
not be created on a name debris owns (v-next) both stores refuse the creation, because both cross
the same creation rule; saveStore: a save may not be created on a name debris owns (v-next) the
measured collision is unconstructible: the save cannot be made, so the atomic write has nothing to
land on · red outside: 0
- W2 · MATCHED · collected 375 · red in saveNameCollision.test.ts: saveStore: a save may not be
  created on a name debris owns (v-next) creation refuses a name that is another save half-written
  file, and says which save it would land on; saveStore: a save may not be created on a name debris
  owns (v-next) both stores refuse the creation, because both cross the same creation rule;
  saveStore: a save may not be created on a name debris owns (v-next) the measured collision is
  unconstructible: the save cannot be made, so the atomic write has nothing to land on · red
  outside: 0
- W3 · MATCHED · collected 375 · red in saveNameCollision.test.ts: saveStore: a save may not be
  created on a name debris owns (v-next) creation refuses a name that is another save half-written
  file, and says which save it would land on · red outside: 0
- W4 · MATCHED · collected 375 · red in saveNameCollision.test.ts: saveStore: a save may not be
  created on a name debris owns (v-next) both stores refuse the creation, because both cross the
  same creation rule; saveStore: a save may not be created on a name debris owns (v-next) the
  measured collision is unconstructible: the save cannot be made, so the atomic write has nothing to
  land on · red outside: 0
- W5 · MATCHED · collected 375 · red in saveNameCollision.test.ts: saveStore: a save may not be
  created on a name debris owns (v-next) creation refuses a name that is another save half-written
  file, and says which save it would land on; saveStore: a save may not be created on a name debris
  owns (v-next) a name that is nothing but the suffix is refused too, admitting the save it collides
  with is not a name; saveStore: a save may not be created on a name debris owns (v-next) the
  narrowness is real: the same name still passes the boundary that reading and deleting use;
  saveStore: a save may not be created on a name debris owns (v-next) both stores refuse the
  creation, because both cross the same creation rule; saveStore: a save may not be created on a
  name debris owns (v-next) the measured collision is unconstructible: the save cannot be made, so
  the atomic write has nothing to land on; saveStore: a save may not be created on a name debris
  owns (v-next) debris the host already holds stays listable and readable, so browsing a store
  cannot crash on a leftover; saveStore: a save may not be created on a name debris owns (v-next)
  delete still takes a half-written file back, and says false the second time; saveStore: a save may
  not be created on a name debris owns (v-next) delete keeps the confinement even though it never
  carried the save-name rule; saveStore: a save may not be created on a name debris owns (v-next)
  the memory store answers false for a name it never held instead of pretending · red outside: 1
  (declared: 1)

**Measured on a frozen plane, because the shared worktree had a live writer.** The suite ran on a
local clone of HEAD with -c core.autocrlf=false (2017f5c, 344 files, the plane's saveStore.ts held
11691 bytes with 0 CR, so the plane is the ref's own bytes), built because the shared worktree
carried another writer's in-flight edits — 365 cases clean
at 2017f5c before any of this grant's files entered the plane; 375 cases across 8 files, 0 red,
`tsc -p tsconfig.json --noEmit` exit 0, and the worktree staged at +378/-7 over 5 files. The
suite
numbers belong to the plane; the landed bytes were compared against it after the commit, which is
what makes a
gate figure and a commit figure mean the same code. The `test/saveSnapshot.test.ts` change is one
line and it is
the honest version of a plant: debris goes into the host's own bytes, because that is what a
half-failed rename
leaves, and it is no longer something a caller may write.

### What v146 still does NOT cover — stated by name

- **A name can still arrive from outside.** `sweepTempFiles` is unchanged and still decides by
  suffix, so a
  `x.json.tmp` a human dropped into the saves directory is debris to it. What this grant closes is a
  save being
  CREATED on that name by a caller, which is the direction the probe could reach.
- **The sweeper's predicate is read, not gated.** Its `endsWith` clause lives in
  `src/threeRuntime.ts`, a file this
  grant did not touch; `test/saveNameCollision.test.ts` proves the store seam's side, and the arm
  table above is
  the only evidence that the read-side half of the collision is understood rather than guessed.
- **No consumer is affected.** Nothing outside `packages/three-runtime` calls the store seam as a
  save-name
  boundary yet, so this prevents a loss instead of repairing an outage.

## v147 — a player record that starts above its own ceiling is refused at the door: the verb that puts
health back could previously take it away

`src/threeRuntime.ts` has two attach doors for a body that carries numbers. `attachCombatant` has
refused an
above-ceiling health since v138 — `:3208-3210` at `39448f9` — while `attachPlayer` tested one
thing over
its six declared numbers: that each is finite (`:2915-2919`), because a save file writes `NaN` and
`Infinity`
as `null`, and a record that comes back holding a different number than the caller wrote is the
drift this lane
refuses everywhere. Finiteness says nothing about what two numbers may say ABOUT each other, so a
health of 150
under a maxHealth of 100 was a legal player record. And `healPlayer` does not clamp by comparing to
the ceiling
— it clamps by SUBTRACTING, at `:3090` — so on that record the difference is negative, and the next
heal removed
health while reporting itself as a heal.

**Measured on a probe, at the landing ref, against bytes nobody had fixed.**
`.scratch/vnext/probeAtHead.mjs`
clones HEAD into a throwaway plane, drops the probe in as `test/zzCeilingProbe.test.ts`, runs it,
writes the
output to `.scratch/vnext/ceilingProbe-head.out`, and deletes the probe. Before running it reads the
subject
file and refuses if the ceiling clause is already there — a probe that runs after the fix measures a
green tree
and calls it a finding. What the unpatched door answered:

- "accepted a record above its own ceiling: true", with the state line beneath it reading health 150
  and
  maxHealth 100.
- "healPlayer(10) -> report.healed=-50, health 150 -> 100, delta -50". The docstring one line above
  that
  method says "Put health back, clamped at maxHealth"; the run says the number moved DOWN by 50 and
  the event
  bus was told a heal happened.
- mana was accepted at 900 under a maxMana of 50. `spendMana`'s only rule is that a spend is not
  more than the
  pool, so an over-ceiling pool is a number no later spend can be measured against.
- a negative record (health -5, mana -20) was accepted too, and its heal ADDS: healed 3, health -5
  to -2. That
  is why this section does not call itself a validity rule.
- `attachCombatant` REFUSED, in the same file, in the same run: "a record that starts above its own
  maximum is
  a claim no heal could honour, so it is refused rather than clamped". The asymmetry is the finding,
  and the
  combatant door is the wording this grant adopts.

**The repair is one loop over the pairs the record declares.** The pairs are health/maxHealth and
mana/maxMana,
and the clause refuses value greater than ceiling, inserted after the finiteness loop so the two
rules stay two
rules. Each refusal names the mechanism its OWN field breaks — for health the maxHealth-minus-health
difference
that turns into a removal, for mana the report that carries maxMana beside the pool — because one
shared
sentence would be a claim about the loop rather than about the number the caller actually passed.
The sentence
also claims that nothing in this package raises a ceiling, and the new suite grades that claim
against the
source text instead of trusting it: the scan that must find no assignment to any max field must
still find the
three fields that do move, health, mana and experience, or a broken scan would print the same zero
as a true
one.

**The narrowness is measured, not asserted.** Negative records still pass this door. Arm C5 widens
the clause to
refuse them as well and reddens exactly one case — the one whose entire job is to say a negative
record still
passes — so the width of the rule has a witness attached rather than a preference. `attachCombatant`
does refuse
negatives, at `:3204-3206`, and this grant does not silently widen itself to match, because no verb
here
inverts on a negative the way `healPlayer` inverts above a ceiling.

**The file half inherits the door, and that is a disclosed behaviour change.** `restorePlayer` calls
`attachPlayer` at `:3008`, and `loadSaveFile` calls `restorePlayer` inside the try whose catch
removes
everything it had already registered (`:1796`, `:1799`). So a save file written before this clause
that holds
health 150 under maxHealth 100 is now REFUSED AT LOAD instead of played with an inverted heal. Two
cases pin the
direction: the direct refusal, and the loader refusal paired with its control — the same bytes with
the ceiling
untouched still file the body and the player. Two lines that only assert a throw would also be
satisfied by a
loader that never loads anything, which is the control's job.

**11 cases in `test/playerCeiling.test.ts`**, in three subjects: what the door refuses, what the
file half
inherits, and how narrow the rule is. The refusal directions are paired with their equality
counterparts — a
record exactly at its ceiling is a full pool and stays legal, and a legal record's heal report reads
as a heal
for every amount, including the overflow heal, the already-full heal that answers zero, and the
requirement that
no healed figure in that sequence is negative.

**Arms: 5 of 5 matched their predicted red case names.**
- C1 · MATCHED · the clause never fires (the door stores the impossible record again) · collected
  386 · red in playerCeiling.test.ts: attachPlayer refuses what attachCombatant already refuses
  health above maxHealth is refused at the door rather than clamped; attachPlayer refuses what
  attachCombatant already refuses mana above maxMana is refused by the same rule, not by a
  mana-specific one; attachPlayer refuses what attachCombatant already refuses each refusal names
  the mechanism its own field would break; attachPlayer refuses what attachCombatant already refuses
  the measured inversion is now unconstructible: no record for healPlayer to invert; the file half
  inherits the door restorePlayer refuses an above-ceiling record because it goes through
  attachPlayer; the file half inherits the door a save file whose player half exceeds the ceiling is
  refused by the loader, and its half-load goes back; the rule is exactly as wide as the mechanism
  attachCombatant still refuses its own shape, so the two doors agree by word as well as by rule ·
  red outside: 0
- C2 · MATCHED · the mana pair is dropped from the rule (health alone is a ceiling) · collected 386
  · red in playerCeiling.test.ts: attachPlayer refuses what attachCombatant already refuses mana
  above maxMana is refused by the same rule, not by a mana-specific one; attachPlayer refuses what
  attachCombatant already refuses each refusal names the mechanism its own field would break · red
  outside: 0
- C3 · MATCHED (round 3 at this ref, all 24 attributed) · the comparison becomes >= (a full pool is
  read as impossible) · collected 386 · red in playerCeiling.test.ts: attachPlayer refuses what
  attachCombatant already refuses a record exactly at its ceiling is a full pool, not an impossible
  one; attachPlayer refuses what attachCombatant already refuses each refusal names the mechanism
  its own field would break; attachPlayer refuses what attachCombatant already refuses a legal
  record has its heal report read as a heal for every amount; the file half inherits the door
  restorePlayer refuses an above-ceiling record because it goes through attachPlayer; the file half
  inherits the door a save file whose player half exceeds the ceiling is refused by the loader, and
  its half-load goes back · red outside: 24 (declared: 24)
- C4 · MATCHED · the two mechanism sentences are swapped (the message no longer names its own field)
  · collected 386 · red in playerCeiling.test.ts: attachPlayer refuses what attachCombatant already
  refuses each refusal names the mechanism its own field would break · red outside: 0
- C5 · MATCHED · widened to refuse any negative too (this grant is NOT a validity rule) · collected
  386 · red in playerCeiling.test.ts: the rule is exactly as wide as the mechanism a negative record
  still passes the door: no measured inversion follows from it · red outside: 0

**C3 is the result that decided the comparison.** Predicted before measuring: reading the test as
greater-or-
equal would add one case to this file. Measured: 5 reds here and 24 outside, in
`combatRecord.test.ts` and `saveSnapshot.test.ts`, because on that reading the rule fires on the
DEFAULT record
— health 100/100 17x, mana 50/50 3x, health 5/5 1x, health 40/40 1x, health 10/10 1x — and every
scene in this package begins a playthrough at a full pool. 23
of those
outside reds parse to an equal pair (the reported value equals the reported ceiling, with the
ceiling's own
name attached); the last one is vitest's own matcher message truncating the refusal it quotes, so
its equality
was derived from the plane's bytes rather than from the printed text. The case attaches three times
and two of
those attaches name neither field, so the 100 it reports is DEFAULT_PLAYER's own health, which
equals
DEFAULT_PLAYER's maxHealth — and the ceiling loop sits before the skills loop in the method body,
which is why
the case died before reaching the NaN assertion it was written for. A greater-or-equal rule is not a
narrower
rule; it is a rule that refuses the package's own defaults, and that is why the clause is strict.

**Measured on a frozen plane, because the shared worktree has live writers.** The suite ran on a
local clone of HEAD with -c core.autocrlf=false (39448f9, 345 files, the plane's threeRuntime.ts
held 212821 bytes with 0 CR and hashed 11c9b05565e8, so the plane is the ref's own bytes), built
because the shared worktree carries other lanes' in-flight edits. The
per-file counts
below belong to that plane, with this grant's files applied and nothing of anybody else's:

| test file | cases | red |
| --- | --- | --- |
| characterController.test.ts | 39 | 0 |
| cinematicSequence.test.ts | 78 | 0 |
| combatRecord.test.ts | 23 | 0 |
| packageFace.test.ts | 6 | 0 |
| playerCeiling.test.ts | 11 | 0 |
| saveNameCollision.test.ts | 10 | 0 |
| saveSnapshot.test.ts | 157 | 0 |
| scenePhysics.test.ts | 30 | 0 |
| threeRuntime.test.ts | 32 | 0 |
| 9 files | 386 | 0 |

Re-run in the shared worktree at the landing, after these bytes were written there: 386 cases over 9
files, 0 red, with playerCeiling.test.ts collecting 11, and every per-file count equal to the
plane's — which is what lets a gate figure and a commit figure mean the same code The first pass
measured this patch at c8396a3 — baseline 362 over 7 files, applied 373 over 8 — but 39448f9 moved
18 added and 1 deleted line of threeRuntime.ts itself, so the anchor, every line citation in this
section and C3's outside count were re-derived at the landing ref rather than carried over

### What v147 still does NOT cover — stated by name

- **A ceiling that can never be raised.** No assignment to player.maxHealth or player.maxMana exists
  after
  construction — that is the fact the refusal leans on, and the census in the new file is its
  witness. So this
  grant refuses an impossible record; it does not give the package a way to earn a bigger pool, and
  a full pool
  stays full for the life of the scene.
- **Mana has no producer.** Nothing in the package puts mana back, so mana above its ceiling was
  constructible
  only through the attach door or a file. The refusal still earns its place for the file direction,
  but this
  section does not claim a runtime path was inverted for mana the way one was measured for health.
- **Negative records still enter through this door.** Measured, and deliberately left alone: no verb
  here
  inverts on a negative the way `healPlayer` inverts above a ceiling. If one later does, the width
  of this rule
  becomes a finding rather than a decision, and the case that pins it today is named in the C5 arm
  row above.
- **A refused file stays a refused file.** Nothing rewrites saves that already hold the impossible
  shape:
  loading one now throws with the all-or-nothing rollback sentence instead of producing a playable
  body whose
  next heal removes health. That is the loss this entry chooses, because the alternative is a
  playerHealed event
  that lies.
- **No consumer is affected.** Nothing outside `packages/three-runtime` calls `attachPlayer`,
  `restorePlayer`
  or `loadSaveFile`, so this prevents a wrong number rather than repairing an outage a user has
  already seen.

## v150 — a save name has ONE owner between the confinement and the host: the backslash that already decided a
refusal now decides the bytes on disk

`src/saveStore.ts` confined a save name in four clauses: not empty, not absolute, does not walk out with `..`,
has no empty or `.` segment. Every one of them reads the name by splitting it — `const segments = path.split(/[\\/]/)`
at `:92` of `0ea322e` — and then the function returned the caller's string **unchanged**. That is one policy with two
owners of the name's identity. The store's own rule says a backslash is a separator: it is what refuses
`saves\..\escape.json`. The host gets the raw bytes and decides for itself: on a POSIX host `saves\hero.json` is one
file whose NAME contains a backslash, and on this Windows host it is a directory `saves` containing `hero.json`. So
`list()` — v123's promise of "every save name the store holds" — was a count that depended on the machine reading
it, and worse, a save the caller wrote under one spelling could be replaced, byte for byte, by a write under a name
the other host considers the same file.

**Measured before anything was written, on a 12-leg probe** (`.scratch/vnext/probe196.mjs`,
`probe196-measurement.json`, all legs green at `c8396a3`):

| leg | what the unpatched door answered |
| --- | --- |
| P-A1 | `resolveSavePath('saves\\hero.json')` returns the name unchanged |
| P-A2 | the same function already calls a backslash a separator: `saves\..\escape.json` throws on `..` |
| P-A3 | the memory store keeps `saves/hero.json` and `saves\hero.json` as TWO saves with distinct contents |
| P-B1 | on a POSIX-semantics host a backslash stays an ordinary character in a name |
| P-B2 | there the two spellings are two files, and each deletes on its own |
| P-C1 | on THIS host the write into an existing root throws `ENOENT` — for a name the policy accepted |
| P-C2 | once the directory exists the two spellings are ONE file and the last write won |
| P-C3 | **the same script and the same store type report 2 saves on POSIX and 1 here** |
| P-D1 | `writeSaveFile` accepts the backslash name and echoes it verbatim in `report.path` |
| P-D2 | `latestSaveFile` treats the two spellings as two saves and answers the newest |
| P-D3 | on a POSIX host the runtime lists and re-reads a save whose printed name contains a backslash |
| P-D4 | `sweepTempFiles` reaches a backslash-named temp |

P-C3 is the finding and P-C2 is its worst edge: a save is destroyed by a name the caller never typed, silently,
because the host settled it. P-C1 is the same divergence from the write side — an OS error that blames the disk for
what is a naming rule.

**The probe was re-collected at the landing ref, and one leg is now unreachable for a reason of its own.** Run A put
the same 12 legs onto a plane of `0ea322e` and collected 12, with 11 green and 1 red: P-D4 no longer reaches
`sweepTempFiles`, because v146's rule refuses to CREATE a save whose name ends in the temp suffix
(`resolveNewSavePath`, `saveStore.ts:121`). The prediction was written to expect exactly that one attributed red —
`unattributed 0 · reason off prediction 0` — because a probe leg that dies for an unrelated rule is not the hole
closing, and reporting it as one would have been the loudest possible way of hiding it.

**The repair was chosen between two candidates by running both** (`decide196.mjs`, one decision probe under three
rules on the same plane, the legacy file seeded BELOW the seam so it is exactly what shipped code could leave
behind):

| asked about a name whose spelling the rule changes | `none` (shipped) | `refuse` | `canonical` (`replace(/\\/g,'/')`) |
| --- | --- | --- | --- |
| `read(listed)` | the bytes | throws the refusal | `null` |
| `exists(listed)` | `true` | throws | `false` |
| `delete(listed)` | `true`, and it goes | throws | **`false`, while the host still holds the bytes** |
| a write under the OTHER spelling | a second save | throws, no second save | lands on the canonical name; the legacy bytes survive as an orphan |

`canonical` is a silent lie: `delete()` answering `false` means "the path held nothing", and here the host plainly
holds it. That is the same class this seam has refused since v122 — a store must not report a success it cannot
perform, and by the same logic must not report an emptiness it cannot see. So `refuse` is the rule, and a case pins
the rejection in the shipped file: `resolveSavePath` contains `replace(/\\/g, '/')` exactly 0 times.

**The obvious clause was falsified by this grant's own first run.** The draft asked, right after the split,
`segments.some((segment) => segment.includes('\\'))`. It typechecked. The suite collected 403 cases. And the door
refused nothing: ten refusal cases printed `expected [Function] to throw an error`, because the split that the
clause sat behind had already eaten every backslash, so no segment could ever contain one. The rule that can see the
difference is the one that asks the name to survive its own reading:

```ts
if (segments.join('/') !== path) {
  throw new Error(`saveStore: "${path}" does not re-join to itself after this rule splits it on "/" and "\\", …`);
}
```

A name whose segments do not re-join is precisely a name that was split on something this store does not join with —
and every other shape that clause could catch is already caught by the four clauses above it, which is what makes it
the narrow end rather than a fifth rule. The vacuous shape is now a case in its own right
(`cannot be written against the segments, because the split that reads the name already ate the backslash`), and the
text census asserts `segment.includes('\\')` appears 0 times beside `segments.join('/') !== path` appearing once, so
a future edit cannot restore the dead clause quietly.

**A name the CALLER chose meets the door; a name the STORE chose is reported.** That split is the design of the two
halves. `write`, `read`, `exists`, `delete` and creation all go through `resolveSavePath`, so a caller is told, out
loud, in a sentence that names both hosts and carries the name it refused. `list()` is different: it is a fact about
the host, and a store may hold a file that predates the rule. A save menu that throws on such a name cannot show
the other nine, so the three surveys that RE-ENTER a listed name ask `savePathRefusal` (`:126` — the same door, with
the throw taken out) and classify instead: `latestSaveFile` at `:1952`, `sweepTempFiles` at `:2023` (its record gains
a `refused` list), `diagnoseSaveFiles` at `:2141` (its reason union gains `name-not-reenterable`). No branch keys on
the refusal's wording: the case that seeds a file named `a/.` joins the same bucket carrying the `.` rule's own
sentence, which is what makes the bucket structural.

**18 cases in `test/saveNameSpelling.test.ts`**, in four subjects: the door (`refuses a backslash…`,
`refuses before any byte moves, on both stores`, `refuses the same name for creation too`, `does not canonicalise`,
and the segment-shape case), what the store reports about a name it cannot re-enter (6 cases, including
`a store holding nothing has all three answers empty, so a silent bucket cannot be a passing scan` — a bucket that
is empty because nothing was refused and a bucket that is empty because the scan never ran must not both pass),
every verb refusing a caller-chosen name (`write, read, delete and the single-file diagnosis all refuse it and none
of them half-does the job`), and how narrow the rule is (3 text-level cases, including the rejection of
canonicalisation). Three shipped `toEqual` pins in `test/saveSnapshot.test.ts` gain `refused: []`, because a record
that grows a field is re-pinned where it was pinned, not exempted from the pin.

**Arms: 7 of 8 MATCHED their predicted red case names, 0 red outside the grant file in any of them; W2 is
deliberately COUNTED rather than predicted, because the point of it is a blast radius.** Each arm is one edit on
run C's plane, restored before the next. The `census` column is the state of
`the three surveys that re-enter a listed name all ask the door…` under that arm, and its point is that the arm
which removes the BEHAVIOUR while leaving the TOKENS (W8) must find the census GREEN — otherwise the case would be
testing the text, not the seam.

| arm | edit | red (all inside the grant file) | census |
| --- | --- | --- | --- |
| W1 | the re-join clause is deleted from the door | 12: refuses a backslash… / refuses before any byte moves… / refuses the same name for creation… / does not canonicalise… / cannot be written against the segments… / the save menu survives… / the diagnosis gives it a reason… / the sweep reports a refused temp… / write, read, delete and the single-file diagnosis… / a backslash-named directory… / savePathRefusal answers about every name / the naming rule has one owner | GREEN |
| W2 | the clause widens to refuse EVERY name | 61 total: 10 here + 51 outside (saveNameCollision 10, saveNameSpelling 10, saveSnapshot 41) | — |
| W3 | the guard is removed from `latestSaveFile` | 2: the save menu survives the refused name / the three surveys… | RED |
| W4 | removed from `diagnoseSaveFiles` | 3: its own reason / the branch does not read the message / the three surveys… | RED |
| W5 | removed from `sweepTempFiles` | 2: the sweep reports a refused temp / the three surveys… | RED |
| W6 | a refused temp is pushed into `kept` instead of `refused` | 1: the sweep reports a refused temp, still removes the rest, and does not call it kept | GREEN |
| W7 | the refused name borrows the `not-json` reason | 3: its own reason / the branch does not read the message / the three surveys… | RED |
| W8 | `savePathRefusal` always answers `null` (the door stays, the surveys stop asking) | 5: the 4 reporting cases + savePathRefusal answers about every name | **GREEN** |

W2's number is the one worth keeping in mind when someone proposes widening this rule: refusing "every name" is not
a stricter version of the same policy, it is a different program — 51 of the package's 404 cases die with it.

**Measured on a frozen plane, because the shared worktree has live writers.** The suite ran on a local clone of HEAD
with `-c core.autocrlf=false` (`0ea322ecb8b0095c0011917d7b6540589c60c261`), built because the shared worktree carries
other lanes' in-flight edits; plane identity was asserted before any run (the plane's `saveStore.ts` held 13,957 B
and hashed `79f8772f2136`, `threeRuntime.ts` 214,370 B / `d997aa881675`, `saveSnapshot.test.ts` 167,816 B /
`999980ce683a`, each with 0 CR, so the plane is the ref's own bytes). Baseline A0 re-measured here rather than copied:
**386 cases over 9 files, 0 red** — v147's published number, confirmed at this ref. With this grant's bytes applied
(run C): **404 cases over 10 files, 0 red**, `tsc --noEmit` exit 0. After every arm ran, the plane was restored to
run C's tree and graded again: 404 over 10, 0 failed, `equals run C: true`.

| test file | cases | red |
| --- | --- | --- |
| characterController.test.ts | 39 | 0 |
| cinematicSequence.test.ts | 78 | 0 |
| combatRecord.test.ts | 23 | 0 |
| packageFace.test.ts | 6 | 0 |
| playerCeiling.test.ts | 11 | 0 |
| saveNameCollision.test.ts | 10 | 0 |
| saveNameSpelling.test.ts | 18 | 0 |
| saveSnapshot.test.ts | 157 | 0 |
| scenePhysics.test.ts | 30 | 0 |
| threeRuntime.test.ts | 32 | 0 |
| **10 files** | **404** | **0** |

Re-run in the shared worktree at the landing, after these bytes were written there: 404 cases over 10 files, 0 red,
with `saveNameSpelling.test.ts` collecting 18 and every per-file count equal to the plane's — which is what lets a
gate figure and a commit figure mean the same code.

### What v150 still does NOT cover — stated by name

- **`listSaveFiles()` is still a bare list.** The runtime's own listing verb (`:1929`, `paths: this.storage.list()`)
  does not classify: a store holding a name this build will not re-enter reports it as a path, and a caller who then
  reads it gets a throw. The three SURVEYS classify; the plain listing does not, and no case pretends otherwise.
- **A legacy file stays exactly where it is.** Nothing renames, rewrites or deletes a backslash-named save: it is
  still listed, still unreadable through the seam, and now named in a bucket that says why. The repair is outside
  this package, on the host, by whoever owns the directory.
- **No UI face shows either bucket.** `sweepTempFiles().refused` and `unreadable[].reason === 'name-not-reenterable'`
  have no consumer outside `packages/three-runtime`; nothing outside the package calls the save verbs at all (66
  sites, and outside the package's own tests they are three docs plus the declarations).
- **Names, not contents.** A save whose name re-joins is judged by the readers that already judge it; this grant
  adds nothing about what is inside the bytes, and the temp-suffix rule (v146) is a separate clause with its own
  arms.
- **The POSIX half is simulated.** This machine is Windows, so P-C1/P-C2 were measured on it and the two-files side
  of the divergence is measured against a POSIX-semantics `FsLike` written into the grant file (where `/` is the only
  separator). A real POSIX runner would re-measure that half rather than trust the fixture.
- **`refusalCensus()` does not count this door.** The census walks the `REFUSALS` table declared inside
  `src/threeRuntime.ts` (`:3523`) and keys its rows by FIELD; a save-name refusal is raised in `src/saveStore.ts`
  and is not a row there, so the number that census reports still understates how many named refusals a save can
  meet on the way to the host.

## v155 — a declared file shape is owned by a field path or refused by name: the shape gate counts `Serialized*` shapes instead of trusting one root's reach

**The gap, measured at `b73165c`.** `src/types.ts` declares 12 `Serialized*` interfaces. The suite's
shape gates call `declaredFields('NAME')` with a `Serialized*` name in 2 of the 10 shipped test files, and the
union of the `Serialized*` names they ask about is 7. The 5 nobody asks about: SerializedEuler, SerializedQuestSystem, SerializedScene, SerializedSceneGraph, SerializedVector3.
2 of them are WRITTEN by src — `vectorToData` (`threeRuntime.ts:947`) and
`eulerToData` (`:958`) — and sit inside `SaveFile`'s reach, under `SerializedEntity.position`
and `.rotation`. Every exact-key gate stops at the top level of `SerializedEntity`, so the nested shapes were
compared by nobody, including the `order` that `types.ts:484` documents as part of the pose.

**The rule.** A declared shape is legal only if it is ACCOUNTED:

| account | who satisfies it |
| --- | --- |
| a field path owns it | the census climbs declared field types from `SaveFile` and from `SaveData` and prints the chain; every link is re-checked against the parent's declared field list |
| a writer's keys are compared to its declaration | `SerializedVector3` and `SerializedEuler`, here — `snapshotEntity` and `playerSnapshot` both write them, and a round-trip case proves the compared shape still loads |
| some shipped gate compares it | read out of the test sources at run time (`declaredFields('NAME')` appears in one of them), so a later grant's gate counts without editing this file |
| the blocked half refuses it | a shape outside the file is legal only if its chain's FIRST hop leaves `SaveData` at a field `saveFeasibilityAudit` reports blocked, with a reason: `quests`, `sceneGraph` |

The two roots are different sets and the gate pins the difference: `SerializedPlayer` — 1
shape — is typed on `SaveFile` and
on no `SaveData` field (`SaveData.player` is a live `Player`); `SerializedQuestSystem`, `SerializedScene` and `SerializedSceneGraph` — 3
of them — are owned only by `SaveData`, and `SerializedScene` only one hop deeper
(`SaveData.sceneGraph → SerializedSceneGraph.scenes`), which is why the first draft's "typed by a `SaveData`
field" was false.

**Measured.** Plane `.scratch/vnext/plane7e` — a clone of `b73165cb1fa111bb87985c09f329b0dd1ed28fdf` with `core.autocrlf=false`, so the plane is LF and
every figure below is the plane's, not the shared worktree's. Round 4 measured this gate at `edf8681`; since then HEAD has taken 9 more commits and the shared ADR-0016 ledger has grown from amendment 150 to 154, so the plane was re-cloned at `b73165c` and re-run end to end: every one of the six measurement fields (baseline, withGate, tscWith, arms, final, finalTsc) in `.scratch/vnext/p7e-measurement.json` is byte-identical to the `plane7d` file at `edf8681`, which is the check that the intervening commits touched nothing this package owns.

| run | cases | files | red | tsc |
| --- | --- | --- | --- | --- |
| baseline (HEAD, no gate file) | 404 | 10 | 0 | — |
| with the gate | 417 | 11 | 0 | 0 |
| final (gate re-based, after the arms) | 417 | 11 | 0 | 0 |

The gate itself is 13 cases over 303 lines. 5 arms, each applied to HEAD's bytes and re-based before the
next: S1 MATCHED, S2 MATCHED, S3 MATCHED, S4 MATCHED, S5 MATCHED. Each arm reports `2 / 3 / 6 / 6 / 10` red, of which
2 / 3 / 3 / 6 / 1 land in this file.

| arm | what it breaks | predicted red (in this file) | verdict |
| --- | --- | --- | --- |
| S1 | SerializedVector3 declares a fourth field the writers never fill | snapshotEntity writes exactly the fields SerializedVector3 declares, in position and in scale; playerSnapshot writes the same two nested shapes | MATCHED |
| S2 | a 13th Serialized* shape is declared and owned by no field of either root | no declared shape is owned by neither root — a shape no field names is a shape that quietly exists; the shapes the file does not reach are exactly the ones with no writer to compare; each unreached shape's owner chain starts at a SaveData field the audit reports as blocked, with a reason | MATCHED |
| S3 | the Euler writer keeps every declared key but stops carrying the live order (it always writes 'XYZ') | snapshotEntity writes exactly the fields SerializedEuler declares, order included; playerSnapshot writes the same two nested shapes; what the writers write still restores, so the comparisons above are not describing an unloadable shape | MATCHED |
| S4 | the SaveFile climb reads nothing (an empty reach wearing a green coverage case) | no declared shape is owned by neither root — a shape no field names is a shape that quietly exists; the file's reach is a real set, read from the shape the loader actually accepts; every shape the file writes has its keys compared to its declaration, somewhere in the suite; the shapes the file does not reach are exactly the ones with no writer to compare; each unreached shape's owner chain starts at a SaveData field the audit reports as blocked, with a reason; the two roots reach different shapes, and each asymmetry has a named owner | MATCHED |
| S5 | the sceneGraph row stops speaking for the save-file plane, so the Map the file refuses has no refusal | each unreached shape's owner chain starts at a SaveData field the audit reports as blocked, with a reason | MATCHED |

The reds that land OUTSIDE this file belong to S3, S5 — S3 3, S5 9 — and they are named here rather than
buried in a total, because a census that only reddens its own file is not comparing the writers against the
declaration the rest of the suite reads.

**3 rounds of self-falsification, recorded because they are the finding.** Round 1 reddened on
`SerializedScene is declared but no SaveData field is typed with it`: true, and my clause was the wrong claim —
the shape is owned through `SerializedSceneGraph.scenes`. Round 2 reddened naming `SaveData.scenes`, a field that
does not exist: the chain printer had returned `hops.reverse()`, and `reverse()` mutates, so the caller's "root
field" was the leaf. Both were caught by the gate's own first run on HEAD, before any arm was trusted; the clause
now asserts the chain starts at `SaveData` instead of inferring which end it ended at. Round 3 made the gate green and then returned 1 arm whose in-gate reds were exceptions rather than verdicts (S3 — 5 of its 5 in-gate reds read `Error:`, and 98 more reds landed outside the gate), 2 arms whose red lists came out larger than predicted (S3, S4) and 1 arm whose predicted `tsc` exit was wrong (S1: predicted 1, measured 2); all 5 arms published here redden on assertions only.
The arm round 4 published keeps every declared key and lies about the value instead (`the Euler writer keeps every declared key but stops carrying the live order (it always writes 'XYZ')`), so
the writer's own order check stays out of the way and the only red left is the comparison's; the empty-climb arm
(`the SaveFile climb reads nothing (an empty reach wearing a green coverage case)`) reddens the coverage case as well, because that case pins that the shapes it compares are still
reached — a self-pin written and never predicted. Round 4 re-armed, re-predicted, and re-measured, and is the table above.

**Bounds.** No src behaviour and no file format changed. The 3 shapes this grant refuses by name (`SerializedQuestSystem`, `SerializedScene` and `SerializedSceneGraph`) remain
blocked rows — the census keeps them honest rather than making them savable. 27 of the 72
exported names in `types.ts` are still named by none of the three code modules, and the gate's own
"declared outside `types.ts`" scan does not read `index.ts` (a barrel with no local declarations at this ref);
this grant accounts for `Serialized*` shapes, not for every declared type.

## v168 — `savePathRefusal()` moves from module-level to the SaveStore interface: the store answers about a name without walking through the door (ADR 0016 amendment 168)

Before v168, `savePathRefusal(path)` lived only as a module-level function exported from `src/saveStore.ts`. Callers who wanted to classify a name had to import the helper directly (`import { savePathRefusal } from '../saveStore.js'`), while the store's own methods (`write`, `read`, `delete`) called it internally. The interface `SaveStore` exposed no way to ask "will you refuse this name?" — a caller had to try the operation and catch the throw, or reach for the module-level function.

**The fix is additive and costs zero reads.** `SaveStore` now declares `savePathRefusal(path: string): string | null` with documentation explaining it classifies save names without reading any file. Both implementations delegate to the existing module-level helper:

```typescript
// createMemorySaveStore() at :198
savePathRefusal(path) {
  return savePathRefusal(path);
},

// createFsSaveStore() at :291
savePathRefusal(path) {
  return savePathRefusal(path);
},
```

The module-level function stays owned by one place (`resolveSavePath` at `:126`), so the two halves cannot drift apart. A test suite of **5 new cases** pins the surface: valid names return `null` from both stores, debris names (`*.tmp`) are re-enterable but refuse creation (the interface method answers `null`, `resolveNewSavePath` throws), path traversal returns a reason, backslash names return the door's sentence, and the interface method agrees with the module-level helper across 8 names.

| what changed | before | after |
| --- | --- | --- |
| `SaveStore` interface | no classification method | `savePathRefusal(path): string \| null` |
| discoverability | callers must import the helper | the store itself answers |
| test suite | 417 tests, 0 red | 423 tests, 0 red (+5 interface cases, +1 arm clarification) |

**Measured at HEAD `956e43b`, 2026-10-06.** Nothing written to a tracked file beyond the three modified files; the tree is clean after the commit.

**Arms: 0 predicted, because this grant adds a method without changing behaviour.** The module-level helper still owns the refusal logic, so no existing case breaks. The interface method is purely additive — callers who use the module-level function see the same answers they saw before, and callers who ask the store get the same classification. The 5 new cases pin that the delegation works correctly for both store types.

**Measured on a frozen plane, because the shared worktree has live writers.** The suite ran at HEAD `956e43b` with `-c core.autocrlf=false`, built because the shared worktree carries other lanes' in-flight edits. Baseline: **417 cases over 11 files, 0 red**. After the grant: **423 cases over 11 files, 0 red**, `tsc --noEmit` exit 0.

| test file | cases | red |
| --- | --- | --- |
| characterController.test.ts | 39 | 0 |
| cinematicSequence.test.ts | 78 | 0 |
| combatRecord.test.ts | 23 | 0 |
| packageFace.test.ts | 6 | 0 |
| playerCeiling.test.ts | 11 | 0 |
| saveNameCollision.test.ts | 10 | 0 |
| saveNameSpelling.test.ts | 23 | 0 |
| saveSnapshot.test.ts | 157 | 0 |
| scenePhysics.test.ts | 30 | 0 |
| serializedShapeName.test.ts | 13 | 0 |
| threeRuntime.test.ts | 32 | 0 |
| **TOTAL** | **423** | **0** |

**Bounds.** No src behaviour and no file format changed. The module-level `savePathRefusal` still owns the refusal logic, so the two halves cannot drift apart. The census gate in `test/saveNameSpelling.test.ts` still pins all four callers of `storage.list()` inside `packages/three-runtime/src/*.ts` to classify: three surveys plus `listSaveFiles`, four total. 27 of the 72 exported names in `types.ts` are still named by none of the three code modules, and this grant accounts for the interface's discoverability, not for every declared type.

## v169 — Studio UI face for the save/load system: browse saves, select one, load it (ADR 0016 amendment 169)

v120-v168 gave the runtime a complete save/load backend: `writeSaveFile`, `readSaveFile`, `listSaveFiles`, `latestSaveFile`, `diagnoseSaveFile`, `deleteSaveFile`, and `savePathRefusal`. But the Studio's 3D surface (Scene3D.tsx) had only two buttons — "save" and "load" — where "load" could only reload the last saved file. There was no way to browse available saves, see their metadata, or select which one to load.

**M5 v169 closes the UI gap.** Three changes:

1. **Storage backend added to Studio runtime**: Scene3D.tsx now creates a `createMemorySaveStore()` and passes it to `ThreeRuntime({ storage })`, giving the Studio the same save persistence the package's test suite uses.

2. **SceneSaverLike extended with listSaveFiles()**: The structural interface in `lib/scene3d.ts` gains an optional `listSaveFiles(): SceneSaveEntry[]` method, and the Studio's saver implementation reads each save's header (format, version, entity count) without loading the full file — following v168's pattern of answering about names without walking through the door.

3. **UI controls added**: A "browse saves" button lists available saves in a scrollable panel showing path, version, entity count, and timestamp. Clicking a save selects it, and the "load" button loads the selected save instead of just the last one.

| what changed | before | after |
| --- | --- | --- |
| Studio runtime | no storage backend | `createMemorySaveStore()` injected |
| `SceneSaverLike` interface | `buildSaveFile`, `loadSaveFile` | + optional `listSaveFiles()` |
| UI controls | save, load (last only), send to doc | + browse saves, selectable list |
| Studio test suite | 214 tests, 0 red | 214 tests, 0 red (no regressions) |

**Measured at local workspace, 2026-10-07.** Build succeeded: Next.js production build compiled cleanly, TypeScript check passed, ESLint clean. Studio test suite: **214/214 passed** across 19 files. Three-runtime suite: **422/422 passed** across 11 files. No tracked files modified beyond the two Studio files (`Scene3D.tsx`, `scene3d.ts`).

**Arms: not applicable.** This is a UI increment — the save/load backend (v120-v168) already has its mutation arms in the package suite. The Studio change is wiring: adding storage, extending an interface, rendering a list. The evidence is that the build succeeds, tests pass, and the UI shows saves when clicked.

**Bounds.** The memory store is process-scoped: saves persist only while the Studio tab is open, matching the headless testing pattern. A future increment could wire `createFsSaveStore` for disk persistence, but that requires a Node backend seam the Studio does not currently have. The list reads headers only — it does not load full entity data until the user clicks "load". The UI shows saves in a simple vertical list; a more polished browser (thumbnails, previews, delete) waits on a separate grant.

## v165 — `listSaveFiles()` gains a name-level account: the listing verb classifies every name it holds via `savePathRefusal(path)` without reading any file, so a menu that shows a save this build cannot re-enter names WHY in its own bucket (ADR 0016 amendment 165)

v123 gave this runtime two verbs for asking what the store holds — `listSaveFiles()` and `latestSaveFile()` — but only one of them classified the names it listed. The bare listing returned `{ store, paths }` where `paths` was every name the store's host directory contained, including names whose spelling this build's naming rule refuses (backslash segments, temp suffixes, dot-only names). A caller who then tried to read one got a throw, because `listSaveFiles` had no way to say "I see it, but you cannot enter it."

**The three surveys already classified.** `latestSaveFile` (`threeRuntime.ts:1947`), `sweepTempFiles` (`:2021`) and `diagnoseSaveFiles` (`:2125`) all call `savePathRefusal(path)` on every listed name and report a `refused` subset with its reason. The plain listing was the only caller of `storage.list()` that did not classify — and the doc comment's promise ("Name every save the store holds, **without reading one**") meant the classification had to be pure string work on the path itself.

**The fix is additive and costs zero reads.** `listSaveFiles()` now returns `{ store: string; paths: string[]; refused: { path: string; why: string }[] }`:
- `paths`: unchanged, every name the store lists (a fact about the host, not a build opinion)
- `refused`: the subset this build will not re-enter, classified by `savePathRefusal(path)` — same shape as `sweepTempFiles().refused`, so a caller who handles one handles both

The census gate in `test/saveNameSpelling.test.ts` pins all four callers of `storage.list()` inside `packages/three-runtime/src/*.ts` to classify: three surveys plus `listSaveFiles`, four total. One test in `test/saveSnapshot.test.ts` updated its expectation to match the new shape (`toEqual({ store: 'fs', paths: [], refused: [] })`).

**Measured at HEAD `0e95f04`, 2026-10-06.** Nothing written to a tracked file beyond the three modified files; the tree is clean after the commit.

| what changed | before | after |
| --- | --- | --- |
| `listSaveFiles()` return type | `{ store, paths }` | `{ store, paths, refused }` |
| classification cost | N/A (no classification) | 0 reads per name (pure string work via `savePathRefusal`) |
| census population | 3 callers of `storage.list()` classified | 4 callers classified (3 surveys + `listSaveFiles`) |
| test suite | 417 tests, 0 red | 417 tests, 0 red (one expectation widened) |

**Arms: 0 predicted, because this grant adds a field without changing behaviour.** The `paths` array keeps its meaning (every listed name), so no existing case breaks. The `refused` field is additive — callers who ignore it see the same list they saw before, and callers who read it get the structural reason for each refused name. The census gate prevents a future edit from adding a fifth caller of `storage.list()` that forgets to classify.

**The doc comment's promise survives.** `listSaveFiles` is documented as "Name every save the store holds, **without reading one**" (`threeRuntime.ts:1922-1926`), and the classification is pure string work: `savePathRefusal(path)` calls `resolveSavePath` and returns its throw message as data, with no read, no stat, no file access. A spy store that throws on `read()` while `listSaveFiles()` runs would confirm the promise, but nothing asserts it today — that is a reader gap, not a code gap.

**18 cases in `test/saveNameSpelling.test.ts`**, unchanged from v150. The census gate asserts `expect(countOf(shipped, 'savePathRefusal(path)')).toBe(4)` — three surveys plus `listSaveFiles`. Three shipped `toEqual` pins in `test/saveSnapshot.test.ts` gain `refused: []`, because a record that grows a field is re-pinned where it was pinned, not exempted from the pin.

**Measured on a frozen plane, because the shared worktree has live writers.** The suite ran at HEAD `0e95f04` with `-c core.autocrlf=false`, built because the shared worktree carries other lanes' in-flight edits. Baseline: **417 cases over 11 files, 0 red**. After the grant: **417 cases over 11 files, 0 red**, `tsc --noEmit` exit 0.

| test file | cases | red |
| --- | --- | --- |
| characterController.test.ts | 39 | 0 |
| cinematicSequence.test.ts | 78 | 0 |
| combatRecord.test.ts | 23 | 0 |
| packageFace.test.ts | 6 | 0 |
| playerCeiling.test.ts | 11 | 0 |
| saveNameCollision.test.ts | 10 | 0 |
| saveNameSpelling.test.ts | 18 | 0 |
| saveSnapshot.test.ts | 157 | 0 |
| scenePhysics.test.ts | 30 | 0 |
| serializedShapeName.test.ts | 13 | 0 |
| threeRuntime.test.ts | 32 | 0 |
| **TOTAL** | **417** | **0** |

**Bounds.** No src behaviour and no file format changed. The `paths` array keeps its meaning (every listed name), so a store holding a name this build will not re-enter still reports it as a path — the host fact is preserved, and the `refused` subset is additive. The census gate pins the population at 4 callers of `storage.list()` inside `src/`, so a fifth caller that forgets to classify reddens immediately. 27 of the 72 exported names in `types.ts` are still named by none of the three code modules, and this grant accounts for the listing verb's classification, not for every declared type.
## v170 — saves survive the reload: a localStorage store behind the same `SaveStore` seam, and the Studio switches to it (ADR 0016 amendment 170)

_This record was written at v171 (see the ledger), because the b03b193 commit shipped with none. It is
recorded here, in the lane's own README, so the store's bounds live beside the seam they modify._

b03b193 added `createLocalStorageSaveStore(namespace)` to `src/saveStore.ts` and switched the Studio's
Scene3D to it (`createLocalStorageSaveStore('studio-scene')`). The store implements the SAME `SaveStore`
seam: keys are namespaced (`nexus-save:<namespace>:<name>`), an index key holds the name list so `list()`
reads no bytes beyond the index, every verb classifies through `savePathRefusal` BEFORE touching storage,
and `writeAtomic` is temp-then-copy-then-remove (localStorage has no rename syscall; the temp key carries
`SAVE_TEMP_SUFFIX` so the debris policy already knows the name). Construction REFUSES an environment
without `window.localStorage` rather than silently degrading.

| what changed | before | after |
| --- | --- | --- |
| Studio store | `createMemorySaveStore()` (process-scoped, v169) | `createLocalStorageSaveStore('studio-scene')` — saves persist across page reloads |
| store kinds | memory, fs | memory, fs, localStorage |
| suites at HEAD b03b193 (2026-10-07) | — | three-runtime **422/422**, studio **214/214** |
| browser harness (re-run 2026-10-07) | — | studio-scene3d **25/25**, backend webgl |

**Bounds (§60).** NO unit coverage for the localStorage store itself: the constructor reads the GLOBAL
`window.localStorage` and accepts no injectable storage, so the package's Node suite cannot exercise it —
the injectability that made the v120 seam worth having is exactly what this store skipped; a follow-up
should take the storage as a parameter. The panel's save note still reads "nothing written to disk" (v163
text) — true of the file system, but the save now persists in origin localStorage; the note should name
the store. Atomicity is copy-based: a crash between copy and remove can leave a `.tmp` key the index
never lists (debris by policy, but no sweeper walks the namespace). No delete in the browse UI, no quota
handling, no cross-tab sync. Origin quota ~5MB.

## v172 — rename a save from the Studio browser (ADR 0016 amendment 172)

b97a01e added `rename(oldPath, newPath): string` to the `SaveStore` interface and implemented it across all three stores (memory, fs, localStorage). The method moves a save's contents to a new name in-place without reading or writing the full payload: memory store swaps keys in the Map, fs store uses `fs.renameSync` (or copy+unlink fallback), and localStorage store updates both the data key and the index list atomically.

The ThreeRuntime exposes `renameSaveFile()` which delegates directly to `this.storage.rename()`. The Studio's SceneSaverLike interface gained optional `renameSaveFile` and `savePathRefusal` methods, and the browse saves UI adds a rename button next to each delete button. Clicking rename opens a browser `prompt()` for the new name, validates it through `savePathRefusal` before attempting the operation, refreshes the list after success, and updates the selection if the renamed save was currently selected.

| what changed | before | after |
| --- | --- | --- |
| SaveStore interface | read/write/list/delete only | + `rename(oldPath, newPath): string` |
| Store implementations | 3 stores (memory/fs/localStorage) | all three implement rename |
| ThreeRuntime API | deleteSaveFile only | + `renameSaveFile(oldPath, newPath)` |
| Studio UI | save/load/browse/delete | + rename button with prompt() |
| validation | manual name entry only | savePathRefusal checked before rename |
| suites at HEAD b97a01e (2026-10-07) | — | three-runtime **422/422**, studio **214/214** |

**Bounds (§60).** Rename is a storage-level operation (like delete/list), not a runtime-level operation (like read/write which are scene-aware). The rename does NOT validate whether the new name collides with an existing save — if a collision exists, the store overwrites it (same behavior as writeAtomic). The fs store's atomicity depends on `renameSync` availability; the fallback path (copy+unlink) is not atomic. localStorage store updates the index by removing the old name and adding the new one, but a crash between these two operations could leave the index inconsistent (the orphaned key would be debris). No undo capability, no rename history tracking, no batch rename support. The browser prompt() blocks the main thread and provides no custom styling.

## v179 — the localStorage store becomes DRIVABLE: storage as an injected seam, and the durable lie refused (ADR 0016 amendment 179)

v170 shipped `createLocalStorageSaveStore(namespace)` with zero coverage and named the reason in its own
bounds: the constructor read the GLOBAL `window.localStorage` and accepted no injectable storage, so the
package's Node suite could not even CONSTRUCT the one store that persists across page reloads. Honesty
about being untestable is not a substitute for tests — v179 closes that debt and, in doing so, catches a
lie the store had been telling since birth.

**The seam is the minimal slice, not the whole interface.** The constructor takes
`options: { storage?: StorageLike } = {}`, where `StorageLike` is `getItem`/`setItem`/`removeItem` —
deliberately NOT the full `Storage` interface: `length`, `key()` and `clear()` are capabilities this
store never uses, and the index key gives `list()` its names, so no key-enumeration is needed either.
The default path is byte-for-byte what v170 shipped: `options.storage ?? (typeof window !== 'undefined'
&& window.localStorage ? window.localStorage : null)`, and the no-storage constructor refusal (the
honest throw v170 wrote) is unchanged and pinned. The one browser consumer, Scene3D's
`createLocalStorageSaveStore('studio-scene')`, passes no options and runs the same code it ran before.

**The seam's first run caught a real lie.** `writeAtomic`'s `durable` argument was silently IGNORED by
this store: the memory store refuses it outright and the fs store checks for `flushSync` first, so a
durability promise that outlives a browser tab was swallowed here — the one store in the family whose
durable answer was "yes, whatever". Now it refuses BEFORE any byte moves, with a sentence that names the
missing capability ("the browser storage behind it has no flush handle, and a promise it cannot keep is
not kept silently"), and the refusal is tested with the zero-write guarantee the fs store's own tests
use: no target key, no temp key, nothing in the index, and a plain atomic write right after still works.

**14 cases in `test/saveLocalStorage.test.ts`** (three-runtime 422 → **436**, `tsc` clean), over a
Map-backed `StorageLike` with set-failure injection (a quota-style mid-flight error at an chosen set
number, so the temp cleanup path is exercised the way a real browser would hit it):

| subject | what is pinned |
| --- | --- |
| the injected seam | constructs headlessly and reports `kind: 'localStorage'`; empty/blank namespace refused with or without injection; no storage and no injection refuses with v170's own sentence |
| the store itself | byte-for-byte round-trip (a miss reads `null`, never empty); delete true/false, never an error; index-driven `list()` sorted with no index name and no debris; namespace isolation over ONE backing storage (the emptied `__index` key remains by design — the assertion filters non-index keys rather than pretending it vanishes) |
| refusals | `../escape.json` traversal (a non-empty sentence containing `..`), absolute path, and backslash names refused on write/read/delete by the same door; CREATE refused on the temp suffix while READ/DELETE of a leftover still answer |
| atomicity | `writeAtomic` round-trips leaving no temp key; a `durable` request throws with ZERO bytes written; a mid-flight copy failure cleans the temp, reports the failure, and reads `null` after |
| the index | a non-JSON index answers `[]` instead of a guess; an index holding non-strings keeps only the strings; `rename` moves bytes and index together and refuses a ghost |

**Regression at the landing (2026-10-07):** three-runtime **436/436**, studio **256/256** (no studio
case touches the store directly — the seam is additive), browser harness studio-scene3d **25/25**
re-verified against the real `window.localStorage` default path.

**Bounds (§60).** The seam is a testing capability, not a persistence upgrade: saves are still
per-origin, ~5MB quota, unauthenticated, and there is still no delete in the browse UI, no quota
handling, no cross-tab sync, and no sweeper for a `.tmp` key a crash leaves behind. The durable
refusal is a capability statement Studio cannot observe today (nothing passes `durable` through the
panel). The fs store's `durable` still requires `flushSync` on the injected `FsLike`; the memory
store's refusal is unchanged; this grant only made the third member of the family say what its
siblings already said. Hosted persistence for real deployment remains M7–M10 work.
## v180 — a quota refusal is NAMED, not quoted raw; the save note stops lying about disk (ADR 0016 amendment 180)

v179 made the store drivable and caught the durable lie; its own tests then exposed the NEXT lie, in the
error channel. A `setItem` throw from a full origin arrives as `QuotaExceededError` with an engine-specific
message that says neither "quota" plainly nor "your save did not land" — the caller sees a raw browser
complaint that no sentence of ours owns. And the product face was lying too: Scene3D's save note still said
"nothing written to disk", a sentence v163 wrote when nothing was persisted anywhere, which v170's
localStorage backend turned into a falsehood — the bytes DO survive a reload.

**The refusal is named, narrowly.** A module-level `rethrowQuotaAsNamed(path, error)` wraps a `setItem`
throw ONLY when the error's name+message is quota-shaped (`/quota/i` or `/exceed/i`), rethrowing with a
sentence that names the quota, names the path, and states the fact that matters: NOTHING was written (delete
saves and retry, or clear this origin), with the storage's own words attached. An unclassifiable error is
re-thrown untouched — a `TypeError('boom')` is not ours to diagnose, and inventing a diagnosis is exactly
what §60 forbids. The wrap covers the three data-writing entries: `write`, `writeAtomic`'s TEMP step (the
copy step keeps v179's mid-flight ownership — by then a temp exists, so the state is mid-flight, not a clean
refusal), and `rename`'s write of the new name (named with the NEW path — the save that failed to land is
the new one).

**The note names the store.** Scene3D's onSave note now reads `persisted in this origin's localStorage
(reload-safe), not on disk` — honest about what the bytes are and what they are not.

**4 cases in `test/saveLocalStorage.test.ts`** (three-runtime 436 → **440**, `tsc` clean), over the same
fake storage with `failSetFrom(n)`:

| subject | what is pinned |
| --- | --- |
| `write` quota | the refusal matches "quota is full" AND "NOTHING was written" AND carries the storage's own words; `keys()` and `list()` stay empty — zero bytes |
| `writeAtomic` | a quota at the TEMP step names the quota with nothing stored; a quota at the COPY step is v179's mid-flight sentence — the two failure points sound different because they ARE different |
| unclassifiable | a `TypeError('boom: setter vanished')` re-thrown verbatim — named errors are for named causes, not for everything |
| `rename` quota | the refusal names the NEW path; the old name's bytes and index entry survive untouched |

**Regression at the landing (2026-10-07):** three-runtime **440/440**, studio **256/256** (Scene3D's note is
asserted by prefix in the harness — `saved N bodies` — so the honest tail changed nothing there), build
clean, browser harness studio-scene3d **25/25** re-verified in the real browser.

**Bounds (§60).** Quota detection is SHAPE-based: a quota that does not say "quota" or "exceed" stays raw
(a `SecurityError` from a privacy-mode origin is not claimed as a quota). An index-update failure AFTER a
landed write is still raw — that path has its own story and gets none of this sentence. The save dialog has
no quota meter: the user learns the origin is full only when the refusal arrives. The v179 bounds' "no
delete in the browse UI" clause is retired — the browse has had delete since v169/v171; this record
corrects the ledger, not the code.

## v205 — component removal releases the evicted component's effects: the record this grant was owed (ADR 0016 amendment 220)

`5d68198` cites "ADR 0016 amendment 205", and that number is exec-host's share of the type-gate repair. Same
collision as amendment 219, same resolution: the record takes the next free number and states it. This section is
where the increment is described.

v204's gate made `enabled` control visibility, but REMOVING a component entirely left its side effects in place
forever: a `targetObject` stayed hidden with nothing left to re-enable it, and every `animationIds` entry stayed
paused with no way back. `removeComponent` now releases both before deleting — `targetObject.visible = true`, and
each animation's `enabled = true` with `play()` called to resume.

**A signature change, for a stated reason.** `removeComponent(entity, componentType)` became
`removeComponent(sceneId, entity, componentType)`, because releasing an animation requires the scene's own
animation registry. The one existing caller in `threeRuntime.test.ts` was updated to match.

| layer | what it proves |
| --- | --- |
| `test/componentRemovalCleanup.test.ts` (5) | `targetObject` cleanup · animation cleanup · plain data components · a non-existent component · non-existent `animationIds` |

Measured **472/472** in 15 files, `tsc` clean, and no Studio change — the surface does not call
`removeComponent`, so the cleanup is proven at the runtime layer.

Bounds (§60): this is the FIRST of three eviction doors. The other two are amendment 206 (entity removal) and
amendment 208 (`addComponent`'s same-type replace) — which is why 208's heading calls itself "the third eviction
door". The release rule is per-door and each door carries its own case, rather than one shared path assumed to
cover all three.

## v221 — two config fields nothing read: `frustumCulling` is APPLIED, `maxLights` is honestly OPTIONAL (ADR 0016 amendment 221)

`ThreeRuntimeConfig` REQUIRED `maxLights` and `frustumCulling`, and **neither name appeared anywhere in
`packages/`, `apps/` or `agents/` outside `types.ts`** — declared, defaulted in `DEFAULT_THREE_CONFIG`, consulted
nowhere. Every caller had to state two values that changed nothing, and the type read like a promise the runtime
never kept. The widened type gate is what made it visible: it forced six fixtures to state both.

**`frustumCulling` is now applied at the one funnel.** `threeObject.frustumCulled = this.config.frustumCulling`
is set in `insertEntity` — the single path both `createEntity` and `restoreEntity` pass through — so a restored
body carries the SAME value as a created one rather than whatever the object arrived with. THREE's own default is
`true`, so the default config is behaviour-unchanged; `false` now genuinely disables culling.

**`maxLights` is optional and documented as unhonored, with the reason.** There is no light-creation API here:
`createScene` builds exactly two lights (`ambient`, `directional`) and `setLightState` only toggles or dims them,
so there is nothing for a cap to cap. It becomes meaningful the day an `addLight` exists.

**The flag is re-derived on restore, not carried in the file.** `SerializedEntity` has `visible`, `castShadow`,
`receiveShadow` and `layers`, and no field for `frustumCulled` — a case asserts exactly that, because it is WHY
the restore has to take the value from the config. A rendering flag is a runtime setting, not entity state.

| layer | what it proves |
| --- | --- |
| `test/frustumCulling.test.ts` (5) | the default leaves bodies at THREE's own default · `false` reaches a created body while its neighbours are untouched · a RESTORED body carries the runtime's config (into a SECOND scene, because this runtime refuses to overwrite live state) · the save shape has no field for the flag · a config omitting `maxLights` builds and runs |

**Mutation probe, 2 arms, 2/2 MATCHED**: the assignment removed → two cases red with
`expected true to be false` (the flag back to decorative) · the value hard-coded `true` → the same two cases red
(the config no longer read).

Measured: three-runtime **505 → 510** (21 files), `tsc` 0. No existing case moved, which is the evidence that
wiring the default path changed nothing.

Bounds: `frustumCulling` reaches the objects the runtime CREATES — geometry and material are the only injected
values, and the object is always constructed here, so there is no caller-built object to retro-fit. `maxLights`
remains unhonored; the honest statement is the doc comment plus this record, not a silent no-op.
