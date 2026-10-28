/**
 * M8 — direct coverage for the creator dashboard projection (src/lib/creatorDashboard.ts).
 *
 * These pin what the projection is FOR: composing the credits ledger, the template catalog and the
 * marketplace into one immutable shape a panel renders, with every number derived (so nothing can
 * drift from the records), an unsigned visitor seeing the market's size and nobody's numbers, and
 * the viewerId treated as the CLAIM it is (ADR 0018) rather than an authenticated identity.
 */
import { describe, expect, it } from 'vitest';
import { appendCreditEntry, balanceOf, emptyCreditLedger, type CreditLedger } from './credits';
import { addTemplate, emptyTemplateCatalog, type TemplateCatalog } from './templateCatalog';
import { purchaseTemplate } from './marketplace';
import { refundPurchase } from './refund';
import { buildCreatorDashboard, creatorDashboardLine } from './creatorDashboard';

function fixture() {
  let catalog: TemplateCatalog = emptyTemplateCatalog();
  for (const [id, author, price] of [['t1', 'author-1', 500], ['t2', 'author-1', 0], ['t3', 'other-1', 200]] as const) {
    const d = addTemplate(catalog, { id, title: `Template ${id}`, description: 'A template.', authorId: author, priceCents: price, category: 'landing', tags: ['x'], documentId: `doc-${id}`, createdAt: 1_000 });
    if (!d.ok) throw new Error('fixture: ' + d.reason);
    catalog = d.catalog;
  }
  let ledger: CreditLedger = emptyCreditLedger();
  const grant = appendCreditEntry(ledger, { id: 'g1', accountId: 'buyer-1', delta: 900, reason: 'signup grant', at: 1, kind: 'grant' });
  if (!grant.ok) throw new Error('fixture: ' + grant.reason);
  ledger = grant.ledger;
  const bought = purchaseTemplate(catalog, ledger, { templateId: 't1', buyerId: 'buyer-1', entryId: 'buy-1', at: 2_000 });
  if (!bought.ok) throw new Error('fixture: ' + bought.reason);
  return { catalog, ledger: bought.ledger };
}

describe('creatorDashboard: an unsigned visitor', () => {
  it('sees the market\'s size and nobody\'s numbers', () => {
    const { catalog, ledger } = fixture();
    const d = buildCreatorDashboard(catalog, ledger, null);
    expect(d.viewerId).toBeNull();
    expect(d.balance).toBe(0);
    expect(d.myListings).toEqual([]);
    expect(d.earned).toBe(0);
    expect(d.spent).toBe(0);
    expect(d.refunded).toBe(0);
    expect(d.clawedBack).toBe(0);
    expect(d.movements).toBe(0);
    expect(d.referenced).toEqual([]);
    expect(d.affordable).toEqual([]);
    expect(d.catalogSize).toBe(3); // the market's scale is still stated
    expect(creatorDashboardLine(d)).toContain('nobody is looking');
    expect(creatorDashboardLine(d)).toContain('3 listing(s)');
  });
});

describe('creatorDashboard: a viewer with a history', () => {
  it('derives the balance, the listings, the earnings and the referenced movements', () => {
    const { catalog, ledger } = fixture();
    const d = buildCreatorDashboard(catalog, ledger, 'buyer-1');
    expect(d.balance).toBe(400); // 900 granted, 500 spent on t1
    expect(d.earned).toBe(900);
    expect(d.spent).toBe(500);
    expect(d.movements).toBe(2); // the grant and the debit (the author's credit is another account's)
    expect(d.referenced.map((e) => e.ref)).toEqual(['t1']); // only the debit references something
    expect(d.myListings).toEqual([]); // buyer-1 published nothing
    expect(d.catalogSize).toBe(3);
  });

  it('earned − spent + refunded − clawedBack IS the balance — the derived numbers cannot drift', () => {
    const { catalog, ledger } = fixture();
    const refunded = refundPurchase(catalog, ledger, { templateId: 't1', buyerId: 'buyer-1', entryId: 'r1', at: 3_000 });
    if (!refunded.ok) throw new Error(`fixture refund refused: ${refunded.reason}`);
    for (const id of ['buyer-1', 'author-1', 'nobody-1']) {
      const d = buildCreatorDashboard(catalog, refunded.ledger, id);
      expect(d.earned - d.spent + d.refunded - d.clawedBack).toBe(balanceOf(refunded.ledger, id));
    }
    // With no refund-shaped movement the same identity reduces to earned − spent.
    for (const id of ['buyer-1', 'author-1']) {
      const d = buildCreatorDashboard(catalog, ledger, id);
      expect(d.refunded).toBe(0);
      expect(d.clawedBack).toBe(0);
      expect(d.earned - d.spent).toBe(balanceOf(ledger, id));
    }
  });

  it('a refund is not income and a claw-back is not spending — each gets its own bucket', () => {
    const { catalog, ledger } = fixture();
    const refunded = refundPurchase(catalog, ledger, { templateId: 't1', buyerId: 'buyer-1', entryId: 'r1', at: 3_000 });
    if (!refunded.ok) throw new Error(`fixture refund refused: ${refunded.reason}`);

    const buyer = buildCreatorDashboard(catalog, refunded.ledger, 'buyer-1');
    expect(buyer.earned).toBe(900); // the grant — a refund does not inflate what the buyer earned
    expect(buyer.spent).toBe(500); // the purchase — the refund does not erase what they spent
    expect(buyer.refunded).toBe(500);
    expect(buyer.clawedBack).toBe(0);
    expect(buyer.balance).toBe(900); // 900 − 500 + 500

    const author = buildCreatorDashboard(catalog, refunded.ledger, 'author-1');
    expect(author.earned).toBe(500); // the sale DID happen; it is not un-earned by the reversal
    expect(author.spent).toBe(0); // the claw-back is not the author buying anything
    expect(author.clawedBack).toBe(500);
    expect(author.refunded).toBe(0);
    expect(author.balance).toBe(0); // 500 sale − 500 claw-back

    const line = creatorDashboardLine(author);
    expect(line).toContain('earned 500');
    expect(line).toContain('spent 0');
    expect(line).toContain('clawed back 500');
    expect(line).toContain('refunded 0');
  });

  it('an author sees their own listings and their sale as a referenced movement', () => {
    const { catalog, ledger } = fixture();
    const d = buildCreatorDashboard(catalog, ledger, 'author-1');
    expect(d.myListings.map((l) => l.id)).toEqual(['t1', 't2']);
    expect(d.earned).toBe(500); // the sale credit
    expect(d.spent).toBe(0);
    expect(d.referenced.map((e) => e.ref)).toEqual(['t1']);
  });

  it('affordable excludes the viewer\'s own listings, the free ones, and what the balance cannot cover', () => {
    const { catalog, ledger } = fixture();
    const d = buildCreatorDashboard(catalog, ledger, 'buyer-1');
    expect(d.affordable.map((l) => l.id)).toEqual(['t3']); // 400 covers t3 (200); t1 is 500, t2 is free, t1 is not author-1's
    const authorView = buildCreatorDashboard(catalog, ledger, 'author-1');
    expect(authorView.affordable.map((l) => l.id)).toEqual(['t3']); // own listings excluded, free excluded
  });

  it('the one-line verdict names the balance, the flows and the referenced share', () => {
    const { catalog, ledger } = fixture();
    const line = creatorDashboardLine(buildCreatorDashboard(catalog, ledger, 'buyer-1'));
    expect(line).toContain('holds 400');
    expect(line).toContain('earned 900');
    expect(line).toContain('spent 500');
    expect(line).toContain('1 of 2 movement(s) reference something');
  });

  it('never mutates the ledger or the catalog it reads', () => {
    const { catalog, ledger } = fixture();
    const entriesBefore = ledger.entries.length;
    const listingsBefore = catalog.listings.length;
    buildCreatorDashboard(catalog, ledger, 'buyer-1');
    expect(ledger.entries).toHaveLength(entriesBefore);
    expect(catalog.listings).toHaveLength(listingsBefore);
  });
});
