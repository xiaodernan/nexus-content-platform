/**
 * M7 v233 (ADR 0016 amendment 233): the CLIENT half of a REMIX — a fetch adapter plus a PURE validator,
 * nothing more. Like `publishLane.ts` it imports nothing RUNTIME from the server half (`publishServer.ts`,
 * which holds the service's address): the browser bundle gets only this module's locally-stated types. The
 * `DesignDocument` import is TYPE-ONLY, so it is erased at compile and adds nothing to the bundle.
 *
 * A remix is the community's first cross-user primitive — it reads SOMEONE ELSE'S publication back into the
 * Studio as a new project. Until v233 the Studio could publish but never read a publication back in its own
 * UI (a stated M7 bound); `readPublished` existed and had NO consumer.
 */
import { validateDocument, type DesignDocument } from '@nexus/design-model';

import { readPublished } from './publishLane';

/** The outcome of pulling a document out of a `read` answer: the document, or the reason it cannot be used. */
export type RemixExtraction = { ok: true; document: DesignDocument } | { ok: false; reason: string };

/**
 * PURE: decide whether a `read` answer carries a document this Studio can open, and say WHICH part failed
 * when it cannot.
 *
 * The checks are the ones the model actually requires — an object with a string `id`, a string `rootId`, an
 * object `nodes`, and a string `activePageId` — NOT a deep validation; the store and the renderer are the
 * real authorities, and a lane that re-implemented the whole schema would be a second, drifting one. A
 * service that is DOWN is a normal answer (`ok: false` carrying the service's own reason), which is a
 * DIFFERENT fact from a publication that exists but carries no document — the two are reported apart.
 */
export function extractRemixDocument(answer: unknown): RemixExtraction {
  if (!answer || typeof answer !== 'object') return { ok: false, reason: 'the read answer is not an object' };
  const a = answer as { ok?: unknown; document?: unknown; reason?: unknown };
  if (a.ok !== true) {
    return { ok: false, reason: typeof a.reason === 'string' && a.reason ? a.reason : 'the read answer reported failure with no reason' };
  }
  const d = a.document;
  if (!d || typeof d !== 'object') return { ok: false, reason: 'the publication carries no document' };
  const doc = d as { id?: unknown; rootId?: unknown; nodes?: unknown; activePageId?: unknown };
  if (typeof doc.id !== 'string' || !doc.id) return { ok: false, reason: 'the document has no string id' };
  if (typeof doc.rootId !== 'string' || !doc.rootId) return { ok: false, reason: 'the document has no string rootId' };
  if (!doc.nodes || typeof doc.nodes !== 'object') return { ok: false, reason: 'the document has no nodes object' };
  if (typeof doc.activePageId !== 'string' || !doc.activePageId) return { ok: false, reason: 'the document has no string activePageId' };
  // v243 — the shallow shape is NOT enough. A document whose graph is internally inconsistent (a childId
  // naming no node, a parent that disagrees with its child, a cycle) passes the checks above and then loads
  // into the store and draws something subtly wrong, which is worse than refusing it. The deep check names
  // the problem; the shallow reasons above stay first so a malformed SHAPE is still reported as such.
  const verdict = validateDocument(d);
  if (!verdict.ok) {
    const [first, ...rest] = verdict.problems;
    return { ok: false, reason: `the document is not a consistent graph: ${first!.detail}${rest.length ? ` (+${rest.length} more)` : ''}` };
  }
  return { ok: true, document: d as DesignDocument };
}

/** Read a publication and hand back the document it carries, or a reason it could not be remixed. */
export async function remixProject(projectId: string): Promise<RemixExtraction> {
  return extractRemixDocument(await readPublished(projectId));
}

/**
 * v234 — PURE: the remix target named by a URL query string, or `null`. The artifact page links a visitor to
 * `/?remix=<id>`, so the Studio reads this on mount. A bare `?remix=` (or whitespace) is `null`, not a project
 * named the empty string — the same "absence has one representation" rule the model follows.
 */
export function remixIdFromSearch(search: string): string | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const id = new URLSearchParams(query).get('remix');
  return id && id.trim() ? id : null;
}
