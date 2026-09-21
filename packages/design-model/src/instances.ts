import type { DesignDocument, DesignNode, InstanceNode, NexusId } from './types.js';
import { childIdList } from './selectors.js';

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

interface GeometryOverride {
  width?: number;
  height?: number;
  visible?: boolean;
  /** Position deltas relative to the master child's authored x/y. */
  x?: number;
  y?: number;
  /** Absolute rotation in degrees, replacing the master child's authored rotation. */
  rotation?: number;
}

function readOverrides(inst: InstanceNode): {
  byId: Record<NexusId, GeometryOverride>;
  text: Record<NexusId, string>;
} {
  const o = inst.overrides ?? {};
  const text = (o.text ?? {}) as Record<NexusId, string>;
  const byId: Record<NexusId, GeometryOverride> = {};
  for (const [key, val] of Object.entries(o)) {
    if (key === 'text') continue;
    if (val && typeof val === 'object') byId[key] = val as GeometryOverride;
  }
  return { byId, text };
}

function applyOverrides(
  clone: DesignNode,
  masterId: NexusId,
  byId: Record<NexusId, GeometryOverride>,
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
  }
  const t = text[masterId];
  if (t !== undefined && clone.type === 'text') clone.characters = t;
}

export function expandComponentInstances(doc: DesignDocument): ExpandedInstances {
  const projected: Record<NexusId, DesignNode> = { ...doc.nodes };
  const meta: Record<NexusId, InstanceMeta> = {};

  function cloneTree(
    src: DesignNode,
    parentCloneId: NexusId,
    ns: NexusId,
    topId: NexusId,
    byId: Record<NexusId, GeometryOverride>,
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
