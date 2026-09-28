import type { ContainerNode, DesignDocument, DesignNode, InstanceNode, NexusId, Paint, Point } from './types.js';
import { childIdList } from './selectors.js';
import { rotatePointAbout } from './geometry.js';

/**
 * Component → instance projection (ADR 0015).
 *
 * The canonical document stores an `instance` node as a single reference
 * (`componentId` + `overrides`). Rendering, hit-testing and preview, however, need
 * the instance's *materialized* subtree. This module is a pure, view-time projection:
 * it never mutates the authored document — it returns a shadow document whose instance
 * nodes gain namespaced clones of their component master, plus a `meta` map that ties
 * every materialized id back to its owning top-level instance so a click on any part
 * selects the whole instance unit.
 *
 * Namespace scheme: a top-level instance keeps its own id; its clones are
 * `${instanceId}::${masterChildId}`. A nested instance clone becomes its own
 * namespace, so ids stay unique and the master is never mutated.
 */

export interface InstanceMeta {
  /** The top-level authored instance this clone belongs to. */
  instanceId: NexusId;
  /** The canonical master node id this clone was derived from. */
  masterId: NexusId;
}

export interface ExpandedInstances {
  doc: DesignDocument;
  meta: Record<NexusId, InstanceMeta>;
}

/**
 * One master child's patch. Named `ChildOverride` rather than `GeometryOverride` because v132 made `fills`
 * and `cornerRadius` overridable: a name that says geometry while holding a paint is the kind of stale
 * sentence this lane keeps retiring (v118's `duration`, v119's loader that "ignored what it could not read").
 */
interface ChildOverride {
  width?: number;
  height?: number;
  visible?: boolean;
  /** Position deltas relative to the master child's authored x/y. */
  x?: number;
  y?: number;
  /** Absolute rotation in degrees, replacing the master child's authored rotation. */
  rotation?: number;
  /** The master child's corner radius, replaced. */
  cornerRadius?: number;
  /** The master child's fills, replaced whole. */
  fills?: Paint[];
}

function readOverrides(inst: InstanceNode): {
  byId: Record<NexusId, ChildOverride>;
  text: Record<NexusId, string>;
} {
  const o = inst.overrides ?? {};
  const text = (o.text ?? {}) as Record<NexusId, string>;
  const byId: Record<NexusId, ChildOverride> = {};
  for (const [key, val] of Object.entries(o)) {
    if (key === 'text') continue;
    if (val && typeof val === 'object') byId[key] = val as ChildOverride;
  }
  return { byId, text };
}

function applyOverrides(
  clone: DesignNode,
  masterId: NexusId,
  byId: Record<NexusId, ChildOverride>,
  text: Record<NexusId, string>,
): void {
  const geom = byId[masterId];
  if (geom) {
    if (geom.width !== undefined) clone.width = geom.width;
    if (geom.height !== undefined) clone.height = geom.height;
    if (geom.visible !== undefined) clone.visible = geom.visible;
    if (geom.x !== undefined) clone.x += geom.x;
    if (geom.y !== undefined) clone.y += geom.y;
    if (geom.rotation !== undefined) clone.rotation = geom.rotation;
    if (geom.cornerRadius !== undefined) clone.cornerRadius = geom.cornerRadius;
    // A COPY of the array, never the patch's own. The patch lives in `instance.overrides`, i.e. in the
    // canonical document, so a clone that shared the array would hand a renderer a writable path back into
    // the authored document. The paints inside stay shared by reference: nothing in this lane mutates a paint
    // in place, and a deep clone here is the honest fix the day something does.
    if (geom.fills !== undefined) clone.fills = [...geom.fills];
  }
  const t = text[masterId];
  if (t !== undefined && clone.type === 'text') clone.characters = t;
}

/**
 * Rigid bake: an instance's own `rotation` turns its *whole* materialized subtree — each clone's
 * position rotates about the instance centre and its rotation is incremented — so rotating the
 * unit reads as one solid body instead of a frozen stencil over turning rectangles. Authored
 * masters are never touched; per-clone override rotations stay *local* (the bake composes the
 * instance angle on top). Flow-placed (auto-layout) children are the existing exception: their
 * positions are not x/y-authorable, so they keep the old individually-rotated behavior.
 */
function bakeInstanceRotation(projected: Record<NexusId, DesignNode>, instId: NexusId): void {
  const inst = projected[instId];
  if (!inst || inst.type !== 'instance') return;
  const theta = inst.rotation;
  if (!theta) return;
  const pivot: Point = { x: inst.width / 2, y: inst.height / 2 };
  const walk = (id: NexusId, parentLocal: Point, parentNew: Point): void => {
    const node = projected[id];
    if (!node || !node.visible) return;
    const local: Point = { x: parentLocal.x + node.x, y: parentLocal.y + node.y };
    const center: Point = { x: local.x + node.width / 2, y: local.y + node.height / 2 };
    const newCenter = rotatePointAbout(center, pivot, theta);
    const newTopLeft: Point = { x: newCenter.x - node.width / 2, y: newCenter.y - node.height / 2 };
    node.x = newTopLeft.x - parentNew.x;
    node.y = newTopLeft.y - parentNew.y;
    node.rotation = (node.rotation ?? 0) + theta;
    if ((node as ContainerNode).layout) return;
    for (const cid of childIdList(node)) walk(cid, local, newTopLeft);
  };
  for (const cid of childIdList(inst)) walk(cid, { x: 0, y: 0 }, { x: 0, y: 0 });
}

export function expandComponentInstances(doc: DesignDocument): ExpandedInstances {
  const projected: Record<NexusId, DesignNode> = { ...doc.nodes };
  const meta: Record<NexusId, InstanceMeta> = {};

  function cloneTree(
    src: DesignNode,
    parentCloneId: NexusId,
    ns: NexusId,
    topId: NexusId,
    byId: Record<NexusId, ChildOverride>,
    text: Record<NexusId, string>,
    stack: NexusId[],
  ): NexusId {
    const cloneId = `${ns}::${src.id}`;
    const clone: DesignNode = { ...src, id: cloneId, parentId: parentCloneId, childIds: [] };
    applyOverrides(clone, src.id, byId, text);
    projected[cloneId] = clone;
    meta[cloneId] = { instanceId: topId, masterId: src.id };

    if (clone.type === 'instance') {
      expandInstance(cloneId, topId, stack);
    } else {
      for (const mid of childIdList(src)) {
        const child = doc.nodes[mid];
        if (!child) continue;
        clone.childIds.push(cloneTree(child, cloneId, ns, topId, byId, text, stack));
      }
    }
    return cloneId;
  }

  function expandInstance(instId: NexusId, topId: NexusId, stack: NexusId[]): void {
    const inst = projected[instId] as InstanceNode | undefined;
    if (!inst || inst.type !== 'instance') return;
    const cid = inst.componentId;
    if (!cid || stack.includes(cid)) return; // unknown component or cycle → stay childless
    const master = doc.nodes[cid];
    if (!master) return;
    const nextStack = [...stack, cid];
    const { byId, text } = readOverrides(inst);
    const childIds: NexusId[] = [];
    for (const mid of childIdList(master)) {
      const src = doc.nodes[mid];
      if (!src) continue;
      childIds.push(cloneTree(src, instId, instId, topId, byId, text, nextStack));
    }
    inst.childIds = childIds;
  }

  for (const node of Object.values(doc.nodes)) {
    if (node.type !== 'instance') continue;
    // Copy the authored instance so we never mutate the canonical document.
    const copy = { ...node };
    projected[node.id] = copy;
    meta[node.id] = { instanceId: node.id, masterId: copy.componentId };
    expandInstance(node.id, node.id, []);
    bakeInstanceRotation(projected, node.id);
  }

  return { doc: { ...doc, nodes: projected }, meta };
}

/** The top-level instance an id belongs to (the instance itself, or one of its clones). */
export function ownerInstanceId(
  meta: Record<NexusId, InstanceMeta>,
  id: NexusId,
): NexusId | null {
  return meta[id]?.instanceId ?? null;
}
