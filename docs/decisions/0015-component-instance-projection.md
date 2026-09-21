# 0015 — Component → instance projection at view time (M1 polish)

- **Status:** Accepted
- **Date:** 2026-09-22

## Context
The Design Model already *declares* components and instances in its type system
(`ContainerNode` type `'component'`, `InstanceNode { componentId, overrides }`, `instanceNode()` /
`componentNode()` factories), but nothing consumed them: `layoutPage`/`hitTest`/the renderer only
walk authored `childIds`, so an instance drew as an empty box and a component master had no effect.
Spec §7/§32 want "components" and "variant editing" in the M1 slice, and §62 demands polish. The
constraint from ADR 0004 is hard: the **canonical model must not be bloated with duplicated
subtrees** — materializing every instance into the document would break structural sharing, double
the node count per instance, and make AI-diff (ADR 0006/§36) meaningless.

## Decision
Instances are materialized as a **pure, view-time projection** and never stored.

1. **`expandComponentInstances(doc) → { doc, meta }`** in `@nexus/design-model` is a pure function
   that returns a *shadow* document (canonical doc untouched, structural sharing preserved) in which
   every `instance` node gains `childIds` = namespaced clones of its component master subtree.
   - **Namespacing:** a top-level instance keeps its own id; its clones are `${instanceId}::${masterChildId}`.
     A nested instance clone becomes its own namespace, so ids stay unique and disjoint across
     instances of the same master. A final owner map `meta[id] = { instanceId, masterId }` ties every
     materialized id back to its **top-level** instance.
   - **Overrides** apply by canonical master-child id: `overrides[mid] = { width, height, visible }`
     and `overrides.text[mid] = string` patch the clone, never the master.
   - **Termination:** a `stack` of visited `componentId`s guards cycles; an unknown component or a
     cycle leaves that instance childless rather than looping.

2. **Studio renders + hit-tests through the projection; all authoring stays on the canonical model.**
   `lib/store.ts` memoizes `instanceView(doc)` by document identity (recomputes only when `doc`
   changes, so the rAF paint loop stays cheap). The canvas paints `viewDoc` and collapses any clone
   hit back to its owning instance via `ownerInstanceId`, so an instance is one atomic selectable /
   movable unit at its own authored rect — which is byte-identical between canonical and projected
   layout (the projection only *adds* children).

3. **Create / insert / detach are ordinary reversible op batches** (ADR 0006) — no new op type, no
   schema change:
   - *Create component* = `addSubtree` the master under the document root + `reparent` the selected
     layers into it + `updateNode` to rebase their local coords + `addSubtree` one instance on the page.
   - *Insert instance* = `addSubtree` another `instance` referencing the same master.
   - *Detach instance* = promote the projected clone subtree into concrete canonical nodes under a new
     group, then `removeSubtree` the instance — the master survives for other instances.
   Undo works because op inverses are computed against the pre-batch document and replayed in reverse
   order, so children are reparented back out *before* the empty master is removed.

   Masters live under the document root and are **never a page child**, so `layoutPage` (which walks
   from a page) simply never paints them; page-listing UI filters by `type === 'page'`, so a stored
   master is invisible to PageTabs / `safePage`.

## Options
- **This choice** — view-time projection + op-only authoring. Model stays minimal; diff/undo unchanged.
- Store materialized children on the instance — duplicates the master per instance, wrecks structural
  sharing and AI-diff, and drifts from the master on edit. Rejected (§8/§36).
- A new `instantiate`/`setActivePage`-style op — cleaner semantics but forces new op tests + a rebuild
  surface with no benefit over composing existing ops. Deferred.

## Reason
ADR 0004 says the model is an intent graph, not a render tree; ADR 0005 already established that
*geometry is a pure projection* (`layoutPage`). Instance expansion is the exact same idea one level
up: components are intent, materialized children are a derived view. Keeping it a pure function
makes it unit-testable headless (`instances.test.ts`, `store-variants.test.ts`, `pipeline-proof.mjs`
step 8) and leaves a single source of truth — the authored `componentId` + `overrides`.

## Tradeoffs
- (−) Instances are opaque at the selection layer this increment: clicking any part selects the whole
  top-level unit; you cannot yet drill into an instance's internal nodes or edit per-instance text
  from the Properties panel. Detach is the escape hatch. Nested-instance *selection* collapses to the
  top owner too.
- (−) The projection runs per document change (memoized), so a document with very many large
  instances pays a clone cost on each edit. Fine at slice scale; a caching/expansion-by-need pass is
  the M1-polish follow-up if it ever shows in profiles.
- (−) Masters stored under the root (in `pageIds`-adjacent storage) rather than a dedicated library
  field is a small semantic wart; the type-based filtering that makes it safe is centralized, and a
  first-class `library` container is deferred with the `setActivePage` op.

## Amendment — 2026-09-22 (follow-up increment, no decision change)
The first tradeoff above ("cannot yet edit per-instance text from the Properties panel") is now
resolved without touching the Decision: selecting an instance renders an *Instance overrides* section
(`InstanceOverrides.tsx`) that walks the projected clones, keys each field by its **master** child id,
and calls `setInstanceOverride` (store) — which merges `width`/`height`/`visible` into `overrides[mid]`
and text into `overrides.text[mid]` and commits a single `updateNode(instance, { overrides })` op. This
rides the exact projection contract already defined here (overrides apply by master id to clones only,
never the master or siblings) and the existing reversible-op path — so no new op type, no schema change,
and no rebuild. What stays deferred from this ADR is nested-instance *sub-selection* (drill-in past a
nested instance); Detach remains the escape hatch for those internals.

## Amendment — 2026-09-22 (sub-selection + x/y delta overrides)
The deferred drill-in is now implemented **without changing the Decision** — it is purely a studio
interaction layer over the same projection + overrides contract, plus one schema *extension* (not a
semantic change):

1. **`overrides[mid]` gains `x`/`y`** — as **deltas** relative to the master's authored position
   (`clone.x += geom.x` in `applyOverrides`). Deltas (rather than absolute layout coords) keep the
   instance following master moves, which is the point of components. Absolute semantics stay for
   `width`/`height`; `text` is unchanged. This required a design-model rebuild (`types.ts` /
   `instances.ts` + `instances.test.ts` now cover delta composition).
2. **Focus state is studio-local view state** (ADR 0014): `focusedInstanceId` in the store, set/cleared
   by progressive double-click and Escape, never persisted and deliberately **not** undoable.
3. **Hit resolution keeps clone ids when the owning instance is focused**; otherwise clones still
   collapse to their top-level instance exactly as before (`resolveHit` in `Canvas.tsx`).
   Progressive drill: 1st double-click on any part enters the instance and selects the clicked clone;
   a second double-click on a *text* clone starts on-canvas editing inside it; double-clicking the
   instance itself again (or Escape, or clicking empty canvas) drills out. A breadcrumb chip
   (`#nexus-focus-chip`) makes the focused state visible and exitable.
4. **Every clone edit commits as one `updateNode(instance, { overrides })` op** — move (arrow keys or
   drag, accumulated across multiple selected clones of the same instance), resize (layout-space
   deltas + absolute w/h) and text (`characters` → `overrides.text`). History/undo/diff behavior is
   unchanged from ADR 0006; the canonical model still contains no clone nodes.
5. **Selection liveness** now checks the *projected* doc (memoized), because a clone id legitimately
   survives many commits while being absent from `doc.nodes` — canonical-only pruning deselected the
   user from their own edit on every commit.

Nested instances work one level at a time: while an outer instance is focused, a nested instance's
clone still collapses to *its own* top-level owner per rule 3 of the original decision — so entering
the outer reveals the inner as a single unit; a further double-click enters it (ids stay namespaced
and disjoint). Rotate handles are intentionally not offered on clones (rotation would have to target
a non-canonical id); Detach remains the escape hatch for anything overrides cannot express.

## Amendment 3 — 2026-09-22 (per-clone rotation)
"Rotate handles are intentionally not offered on clones" from Amendment 2 is **superseded**.
`overrides[mid]` gains an absolute `rotation?: number` (degrees) alongside the x/y deltas and
w/h sizes — the rotation targets the *master id* through the projection, so the non-canonical-id
objection no longer applies (the op is still one `updateNode(instance, { overrides })`).
Applied in `applyOverrides` (clone.rotation = override, replacing the master's authored value);
studio offers the rotate grip on a focused clone (drag commits via `setInstanceOverride`) and the
*Instance overrides* panel gains a per-row Rotation input. Known boundary (accepted): hit
descent requires each ancestor's own rect to contain the point, so a rotated clone overhanging
its unrotated container's box is unreachable in the overhang — the same pre-existing
container-overflow rule as moved/resized clones; rigid subtree rotation stays deferred.
Design-model tests 24/24 (new rotation-override case), studio 66/66.
