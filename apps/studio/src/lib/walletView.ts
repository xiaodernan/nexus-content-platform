/**
 * M8 — the WALLET view: the buyer/viewer's side of the creator economy, as a PURE model.
 *
 * <p>`creatorDashboard.ts` is the CREATOR's side — what a template author has earned and sold. This is
 * the BUYER's side: what one viewer holds, what they own, and what they can afford right now. It is a
 * composition of three models that already exist — the credits ledger (`credits.ts`), the template
 * catalog (`templateCatalog.ts`) and the marketplace's buy gate (`marketplace.ts`) — and it adds no
 * new state of its own. Every fact it reports is DERIVED, so it cannot drift from the ledger or the
 * catalog the way a stored "wallet" snapshot would.
 *
 * <p>Three rules keep it honest (§60):
 * <ul>
 *   <li><b>The balance is the ledger's.</b> `balanceCents` is `balanceOf`; the wallet never keeps a
 *       second number for the same account.</li>
 *   <li><b>Ownership is derived, not stored.</b> A viewer owns a template if they authored it or if the
 *       ledger holds a NET-POSITIVE claim on it — `spend` minus `refund`, per ref (`heldRefsOf`). There
 *       is no separate "owned" list to disagree with the ledger.</li>
 *   <li><b>"Affordable" is the marketplace's own gate.</b> Rather than re-implement the price/balance
 *       check, the view calls `templateAffordable` — so a free template (cloned, never bought) and the
 *       viewer's own listings (which they cannot buy) are reported the same way the buy button would.</li>
 * </ul>
 *
 * <p>What this module is NOT: it reads nothing from a service, holds no session, and decides nothing. It
 * is the pure shape a wallet panel can render; the panel supplies the viewer id and the data it already
 * has. A viewer with no entries simply has a zero balance and an empty wallet — never a thrown error.
 */

import { balanceOf, heldRefsOf, type CreditLedger } from './credits';
import { templateById, type TemplateCatalog } from './templateCatalog';
import { refSoldIn, templateAffordable } from './marketplace';

/** The facts a viewer's wallet screen needs, all derived. */
export interface WalletView {
  /** The viewer's credit balance, in cents — straight from the ledger. */
  balanceCents: number;
  /**
   * Template ids this viewer owns: every listing they authored, plus every listing the ledger records
   * a `spend` entry for (a purchase). Derived; no second ownership list.
   */
  ownedTemplateIds: string[];
  /** Template ids the viewer can buy right now, per the marketplace's own affordability gate. */
  affordableTemplateIds: string[];
  /** How many listings are in the catalog (the window's whole size, not the affordable subset). */
  catalogSize: number;
}

/**
 * Build the wallet view for one viewer from a catalog and a ledger. Pure and total: a viewer with no
 * entries yields a zero balance and empty lists, not an error.
 */
export function buildWalletView(catalog: TemplateCatalog, ledger: CreditLedger, viewerId: string): WalletView {
  const balance = balanceOf(ledger, viewerId);
  // Ownership is NET of refunds (`heldRefsOf`: spend − refund per ref), and an unlisted ref only
  // counts as template ownership when the RECORD shows it was SOLD (v539) — the ledger is shared, so
  // a subscription's plan id must not read as one, while a listing that was RETIRED is still owned by
  // whoever paid for it. The catalog answers first; the record answers when the catalog has forgotten
  // the listing, which is the same division of authority the refund mechanism follows.
  const owned = new Set<string>();
  for (const ref of heldRefsOf(ledger, viewerId)) {
    const listed = templateById(catalog, ref) !== null;
    if (listed || refSoldIn(ledger, ref)) owned.add(ref);
  }
  const affordable: string[] = [];
  for (const listing of catalog.listings) {
    if (listing.authorId === viewerId) owned.add(listing.id); // the author holds their own listing
    if (templateAffordable(catalog, ledger, viewerId, listing.id)) affordable.push(listing.id);
  }
  return {
    balanceCents: balance,
    ownedTemplateIds: [...owned],
    affordableTemplateIds: affordable,
    catalogSize: catalog.listings.length,
  };
}

/** Whether this viewer owns a given template id — a thin, named read over the view's derived set. */
export function walletOwns(view: WalletView, templateId: string): boolean {
  return view.ownedTemplateIds.includes(templateId);
}

/** Whether this viewer can afford a given template id — a thin, named read over the view's derived set. */
export function walletCanAfford(view: WalletView, templateId: string): boolean {
  return view.affordableTemplateIds.includes(templateId);
}


/** One row of the STORE as one viewer reads it (v540). */
export interface StoreRow {
  /** The listing's ref — the name the marketplace and the ledger both use. */
  ref: string;
  /** Whether the catalog still carries it. False = RETIRED: only the record remembers it. */
  listed: boolean;
}

/**
 * The STORE's rows for one viewer (v540): what the shelf carries, then what the RECORD says the
 * viewer still owns after the shelf forgot it. The order is the catalog's own, then the retired refs
 * sorted by id — deterministic, so a surface cannot reorder itself between two reads of the same facts.
 *
 * <p>A retired listing NOBODY bought is not a row: the shelf forgot it and it is not the viewer's, so
 * the store would have nothing to render it from. A plan id is not a row either — `buildWalletView`
 * already refuses to read an unsold ref as template ownership (v539), so this function INHERITS that
 * rule rather than re-deriving it, and a page that renders these rows cannot resurrect the bug.
 */
export function storeRows(catalog: TemplateCatalog, ledger: CreditLedger, viewerId: string): StoreRow[] {
  const rows: StoreRow[] = catalog.listings.map((listing) => ({ ref: listing.id, listed: true }));
  const onShelf = new Set(rows.map((row) => row.ref));
  const view = buildWalletView(catalog, ledger, viewerId);
  for (const ref of view.ownedTemplateIds.filter((id) => !onShelf.has(id)).sort()) {
    rows.push({ ref, listed: false });
  }
  return rows;
}
