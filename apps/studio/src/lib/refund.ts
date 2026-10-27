/**
 * M8 — the REFUND mechanism: reverse one purchase, atomically, as a PURE transaction.
 *
 * <p>`CreditEntry.kind` has carried `'refund'` since the ledger landed, but NOTHING produced one — the
 * kind was a supported shape with no writer. This module is that writer. It is deliberately a
 * MECHANISM and not a POLICY: it answers "how do you reverse this purchase correctly", not "when is a
 * refund allowed". The second question is a business policy for the host (or a future service), and
 * inventing it here would be the mistake ADR 0019 warned about.
 *
 * <p>Four rules keep the transaction honest (§60):
 * <ul>
 *   <li><b>The purchase is the fact.</b> The buyer is credited the price the PURCHASE recorded, not the
 *       listing's price today — a creator may have repriced since, and refunding the new price would
 *       invent a movement that never happened.</li>
 *   <li><b>Atomic.</b> The buyer's credit and the author's claw-back are appended together, or neither
 *       is. A refund that credited the buyer and failed to debit the author would mint credits.</li>
 *   <li><b>A refund is not repeatable, but a RE-PURCHASE is (v529).</b> Purchases and refunds PAIR: the n-th
 *       refund reverses the n-th purchase (FIFO). Refunding more times than buying is refused by name;
 *       a buyer who refunded and bought again can refund again, because that purchase was never
 *       refunded.</li>
 *   <li><b>The author must be able to cover it.</b> A claw-back that would drive the author below zero
 *       is refused whole, with the balance that was actually there — the same rule the ledger applies
 *       to every spend.</li>
 * </ul>
 *
 * <p>Ownership is NET of refunds: `heldRefsOf` in `credits.ts` counts `spend − refund` per ref, so a
 * refunded purchase stops being ownership and a re-purchase starts it again. The wallet and the remix
 * right both read that one answer.
 */

import { appendCreditEntry, balanceOf, heldRefsOf, type CreditEntry, type CreditLedger } from './credits';
import { templateById, type TemplateCatalog } from './templateCatalog';

export interface TemplateRefund {
  templateId: string;
  buyerId: string;
  /** Idempotency key for the buyer's credit. The author's claw-back is keyed `${entryId}:author`. */
  entryId: string;
  /** Epoch milliseconds, host-supplied — forwarded to both entries. */
  at: number;
}

export type RefundDecision =
  | { ok: true; ledger: CreditLedger; buyerEntry: CreditEntry; authorEntry: CreditEntry; priceCents: number }
  | { ok: false; reason: string };

/** The purchases a buyer recorded for one listing, oldest first. */
function purchasesOf(ledger: CreditLedger, buyerId: string, templateId: string): CreditEntry[] {
  return ledger.entries.filter((e) => e.accountId === buyerId && e.kind === 'spend' && e.ref === templateId);
}

/** The refunds this buyer already took for one listing, oldest first. */
function refundsOf(ledger: CreditLedger, buyerId: string, templateId: string): CreditEntry[] {
  return ledger.entries.filter((e) => e.accountId === buyerId && e.kind === 'refund' && e.ref === templateId);
}

/**
 * The purchase a refund would reverse, or null when there is none to reverse.
 *
 * <p>Purchases and refunds PAIR: the n-th refund reverses the n-th purchase (FIFO). Counting them
 * separately is what lets a re-purchase after a refund be refunded again; a per-REF "already
 * refunded" check refused it, which was wrong — the second purchase was never refunded.
 *
 * <p>This is the ONE owner of the pairing rule. `refundPurchase` asks it what to reverse, and a
 * policy layer (`refundPolicy.ts`) asks it the same question so a deadline is measured on the
 * purchase that would actually be reversed rather than on a purchase that would not.
 */
export function purchaseAwaitingRefund(ledger: CreditLedger, buyerId: string, templateId: string): CreditEntry | null {
  const purchases = purchasesOf(ledger, buyerId, templateId);
  const refunds = refundsOf(ledger, buyerId, templateId);
  return purchases[refunds.length] ?? null;
}

/**
 * Reverse one purchase of a listing by a buyer. Pure and atomic: on any refusal the ledger handed in is
 * untouched. The `priceCents` returned is the amount the ORIGINAL purchase recorded.
 */
export function refundPurchase(catalog: TemplateCatalog, ledger: CreditLedger, refund: TemplateRefund): RefundDecision {
  const listing = templateById(catalog, refund.templateId);
  if (!listing) return { ok: false, reason: `no template is listed under id "${refund.templateId}"` };
  if (typeof refund.buyerId !== 'string' || refund.buyerId === '') return { ok: false, reason: 'a refund needs the buyerId it is for' };
  if (typeof refund.entryId !== 'string' || refund.entryId === '') return { ok: false, reason: 'a refund needs a non-empty entryId (the idempotency key of the buyer\'s credit)' };

  // Two DIFFERENT refusals keep their own sentences: "you never bought it" and "you already refunded
  // every purchase" are different facts, and pairing alone cannot tell the caller which one it is.
  const purchases = purchasesOf(ledger, refund.buyerId, refund.templateId);
  const refunds = refundsOf(ledger, refund.buyerId, refund.templateId);
  if (purchases.length === 0) return { ok: false, reason: `${refund.buyerId} holds no purchase of "${listing.title}" to refund` };
  if (refunds.length >= purchases.length) {
    return { ok: false, reason: `every purchase of "${listing.title}" has already been refunded — a refund is not repeatable` };
  }
  // The OLDEST unrefunded purchase is the one reversed, and ITS recorded price is the amount.
  const purchase = purchaseAwaitingRefund(ledger, refund.buyerId, refund.templateId)!;

  const priceCents = -purchase.delta; // the purchase's delta is negative
  if (priceCents <= 0) return { ok: false, reason: 'the recorded purchase does not debit a positive price, so there is nothing to reverse' };

  const authorBalance = balanceOf(ledger, listing.authorId);
  if (authorBalance < priceCents) {
    return { ok: false, reason: `${listing.authorId} holds ${authorBalance} and the refund claws back ${priceCents} — the author cannot cover it` };
  }

  const credit = appendCreditEntry(ledger, {
    id: refund.entryId,
    accountId: refund.buyerId,
    delta: priceCents,
    reason: `refund of "${listing.title}"`,
    at: refund.at,
    kind: 'refund',
    ref: listing.id,
  });
  if (!credit.ok) return { ok: false, reason: `the buyer's refund was refused: ${credit.reason}` };

  const debit = appendCreditEntry(credit.ledger, {
    id: `${refund.entryId}:author`,
    accountId: listing.authorId,
    delta: -priceCents,
    reason: `refund of "${listing.title}"`,
    at: refund.at,
    kind: 'spend',
    ref: listing.id,
  });
  if (!debit.ok) return { ok: false, reason: `the author's claw-back was refused, so the refund is refused whole: ${debit.reason}` };

  return { ok: true, ledger: debit.ledger, buyerEntry: credit.entry, authorEntry: debit.entry, priceCents };
}

/** Whether this buyer currently holds the listing — NET of refunds. Derived; decides nothing. */
export function holdsTemplate(ledger: CreditLedger, buyerId: string, templateId: string): boolean {
  return heldRefsOf(ledger, buyerId).has(templateId);
}
