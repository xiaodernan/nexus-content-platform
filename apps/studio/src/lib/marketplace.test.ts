/**
 * M8 — direct coverage for the marketplace (src/lib/marketplace.ts), the one place a listing
 * becomes a transaction. These pin the three rules: the purchase is ATOMIC (a refusal moves
 * neither model), the ledger stays the record (both entries carry the template id as their `ref`),
 * and a free template is cloned rather than bought. Plus the honest refusals and the balance
 * conservation a transfer must hold.
 */
import { describe, expect, it } from 'vitest';
import { appendCreditEntry, balanceOf, emptyCreditLedger, historyOf, type CreditEntry, type CreditLedger } from './credits';
import { addTemplate, emptyTemplateCatalog, type TemplateCatalog } from './templateCatalog';
import { purchasesOf, purchaseTemplate, refSoldIn, saleOfPurchase, templateAffordable } from './marketplace';

function fixture() {
  let catalog: TemplateCatalog = emptyTemplateCatalog();
  const a = addTemplate(catalog, {
    id: 't1', title: 'SaaS Landing', description: 'A hero and a pricing table.', authorId: 'author-1',
    priceCents: 500, category: 'landing', tags: ['saas'], documentId: 'doc-1', createdAt: 1_000,
  });
  if (!a.ok) throw new Error('fixture: ' + a.reason);
  catalog = a.catalog;
  const free = addTemplate(catalog, {
    id: 't-free', title: 'Starter', description: 'A free starter.', authorId: 'author-1',
    priceCents: 0, category: 'other', tags: [], documentId: 'doc-2', createdAt: 1_000,
  });
  if (!free.ok) throw new Error('fixture: ' + free.reason);
  catalog = free.catalog;
  let ledger: CreditLedger = emptyCreditLedger();
  const g = appendCreditEntry(ledger, { id: 'grant-1', accountId: 'buyer-1', delta: 800, reason: 'signup grant', at: 1, kind: 'grant' });
  if (!g.ok) throw new Error('fixture: ' + g.reason);
  ledger = g.ledger;
  return { catalog, ledger };
}

const buy = { templateId: 't1', buyerId: 'buyer-1', entryId: 'buy-1', at: 2_000 };

describe('marketplace: a purchase', () => {
  it('debits the buyer, credits the author, and carries the template id on both entries', () => {
    const { catalog, ledger } = fixture();
    const d = purchaseTemplate(catalog, ledger, buy);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(balanceOf(d.ledger, 'buyer-1')).toBe(300); // 800 - 500
    expect(balanceOf(d.ledger, 'author-1')).toBe(500);
    expect(d.buyerEntry).toMatchObject({ accountId: 'buyer-1', delta: -500, kind: 'spend', ref: 't1' });
    expect(d.authorEntry).toMatchObject({ accountId: 'author-1', delta: 500, kind: 'grant', ref: 't1' });
    expect(d.authorEntry.id).toBe('buy-1:author'); // derived from the buyer's idempotency key
    expect(d.catalog).toBe(catalog); // the catalog is untouched by a purchase
  });

  it('conserves credits: the buyer loses exactly what the author gains', () => {
    const { catalog, ledger } = fixture();
    const before = balanceOf(ledger, 'buyer-1') + balanceOf(ledger, 'author-1');
    const d = purchaseTemplate(catalog, ledger, buy);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(balanceOf(d.ledger, 'buyer-1') + balanceOf(d.ledger, 'author-1')).toBe(before);
  });

  it('derives the purchase history from the ledger, with no second list', () => {
    const { catalog, ledger } = fixture();
    const d = purchaseTemplate(catalog, ledger, buy);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(purchasesOf(d.ledger, 'buyer-1').map((e) => e.ref)).toEqual(['t1']);
    expect(purchasesOf(d.ledger, 'author-1').map((e) => e.ref)).toEqual(['t1']);
    // the grant the fixture made carries no ref, so it is not a purchase
    expect(purchasesOf(ledger, 'buyer-1')).toEqual([]);
  });

  it('never mutates the ledger it is handed', () => {
    const { catalog, ledger } = fixture();
    const before = ledger.entries.length;
    purchaseTemplate(catalog, ledger, buy);
    expect(ledger.entries).toHaveLength(before);
    expect(balanceOf(ledger, 'buyer-1')).toBe(800);
  });
});

describe('marketplace: refusals, each by name', () => {
  const refuse = (over: Partial<typeof buy> = {}) => {
    const { catalog, ledger } = fixture();
    const d = purchaseTemplate(catalog, ledger, { ...buy, ...over });
    expect(d.ok).toBe(false);
    return d.ok ? '' : d.reason;
  };

  it('an unknown template id', () => {
    expect(refuse({ templateId: 'nope' })).toContain('no template is listed under id "nope"');
  });

  it('the author buying their own listing', () => {
    expect(refuse({ buyerId: 'author-1' })).toContain('already holds it');
  });

  it('a free template is cloned, not bought', () => {
    expect(refuse({ templateId: 't-free' })).toContain('free — a free template is cloned, not bought');
  });

  it('a blank buyerId or entryId', () => {
    expect(refuse({ buyerId: '' })).toContain('buyerId');
    expect(refuse({ entryId: '' })).toContain('entryId');
  });

  it('an unaffordable purchase names the balance and the price', () => {
    const { catalog, ledger } = fixture();
    const first = purchaseTemplate(catalog, ledger, buy); // the buyer's 800 becomes 300
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = purchaseTemplate(first.catalog, first.ledger, { ...buy, entryId: 'buy-3' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toContain('holds 300');
    expect(second.reason).toContain('costs 500');
    expect(second.reason).toContain('not affordable');
  });
});

describe('marketplace: atomicity', () => {
  it('a retried entryId refuses the WHOLE purchase and moves neither model', () => {
    const { catalog, ledger } = fixture();
    // Enough for TWO purchases, so the retry reaches the idempotency check rather than being
    // stopped earlier by the balance check — that is the branch this case exists to exercise.
    const rich = appendCreditEntry(ledger, { id: 'grant-2', accountId: 'buyer-1', delta: 700, reason: 'top-up', at: 1, kind: 'grant' });
    if (!rich.ok) throw new Error('unreachable');
    const first = purchaseTemplate(catalog, rich.ledger, buy);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const snapshot = first.ledger.entries.length;
    // a retry that reuses the same idempotency key: the buyer's debit is refused (duplicate id),
    // so the purchase is refused whole — the author is NOT credited a second time.
    const retry = purchaseTemplate(first.catalog, first.ledger, buy);
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.reason).toContain('the buyer\'s debit was refused');
    expect(retry.reason).toContain('already in this ledger');
    expect(first.ledger.entries).toHaveLength(snapshot);
    expect(balanceOf(first.ledger, 'author-1')).toBe(500);
  });
});

describe('marketplace: affordability is derived, and decides nothing', () => {
  it('answers true only for a listing the viewer can actually buy', () => {
    const { catalog, ledger } = fixture();
    expect(templateAffordable(catalog, ledger, 'buyer-1', 't1')).toBe(true);
    expect(templateAffordable(catalog, ledger, 'poor-1', 't1')).toBe(false); // no balance
    expect(templateAffordable(catalog, ledger, 'author-1', 't1')).toBe(false); // the author
    expect(templateAffordable(catalog, ledger, 'buyer-1', 't-free')).toBe(false); // free is cloned
    expect(templateAffordable(catalog, ledger, 'buyer-1', 'nope')).toBe(false); // unknown
  });

  it('a purchase leaves a readable trail in the buyer history', () => {
    const { catalog, ledger } = fixture();
    const d = purchaseTemplate(catalog, ledger, buy);
    if (!d.ok) throw new Error('unreachable');
    expect(historyOf(d.ledger, 'buyer-1').map((e) => e.kind)).toEqual(['grant', 'spend']);
  });
});

describe('marketplace: WHO WAS PAID is the paired write (v538, owned here since v539)', () => {
  it('saleOfPurchase reads the account the sale credited, and refSoldIn says the ref named a template', () => {
    const { catalog, ledger } = fixture();
    const d = purchaseTemplate(catalog, ledger, buy);
    if (!d.ok) throw new Error(`fixture purchase refused: ${d.reason}`);
    expect(saleOfPurchase(d.ledger, d.buyerEntry)?.accountId).toBe('author-1');
    expect(refSoldIn(d.ledger, 't1')).toBe(true);
    expect(refSoldIn(d.ledger, 'plan-pro')).toBe(false);
  });

  it('a grant at a DIFFERENT instant is not the sale, and a purchase with no ref has none', () => {
    // A hand-built record: a top-up carrying the same ref at another instant must not be read as a sale.
    const g1: CreditEntry = { id: 'g1', accountId: 'author-1', delta: 500, reason: 'top-up', at: 5, kind: 'grant', ref: 't1' };
    const s1: CreditEntry = { id: 's1', accountId: 'buyer-1', delta: -500, reason: 'template "SaaS Landing"', at: 2, kind: 'spend', ref: 't1' };
    const s2: CreditEntry = { id: 's2', accountId: 'buyer-1', delta: -300, reason: 'subscription "pro"', at: 6, kind: 'spend' };
    const ledger: CreditLedger = { entries: [g1, s1, s2] };
    expect(saleOfPurchase(ledger, s1)).toBeNull();
    expect(refSoldIn(ledger, 't1')).toBe(false);
    expect(saleOfPurchase(ledger, s2)).toBeNull();
  });
});