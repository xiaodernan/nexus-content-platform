# @nexus/three-runtime — evidence for v108 (host seams), v114 (character controller), v115 (the entity save format), v116 (the scene's physics world) and v117 (the cinematic sequence)

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
