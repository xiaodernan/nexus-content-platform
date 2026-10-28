'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildCreatorDashboard, creatorDashboardLine } from '@/lib/creatorDashboard';
import { heldRefsOf, type CreditLedger } from '@/lib/credits';
import { buildDemoCreditsScene } from '@/lib/creditsDemo';
import { loadCredits, saveCredits } from '@/lib/creditsStore';
import { purchaseTemplate } from '@/lib/marketplace';
import { priceText, type PriceCents } from '@/lib/monetization';
import {
  describeRefundPolicy,
  NO_REFUND_DEADLINE,
  refundEligibility,
  refundPurchaseUnderPolicy,
  type RefundPolicy,
} from '@/lib/refundPolicy';
import { attributionByRef, attributionLine, statementFor, statementLine, statementReconciles, type SettlementWindow } from '@/lib/settlement';
import {
  retireTemplate,
  templateById,
  type TemplateCatalog,
  type TemplateListing,
} from '@/lib/templateCatalog';
import { buildWalletView, storeRows } from '@/lib/walletView';

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
  /**
   * The SHELF this page renders (v540). It starts as the demo fixture's catalog and a RETIRE replaces
   * it: a take-down is a window operation on what is FOR SALE, and this page is the host. The LEDGER is
   * untouched by it, so retiring a listing a buyer paid for cannot hide their purchase — the store's
   * rows are the shelf PLUS what the record says the viewer still owns (`storeRows`).
   */
  const [catalog, setCatalog] = useState<TemplateCatalog>(scene.catalog);
  const [ledger, setLedger] = useState<CreditLedger | null>(null);
  const [source, setSource] = useState<'stored' | 'empty' | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The refund POLICY the page applies. The model declares the SHAPE; the HOST chooses the window, and
   * this demo page is the host. `none` is a declared policy too — `NO_REFUND_DEADLINE` says so out
   * loud — while `30d` is the panel's own example, NOT a model default. Switching it changes what the
   * next refund is allowed to do, which is exactly the decision the mechanism refuses to make.
   */
  const [policyChoice, setPolicyChoice] = useState<'none' | '30d'>('none');
  const policy: RefundPolicy = useMemo(
    () => (policyChoice === '30d' ? { windowMs: 30 * 86_400_000 } : NO_REFUND_DEADLINE),
    [policyChoice],
  );

  /**
   * The STATEMENT WINDOW the page reads over (v537). The model refuses to read a clock (ADR 0010), so
   * the host chooses the window; this page offers three honest ones: the whole record, the demo
   * fixture's own 2023 span (which puts this session's movements AFTER the close, so `closing` stops
   * being the balance), and this page's session (which folds the demo era into the opening balance).
   * The SAME window feeds `attributionByRef`, so the per-listing rows obey it too — a refund whose
   * purchase falls outside the window is stated as the refund it was, which is the Amendment 7 bound
   * made operable instead of implied.
   */
  const [windowChoice, setWindowChoice] = useState<'all' | 'demo' | 'session'>('all');
  const sessionStart = useMemo(() => Date.now(), []);
  const demoBounds = useMemo(() => {
    const instants = scene.ledger.entries.map((e) => e.at);
    return { from: Math.min(...instants), to: Math.max(...instants) };
  }, [scene]);
  // Named `statementWindow`, not `window`: this component reads `window.localStorage` below, and a
  // shadowed global would compile to a ledger read off a SettlementWindow.
  const statementWindow: SettlementWindow | undefined = useMemo(() => {
    if (windowChoice === 'demo') return demoBounds;
    if (windowChoice === 'session') return { from: sessionStart };
    return undefined;
  }, [windowChoice, demoBounds, sessionStart]);
  const windowLabel =
    windowChoice === 'all'
      ? 'all time — every movement in the record'
      : windowChoice === 'demo'
        ? `${new Date(demoBounds.from).toISOString()}..${new Date(demoBounds.to).toISOString()} — the demo ledger's own span`
        : `since ${new Date(sessionStart).toISOString()} — this page opened`;

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
    const decision = purchaseTemplate(catalog, ledger, {
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
  }, [catalog, ledger, scene]);

  /**
   * REFUND one purchase BY REF: the REAL refund mechanism on the LOCAL ledger, with the page's POLICY
   * applied first — the buyer is made whole and the author is clawed back atomically, then the result
   * is persisted. It takes the REF rather than a listing (v540): a purchase whose listing was retired
   * has no listing left to hand over, and the record — not the shelf — is what the mechanism reads. A
   * policy that has closed the window refuses BEFORE the mechanism runs, so the ledger is untouched.
   */
  const onRefund = useCallback((ref: string) => {
    if (!ledger) return;
    const decision = refundPurchaseUnderPolicy(catalog, ledger, {
      templateId: ref,
      buyerId: scene.viewerId,
      entryId: `demo-refund-${ref}-${Date.now()}`,
      at: Date.now(),
    }, policy, Date.now());
    if (!decision.ok) { setError(decision.reason); return; }
    const saved = saveCredits(window.localStorage, decision.ledger);
    if (!saved.ok) { setError(saved.reason); return; }
    setLedger(decision.ledger);
    setError(null);
  }, [catalog, ledger, scene, policy]);

  /**
   * RETIRE one listing (v540): the catalog's take-down verb, on the local shelf this page renders. It
   * touches NO ledger entry — a take-down decides what is FOR SALE, never what was bought — so a buyer
   * keeps what they paid for, and their store row keeps a Refund door the shelf's absence cannot close.
   * The model refuses a SECOND retire of the same id by name; the surface simply no longer offers one.
   */
  const onRetire = useCallback((ref: string) => {
    const decision = retireTemplate(catalog, ref);
    if (!decision.ok) { setError(decision.reason); return; }
    setCatalog(decision.catalog);
    setError(null);
  }, [catalog]);

  const wallet = ledger ? buildWalletView(catalog, ledger, scene.viewerId) : null;
  // "Still to buy" = the marketplace's affordability gate MINUS what is already owned. The model
  // deliberately lets an owned listing stay affordable (ADR 0019's bound), so the panel does the
  // subtraction rather than inviting a second purchase of one item.
  const stillToBuy = wallet ? wallet.affordableTemplateIds.filter((id) => !wallet.ownedTemplateIds.includes(id)) : [];
  // What the viewer HOLDS by a recorded purchase — net of refunds. A refund is only offered for these:
  // an authored listing is "owned" but was never bought, so there is no purchase to reverse.
  const heldRefs = ledger ? heldRefsOf(ledger, scene.viewerId) : new Set<string>();
  // The PREFLIGHT's instant. It only decides whether a Refund button is OFFERED as clickable; the
  // click re-asks with its own `Date.now()`, so a stale render can never authorise a write.
  const refundNow = Date.now();
  const creator = ledger ? buildCreatorDashboard(catalog, ledger, scene.creatorId) : null;
  const statement = ledger ? statementFor(ledger, scene.viewerId, statementWindow) : null;
  // What each LISTING did for this account, by name (v536), over the SAME window the statement reads
  // (v537) — so a purchase that was fully refunded reports both halves instead of netting to a zero
  // that would look like nothing happened, and a movement outside the window is not silently counted.
  const attribution = ledger ? attributionByRef(ledger, scene.viewerId, statementWindow) : [];
  const reconciles = ledger && statement ? statementReconciles(ledger, statement) : false;
  // The STORE's rows (v540): the shelf, then what the RECORD says this viewer still owns after the
  // shelf forgot it — so a retire can never hide a purchase, or the Refund door that reverses it.
  const rows = ledger ? storeRows(catalog, ledger, scene.viewerId) : [];
  const retiredRows = rows.filter((row) => !row.listed).length;
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

      {/*
        The refund POLICY strip. The mechanism in `refund.ts` deliberately does not decide WHEN a
        refund is allowed (ADR 0019/0020); the host does, and this page is the host. Switching the
        policy changes what the NEXT refund may do — with a 30-day window, the demo's purchase (made at
        a fixed 2023 instant) is already outside it, so the refusal is observable rather than implied.
      */}
      <div data-credits-policy-strip style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <span data-credits-policy-line style={{ color: 'var(--nexus-muted)' }}>
          REFUND POLICY · {describeRefundPolicy(policy)}
        </span>
        <button
          type="button"
          className="btn"
          data-credits-policy="none"
          onClick={() => setPolicyChoice('none')}
          style={{ fontSize: 10, padding: '1px 6px', opacity: policyChoice === 'none' ? 1 : 0.6 }}
        >
          No deadline
        </button>
        <button
          type="button"
          className="btn"
          data-credits-policy="30d"
          onClick={() => setPolicyChoice('30d')}
          style={{ fontSize: 10, padding: '1px 6px', opacity: policyChoice === '30d' ? 1 : 0.6 }}
        >
          30-day window
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
              {/*
                The window is the READER's (v537). These buttons are the host choosing what the line
                below and the per-listing rows are a reading OF; the model reads no clock, so none of
                the three windows is a default it invented.
              */}
              <div
                data-credits-window-strip
                style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6, flexWrap: 'wrap' }}
              >
                <span data-credits-window-line style={{ color: 'var(--nexus-muted)' }}>WINDOW · {windowLabel}</span>
                {(['all', 'demo', 'session'] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className="btn"
                    data-credits-window={choice}
                    onClick={() => setWindowChoice(choice)}
                    style={{ fontSize: 10, padding: '1px 6px', opacity: windowChoice === choice ? 1 : 0.6 }}
                  >
                    {choice === 'all' ? 'All time' : choice === 'demo' ? "Demo's span" : 'This session'}
                  </button>
                ))}
              </div>
              <div data-credits-statement-line style={{ marginTop: 6 }}>{statementLine(statement)}</div>
              <div>reconciles: {reconciles ? 'yes' : 'NO'}</div>
              {/*
                The per-listing reading (v535/v536). The statement above says what moved; these rows say
                WHICH LISTING moved it, with the same four names — so "sold, then fully clawed back"
                stays a row (net 0, two movements) instead of collapsing into "never sold".
              */}
              <div
                data-credits-attribution
                style={{ marginTop: 8, borderTop: '1px solid var(--nexus-border)', paddingTop: 6 }}
              >
                <div style={{ color: 'var(--nexus-muted)' }}>BY LISTING · what each one did for {scene.viewerId} in this window</div>
                {attribution.length === 0 ? (
                  <div style={{ color: 'var(--nexus-muted)' }}>no movement in this window carries a listing reference yet</div>
                ) : (
                  attribution.map((row) => (
                    <div key={row.ref} data-credits-attr={row.ref} data-credits-attr-net={String(row.net)}>
                      {attributionLine(row)}
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          <section data-credits-store style={{ border: '1px solid var(--nexus-border)', padding: 12 }}>
            <strong>
              STORE · {catalog.listings.length} listing(s)
              {retiredRows > 0 ? ` · ${retiredRows} retired you still own` : ''}
            </strong>
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
                {rows.map((row) => {
                  const listing = templateById(catalog, row.ref);
                  const owned = wallet?.ownedTemplateIds.includes(row.ref) ?? false;
                  const affordable = wallet?.affordableTemplateIds.includes(row.ref) ?? false;
                  const state = !listing
                    ? 'owned · retired, no longer listed'
                    : owned ? 'owned' : affordable ? 'affordable' : listing.priceCents === 0 ? 'free' : 'out of reach';
                  // A listing is buyable only when it is a PAID listing the viewer does not already own
                  // and can afford. Offering "Buy" on something already owned would invite a second
                  // purchase of one item — the model allows it, but the panel should not suggest it.
                  const buyable = !!listing && !owned && affordable && listing.priceCents > 0;
                  // A retired row was BOUGHT by definition (that is why the record still shows it), so
                  // its price is no longer on the shelf to read; the refund door follows the HOLD, not a
                  // price the catalog forgot.
                  const refundable = heldRefs.has(row.ref) && (listing ? listing.priceCents > 0 : true);
                  // Ask the policy layer BEFORE the click: the same gate the write reads, so a
                  // disabled button and a refused click cannot tell different stories.
                  const eligibility = refundable && ledger
                    ? refundEligibility(catalog, ledger, { templateId: row.ref, buyerId: scene.viewerId }, policy, refundNow)
                    : null;
                  const refundBlocked = eligibility && !eligibility.eligible ? eligibility.reason : null;
                  return (
                    <tr key={row.ref} data-credits-listing={row.ref} data-credits-retired={row.listed ? undefined : 'true'}>
                      <td>{listing ? listing.title : <code>{row.ref}</code>}</td>
                      <td>{listing ? listing.authorId : '—'}</td>
                      <td>{listing ? priceText(listing.priceCents as PriceCents, 'CNY') : '—'}</td>
                      <td>{state}</td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        {listing && buyable ? (
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
                        {listing ? (
                          /*
                            The TAKE-DOWN (v540). The catalog could only ADD until v539; this is the verb
                            a host uses to withdraw a listing. It writes nothing to the ledger, so the
                            row below it is re-read from the RECORD if this viewer paid for it.
                          */
                          <button
                            type="button"
                            className="btn"
                            data-credits-retire={row.ref}
                            onClick={() => onRetire(row.ref)}
                            style={{ fontSize: 10, padding: '1px 6px', opacity: 0.7 }}
                          >
                            Retire
                          </button>
                        ) : null}
                        {refundable ? (
                          <button
                            type="button"
                            className="btn"
                            data-credits-refund={row.ref}
                            data-credits-refund-blocked={refundBlocked ? 'true' : undefined}
                            disabled={refundBlocked !== null}
                            title={refundBlocked ?? undefined}
                            onClick={() => onRefund(row.ref)}
                            style={{ fontSize: 10, padding: '1px 6px', opacity: refundBlocked ? 0.4 : 0.8 }}
                          >
                            Refund
                          </button>
                        ) : null}
                        {/*
                          The DEADLINE the preflight already computed, said out loud (v534). v531 made
                          the gate answer `closesAt` before a click; a surface that knows the instant
                          and never shows it leaves the person to guess "until when?". This is the
                          preflight's own answer, not a second computation: an eligible row states the
                          instant its refund window closes, or that this host declared none.
                        */}
                        {eligibility?.eligible ? (
                          <span
                            data-credits-refund-until={
                              eligibility.closesAt === null
                                ? 'no deadline'
                                : new Date(eligibility.closesAt).toISOString()
                            }
                            style={{ fontSize: 10, color: 'var(--nexus-muted)', alignSelf: 'center' }}
                          >
                            {eligibility.closesAt === null
                              ? 'refund: no deadline'
                              : `refund until ${new Date(eligibility.closesAt).toISOString()}`}
                          </span>
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
