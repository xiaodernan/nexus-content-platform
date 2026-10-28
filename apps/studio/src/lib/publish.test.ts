import { createEmptyDocument, type DesignDocument } from '@nexus/design-model';
import { describe, expect, it } from 'vitest';

import { publishTemplate, type PublishTemplateInput } from './publish';
import { addTemplate, emptyTemplateCatalog } from './templateCatalog';

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
