/**
 * M8 — the CREATOR DASHBOARD's view model, as a PURE projection.
 *
 * <p>The credits ledger (`credits.ts`), the template catalog (`templateCatalog.ts`) and the
 * marketplace (`marketplace.ts`) are three models that know nothing about a screen. This module is
 * the seam between them and one: a pure function that composes them into the shape a panel
 * renders, the same discipline `buildStudioAssets` and `buildStudioWorld` follow — structural
 * inputs, derived output, no DOM, no fetch, no session.
 *
 * <p>What it deliberately does NOT do (§60): it does not decide WHO the viewer is. The viewerId is
 * handed to it, not verified by it — ADR 0018's claim discipline is that a claim is carried and
 * labelled, and the party that could verify one is the service. A dashboard built from an
 * unverified viewerId shows what that id holds; it does not pretend the id is authentic. An
 * unsigned visitor (viewerId null) sees the market's size and nothing of anyone's.
 *
 * <p>Every number is DERIVED from the ledger and the catalog at call time — there is no cached
 * balance, no stored earnings, and therefore nothing that can drift from the records it came from.
 */

import { balanceOf, creditFlowOf, type CreditEntry, type CreditLedger } from './credits';
import type { TemplateCatalog, TemplateListing } from './templateCatalog';

/** Everything one creator's panel needs, in one immutable value. */
export interface CreatorDashboard {
  /** Who is looking, or null for an unsigned visitor. */
  viewerId: string | null;
  /** The viewer's credit balance. 0 when nobody is looking. */
  balance: number;
  /** The listings this account published, in catalog order. */
  myListings: TemplateListing[];
  /** Whole cents this account has been credited (grants, sales and upward adjustments). */
  earned: number;
  /** Whole cents this account has been debited by its own spending (purchases, downward adjustments). */
  spent: number;
  /** Whole cents returned to this account as a BUYER — refunds it received. Not income. */
  refunded: number;
  /** Whole cents taken back from this account as a SELLER — the claw-backs of refunded sales. Not spending. */
  clawedBack: number;
  /** How many movements the account has, referenced or not. */
  movements: number;
  /** Every movement that references something — the sale and purchase history, in order. */
  referenced: CreditEntry[];
  /** The listings this viewer can buy right now. Derived; it decides nothing. */
  affordable: TemplateListing[];
  /** The catalog's own size, so a panel can say what a filter is hiding. */
  catalogSize: number;
}

/**
 * Compose the dashboard for one viewer. `viewerId` is a CLAIM (ADR 0018): this function reads
 * what it holds and never asserts that it is authentic.
 */
export function buildCreatorDashboard(catalog: TemplateCatalog, ledger: CreditLedger, viewerId: string | null): CreatorDashboard {
  if (!viewerId) {
    return {
      viewerId: null,
      balance: 0,
      myListings: [],
      earned: 0,
      spent: 0,
      refunded: 0,
      clawedBack: 0,
      movements: 0,
      referenced: [],
      affordable: [],
      catalogSize: catalog.listings.length,
    };
  }
  let earned = 0;
  let spent = 0;
  let refunded = 0;
  let clawedBack = 0;
  let movements = 0;
  const referenced: CreditEntry[] = [];
  for (const e of ledger.entries) {
    if (e.accountId !== viewerId) continue;
    movements++;
    // Classified by KIND, not by sign: a refund credits the buyer but is not income, and a claw-back
    // debits the seller but is not spending. `creditFlowOf` is the one owner of that reading.
    const flow = creditFlowOf(e);
    if (flow.kind === 'earned') earned += flow.amount;
    else if (flow.kind === 'spent') spent += flow.amount;
    else if (flow.kind === 'refunded') refunded += flow.amount;
    else clawedBack += flow.amount;
    if (e.ref !== undefined) referenced.push(e);
  }
  return {
    viewerId,
    balance: balanceOf(ledger, viewerId),
    myListings: catalog.listings.filter((l) => l.authorId === viewerId),
    earned,
    spent,
    refunded,
    clawedBack,
    movements,
    referenced,
    affordable: catalog.listings.filter((l) => l.authorId !== viewerId && l.priceCents > 0 && balanceOf(ledger, viewerId) >= l.priceCents),
    catalogSize: catalog.listings.length,
  };
}

/**
 * The one-line, deterministic verdict for a ledger row or a panel header: the balance, what came
 * in, what went out, what came BACK (refunds received) and what was taken back (claw-backs of
 * refunded sales), and how much of it references something. Never a percentage — a ratio over a
 * handful of movements is decoration, not information.
 *
 * <p>Refunds and claw-backs are stated even at zero: a creator reading "refunded 0" learns that
 * nothing was returned, which is a different fact from the line not mentioning refunds at all.
 */
export function creatorDashboardLine(dashboard: CreatorDashboard): string {
  if (!dashboard.viewerId) return `dashboard: nobody is looking — the market holds ${dashboard.catalogSize} listing(s)`;
  return `dashboard: ${dashboard.viewerId} holds ${dashboard.balance} · earned ${dashboard.earned} · spent ${dashboard.spent} · refunded ${dashboard.refunded} · clawed back ${dashboard.clawedBack} · ${dashboard.referenced.length} of ${dashboard.movements} movement(s) reference something`;
}
