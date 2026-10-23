/**
 * v243 — `validateDocument`: the internal-consistency check the normalized graph (ADR 0004) always CLAIMED
 * but nothing checked (ADR 0016 amendment 243).
 *
 * Every path that brings a document INTO the model from outside — a remix (v233), a local snapshot
 * (`persist.ts`), an AI batch, a hand-edited JSON — handed it straight to the store and the renderer. A
 * malformed graph (a `childId` naming no node, a node whose `parentId` disagrees with its parent's list, a
 * cycle) does not crash: it draws something subtly wrong, which is worse. This module answers a VERDICT —
 * a LIST of problems, never a throw — so a caller can show a person what is wrong instead of catching an
 * exception (the same rule `normalizeHandle` follows in the account model).
 *
 * The conventions it pins are the model's OWN, and three are easy to get wrong, so they are stated here
 * rather than assumed:
 *
 *  - **The document's children live on the ROOT NODE's `pageIds`.** A `DesignDocument` has no `pageIds`
 *    field of its own; `ops.setChildIds`/`childIdsOf` route a document parent to the root node's
 *    `pageIds`, and `selectors.childIdList` reads it. (The first draft of this file checked
 *    `doc.pageIds` and the probe caught it — every real document failed with `bad-page-ids`.)
 *  - **A document's `childIds` is a REQUIRED-but-DEAD field that must stay empty.** Two representations of
 *    "the document's children" would be one too many.
 *  - **`pageIds` is misnamed: it holds PAGES and component MASTERS.** A master is added under the root
 *    (`addSubtree(doc.rootId, …)` — the store's `createComponent` does exactly this), so it lands in
 *    `pageIds` beside the pages. Consumers filter by `type` (`PageTabs` does), which is why this has never
 *    been visible — but it means "every entry of `pageIds` is a page" is FALSE, and this check does not
 *    assert it. It is recorded as a bound, not repaired here.
 *
 * The GRAPH axis is not the only one a document from outside can fail. `layoutPage` (v426) also reads
 * `x`/`y`/`width`/`height` and a container's `layout.gap`/`layout.padding` as NUMBERS, and the declared
 * types do not survive JSON.parse: one string `"040"` there produced three different pictures — the
 * artifact wrote it into CSS, the card coerced it to 0, the canvas concatenated it. The graph checker
 * said `ok: true` about that document. So a GEOMETRY axis lives here too, naming the node, the field and
 * the value's TYPE, because the renderer's own answer is silence: the node simply is not drawn, and a
 * person looking at an empty canvas cannot tell whether the document is empty or corrupt.
 */
import type { DesignDocument, DesignNode, NexusId } from './types.js';

export interface DocumentProblem {
  /** A stable machine-readable kind, so a caller can branch without reading prose. */
  code: string;
  /** What is wrong and where — the id involved, named. */
  detail: string;
}

export type DocumentVerdict = { ok: true; problems: [] } | { ok: false; problems: DocumentProblem[] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** The child list of a node: `pageIds` for a document, `childIds` for everything else (ops.ts's rule). */
function childListOf(node: Record<string, unknown>): unknown {
  return node.type === 'document' ? node.pageIds : node.childIds;
}

/**
 * PURE and total: it never throws and never mutates. `doc` is `unknown` because its whole purpose is to be
 * run on bytes that came from outside the type system.
 */
export function validateDocument(doc: unknown): DocumentVerdict {
  const problems: DocumentProblem[] = [];
  const add = (code: string, detail: string) => problems.push({ code, detail });

  if (!isObj(doc)) {
    add('not-an-object', 'the document is not a non-array object');
    return { ok: false, problems };
  }
  if (!isStr(doc.id)) add('bad-doc-id', 'the document has no non-empty string `id`');
  if (!isStr(doc.rootId)) add('bad-root-id', 'the document has no non-empty string `rootId`');
  if (!isStr(doc.activePageId)) add('bad-active-page', 'the document has no non-empty string `activePageId`');
  if (!isObj(doc.nodes)) {
    add('bad-nodes', 'the document has no `nodes` object');
    return { ok: false, problems }; // without nodes nothing else can be checked
  }

  const nodes = doc.nodes as Record<string, Record<string, unknown>>;
  const has = (id: string): boolean => Object.prototype.hasOwnProperty.call(nodes, id);
  const rootId = isStr(doc.rootId) ? doc.rootId : null;

  // ---- the root ----
  if (rootId) {
    if (!has(rootId)) {
      add('root-missing', `rootId ${rootId} is not in nodes`);
    } else {
      const root = nodes[rootId]!;
      if (root.type !== 'document') add('root-not-document', `the node named by rootId (${rootId}) is a ${String(root.type)}, not a document`);
      if (root.parentId !== null) add('root-has-parent', `the root ${rootId} has a parentId (${String(root.parentId)}); a root has none`);
      // the DEAD field must stay empty
      if (Array.isArray(root.childIds) && root.childIds.length > 0) {
        add('document-child-ids-used', `the document node ${rootId} has a non-empty childIds (${root.childIds.length}); a document's children live in pageIds, and childIds is dead`);
      }
    }
  }

  // ---- every node's own identity and parent ----
  for (const [key, node] of Object.entries(nodes)) {
    if (!isObj(node)) {
      add('node-not-object', `nodes["${key}"] is not an object`);
      continue;
    }
    if (node.id !== key) add('node-id-key-mismatch', `nodes["${key}"].id is ${String(node.id)} — a node must be stored under its own id`);
    if (key === rootId) continue; // the root's parent is checked above
    if (!isStr(node.parentId)) {
      add('node-without-parent', `${key} (a ${String(node.type)}) has no string parentId and is not the root`);
    } else if (!has(node.parentId)) {
      add('parent-missing', `${key} names parentId ${node.parentId}, which is not in nodes`);
    }
  }

  // ---- child lists: forward (child exists, agrees back) ----
  for (const [key, node] of Object.entries(nodes)) {
    if (!isObj(node)) continue;
    const list = childListOf(node);
    if (!Array.isArray(list)) {
      add('child-list-not-array', `${key} (a ${String(node.type)}) has no child array`);
      continue;
    }
    const seen = new Set<string>();
    for (const cid of list) {
      if (!isStr(cid)) {
        add('bad-child-id', `${key} lists a child that is not a non-empty string`);
        continue;
      }
      if (cid === key) add('self-child', `${key} lists itself as a child`);
      if (seen.has(cid)) add('duplicate-child', `${key} lists child ${cid} more than once`);
      seen.add(cid);
      if (!has(cid)) {
        add('child-missing', `${key} lists child ${cid}, which is not in nodes`);
        continue;
      }
      const child = nodes[cid]!;
      if (child.parentId !== key) add('child-parent-disagrees', `${key} lists ${cid} as a child, but ${cid}.parentId is ${String(child.parentId)}`);
    }
  }

  // ---- the active page ----
  if (isStr(doc.activePageId)) {
    if (!has(doc.activePageId)) {
      add('active-page-missing', `activePageId ${doc.activePageId} is not in nodes`);
    } else if (nodes[doc.activePageId]!.type !== 'page') {
      add('active-not-page', `activePageId ${doc.activePageId} is a ${String(nodes[doc.activePageId]!.type)}, not a page`);
    }
  }

  // ---- reverse direction: every non-root node is listed by its parent ----
  for (const [key, node] of Object.entries(nodes)) {
    if (!isObj(node) || key === rootId) continue;
    const parentId = isStr(node.parentId) ? node.parentId : null;
    if (!parentId || !has(parentId)) continue; // already reported
    const list = childListOf(nodes[parentId]!);
    if (Array.isArray(list) && !list.includes(key)) {
      add('parent-does-not-list-child', `${key}.parentId is ${parentId}, but ${parentId} does not list ${key} as a child`);
    }
  }

  // ---- geometry: the fields a renderer needs in order to place a drawing ----
  const finite = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v);
  // The TYPE is the whole story; the bytes are attacker-shaped and do not belong in a diagnostic string.
  const shape = (v: unknown): string => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
  for (const [key, node] of Object.entries(nodes)) {
    if (!isObj(node) || key === rootId) continue; // a document's own geometry is read by nothing
    const bad = (['x', 'y', 'width', 'height'] as const).filter((f) => !finite(node[f]));
    if (!bad.length) continue;
    if (key === doc.activePageId) {
      add('geometry-not-a-number', `the active page ${key} has non-finite ${bad.join(', ')} (${bad.map((f) => shape(node[f])).join(', ')}) — the page rect falls back to 0, so the page draws empty`);
      continue;
    }
    add('geometry-not-a-number', `${key} (a ${String(node.type)}) has non-finite ${bad.join(', ')} (${bad.map((f) => shape(node[f])).join(', ')}) — layoutPage emits no rect for it, so no renderer draws it and its subtree goes with it`);
  }

  // ---- auto-layout terms: the numbers a container ADDS to its running cursor ----
  for (const [key, node] of Object.entries(nodes)) {
    if (!isObj(node) || key === rootId) continue;
    const layout = node.layout;
    if (!isObj(layout)) continue;
    if (!finite(layout.gap)) add('layout-not-a-number', `${key} (a ${String(node.type)}) has a non-finite layout.gap (${shape(layout.gap)}) — the cursor treats it as 0`);
    if (!isObj(layout.padding)) continue;
    const pad = Object.entries(layout.padding as Record<string, unknown>).filter(([, v]) => !finite(v));
    if (pad.length) add('layout-not-a-number', `${key} (a ${String(node.type)}) has non-finite layout.padding entries (${pad.map(([f, v]) => `${f}: ${shape(v)}`).join(', ')}) — the cursor treats them as 0`);
  }

  // ---- no cycles, and every node reachable from the root ----
  if (rootId && has(rootId)) {
    const visited = new Set<string>();
    let cycle: string | null = null;
    const walk = (id: string, stack: Set<string>) => {
      if (stack.has(id)) { cycle = id; return; }
      if (visited.has(id)) return;
      stack.add(id);
      const n = nodes[id];
      const list = n && isObj(n) ? childListOf(n) : undefined;
      if (Array.isArray(list)) for (const cid of list) if (isStr(cid) && has(cid)) walk(cid, stack);
      stack.delete(id);
      visited.add(id);
    };
    walk(rootId, new Set());
    if (cycle) {
      add('cycle', `the child graph has a cycle through ${cycle}`);
    } else {
      const unreachable = Object.keys(nodes).filter((id) => !visited.has(id));
      if (unreachable.length) add('unreachable', `${unreachable.length} node(s) are not reachable from the root: ${unreachable.slice(0, 5).join(', ')}${unreachable.length > 5 ? ' …' : ''}`);
    }
  }

  return problems.length ? { ok: false, problems } : { ok: true, problems: [] };
}
