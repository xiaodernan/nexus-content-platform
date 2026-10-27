'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildCreatorDashboard, creatorDashboardLine } from '@/lib/creatorDashboard';
import { heldRefsOf, type CreditLedger } from '@/lib/credits';
import { buildDemoCreditsScene } from '@/lib/creditsDemo';
import { loadCredits, saveCredits } from '@/lib/creditsStore';
import { purchaseTemplate } from '@/lib/marketplace';
import { priceText, type PriceCents } from '@/lib/monetization';
import { refundPurchase } from '@/lib/refund';
import { statementFor, statementLine, statementReconciles } from '@/lib/settlement';
import type { TemplateListing } from '@/lib/templateCatalog';
import { buildWalletView } from '@/lib/walletView';

/**
 * M8 — the CREDITS surface. A STANDALONE page (`/credits`), not a Studio pane, so it touches no shared
 * mount point: `Studio.tsx`, the toolbar and the surface store all belong to the editor lane.
 *
 * §60 is the point of this file. This build has no credits service and no payment, so:
 *   - the face says `DEMO MODE` and states that nothing here moves real money;
 *   - the only way to get a ledger is to LOAD THE DEMO FIXTURE, which is a local record built by the
 *     real appender and marketplace (`creditsDemo.ts`), not invented in the view;
 *   - the ledger is read and written through `creditsStore` over `localStorage` — the SAME path a real
 *     local-first ledger would use, so what the page demonstrates is the real persistence.
 *
 * An absent local key is an EMPTY ledger and the page says so; it does not fabricate a balance.
 */
export default function CreditsPanel() {
  const scene = useMemo(() => buildDemoCreditsScene(), []);
  const [ledger, setLedger] = useState<CreditLedger | null>(null);
  const [source, setSource] = useState<'stored' | 'empty' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const loaded = loadCredits(window.localStorage);
      if (!loaded.ok) { setError(loaded.reason); return; }
      setLedger(loaded.ledger);
      setSource(loaded.source);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadDemo = useCallback(() => {
    try {
      const saved = saveCredits(window.localStorage, scene.ledger);
      if (!saved.ok) { setError(saved.reason); return; }
      setLedger(scene.ledger);
      setSource('stored');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [scene]);

  const clearLocal = useCallback(() => {
    try {
      // An empty ledger is a VALID record, so clearing writes one rather than deleting the key.
      const saved = saveCredits(window.localStorage, { entries: [] });
      if (!saved.ok) { setError(saved.reason); return; }
      setLedger({ entries: [] });
      setSource('stored');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  /**
   * BUY one listing: the REAL marketplace transaction on the LOCAL ledger. It appends the buyer's debit
   * and the author's credit atomically, then persists the result through `creditsStore`. This spends
   * DEMO credits, not money — the surface says so on its face — but the arithmetic, the atomicity and
   * the persistence are the ones the rest of the model enforces.
   */
  const onBuy = useCallback((listing: TemplateListing) => {
    if (!ledger) return;
    const decision = purchaseTemplate(scene.catalog, ledger, {
      templateId: listing.id,
      buyerId: scene.viewerId,
      // The HOST supplies the instant and the idempotency key (ADR 0010); a timestamp keeps a second
      // purchase in a later session from colliding with this one.
      entryId: `demo-buy-${listing.id}-${Date.now()}`,
      at: Date.now(),
    });
    if (!decision.ok) { setError(decision.reason); return; }
    const saved = saveCredits(window.localStorage, decision.ledger);
    if (!saved.ok) { setError(saved.reason); return; }
    setLedger(decision.ledger);
    setError(null);
  }, [ledger, scene]);

  /**
   * REFUND one purchase: the REAL refund mechanism on the LOCAL ledger — the buyer is made whole and
   * the author is clawed back atomically, then the result is persisted. It reverses the purchase the
   * ledger recorded, so ownership (which is net of refunds) releases the template.
   */
  const onRefund = useCallback((listing: TemplateListing) => {
    if (!ledger) return;
    const decision = refundPurchase(scene.catalog, ledger, {
      templateId: listing.id,
      buyerId: scene.viewerId,
      entryId: `demo-refund-${listing.id}-${Date.now()}`,
      at: Date.now(),
    });
    if (!decision.ok) { setError(decision.reason); return; }
    const saved = saveCredits(window.localStorage, decision.ledger);
    if (!saved.ok) { setError(saved.reason); return; }
    setLedger(decision.ledger);
    setError(null);
  }, [ledger, scene]);

  const wallet = ledger ? buildWalletView(scene.catalog, ledger, scene.viewerId) : null;
  // "Still to buy" = the marketplace's affordability gate MINUS what is already owned. The model
  // deliberately lets an owned listing stay affordable (ADR 0019's bound), so the panel does the
  // subtraction rather than inviting a second purchase of one item.
  const stillToBuy = wallet ? wallet.affordableTemplateIds.filter((id) => !wallet.ownedTemplateIds.includes(id)) : [];
  // What the viewer HOLDS by a recorded purchase — net of refunds. A refund is only offered for these:
  // an authored listing is "owned" but was never bought, so there is no purchase to reverse.
  const heldRefs = ledger ? heldRefsOf(ledger, scene.viewerId) : new Set<string>();
  const creator = ledger ? buildCreatorDashboard(scene.catalog, ledger, scene.creatorId) : null;
  const statement = ledger ? statementFor(ledger, scene.viewerId) : null;
  const reconciles = ledger && statement ? statementReconciles(ledger, statement) : false;
  const empty = !ledger || source === 'empty' || ledger.entries.length === 0;

  return (
    <div
      id="nexus-credits"
      data-surface="credits"
      style={{ minHeight: '100vh', padding: 16, background: 'var(--nexus-bg)', color: 'var(--nexus-text)', fontSize: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
        <strong style={{ letterSpacing: 0.4 }}>CREDITS (M8)</strong>
        <span style={{ color: 'var(--nexus-muted)' }} data-credits-mode>
          DEMO MODE · no credits service and no payment — this ledger is local and illustrative
        </span>
      </div>
      <div style={{ color: 'var(--nexus-muted)', marginBottom: 12, maxWidth: 780 }}>
        This page reads and writes the ledger through the same local-first store a real ledger would use
        (<code>nexus.credits.v1</code> in this browser). Buying a template appends a real two-entry
        transaction to that LOCAL ledger; refunding reverses the recorded purchase. Both spend demo
        credits, not money.
      </div>

      {error && (
        <div data-credits-error style={{ color: '#d9534f', marginBottom: 10 }}>
          error: {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button type="button" className="btn" data-credits-load onClick={loadDemo}>
          Load a demo ledger
        </button>
        <button type="button" className="btn" data-credits-clear onClick={clearLocal} style={{ opacity: 0.7 }}>
          Clear the local ledger
        </button>
      </div>

      {empty ? (
        <div data-credits-empty style={{ color: 'var(--nexus-muted)', maxWidth: 780 }}>
          No movements yet. This build cannot earn or spend credits, so the local ledger starts empty.
          Load the demo fixture to see the wallet, the creator dashboard and the statement.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14, maxWidth: 980 }}>
          {wallet && (
            <section data-credits-wallet style={{ border: '1px solid var(--nexus-border)', padding: 12 }}>
              <strong>WALLET · {scene.viewerId}</strong>
              <div style={{ marginTop: 6 }}>
                balance: <b>{wallet.balanceCents} credits</b>
              </div>
              <div>owns: {wallet.ownedTemplateIds.length ? wallet.ownedTemplateIds.join(', ') : 'nothing'}</div>
              <div>can still buy: {stillToBuy.length ? stillToBuy.join(', ') : 'nothing'}</div>
            </section>
          )}

          {creator && (
            <section data-credits-creator style={{ border: '1px solid var(--nexus-border)', padding: 12 }}>
              <strong>CREATOR · {scene.creatorId}</strong>
              <div style={{ marginTop: 6 }}>{creatorDashboardLine(creator)}</div>
              <div>listings: {creator.myListings.map((l) => l.title).join(', ') || 'none'}</div>
            </section>
          )}

          {statement && (
            <section data-credits-statement style={{ border: '1px solid var(--nexus-border)', padding: 12 }}>
              <strong>STATEMENT</strong>
              <div style={{ marginTop: 6 }}>{statementLine(statement)}</div>
              <div>reconciles: {reconciles ? 'yes' : 'NO'}</div>
            </section>
          )}

          <section data-credits-store style={{ border: '1px solid var(--nexus-border)', padding: 12 }}>
            <strong>STORE · {scene.catalog.listings.length} listing(s)</strong>
            <table style={{ width: '100%', marginTop: 6, borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th align="left">template</th>
                  <th align="left">author</th>
                  <th align="left">price</th>
                  <th align="left">you</th>
                  <th align="left">action</th>
                </tr>
              </thead>
              <tbody>
                {scene.catalog.listings.map((listing) => {
                  const owned = wallet?.ownedTemplateIds.includes(listing.id) ?? false;
                  const affordable = wallet?.affordableTemplateIds.includes(listing.id) ?? false;
                  const state = owned ? 'owned' : affordable ? 'affordable' : listing.priceCents === 0 ? 'free' : 'out of reach';
                  // A listing is buyable only when it is a PAID listing the viewer does not already own
                  // and can afford. Offering "Buy" on something already owned would invite a second
                  // purchase of one item — the model allows it, but the panel should not suggest it.
                  const buyable = !owned && affordable && listing.priceCents > 0;
                  const refundable = heldRefs.has(listing.id) && listing.priceCents > 0;
                  return (
                    <tr key={listing.id} data-credits-listing={listing.id}>
                      <td>{listing.title}</td>
                      <td>{listing.authorId}</td>
                      <td>{priceText(listing.priceCents as PriceCents, 'CNY')}</td>
                      <td>{state}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {buyable ? (
                          <button
                            type="button"
                            className="btn"
                            data-credits-buy={listing.id}
                            onClick={() => onBuy(listing)}
                            style={{ fontSize: 10, padding: '1px 6px' }}
                          >
                            Buy
                          </button>
                        ) : null}
                        {refundable ? (
                          <button
                            type="button"
                            className="btn"
                            data-credits-refund={listing.id}
                            onClick={() => onRefund(listing)}
                            style={{ fontSize: 10, padding: '1px 6px', opacity: 0.8 }}
                          >
                            Refund
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </div>
  );
}
