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
    expect(d.authorEntry).toMatchObject({ accountId: 'author-1', delta: -500, kind: 'clawback', ref: 't1' });
    expect(d.authorEntry.id).toBe('r1:author');
    // The seller's side is a claw-back, NOT a purchase: losing a sale must not read as acquiring it.
    expect(holdsTemplate(d.ledger, 'author-1', 't1')).toBe(false);
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

describe('refundPurchase: the RECORD decides who was paid (v538)', () => {
  const empty = emptyTemplateCatalog();

  it('refunds a listing the catalog no longer lists — the record has the purchase and the sale', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), grant('author-1', 100), buy(), sale());
    const d = refundPurchase(empty, ledger, refund);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.priceCents).toBe(500);
    expect(balanceOf(d.ledger, 'buyer-1')).toBe(1000);
    expect(balanceOf(d.ledger, 'author-1')).toBe(100); // 100 + 500 sale − 500 claw-back
    // The sentence names the REF, because the catalog stopped claiming a title.
    expect(d.buyerEntry.reason).toBe('refund of "t1" (not in this catalog)');
    expect(holdsTemplate(d.ledger, 'buyer-1', 't1')).toBe(false);
  });

  it('claws back from the account the SALE credited, not the catalog\'s current author', () => {
    // The catalog was re-authored AFTER the sale: it now names author-2, who was never paid.
    const ledger = ledgerOf(grant('buyer-1', 1000), buy(), sale()); // the sale alone funds author-1 (500)
    const readded = addTemplate(emptyTemplateCatalog(), { ...LISTING, authorId: 'author-2' });
    if (!readded.ok) throw new Error(`fixture: ${readded.reason}`);
    const d = refundPurchase(readded.catalog, ledger, refund);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.authorEntry.accountId).toBe('author-1');
    expect(balanceOf(d.ledger, 'author-1')).toBe(0); // 500 sale − 500 claw-back
    expect(balanceOf(d.ledger, 'author-2')).toBe(0); // never paid, never debited
  });

  it('refuses a purchase the record cannot pair with a sale, when no catalog listing can answer either', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), buy()); // the buyer's debit, no seller's credit
    const d = refundPurchase(empty, ledger, refund);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toContain('records no sale');
    expect(d.reason).toContain('"t1" (not in this catalog)');
    expect(ledger.entries.length).toBe(2); // nothing appended
    expect(balanceOf(ledger, 'buyer-1')).toBe(500);
  });
});

describe('refundPurchase: refusals, each by name', () => {
  const refuse = (ledger: CreditLedger, over: Partial<typeof refund> = {}, cat: TemplateCatalog = catalog()) => {
    const d = refundPurchase(cat, ledger, { ...refund, ...over });
    expect(d.ok).toBe(false);
    return d.ok ? '' : d.reason;
  };

  it('a template neither the record nor the catalog knows', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), buy(), sale());
    expect(refuse(ledger, { templateId: 'ghost' })).toContain('holds no purchase of "ghost" (not in this catalog)');
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

  it('a refund dated BEFORE the purchase it reverses — and the ledger does not move (v533)', () => {
    // The instant is host-supplied, so the ledger's arithmetic would happily record a reversal that
    // precedes its cause. The mechanism refuses it by name instead: both instants in the sentence.
    const ledger = ledgerOf(grant('buyer-1', 1000), grant('author-1', 100), buy(), sale()); // purchase at 2
    const before = ledger.entries.length;
    const reason = refuse(ledger, { at: 1 });
    expect(reason).toContain('before the purchase it reverses');
    expect(reason).toContain('purchase was recorded at 2');
    expect(reason).toContain('refund asks for 1');
    expect(ledger.entries.length).toBe(before); // neither entry was appended
    expect(balanceOf(ledger, 'buyer-1')).toBe(500);
  });

  it('allows a refund at the SAME instant as the purchase — a batched pair is coherent', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), grant('author-1', 100), buy(), sale());
    const d = refundPurchase(catalog(), ledger, { ...refund, at: 2 });
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(balanceOf(d.ledger, 'buyer-1')).toBe(1000);
    expect(holdsTemplate(d.ledger, 'buyer-1', 't1')).toBe(false);
  });
});
