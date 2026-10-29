import { createEmptyDocument, type DesignDocument } from '@nexus/design-model';
import { describe, expect, it } from 'vitest';

import { publishListing, publishTemplate, type PublishTemplateInput } from './publish';
import { addTemplate, emptyTemplateCatalog, type TemplateCatalog, type TemplateListing } from './templateCatalog';

/** A deep clone of the model's own empty document, so a test may break a node without sharing state. */
function doc(): DesignDocument {
  const base = createEmptyDocument('My Design');
  return JSON.parse(JSON.stringify({ ...base, id: 'doc-pub' })) as DesignDocument;
}

const input: PublishTemplateInput = {
  id: 'tpl-pub',
  title: 'Published Landing',
  description: 'A landing page with a hero.',
  authorId: 'author-1',
  priceCents: 500,
  category: 'landing',
  tags: ['Landing', 'NEW', 'landing'],
  now: 1_700_000_000_000,
};

describe('publishTemplate: a design becomes a listing', () => {
  it('publishes a valid design, and the listing clones THAT document', () => {
    const d = publishTemplate(doc(), input);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.listing).toMatchObject({
      id: 'tpl-pub', title: 'Published Landing', authorId: 'author-1',
      priceCents: 500, documentId: 'doc-pub', createdAt: input.now,
    });
    expect(d.listing.tags).toEqual(['landing', 'new']); // normalized + de-duplicated
  });

  it('the published listing is a VALID catalog entry (publishing cannot drift from adding)', () => {
    const d = publishTemplate(doc(), input);
    if (!d.ok) throw new Error(d.reason);
    expect(addTemplate(emptyTemplateCatalog(), d.listing).ok).toBe(true);
  });

  it('is deterministic', () => {
    expect(publishTemplate(doc(), input)).toEqual(publishTemplate(doc(), input));
  });
});

describe('publishTemplate: refusals, each by name', () => {
  const refuse = (over: Partial<PublishTemplateInput> = {}, mutate?: (d: DesignDocument) => void) => {
    const d = doc();
    if (mutate) mutate(d);
    const res = publishTemplate(d, { ...input, ...over });
    expect(res.ok).toBe(false);
    return res.ok ? '' : res.reason;
  };

  it('refuses a design whose graph is inconsistent, naming the missing child', () => {
    const reason = refuse({}, (d) => {
      (d.nodes[d.activePageId] as unknown as { childIds: string[] }).childIds = ['ghost'];
    });
    expect(reason).toMatch(/not publishable/);
    expect(reason).toMatch(/ghost/);
  });

  it('refuses a blank title through the catalog rule', () => {
    expect(refuse({ title: '   ' })).toMatch(/title/);
  });

  it('refuses a negative price through the catalog rule', () => {
    expect(refuse({ priceCents: -1 })).toMatch(/price/);
  });

  it('refuses an unknown category through the catalog rule', () => {
    expect(refuse({ category: 'nope' as PublishTemplateInput['category'] })).toMatch(/category/);
  });
});

/** A shelf already holding one listing, built through the same writer a publish uses. */
function shelf(): { catalog: TemplateCatalog; listing: TemplateListing } {
  const added = addTemplate(emptyTemplateCatalog(), {
    id: 'tpl-seed',
    title: 'Seed Listing',
    description: 'Already on the shelf.',
    authorId: 'author-2',
    priceCents: 200,
    category: 'landing',
    tags: ['seed'],
    documentId: 'doc-seed',
    createdAt: 1_700_000_000_000,
  });
  if (!added.ok) throw new Error(added.reason);
  return { catalog: added.catalog, listing: added.listing };
}

describe('publishListing: a design joins an EXISTING shelf as one decision', () => {
  it('adds to the shelf in order, leaves the inputs untouched, and does not touch the withdrawal record', () => {
    const { catalog } = shelf();
    const withdrawn: TemplateListing[] = [];
    const before = JSON.stringify({ catalog, withdrawn });
    const d = publishListing(catalog, withdrawn, doc(), input);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.catalog.listings.map((l) => l.id)).toEqual(['tpl-seed', 'tpl-pub']);
    expect(d.listing).toMatchObject({ id: 'tpl-pub', documentId: 'doc-pub', authorId: 'author-1' });
    expect(JSON.stringify({ catalog, withdrawn })).toBe(before);
  });

  it('refuses a design that is not publishable, naming the problem', () => {
    const { catalog } = shelf();
    const broken = doc();
    (broken.nodes[broken.activePageId] as unknown as { childIds: string[] }).childIds = ['ghost'];
    const d = publishListing(catalog, [], broken, input);
    expect(d.ok).toBe(false);
    expect(d.ok ? '' : d.reason).toMatch(/not publishable/);
    expect(catalog.listings.map((l) => l.id)).toEqual(['tpl-seed']);
  });

  it('refuses an id the shelf already lists, through the shelf own rule', () => {
    const { catalog } = shelf();
    const d = publishListing(catalog, [], doc(), { ...input, id: 'tpl-seed' });
    expect(d.ok).toBe(false);
    expect(d.ok ? '' : d.reason).toMatch(/tpl-seed/);
  });

  it('refuses an id ONLY the withdrawal record holds, so a publish cannot build an unsavable shelf', () => {
    const { catalog, listing } = shelf();
    // Not on the shelf — the shelf's own rule would accept it. Only the RECORD forbids the id, which is
    // exactly the case a hand-rolled publish would miss and `catalogStore` would then refuse to save.
    const withdrawn = [{ ...listing, id: 'tpl-gone' }];
    const d = publishListing(catalog, withdrawn, doc(), { ...input, id: 'tpl-gone' });
    expect(d.ok).toBe(false);
    expect(d.ok ? '' : d.reason).toMatch(/withdrawal record/);
    expect(catalog.listings.map((l) => l.id)).toEqual(['tpl-seed']);
  });
});
