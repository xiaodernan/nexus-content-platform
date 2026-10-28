import { describe, expect, it } from 'vitest';

import { appendCreditEntry, balanceOf, emptyCreditLedger, type CreditEntry, type CreditLedger } from './credits';
import { holdsTemplate, refundPurchase } from './refund';
import {
  describeRefundPolicy,
  NO_REFUND_DEADLINE,
  refundEligibility,
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

  it('refuses a refund ASKED before the purchase existed, and the ledger does not move (v533)', () => {
    // The window bounds how LATE a refund may be; this bounds how EARLY. The ask's own instant is
    // compared to the purchase the refund would reverse, so a preflight and a write agree.
    const ledger = funded(); // purchase at 2
    const before = ledger.entries.length;
    const d = refundPurchaseUnderPolicy(catalog(), ledger, refund, NO_REFUND_DEADLINE, 1);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toContain('before the purchase it reverses');
    expect(d.reason).toContain('purchase was recorded at 2');
    expect(ledger.entries.length).toBe(before);
    expect(balanceOf(ledger, 'buyer-1')).toBe(500);
  });

  it('the MECHANISM judges the instant the write would record, even when the ask instant looks fine', () => {
    // `now` (5) is after the purchase, but the caller asked the write to RECORD 1 — a caller whose two
    // instants disagree gets the mechanism's refusal, because the record is what the history would say.
    const ledger = funded();
    const before = ledger.entries.length;
    const d = refundPurchaseUnderPolicy(catalog(), ledger, { ...refund, at: 1 }, NO_REFUND_DEADLINE, 5);
    expect(d.ok).toBe(false);
    if (d.ok) return;
    expect(d.reason).toContain('before the purchase it reverses');
    expect(d.reason).toContain('refund asks for 1');
    expect(ledger.entries.length).toBe(before);
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

    // …and the boundary itself is inside it, so a re-purchase really does get its own window. The
    // REFUND's recorded instant follows the re-purchase: v533 refuses a reversal dated before it.
    const second = refundPurchaseUnderPolicy(catalog(), ledger, { ...refund, entryId: 'r2', at: 110 }, { windowMs: 10 }, 110);
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
    const second = refundPurchaseUnderPolicy(catalog(), first.ledger, { ...refund, entryId: 'r2', at: 61 }, NO_REFUND_DEADLINE, 61);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(balanceOf(second.ledger, 'buyer-1')).toBe(2000);
  });
});

describe('refundEligibility: the preflight answers before anything is written', () => {
  const funded = () => ledgerOf(grant('buyer-1', 1000), grant('author-1', 100), buy(), sale());

  it('reports eligible inside the window, naming the purchase it measured and when the window closes', () => {
    const e = refundEligibility(catalog(), funded(), refund, { windowMs: 10 }, 5);
    expect(e.eligible).toBe(true);
    if (!e.eligible) return;
    expect(e.purchaseAt).toBe(2);
    expect(e.closesAt).toBe(12);
    expect(e.priceCents).toBe(500);
  });

  it('the closing instant is inside; the next millisecond is outside with the window sentence', () => {
    const boundary = refundEligibility(catalog(), funded(), refund, { windowMs: 10 }, 12);
    const late = refundEligibility(catalog(), funded(), refund, { windowMs: 10 }, 13);
    expect(boundary.eligible).toBe(true);
    expect(late.eligible).toBe(false);
    if (late.eligible) return;
    expect(late.reason).toContain('refund window');
    expect(late.reason).toContain('closed 1 ms ago');
  });

  it('a buyer with no purchase is answered by the mechanism, not by the policy', () => {
    const e = refundEligibility(catalog(), ledgerOf(grant('buyer-1', 1000)), refund, { windowMs: 0 }, refund.at);
    expect(e.eligible).toBe(false);
    if (e.eligible) return;
    expect(e.reason).toContain('holds no purchase');
    expect(e.reason).not.toContain('refund window');
  });

  it('a broken policy is refused by name even when the purchase would be refundable', () => {
    const e = refundEligibility(catalog(), funded(), refund, {} as RefundPolicy, refund.at);
    expect(e.eligible).toBe(false);
    if (e.eligible) return;
    expect(e.reason).toContain('windowMs');
  });

  it('an author who cannot cover the claw-back is reported ineligible before the click', () => {
    const ledger = ledgerOf(grant('buyer-1', 1000), buy(), grant('author-1', 100));
    const e = refundEligibility(catalog(), ledger, refund, NO_REFUND_DEADLINE, refund.at);
    expect(e.eligible).toBe(false);
    if (e.eligible) return;
    expect(e.reason).toContain('cannot cover it');
  });

  it('a declared no-deadline policy closes at null and stays eligible at any later instant', () => {
    const e = refundEligibility(catalog(), funded(), refund, NO_REFUND_DEADLINE, 1_700_000_000_000);
    expect(e.eligible).toBe(true);
    if (!e.eligible) return;
    expect(e.closesAt).toBeNull();
  });

  it('measures the window on the purchase FIFO would reverse, not the newest', () => {
    const ledger = ledgerOf(grant('buyer-1', 2000), grant('author-1', 1000), buy(-500, 2, 'buy-1'), buy(-500, 50, 'buy-2'), sale(2));
    const e = refundEligibility(catalog(), ledger, refund, { windowMs: 10 }, 55);
    expect(e.eligible).toBe(false);
    if (e.eligible) return;
    expect(e.reason).toContain('made at 2');
  });

  it('an ask at an instant BEFORE the purchase is ineligible, in the mechanism\'s own words (v533)', () => {
    // A surface asking "can this be refunded at time 1" when the purchase happened at 2 must be told
    // the purchase did not exist yet — not offered a button whose window has not even opened.
    const e = refundEligibility(catalog(), funded(), refund, NO_REFUND_DEADLINE, 1);
    expect(e.eligible).toBe(false);
    if (e.eligible) return;
    expect(e.reason).toContain('before the purchase it reverses');
    expect(e.reason).toContain('purchase was recorded at 2');
    expect(e.reason).not.toContain('refund window');
  });

  it('never moves the ledger, and agrees with the write on every case it can see', () => {
    const cases: Array<[CreditLedger, RefundPolicy, number]> = [
      [funded(), NO_REFUND_DEADLINE, 5],
      [funded(), { windowMs: 10 }, 12],
      [funded(), { windowMs: 10 }, 13],
      [funded(), NO_REFUND_DEADLINE, 1],
      [ledgerOf(grant('buyer-1', 1000)), { windowMs: 0 }, 3],
      [funded(), {} as RefundPolicy, 3],
      [ledgerOf(grant('buyer-1', 1000), buy(), grant('author-1', 100)), NO_REFUND_DEADLINE, 3],
    ];
    for (const [ledger, policy, now] of cases) {
      const before = ledger.entries.length;
      const preflight = refundEligibility(catalog(), ledger, refund, policy, now);
      const write = refundPurchaseUnderPolicy(catalog(), ledger, refund, policy, now);
      expect(preflight.eligible).toBe(write.ok);
      if (!preflight.eligible && !write.ok) expect(preflight.reason).toBe(write.reason);
      expect(ledger.entries.length).toBe(before);
    }
  });
});
