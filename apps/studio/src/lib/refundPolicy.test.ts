import { describe, expect, it } from 'vitest';

import { appendCreditEntry, balanceOf, emptyCreditLedger, type CreditEntry, type CreditLedger } from './credits';
import { holdsTemplate, refundPurchase } from './refund';
import {
  describeRefundPolicy,
  NO_REFUND_DEADLINE,
  refundPolicyProblem,
  refundPurchaseUnderPolicy,
  refundWindowClosesAt,
  type RefundPolicy,
} from './refundPolicy';
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
const buy = (delta = -500, at = 2, id = 'buy-1'): CreditEntry => ({ id, accountId: 'buyer-1', delta, reason: 'template "SaaS Landing"', at, kind: 'spend', ref: 't1' });
const sale = (at = 2): CreditEntry => ({ id: 'sale-1', accountId: 'author-1', delta: 500, reason: 'sale of "SaaS Landing"', at, kind: 'grant', ref: 't1' });

const refund = { templateId: 't1', buyerId: 'buyer-1', entryId: 'r1', at: 3 };
const DAY = 86_400_000;

describe('refundPolicyProblem: a declaration is checked, never guessed', () => {
  it('accepts a declared deadline and an explicit no-deadline', () => {
    expect(refundPolicyProblem({ windowMs: 30 * DAY })).toBeNull();
    expect(refundPolicyProblem(NO_REFUND_DEADLINE)).toBeNull();
    expect(refundPolicyProblem({ windowMs: 0 })).toBeNull();
  });

  it('refuses negative, non-finite and missing windows BY NAME — none of them means "no deadline"', () => {
    expect(refundPolicyProblem({ windowMs: -1 })).toContain('windowMs');
    expect(refundPolicyProblem({ windowMs: Number.NaN })).toContain('windowMs');
    expect(refundPolicyProblem({ windowMs: Number.POSITIVE_INFINITY })).toContain('windowMs');
    expect(refundPolicyProblem({} as RefundPolicy)).toContain('windowMs');
    expect(refundPolicyProblem(null)).toContain('declared policy');
    expect(refundPolicyProblem(undefined)).toContain('declared policy');
  });

  it('the refusal names the bad value so a host can see what it sent', () => {
    expect(refundPolicyProblem({ windowMs: -1 })).toContain('-1');
    expect(refundPolicyProblem({ windowMs: Number.NaN })).toContain('NaN');
  });
});

describe('describeRefundPolicy: a policy in words', () => {
  it('says "no deadline" out loud, and names each whole unit', () => {
    expect(describeRefundPolicy(NO_REFUND_DEADLINE)).toBe('no deadline');
    expect(describeRefundPolicy({ windowMs: 0 })).toBe('the purchase instant only');
    expect(describeRefundPolicy({ windowMs: 30 * DAY })).toBe('30-day window from the purchase');
    expect(describeRefundPolicy({ windowMs: 2 * 3_600_000 })).toBe('2-hour window from the purchase');
    expect(describeRefundPolicy({ windowMs: 15 * 60_000 })).toBe('15-minute window from the purchase');
    expect(describeRefundPolicy({ windowMs: 1_500 })).toBe('1500 ms from the purchase');
  });

  it('describes a broken policy by its problem rather than inventing a window', () => {
    expect(describeRefundPolicy({ windowMs: -5 })).toContain('windowMs');
  });
});

describe('refundWindowClosesAt', () => {
  it('is null for no deadline and an exact sum otherwise', () => {
    expect(refundWindowClosesAt(1_000, NO_REFUND_DEADLINE)).toBeNull();
    expect(refundWindowClosesAt(1_000, { windowMs: 500 })).toBe(1_500);
    expect(refundWindowClosesAt(1_000, { windowMs: 0 })).toBe(1_000);
  });
});

describe('refundPurchaseUnderPolicy: the window decides, the mechanism reverses', () => {
  const funded = () => ledgerOf(grant('buyer-1', 1000), grant('author-1', 100), buy(), sale());

  it('allows a refund inside the window', () => {
    const ledger = funded();
    const d = refundPurchaseUnderPolicy(catalog(), ledger, refund, { windowMs: 30 * DAY }, 2 + 30 * DAY - 1);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(d.priceCents).toBe(500);
    expect(balanceOf(d.ledger, 'buyer-1')).toBe(1000);
    expect(holdsTemplate(d.ledger, 'buyer-1', 't1')).toBe(false);
  });

  it('allows a refund at EXACTLY the closing instant — the boundary is inclusive', () => {
    const d = refundPurchaseUnderPolicy(catalog(), funded(), refund, { windowMs: 10 }, 2 + 10);
    expect(d.ok).toBe(true);
  });

  it('refuses one millisecond past the closing instant, and the ledger does not move', () => {
    const ledger = funded();
    const before = ledger.entries.length;
    const d = refundPurchaseUnderPolicy(catalog(), ledger, refund, { windowMs: 10 }, 2 + 10 + 1);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toContain('refund window');
    expect(d.reason).toContain('closed 1 ms ago');
    expect(d.reason).toContain('10 ms from the purchase');
    expect(ledger.entries.length).toBe(before);
    expect(balanceOf(ledger, 'buyer-1')).toBe(500);
    expect(holdsTemplate(ledger, 'buyer-1', 't1')).toBe(true);
  });

  it('says how long the window has been closed, in the largest whole unit', () => {
    const at2Days = refundPurchaseUnderPolicy(catalog(), funded(), refund, { windowMs: 0 }, 2 + 2 * DAY);
    const at3Hours = refundPurchaseUnderPolicy(catalog(), funded(), refund, { windowMs: 0 }, 2 + 3 * 3_600_000);
    const at5Minutes = refundPurchaseUnderPolicy(catalog(), funded(), refund, { windowMs: 0 }, 2 + 5 * 60_000);
    expect(at2Days.ok).toBe(false);
    expect(at3Hours.ok).toBe(false);
    expect(at5Minutes.ok).toBe(false);
    if (at2Days.ok || at3Hours.ok || at5Minutes.ok) throw new Error('unreachable');
    expect(at2Days.reason).toContain('closed 2 day(s) ago');
    expect(at3Hours.reason).toContain('closed 3 hour(s) ago');
    expect(at5Minutes.reason).toContain('closed 5 minute(s) ago');
  });

  it('a declared no-deadline policy allows a refund however late it is asked for', () => {
    const d = refundPurchaseUnderPolicy(catalog(), funded(), refund, NO_REFUND_DEADLINE, 1_700_000_000_000);
    expect(d.ok).toBe(true);
  });

  it('refuses a broken policy by name — a missing window cannot be read as "no deadline"', () => {
    const ledger = funded();
    const missing = refundPurchaseUnderPolicy(catalog(), ledger, refund, {} as RefundPolicy, refund.at);
    const negative = refundPurchaseUnderPolicy(catalog(), ledger, refund, { windowMs: -1 }, refund.at);
    expect(missing.ok).toBe(false);
    expect(negative.ok).toBe(false);
    if (missing.ok || negative.ok) throw new Error('unreachable');
    expect(missing.reason).toContain('windowMs');
    expect(negative.reason).toContain('windowMs');
    expect(ledger.entries.length).toBe(4); // nothing appended
  });

  it('a policy ask with NO refundable purchase is answered by the mechanism, not by a policy opinion', () => {
    const neverBought = ledgerOf(grant('buyer-1', 1000));
    const d = refundPurchaseUnderPolicy(catalog(), neverBought, refund, { windowMs: 0 }, refund.at);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toContain('holds no purchase');
    expect(d.reason).not.toContain('refund window');
  });

  it('an unknown listing is answered by the mechanism even when the window has closed', () => {
    const d = refundPurchaseUnderPolicy(catalog(), funded(), { ...refund, templateId: 'ghost' }, { windowMs: 0 }, 1_700_000_000_000);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toContain('no template is listed');
  });

  it('a fully refunded listing is answered by the mechanism\'s "not repeatable" sentence', () => {
    const first = refundPurchase(catalog(), funded(), refund);
    if (!first.ok) throw new Error(`first refund refused: ${first.reason}`);
    const again = refundPurchaseUnderPolicy(catalog(), first.ledger, { ...refund, entryId: 'r2' }, NO_REFUND_DEADLINE, 1_000);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason).toContain('already been refunded');
  });

  it('an author who cannot cover the claw-back is refused by the mechanism, and the policy cannot overrule it', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), buy(), grant('author-1', 100));
    const d = refundPurchaseUnderPolicy(catalog(), ledger, refund, NO_REFUND_DEADLINE, refund.at);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toContain('cannot cover it');
  });
});

describe('refundPurchaseUnderPolicy: the window belongs to the purchase it would reverse', () => {
  it('a re-purchase starts its OWN window, so an old purchase\'s closed window does not block it', () => {
    let ledger = ledgerOf(grant('buyer-1', 2000), grant('author-1', 1000), buy(-500, 2, 'buy-1'), sale(2));
    const first = refundPurchaseUnderPolicy(catalog(), ledger, refund, NO_REFUND_DEADLINE, 3);
    if (!first.ok) throw new Error(`first refund refused: ${first.reason}`);
    ledger = first.ledger;

    const again = appendCreditEntry(ledger, buy(-500, 100, 'buy-2'));
    if (!again.ok) throw new Error(`re-purchase refused: ${again.reason}`);
    ledger = again.ledger;
    expect(holdsTemplate(ledger, 'buyer-1', 't1')).toBe(true);

    // The FIRST purchase was at 2 and its 10ms window is long gone; the second was at 100, so the
    // window under test follows the second purchase. One millisecond past ITS closing instant is late…
    const late = refundPurchaseUnderPolicy(catalog(), ledger, refund, { windowMs: 10 }, 111);
    expect(late.ok).toBe(false);
    if (late.ok) return;
    expect(late.reason).toContain('closed 1 ms ago');
    expect(late.reason).toContain('made at 100');

    // …and the boundary itself is inside it, so a re-purchase really does get its own window.
    const second = refundPurchaseUnderPolicy(catalog(), ledger, { ...refund, entryId: 'r2' }, { windowMs: 10 }, 110);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(holdsTemplate(second.ledger, 'buyer-1', 't1')).toBe(false);
  });

  it('with two unrefunded purchases, the window is measured on the OLDEST one (the one FIFO reverses)', () => {
    const ledger = ledgerOf(grant('buyer-1', 2000), grant('author-1', 1000), buy(-500, 2, 'buy-1'), buy(-500, 50, 'buy-2'), sale(2));
    // Oldest purchase at 2 with a 10ms window: a refund at 55 is late even though the newest purchase
    // at 50 is only 5ms old.
    const d = refundPurchaseUnderPolicy(catalog(), ledger, refund, { windowMs: 10 }, 55);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toContain('closed 43 ms ago');
    expect(d.reason).toContain('made at 2');
  });

  it('the mechanism and the policy agree on WHICH purchase pairs, so a refund is never reversed twice', () => {
    const ledger = ledgerOf(grant('buyer-1', 2000), grant('author-1', 1000), buy(-500, 2, 'buy-1'), buy(-500, 50, 'buy-2'), sale(2));
    const first = refundPurchaseUnderPolicy(catalog(), ledger, refund, NO_REFUND_DEADLINE, 60);
    if (!first.ok) throw new Error(`first refund refused: ${first.reason}`);
    expect(first.buyerEntry.delta).toBe(500);
    const second = refundPurchaseUnderPolicy(catalog(), first.ledger, { ...refund, entryId: 'r2' }, NO_REFUND_DEADLINE, 61);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(balanceOf(second.ledger, 'buyer-1')).toBe(2000);
  });
});
