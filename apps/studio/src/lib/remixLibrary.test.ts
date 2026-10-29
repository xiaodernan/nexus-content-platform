import { describe, expect, it } from 'vitest';
import { createEmptyDocument, type DesignDocument } from '@nexus/design-model';

import { stampLineage } from './lineage';
import { forkLine, forksOf, type ForkRow } from './remixLibrary';
import { addTemplate, emptyTemplateCatalog, type TemplateCatalog, type TemplateListing } from './templateCatalog';

const T0 = '2026-10-29T00:00:00.000Z';

const LISTING: TemplateListing = {
  id: 'tpl-harbour',
  title: 'Harbour Landing',
  description: 'a landing page',
  authorId: 'author-1',
  priceCents: 500,
  category: 'landing',
  tags: ['landing'],
  documentId: 'doc-harbour',
  createdAt: 1,
};

function shelf(...listings: TemplateListing[]): TemplateCatalog {
  let catalog = emptyTemplateCatalog();
  for (const listing of listings) {
    const decision = addTemplate(catalog, listing);
    if (!decision.ok) throw new Error(decision.reason);
    catalog = decision.catalog;
  }
  return catalog;
}

/** A fork of `sourceId`, named `name`, stamped at `at` — the document the store would hold. */
function fork(name: string, sourceId: string, at: string = T0) {
  return stampLineage(createEmptyDocument(name), sourceId, at);
}

describe('forksOf — which stored documents are forks, and where they came from', () => {
  it('answers NOTHING for a store of plain drafts: a document with no lineage is not a fork', () => {
    expect(forksOf([createEmptyDocument('Draft A'), createEmptyDocument('Draft B')], shelf(LISTING))).toEqual([]);
  });

  it('reads a stamped fork as a row naming its own document, its source, its instant and the shelf title', () => {
    const doc = fork('Harbour Landing (remix)', 'tpl-harbour');
    expect(forksOf([doc], shelf(LISTING))).toEqual([
      { documentId: doc.id, name: 'Harbour Landing (remix)', sourceProjectId: 'tpl-harbour', remixedAt: T0, sourceTitle: 'Harbour Landing' },
    ]);
  });

  it('keeps the STORE order — the library reads the documents as they were saved, not a chronology it invents', () => {
    // The second fork was stamped EARLIER; a sort by `remixedAt` would put them the other way round.
    const first = fork('One', 'tpl-harbour', '2026-10-29T02:00:00.000Z');
    const second = fork('Two', 'tpl-harbour', '2026-10-29T01:00:00.000Z');
    expect(forksOf([first, second], shelf(LISTING)).map((row) => row.name)).toEqual(['One', 'Two']);
  });

  it('skips the drafts and keeps the forks, so a project list never counts a plain design as remixed', () => {
    const draft = createEmptyDocument('Draft');
    const forked = fork('Fork', 'tpl-harbour');
    expect(forksOf([draft, forked], shelf(LISTING)).map((row) => row.documentId)).toEqual([forked.id]);
  });

  it('names the source even when the shelf has STOPPED listing it: a take-down is not a delete of the record', () => {
    const doc = fork('Fork', 'tpl-harbour');
    const row = forksOf([doc], emptyTemplateCatalog())[0]!;
    expect(row.sourceProjectId).toBe('tpl-harbour');
    expect(row.sourceTitle).toBe(null);
    expect(row.documentId).toBe(doc.id);
  });

  it('a source re-listed under ANOTHER author still resolves by id — the fork names an identity, not a seller', () => {
    const doc = fork('Fork', 'tpl-harbour');
    const row = forksOf([doc], shelf({ ...LISTING, authorId: 'author-2', title: 'Renamed Template' }))[0]!;
    expect(row.sourceTitle).toBe('Renamed Template');
  });

  it('refuses a HALF-written lineage: a source with no instant is a document nothing wrote', () => {
    const doc = createEmptyDocument('Hand edited');
    const half = { ...doc, _lineage: { sourceProjectId: 'tpl-harbour' } } as unknown as DesignDocument;
    const blank = { ...doc, _lineage: { sourceProjectId: 'tpl-harbour', remixedAt: '' } } as unknown as DesignDocument;
    expect(forksOf([half, blank], shelf(LISTING))).toEqual([]);
  });
});

describe('forkLine — one fork said in a sentence', () => {
  const ROW: ForkRow = {
    documentId: 'doc-fork',
    name: 'Harbour Landing (remix)',
    sourceProjectId: 'tpl-harbour',
    remixedAt: T0,
    sourceTitle: 'Harbour Landing',
  };

  it('names the fork, its source id and title, the instant and the document', () => {
    expect(forkLine(ROW)).toBe(
      `"Harbour Landing (remix)" ← tpl-harbour ("Harbour Landing") · remixed ${T0} · doc doc-fork`,
    );
  });

  it('says the source is NO LONGER LISTED rather than leaving the origin ambiguous', () => {
    expect(forkLine({ ...ROW, sourceTitle: null })).toBe(
      `"Harbour Landing (remix)" ← tpl-harbour (no longer listed) · remixed ${T0} · doc doc-fork`,
    );
  });
});
