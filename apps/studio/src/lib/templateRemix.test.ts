import { describe, it, expect } from 'vitest';
import type { DesignDocument } from '@nexus/design-model';

import type { CreditLedger } from './credits';
import { addTemplate, emptyTemplateCatalog, type TemplateCatalog, type TemplateListing } from './templateCatalog';
import { remixRightFor, remixTemplateToProject } from './templateRemix';

/** A minimal Design Document fixture — only the shape `forkDocument` actually reads. */
function doc(id: string, name: string): DesignDocument {
  const rootId = 'node-root';
  return { id, rootId, name, nodes: { [rootId]: { id: rootId, type: 'page' } } } as unknown as DesignDocument;
}

const FREE: TemplateListing = {
  id: 'tpl-free', title: 'Starter', description: 'A free starter', authorId: 'authorA',
  priceCents: 0, category: 'landing', tags: ['free'], documentId: 'doc-free', createdAt: 1000,
};
const PAID: TemplateListing = {
  id: 'tpl-paid', title: 'Pro Dashboard', description: 'A pro dashboard', authorId: 'authorA',
  priceCents: 500, category: 'dashboard', tags: ['pro'], documentId: 'doc-paid', createdAt: 2000,
};

function catalog(): TemplateCatalog {
  let c = emptyTemplateCatalog();
  for (const l of [FREE, PAID]) { const a = addTemplate(c, l); if (a.ok) c = a.catalog; }
  return c;
}

describe('remixRightFor', () => {
  it('a free template is remixable by anyone, on the "free" basis', () => {
    const r = remixRightFor(catalog(), { entries: [] }, 'anyone', 'tpl-free');
    expect(r).toEqual({ ok: true, basis: 'free' });
  });

  it('a paid template is refused for a viewer with no purchase', () => {
    const r = remixRightFor(catalog(), { entries: [] }, 'buyerB', 'tpl-paid');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/does not hold/);
  });

  it('a refunded purchase no longer grants the right to remix', () => {
    const ledger: CreditLedger = {
      entries: [
        { id: 'e0', accountId: 'buyerB', delta: 1000, reason: 'top-up', at: 2000, kind: 'grant' },
        { id: 'e1', accountId: 'buyerB', delta: -500, reason: 'template "Pro Dashboard"', at: 3000, kind: 'spend', ref: 'tpl-paid' },
        { id: 'e2', accountId: 'buyerB', delta: 500, reason: 'refund', at: 4000, kind: 'refund', ref: 'tpl-paid' },
      ],
    };
    const r = remixRightFor(catalog(), ledger, 'buyerB', 'tpl-paid');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/does not hold/);
  });

  it('a paid template is owned by a viewer who holds a spend entry for it', () => {
    const ledger: CreditLedger = {
      entries: [{ id: 'e1', accountId: 'buyerB', delta: -500, reason: 'template "Pro Dashboard"', at: 3000, kind: 'spend', ref: 'tpl-paid' }],
    };
    const r = remixRightFor(catalog(), ledger, 'buyerB', 'tpl-paid');
    expect(r).toEqual({ ok: true, basis: 'owned' });
  });

  it('a paid template is owned by its own author', () => {
    const r = remixRightFor(catalog(), { entries: [] }, 'authorA', 'tpl-paid');
    expect(r).toEqual({ ok: true, basis: 'owned' });
  });

  it('an unknown template id is refused by name', () => {
    const r = remixRightFor(catalog(), { entries: [] }, 'anyone', 'tpl-ghost');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/no template is listed/);
  });
});

describe('remixTemplateToProject', () => {
  it('forks a free template into a NEW document with a fresh id', () => {
    const source = doc('doc-free', 'Starter');
    const res = remixTemplateToProject(source, catalog(), { entries: [] }, 'anyone', 'tpl-free');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.basis).toBe('free');
      expect(res.document.id).not.toBe('doc-free'); // a remix can never overwrite the source
      expect(res.document.name).toBe('Starter (remix)');
      expect(source.id).toBe('doc-free'); // the source is never mutated
    }
  });

  it('honors an explicit name override', () => {
    const res = remixTemplateToProject(doc('doc-free', 'Starter'), catalog(), { entries: [] }, 'anyone', 'tpl-free', 'My Clone');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.document.name).toBe('My Clone');
  });

  it('refuses a paid template the viewer has not purchased', () => {
    const res = remixTemplateToProject(doc('doc-paid', 'Pro'), catalog(), { entries: [] }, 'buyerB', 'tpl-paid');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/does not hold/);
  });

  it('forks a paid template the viewer owns', () => {
    const ledger: CreditLedger = {
      entries: [{ id: 'e1', accountId: 'buyerB', delta: -500, reason: 'template "Pro Dashboard"', at: 3000, kind: 'spend', ref: 'tpl-paid' }],
    };
    const res = remixTemplateToProject(doc('doc-paid', 'Pro'), catalog(), ledger, 'buyerB', 'tpl-paid');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.document.id).not.toBe('doc-paid');
  });

  it('reports a malformed source document by name instead of throwing', () => {
    const bad = { id: 'doc-bad', rootId: 'node-missing', name: 'Bad', nodes: {} } as unknown as DesignDocument;
    const res = remixTemplateToProject(bad, catalog(), { entries: [] }, 'anyone', 'tpl-free');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/could not be forked/);
  });
});
