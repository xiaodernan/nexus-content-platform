/**
 * M8 — the REFUND mechanism: reverse one purchase, atomically, as a PURE transaction.
 *
 * <p>`CreditEntry.kind` has carried `'refund'` since the ledger landed, but NOTHING produced one — the
 * kind was a supported shape with no writer. This module is that writer. It is deliberately a
 * MECHANISM and not a POLICY: it answers "how do you reverse this purchase correctly", not "when is a
 * refund allowed". The second question is a business policy for the host (or a future service), and
 * inventing it here would be the mistake ADR 0019 warned about.
 *
 * <p>Five rules keep the transaction honest (§60):
 * <ul>
 *   <li><b>The purchase is the fact.</b> The buyer is credited the price the PURCHASE recorded, not the
 *       listing's price today — a creator may have repriced since, and refunding the new price would
 *       invent a movement that never happened. WHO WAS PAID is a fact of the same kind (v538): the
 *       claw-back targets the account the SALE credited, so a delisted listing can still be reversed
 *       and a re-authored one cannot claw back from an account that was never paid.</li>
 *   <li><b>Atomic.</b> The buyer's credit and the author's claw-back are appended together, or neither
 *       is. A refund that credited the buyer and failed to debit the author would mint credits.</li>
 *   <li><b>The seller's side is a `clawback`, not a `spend`.</b> It carries the listing's ref because it
 *       reverses a movement about that listing, but it is not a purchase: `heldRefsOf` ignores it, so
 *       losing a sale can never read as acquiring the template, and a dashboard reports it apart from
 *       the author's own spending.</li>
 *   <li><b>A refund is not repeatable, but a RE-PURCHASE is (v529).</b> Purchases and refunds PAIR: the n-th
 *       refund reverses the n-th purchase (FIFO). Refunding more times than buying is refused by name;
 *       a buyer who refunded and bought again can refund again, because that purchase was never
 *       refunded.</li>
 *   <li><b>The author must be able to cover it.</b> A claw-back that would drive the author below zero
 *       is refused whole, with the balance that was actually there — the same rule the ledger applies
 *       to every spend.</li>
 *   <li><b>A reversal cannot precede its cause (v533).</b> The instants are host-supplied, so the model
 *       can be handed a history that never happened: a refund dated BEFORE the purchase it reverses.
 *       It is refused by name; the same instant is allowed, because a host that batches a purchase and
 *       its reversal in one tick is coherent. One comparison covers BOTH entries the refund writes —
 *       the buyer's spend and the author's sale were recorded at the same `at`.</li>
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
 * The SALE that credited the seller of a purchase, or null when the record carries none (v538).
 *
 * <p>The marketplace appends the buyer's `spend` and the seller's credit at ONE instant, both carrying
 * the listing's id as `ref` (`marketplace.ts`), so who was PAID is a ledger fact. Reading the author
 * off the catalog instead would claw back whoever owns the listing NOW: a delisted listing has no
 * current author at all, and a re-authored one has an account that was never paid. This is the one
 * owner of "who was paid" for a refund, exactly as `purchaseAwaitingRefund` owns "what is reversed".
 */
export function saleOfPurchase(ledger: CreditLedger, purchase: CreditEntry): CreditEntry | null {
  if (purchase.ref === undefined) return null;
  return (
    ledger.entries.find(
      (e) =>
        e.kind === 'grant' &&
        e.ref === purchase.ref &&
        e.at === purchase.at &&
        e.accountId !== purchase.accountId &&
        e.delta > 0,
    ) ?? null
  );
}

/** What a refund ask must satisfy before ANY entry may move — the mechanism's structural answer. */
export type RefundPairing =
  | { ok: true; purchase: CreditEntry; priceCents: number; sellerId: string; label: string }
  | { ok: false; reason: string };

/**
 * Every STRUCTURAL rule a refund must satisfy, in one place: the buyer is named, a purchase is left
 * to reverse, its recorded price is positive, the account that was PAID is known, and it can cover the
 * claw-back.
 *
 * <p>The CATALOG is optional at this layer (v538). It supplies a readable label and a seller only when
 * the record is silent — because what happened is the LEDGER's to say. A listing that left the
 * catalog still has a purchase to reverse and an account that was paid for it; refusing those would
 * strand a buyer's credits for an author's delisting.
 *
 * <p>`refundPurchase` and the policy layer's preflight both ask HERE, so "may this be refunded at
 * all" and "run the refund" can never disagree: one owner of pairing, the price, the seller and
 * solvency. The `entryId` is NOT part of it — it is the host's idempotency key for the write, and a
 * preflight that would not write has no key to give.
 */
export function refundPairing(
  catalog: TemplateCatalog,
  ledger: CreditLedger,
  ask: Pick<TemplateRefund, 'templateId' | 'buyerId'>,
): RefundPairing {
  const listing = templateById(catalog, ask.templateId);
  // One label for every sentence below: the title when the catalog still lists it, the REF when it
  // does not — a reader must never be told a title the catalog has stopped claiming.
  const label = listing ? `"${listing.title}"` : `"${ask.templateId}" (not in this catalog)`;
  if (typeof ask.buyerId !== 'string' || ask.buyerId === '') return { ok: false, reason: 'a refund needs the buyerId it is for' };

  // Two DIFFERENT refusals keep their own sentences: "you never bought it" and "you already refunded
  // every purchase" are different facts, and pairing alone cannot tell the caller which one it is.
  const purchases = purchasesOf(ledger, ask.buyerId, ask.templateId);
  const refunds = refundsOf(ledger, ask.buyerId, ask.templateId);
  if (purchases.length === 0) return { ok: false, reason: `${ask.buyerId} holds no purchase of ${label} to refund` };
  if (refunds.length >= purchases.length) {
    return { ok: false, reason: `every purchase of ${label} has already been refunded — a refund is not repeatable` };
  }
  // The OLDEST unrefunded purchase is the one reversed, and ITS recorded price is the amount.
  const purchase = purchaseAwaitingRefund(ledger, ask.buyerId, ask.templateId)!;

  const priceCents = -purchase.delta; // the purchase's delta is negative
  if (priceCents <= 0) return { ok: false, reason: 'the recorded purchase does not debit a positive price, so there is nothing to reverse' };

  // Whoever the SALE credited; the catalog answers only when the record has no sale to read.
  const sale = saleOfPurchase(ledger, purchase);
  const sellerId = sale ? sale.accountId : listing ? listing.authorId : null;
  if (sellerId === null) {
    return {
      ok: false,
      reason: `the ledger records no sale for ${label} at ${purchase.at} and none is listed under "${ask.templateId}" — a claw-back needs an account the record says was paid`,
    };
  }
  const sellerBalance = balanceOf(ledger, sellerId);
  if (sellerBalance < priceCents) {
    return { ok: false, reason: `${sellerId} holds ${sellerBalance} and the refund claws back ${priceCents} — the seller cannot cover it` };
  }
  return { ok: true, purchase, priceCents, sellerId, label };
}

/**
 * Why `at` cannot be the instant of a refund that reverses a purchase made at `purchaseAt`, or null
 * when it can.
 *
 * <p>Every instant in this sub-system is HOST-SUPPLIED (ADR 0010), so a host can hand the model a
 * history that never happened: a reversal dated before the movement it reverses. The ledger's
 * arithmetic would accept it — the balances still add up — and the statements would then report a
 * refund inside a window where the purchase had not yet occurred. The ordering is therefore stated
 * as a rule rather than left to the host's clock discipline.
 *
 * <p>The SAME instant is allowed: a host that batches a purchase and its reversal in one tick is
 * coherent, and the refund window already treats the purchase instant as inclusive. One millisecond
 * earlier is refused by name, with both instants in the sentence.
 *
 * <p>This one comparison covers BOTH entries a refund writes: the buyer's credit reverses the
 * buyer's `spend`, the author's claw-back reverses the author's SALE, and the marketplace recorded
 * both at the same `purchase.at`.
 *
 * <p>It is the ONE owner of the ordering rule: `refundPurchase` asks it about the instant the write
 * would record, and `refundPolicy`'s gate asks it about the instant the ASK is made, so a preflight
 * never reports eligible at a moment the purchase did not yet exist.
 */
export function refundInstantProblem(purchaseAt: number, at: number): string | null {
  // A non-finite instant is `appendCreditEntry`'s named refusal, not an ordering opinion; letting it
  // through here keeps each rule with its own owner. (NaN fails every comparison, so an ordering
  // check would fall through anyway.)
  if (!Number.isFinite(at)) return null;
  if (at >= purchaseAt) return null;
  return `a refund cannot be dated ${purchaseAt - at} ms before the purchase it reverses — the purchase was recorded at ${purchaseAt} and the refund asks for ${at}`;
}

/**
 * Reverse one purchase of a listing by a buyer. Pure and atomic: on any refusal the ledger handed in is
 * untouched. The `priceCents` returned is the amount the ORIGINAL purchase recorded.
 */
export function refundPurchase(catalog: TemplateCatalog, ledger: CreditLedger, refund: TemplateRefund): RefundDecision {
  const pairing = refundPairing(catalog, ledger, refund);
  if (!pairing.ok) return pairing;
  if (typeof refund.entryId !== 'string' || refund.entryId === '') return { ok: false, reason: 'a refund needs a non-empty entryId (the idempotency key of the buyer\'s credit)' };
  // The instant the WRITE would record, against the instant the purchase records. Refused before the
  // first append, so a refusal writes nothing (atomicity is the same rule as solvency).
  const early = refundInstantProblem(pairing.purchase.at, refund.at);
  if (early) return { ok: false, reason: early };

  const priceCents = pairing.priceCents;
  // The seller is the account the SALE credited (pairing read it off the record); the title is the
  // catalog's when it still lists the ref and the REF itself when it does not (v538).
  const credit = appendCreditEntry(ledger, {
    id: refund.entryId,
    accountId: refund.buyerId,
    delta: priceCents,
    reason: `refund of ${pairing.label}`,
    at: refund.at,
    kind: 'refund',
    ref: refund.templateId,
  });
  if (!credit.ok) return { ok: false, reason: `the buyer's refund was refused: ${credit.reason}` };

  const debit = appendCreditEntry(credit.ledger, {
    id: `${refund.entryId}:author`,
    accountId: pairing.sellerId,
    delta: -priceCents,
    reason: `refund of ${pairing.label}`,
    at: refund.at,
    kind: 'clawback',
    ref: refund.templateId,
  });
  if (!debit.ok) return { ok: false, reason: `the author's claw-back was refused, so the refund is refused whole: ${debit.reason}` };

  return { ok: true, ledger: debit.ledger, buyerEntry: credit.entry, authorEntry: debit.entry, priceCents };
}

/** Whether this buyer currently holds the listing — NET of refunds. Derived; decides nothing. */
export function holdsTemplate(ledger: CreditLedger, buyerId: string, templateId: string): boolean {
  return heldRefsOf(ledger, buyerId).has(templateId);
}
