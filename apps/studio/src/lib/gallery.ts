/**
 * M7 v270 — the GALLERY builder, shared by the explore page and the profile page.
 *
 * A listing carries NO documents (the service's own shape), so a card needs a second read per row: one for
 * the document, one thumbnail drawn from it. That fan-out was the EXPLORE route's business, and the PROFILE
 * route needed the same thing — so it lives here, once, rather than being written twice and drifting.
 *
 * The rule the shared builder keeps: a row whose document cannot be read is shown WITH ITS REASON, never as
 * a blank card, and a row whose document has no drawable page says "nothing to draw". A card that silently
 * loses its picture is a card that lies.
 */
import type { DesignDocument } from '@nexus/design-model';

import { toExploreItem, type ExploreItem, type ExploreRow } from './explore';

/** What a second read of a row's document answered. */
export interface GalleryRead {
  ok: boolean;
  document?: unknown;
  reason?: string;
}

/** The page a document would be drawn on, or `null` when there is nothing to draw. */
export function firstPageId(doc: DesignDocument | null): string | null {
  if (!doc || typeof doc !== 'object') return null;
  const activePageId = (doc as { activePageId?: unknown }).activePageId;
  const nodes = (doc as { nodes?: unknown }).nodes;
  if (typeof activePageId !== 'string' || !nodes || typeof nodes !== 'object') return null;
  const node = (nodes as Record<string, unknown>)[activePageId];
  return node ? activePageId : null;
}

/**
 * Build the cards for a listing of publications.
 *
 * `read` is the caller\u2019s way of asking for a row\u2019s document (the service is one hop behind the Studio\u2019s
 * own route), and `draw` is the caller\u2019s way of turning a document and a page id into a thumbnail. Both are
 * injected so this module stays free of the service\u2019s address and of the renderer.
 */
export async function buildGalleryItems(
  rows: readonly ExploreRow[],
  read: (projectId: string) => Promise<GalleryRead>,
  draw: (doc: DesignDocument, pageId: string) => string,
): Promise<ExploreItem[]> {
  const items: ExploreItem[] = [];
  for (const row of rows) {
    const answer = await read(row.projectId);
    const doc = answer.ok ? ((answer.document as DesignDocument | null) ?? null) : null;
    const pageId = firstPageId(doc);
    const thumbnail = doc && pageId ? draw(doc, pageId) : undefined;
    items.push(toExploreItem(row, answer, thumbnail));
  }
  return items;
}
