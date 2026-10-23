import { describe, expect, it, vi } from 'vitest';
import type { DesignDocument } from '@nexus/design-model';

import { firstPageId, buildGalleryItems, type GalleryRead } from './gallery';
import type { ExploreRow } from './explore';

/**
 * M7 v409 — the GALLERY builder’s own rules, graded directly.
 *
 * The gallery is shared by the explore page and the profile page, and it exists so the fan-out (one read
 * per row’s document, one thumbnail drawn from it) is written ONCE rather than twice and drifting. The
 * rule the shared builder keeps, in its own doc-comment’s words: a row whose document cannot be read is
 * shown WITH ITS REASON, never as a blank card, and a row whose document has no drawable page says
 * “nothing to draw”. A card that silently loses its picture is a card that lies — so the absence of a
 * thumbnail is always a NAMED absence.
 */
const row = (projectId: string): ExploreRow => ({
  projectId,
  title: `Publication ${projectId}`,
  version: 1,
  publishedAt: '2026-10-24T00:00:00.000Z',
});

const docWithPage = (pageId = 'pg-1') =>
  ({ activePageId: pageId, nodes: { [pageId]: { id: pageId, type: 'page' } } }) as unknown as DesignDocument;

describe('firstPageId — the page a document would be drawn on (v409)', () => {
  it('names the active page when the document has one', () => {
    expect(firstPageId(docWithPage('pg-1'))).toBe('pg-1');
    expect(firstPageId(docWithPage('pg-9'))).toBe('pg-9');
  });

  it('answers null for anything that is not a document at all', () => {
    expect(firstPageId(null)).toBeNull();
    expect(firstPageId(undefined as unknown as DesignDocument | null)).toBeNull();
    expect(firstPageId('a document' as unknown as DesignDocument)).toBeNull();
    expect(firstPageId(42 as unknown as DesignDocument)).toBeNull();
  });

  it('answers null when the active page id is missing or not a string', () => {
    expect(firstPageId({ nodes: {} } as unknown as DesignDocument)).toBeNull();
    expect(firstPageId({ activePageId: 7, nodes: {} } as unknown as DesignDocument)).toBeNull();
  });

  it('answers null when the document carries no nodes map at all', () => {
    expect(firstPageId({ activePageId: 'pg-1' } as unknown as DesignDocument)).toBeNull();
    expect(firstPageId({ activePageId: 'pg-1', nodes: 'nope' } as unknown as DesignDocument)).toBeNull();
  });

  it('answers null when the active page is not among the nodes — a stale id is not a page', () => {
    expect(firstPageId({ activePageId: 'pg-gone', nodes: { 'pg-1': {} } } as unknown as DesignDocument)).toBeNull();
  });
});

describe('buildGalleryItems — one second read per row, and the thumbnail it earns (v409)', () => {
  it('reads each row’s document and draws the page the reader named', async () => {
    const seen: string[] = [];
    const read = vi.fn(async (projectId: string): Promise<GalleryRead> => {
      seen.push(projectId);
      return { ok: true, document: docWithPage('pg-1') };
    });
    const drawn: { doc: DesignDocument; pageId: string }[] = [];
    const draw = (doc: DesignDocument, pageId: string) => {
      drawn.push({ doc, pageId });
      return 'data:image/png;base64,AAA';
    };

    const items = await buildGalleryItems([row('p1'), row('p2')], read, draw);

    expect(seen).toEqual(['p1', 'p2']);
    expect(items.map((i) => i.projectId)).toEqual(['p1', 'p2']);
    expect(items.every((i) => i.thumbnail === 'data:image/png;base64,AAA')).toBe(true);
    expect(drawn.map((d) => d.pageId)).toEqual(['pg-1', 'pg-1']);
    expect(items.every((i) => i.note === undefined)).toBe(true);
  });

  it('a row whose document could not be read is shown WITH ITS REASON, never as a blank card', async () => {
    const read = async (): Promise<GalleryRead> => ({ ok: false, reason: 'the service’s document door answered HTTP 503' });
    const draw = vi.fn(() => 'data:image/png;base64,AAA');

    const items = await buildGalleryItems([row('p1')], read, draw);

    expect(items[0]!.thumbnail).toBeUndefined();
    expect(items[0]!.note).toBe('the service’s document door answered HTTP 503');
    expect(draw).not.toHaveBeenCalled();
  });

  it('a read with no reason still says something honest, not nothing', async () => {
    const read = async (): Promise<GalleryRead> => ({ ok: false });
    const items = await buildGalleryItems([row('p1')], read, () => 'x');
    expect(items[0]!.note).toBe('preview unavailable');
  });

  it('a document with no drawable page says “nothing to draw” — the card’s own fact, not a failure', async () => {
    const brokenPage = async (): Promise<GalleryRead> => ({
      ok: true,
      document: { activePageId: 'pg-gone', nodes: {} } as unknown as DesignDocument,
    });
    const noPage = await buildGalleryItems([row('p1')], brokenPage, () => 'x');
    expect(noPage[0]!.thumbnail).toBeUndefined();
    expect(noPage[0]!.note).toBe('nothing to draw');

    const nullDoc = await buildGalleryItems([row('p2')], async () => ({ ok: true, document: null }), () => 'x');
    expect(nullDoc[0]!.note).toBe('nothing to draw');
  });

  it('a successful read with no drawable page never calls the drawer at all', async () => {
    const draw = vi.fn(() => 'x');
    await buildGalleryItems([row('p1')], async () => ({ ok: true, document: null }), draw);
    expect(draw).not.toHaveBeenCalled();
  });

  it('an empty listing builds an empty gallery, and reads nothing', async () => {
    const read = vi.fn(async (): Promise<GalleryRead> => ({ ok: false, reason: 'never asked' }));
    const items = await buildGalleryItems([], read, () => 'x');
    expect(items).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it('the card keeps the row’s own facts and the lineage the document carries', async () => {
    const withLineage = {
      ...docWithPage(),
      _lineage: { sourceProjectId: 'pub-source', remixedAt: '2026-10-20T00:00:00.000Z' },
    } as unknown as DesignDocument;
    const items = await buildGalleryItems(
      [row('p1')],
      async (): Promise<GalleryRead> => ({ ok: true, document: withLineage }),
      () => 'thumb',
    );
    expect(items[0]!.title).toBe('Publication p1');
    expect(items[0]!.remixedFrom).toBe('pub-source');
  });
});
