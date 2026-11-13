/**
 * M8 — the MARKETPLACE: where the credits ledger and the template catalog meet.
 *
 * <p>The credits ledger (`credits.ts`) holds the unit of account and the template catalog
 * (`templateCatalog.ts`) holds the inventory; neither knows about the other. This module is the
 * ONE place a listing becomes a transaction, and it is a pure function over both: a purchase is
 * TWO ledger entries (the buyer's debit and the author's credit) appended together, or a refusal
 * that leaves both models exactly as they were.
 *
 * <p>Three rules keep the transaction honest (§60):
 * <ul>
 *   <li><b>Atomic.</b> If either entry is refused — a reused idempotency key is the realistic
 *       case, a retry after a partial write — the WHOLE purchase is refused and neither model
 *       moves. There is no half-purchase: a buyer is never debited for a sale that did not
 *       land.</li>
 *   <li><b>The ledger stays the record.</b> Both entries carry the template id in their `ref`, so
 *       "what did this account buy" is DERIVED from the ledger rather than kept in a second,
 *       marketplace-specific list that could disagree with it.</li>
 *   <li><b>A free template is cloned, not bought.</b> A price of zero moves no credits, and an
 *       entry that moves nothing is refused by the ledger anyway — so the marketplace names the
 *       case itself rather than leaning on the ledger's refusal to explain it.</li>
 * </ul>
 *
 * <p>What this module is NOT: it decides no platform fee, no payout schedule and no refund policy.
 * The author receives the whole price, and that is a stated bound rather than an oversight — a
 * revenue share is a policy this module has no business inventing.
 */

import { appendCreditEntry, balanceOf, type CreditEntry, type CreditLedger } from './credits';
import { templateById, type TemplateCatalog, type TemplateListing } from './templateCatalog';

export interface TemplatePurchase {
  templateId: string;
  buyerId: string;
  /** Idempotency key for the buyer's debit. The author's credit is keyed `${entryId}:author`. */
  entryId: string;
  /** Epoch milliseconds, host-supplied — forwarded to both entries. */
  at: number;
}

export type TemplatePurchaseDecision =
  | { ok: true; catalog: TemplateCatalog; ledger: CreditLedger; buyerEntry: CreditEntry; authorEntry: CreditEntry; listing: TemplateListing }
  | { ok: false; reason: string };

/**
 * Buy one listing with credits: the buyer is debited, the author is credited, both entries carry
 * the template id as their `ref`, and the whole thing is atomic — a refusal moves neither model.
 */
export function purchaseTemplate(catalog: TemplateCatalog, ledger: CreditLedger, purchase: TemplatePurchase): TemplatePurchaseDecision {
  const listing = templateById(catalog, purchase.templateId);
  if (!listing) return { ok: false, reason: `no template is listed under id "${purchase.templateId}"` };
  if (typeof purchase.buyerId !== 'string' || purchase.buyerId === '') return { ok: false, reason: 'a purchase needs the buyerId it is made by' };
  if (typeof purchase.entryId !== 'string' || purchase.entryId === '') return { ok: false, reason: 'a purchase needs a non-empty entryId (the idempotency key of the buyer\'s debit)' };
  if (listing.authorId === purchase.buyerId) return { ok: false, reason: `the author of "${listing.title}" already holds it — buying your own listing moves credits for nothing` };
  if (listing.priceCents === 0) return { ok: false, reason: `"${listing.title}" is free — a free template is cloned, not bought` };
  const balance = balanceOf(ledger, purchase.buyerId);
  if (balance < listing.priceCents) {
    return { ok: false, reason: `${purchase.buyerId} holds ${balance} and "${listing.title}" costs ${listing.priceCents} — the purchase is not affordable` };
  }

  const debit = appendCreditEntry(ledger, {
    id: purchase.entryId,
    accountId: purchase.buyerId,
    delta: -listing.priceCents,
    reason: `template "${listing.title}"`,
    at: purchase.at,
    kind: 'spend',
    ref: listing.id,
  });
  if (!debit.ok) return { ok: false, reason: `the buyer's debit was refused: ${debit.reason}` };

  const credit = appendCreditEntry(debit.ledger, {
    id: `${purchase.entryId}:author`,
    accountId: listing.authorId,
    delta: listing.priceCents,
    reason: `sale of "${listing.title}"`,
    at: purchase.at,
    kind: 'grant',
    ref: listing.id,
  });
  if (!credit.ok) return { ok: false, reason: `the author's credit was refused, so the purchase is refused whole: ${credit.reason}` };

  return { ok: true, catalog, ledger: credit.ledger, buyerEntry: debit.entry, authorEntry: credit.entry, listing };
}

/** Can this viewer buy this listing right now? Derived from the ledger; it decides nothing. */
export function templateAffordable(catalog: TemplateCatalog, ledger: CreditLedger, viewerId: string, templateId: string): boolean {
  const listing = templateById(catalog, templateId);
  if (!listing) return false;
  if (listing.authorId === viewerId) return false; // the author already holds it
  if (listing.priceCents === 0) return false; // free is cloned, not bought
  return balanceOf(ledger, viewerId) >= listing.priceCents;
}

/** Every credit movement that references something — the purchase history, derived from the ledger. */
export function purchasesOf(ledger: CreditLedger, accountId: string): CreditEntry[] {
  return ledger.entries.filter((e) => e.accountId === accountId && e.ref !== undefined);
}

/**
 * The SALE that credited the seller of a purchase, or null when the record carries none (v538, moved
 * here in v539).
 *
 * <p>A purchase is TWO entries appended at ONE instant, both carrying the listing's id as `ref` — the
 * pairing this module writes — so who was PAID is a fact the ledger holds alone. It lives here, beside
 * that paired write, because the pairing is the marketplace's convention: the refund mechanism and
 * the wallet both ask this ONE owner rather than each re-deriving it. Reading the author off the
 * catalog instead would answer with whoever holds the listing NOW: a retired listing has no current
 * author, and a re-listed one has an account that was never paid.
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

/**
 * Whether the record shows this ref being SOLD to anyone (v539).
 *
 * <p>The wallet must tell "a template" from "a subscription plan id" without the catalog, because a
 * listing can be RETIRED and the buyer still owns what they paid for. The distinguishing fact is the
 * one this module writes: a ref that a sale credits names a template, while a plan id never got a
 * paired sale. This is a read over the record, not an assumption about ref SHAPE — refs are opaque
 * by design (`credits.ts`).
 */
export function refSoldIn(ledger: CreditLedger, ref: string): boolean {
  return ledger.entries.some((e) => e.kind === 'spend' && e.ref === ref && saleOfPurchase(ledger, e) !== null);
}
