import { describe, expect, it } from 'vitest';

import { appendCreditEntry, balanceOf, emptyCreditLedger, type CreditEntry, type CreditLedger } from './credits';
import { holdsTemplate, refundPurchase } from './refund';
import { addTemplate, emptyTemplateCatalog, type TemplateCatalog, type TemplateListing } from './templateCatalog';

const LISTING: TemplateListing = {
  id: 't1', title: 'SaaS Landing', description: 'A landing page.', authorId: 'author-1',
  priceCents: 500, category: 'landing', tags: [], documentId: 'doc-1', createdAt: 1,
};

function catalog(priceCents = 500): TemplateCatalog {
  const added = addTemplate(emptyTemplateCatalog(), { ...LISTING, priceCents });
  if (!added.ok) throw new Error(`fixture: ${added.reason}`);
  return added.catalog;
}

function ledgerOf(...entries: CreditEntry[]): CreditLedger {
  let ledger = emptyCreditLedger();
  for (const entry of entries) {
    const res = appendCreditEntry(ledger, entry);
    if (!res.ok) throw new Error(`fixture: ${res.reason}`);
    ledger = res.ledger;
  }
  return ledger;
}

const grant = (accountId: string, delta: number): CreditEntry => ({ id: `grant-${accountId}`, accountId, delta, reason: 'top-up', at: 1, kind: 'grant' });
const buy = (delta = -500): CreditEntry => ({ id: 'buy-1', accountId: 'buyer-1', delta, reason: 'template "SaaS Landing"', at: 2, kind: 'spend', ref: 't1' });
const sale = (): CreditEntry => ({ id: 'sale-1', accountId: 'author-1', delta: 500, reason: 'sale of "SaaS Landing"', at: 2, kind: 'grant', ref: 't1' });

const refund = { templateId: 't1', buyerId: 'buyer-1', entryId: 'r1', at: 3 };

describe('refundPurchase: the happy path', () => {
  it('credits the buyer and debits the author by the RECORDED price', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), grant('author-1', 100), buy(), sale());
    const d = refundPurchase(catalog(), ledger, refund);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.priceCents).toBe(500);
    expect(balanceOf(d.ledger, 'buyer-1')).toBe(1000); // 1000 - 500 + 500
    expect(balanceOf(d.ledger, 'author-1')).toBe(100); // 100 + 500 - 500
    expect(d.buyerEntry).toMatchObject({ accountId: 'buyer-1', delta: 500, kind: 'refund', ref: 't1' });
    expect(d.authorEntry).toMatchObject({ accountId: 'author-1', delta: -500, kind: 'spend', ref: 't1' });
    expect(d.authorEntry.id).toBe('r1:author');
  });

  it('uses the price the PURCHASE recorded, not the listing\'s price today', () => {
    // The listing now costs 200, but this buyer paid 500 — refunding 200 would invent a movement.
    const ledger = ledgerOf(grant('buyer-1', 1000), grant('author-1', 600), buy(-500), sale());
    const d = refundPurchase(catalog(200), ledger, refund);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.priceCents).toBe(500);
    expect(balanceOf(d.ledger, 'buyer-1')).toBe(1000);
    expect(balanceOf(d.ledger, 'author-1')).toBe(600); // 600 grant + 500 sale - 500 claw-back
  });

  it('a re-purchase after a refund can be refunded again (refunds pair with PURCHASES, not with the ref)', () => {
    let ledger = ledgerOf(grant('buyer-1', 2000), grant('author-1', 1000), buy(-500), sale());
    const first = refundPurchase(catalog(), ledger, { templateId: 't1', buyerId: 'buyer-1', entryId: 'r1', at: 3 });
    if (!first.ok) throw new Error(`first refund refused: ${first.reason}`);
    ledger = first.ledger;

    const again = appendCreditEntry(ledger, { ...buy(-500), id: 'buy-2' });
    if (!again.ok) throw new Error(`re-purchase refused: ${again.reason}`);
    ledger = again.ledger;
    expect(holdsTemplate(ledger, 'buyer-1', 't1')).toBe(true);

    const second = refundPurchase(catalog(), ledger, { templateId: 't1', buyerId: 'buyer-1', entryId: 'r2', at: 5 });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(balanceOf(second.ledger, 'buyer-1')).toBe(2000); // 2000 - 500 + 500 - 500 + 500
    expect(holdsTemplate(second.ledger, 'buyer-1', 't1')).toBe(false);

    const third = refundPurchase(catalog(), second.ledger, { templateId: 't1', buyerId: 'buyer-1', entryId: 'r3', at: 6 });
    expect(third.ok).toBe(false);
  });

  it('releases ownership, and a re-purchase holds it again', () => {
    let ledger = ledgerOf(grant('buyer-1', 1000), grant('author-1', 100), buy(), sale());
    expect(holdsTemplate(ledger, 'buyer-1', 't1')).toBe(true);
    const d = refundPurchase(catalog(), ledger, refund);
    if (!d.ok) throw new Error('unreachable');
    ledger = d.ledger;
    expect(holdsTemplate(ledger, 'buyer-1', 't1')).toBe(false);
    const again = appendCreditEntry(ledger, { ...buy(), id: 'buy-2' });
    if (!again.ok) throw new Error('unreachable');
    expect(holdsTemplate(again.ledger, 'buyer-1', 't1')).toBe(true);
  });
});

describe('refundPurchase: refusals, each by name', () => {
  const refuse = (ledger: CreditLedger, over: Partial<typeof refund> = {}, cat: TemplateCatalog = catalog()) => {
    const d = refundPurchase(cat, ledger, { ...refund, ...over });
    expect(d.ok).toBe(false);
    return d.ok ? '' : d.reason;
  };

  it('an unknown template', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), buy(), sale());
    expect(refuse(ledger, { templateId: 'ghost' })).toContain('no template is listed');
  });

  it('a blank buyerId or entryId', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), buy(), sale());
    expect(refuse(ledger, { buyerId: '' })).toContain('buyerId');
    expect(refuse(ledger, { entryId: '' })).toContain('entryId');
  });

  it('a buyer with no purchase to refund', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000));
    expect(refuse(ledger)).toContain('holds no purchase');
  });

  it('a second refund of the same purchase', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), grant('author-1', 100), buy(), sale());
    const first = refundPurchase(catalog(), ledger, refund);
    if (!first.ok) throw new Error('unreachable');
    expect(refuse(first.ledger, { entryId: 'r2' })).toContain('already been refunded');
  });

  it('an author who cannot cover the claw-back — and the ledger does not move', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), buy(), grant('author-1', 100)); // no sale credit: author holds 100
    const before = ledger.entries.length;
    const reason = refuse(ledger);
    expect(reason).toContain('cannot cover it');
    expect(reason).toContain('holds 100');
    expect(ledger.entries.length).toBe(before); // neither entry was appended
    expect(balanceOf(ledger, 'buyer-1')).toBe(500);
  });
});
