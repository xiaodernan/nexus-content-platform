# @nexus/three-runtime — evidence for v108 (host seams), v114 (character controller) and v115 (the entity save format)

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
