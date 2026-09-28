# @nexus/three-runtime — evidence for v108 (host seams), v114 (character controller), v115 (the entity save format), v116 (the scene's physics world), v117 (the cinematic sequence), v118 (the save that reads it back), v119 (the file it survives on disk), v120 (the bytes, through a store), v121 (the id comes back), v122 (a save taken back), v123 (what it holds), v124 (written atomically) and v125 (flushed when asked)

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
