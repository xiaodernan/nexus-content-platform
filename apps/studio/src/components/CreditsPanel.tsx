'use client';
import { createEmptyDocument, type DesignDocument } from '@nexus/design-model';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildCreatorDashboard, creatorDashboardLine } from '@/lib/creatorDashboard';
import { heldRefsOf, type CreditLedger } from '@/lib/credits';
import { buildDemoCreditsScene } from '@/lib/creditsDemo';
import { loadCatalog, saveCatalog } from '@/lib/catalogStore';
import { loadCredits, saveCredits } from '@/lib/creditsStore';
import { loadDesigns, saveDesign, saveDesigns } from '@/lib/designStore';
import { purchaseTemplate } from '@/lib/marketplace';
import { priceText, type PriceCents } from '@/lib/monetization';
import { publishListing } from '@/lib/publish';
import { forkLine, forksOf } from '@/lib/remixLibrary';
import {
  describeRefundPolicy,
  NO_REFUND_DEADLINE,
  refundEligibility,
  refundPurchaseUnderPolicy,
  type RefundPolicy,
} from '@/lib/refundPolicy';
import { attributionByRef, attributionLine, statementFor, statementLine, statementReconciles, type SettlementWindow } from '@/lib/settlement';
import {
  discardWithdrawn,
  emptyTemplateCatalog,
  relistTemplate,
  retireTemplate,
  templateById,
  withdrawnByAuthor,
  type TemplateCatalog,
  type TemplateListing,
} from '@/lib/templateCatalog';
import { remixRightFor, remixTemplateToProject } from '@/lib/templateRemix';
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
   * The SHELF this page renders (v540). It starts EMPTY — the local-first store's own answer for an
   * absent key — and is read back from `catalogStore` on mount, saved after every change (v541): a
   * take-down is a window operation on what is FOR SALE, and this page is the host. The LEDGER is
   * untouched by it, so retiring a listing a buyer paid for cannot hide their purchase — the store's
   * rows are the shelf PLUS what the record says the viewer still owns (`storeRows`).
   */
  const [catalog, setCatalog] = useState<TemplateCatalog>(() => emptyTemplateCatalog());
  /**
   * What the shelf REMEMBERS withdrawing (v542). A take-down is a MOVE, not a delete: the listing
   * leaves `catalog` and lands here, persisted beside it in the store's format 2. A put-back is the
   * same move reversed, so the surface can offer it — and a reload has to read it back.
   */
  const [withdrawn, setWithdrawn] = useState<TemplateListing[]>([]);
  /**
   * The DESIGNS this browser stores (v547), by document. A listing names a `documentId`, and until the
   * design store existed that id pointed at NOTHING a page could open — so the remix handoff had no
   * source to fork. The DOCUMENTS are held here, not just their ids (v548): the remix library is a
   * reading of the documents themselves, and a fork is appended to this state only after the store has
   * accepted it, so the list can never show a fork a reload would forget.
   */
  const [designs, setDesigns] = useState<DesignDocument[]>([]);
  /** The last remix this page made, stated beside the store. Host state, not a record. */
  const [remixNote, setRemixNote] = useState<string | null>(null);
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
      // The shelf is its OWN local-first record (v541): absence is an empty shelf, corruption is refused.
      const shelf = loadCatalog(window.localStorage);
      if (!shelf.ok) { setError(shelf.reason); return; }
      setCatalog(shelf.catalog);
      setWithdrawn(shelf.withdrawn);
      // The DESIGNS are a third independent record (v547): absence is an empty store, corruption is
      // refused by name. Corrupt bytes BLOCK the page rather than being silently read as "no designs",
      // because a page that offered nothing to remix while holding unreadable work would be lying.
      const designs = loadDesigns(window.localStorage);
      if (!designs.ok) { setError(designs.reason); return; }
      setDesigns(designs.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const loadDemo = useCallback(() => {
    try {
      const savedShelf = saveCatalog(window.localStorage, scene.catalog, []);
      if (!savedShelf.ok) { setError(savedShelf.reason); return; }
      const saved = saveCredits(window.localStorage, scene.ledger);
      if (!saved.ok) { setError(saved.reason); return; }
      setLedger(scene.ledger);
      setCatalog(scene.catalog);
      setWithdrawn([]);
      setSource('stored');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [scene]);

  const clearLocal = useCallback(() => {
    try {
      // An empty ledger, an empty shelf and an empty design store are VALID records, so clearing WRITES
      // them rather than deleting the keys — the same rule `catalogStore` states for an absent key.
      const savedShelf = saveCatalog(window.localStorage, emptyTemplateCatalog(), []);
      if (!savedShelf.ok) { setError(savedShelf.reason); return; }
      const savedDesigns = saveDesigns(window.localStorage, []);
      if (!savedDesigns.ok) { setError(savedDesigns.reason); return; }
      const saved = saveCredits(window.localStorage, { entries: [] });
      if (!saved.ok) { setError(saved.reason); return; }
      setLedger({ entries: [] });
      setCatalog(emptyTemplateCatalog());
      setWithdrawn([]);
      setDesigns([]);
      setRemixNote(null);
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
    // A take-down is PERSISTED before it is rendered (v541): the shelf the page shows is the one a
    // reload reads back, so the store cannot disagree with itself after a refresh.
    // A take-down MOVES the listing to the withdrawn record (v542), so the shelf forgets what is for
    // sale while the page keeps what it could put back. Both halves are PERSISTED before they are
    // rendered, so the shelf a reload reads is the one this click wrote.
    const nextWithdrawn = [...withdrawn, decision.listing];
    const saved = saveCatalog(window.localStorage, decision.catalog, nextWithdrawn);
    if (!saved.ok) { setError(saved.reason); return; }
    setCatalog(decision.catalog);
    setWithdrawn(nextWithdrawn);
    setError(null);
  }, [catalog, withdrawn]);

  /**
   * PUT BACK one withdrawn listing (v543): the move reversed as ONE model decision. `relistTemplate`
   * re-adds the remembered listing through `addTemplate` (so it is validated exactly as a publish
   * would be) AND takes it out of the record, which is the only way to keep one id on one side of the
   * shelf — doing the two halves by hand is what the store's overlap refusal catches. If the id were
   * somehow listed again meanwhile, it refuses BY NAME and nothing is written.
   */
  const onPutBack = useCallback((ref: string) => {
    const decision = relistTemplate(catalog, withdrawn, ref);
    if (!decision.ok) { setError(decision.reason); return; }
    const saved = saveCatalog(window.localStorage, decision.catalog, decision.withdrawn);
    if (!saved.ok) { setError(saved.reason); return; }
    setCatalog(decision.catalog);
    setWithdrawn(decision.withdrawn);
    setError(null);
  }, [catalog, withdrawn]);

  /**
   * DISCARD one withdrawn listing (v543): the record's OTHER exit. A take-down can be undone (put back)
   * or accepted as gone for good, and only this deliberate call makes the memory shrink — a retire
   * never quietly becomes a delete. It is also what frees an id for a NEW publish: while the listing
   * sits in the record, adding a fresh one under that id and saving both would be refused as an
   * overlap. The shelf itself does not move here; the record shrinks.
   */
  const onDiscard = useCallback((ref: string) => {
    const decision = discardWithdrawn(withdrawn, ref);
    if (!decision.ok) { setError(decision.reason); return; }
    const saved = saveCatalog(window.localStorage, catalog, decision.withdrawn);
    if (!saved.ok) { setError(saved.reason); return; }
    setWithdrawn(decision.withdrawn);
    setError(null);
  }, [catalog, withdrawn]);

  /**
   * PUBLISH one draft onto the shelf (v546): the creator's entry point, which the page could not reach
   * before — `publishTemplate` had a proof and no producer, so every row a person saw had been typed
   * into the demo fixture. The design is the model's own EMPTY document (a real, valid graph), the id
   * is chosen to be free on BOTH sides, and `publishListing` asks the withdrawal record before it
   * adds, so this click can never build a shelf `catalogStore` would refuse to save. Persisted before
   * it renders, like every other write on this page.
   */
  const onPublish = useCallback(() => {
    let n = 1;
    while (
      templateById(catalog, `tpl-local-${n}`) !== null ||
      withdrawn.some((entry) => entry.id === `tpl-local-${n}`)
    ) n += 1;
    const id = `tpl-local-${n}`;
    // The design is the model's OWN document (v546) and it is WRITTEN FIRST (v547): a listing must never
    // exist without the document its `documentId` names, so a refused design write leaves the shelf
    // exactly as it was. An orphan design, if the shelf write then fails, is harmless — nothing
    // references it, and it can be published again.
    const draft = createEmptyDocument(`Local Draft ${n}`);
    const decision = publishListing(catalog, withdrawn, draft, {
      id,
      title: `Local Draft ${n}`,
      description: 'A demo design published from this page.',
      authorId: scene.creatorId,
      priceCents: 300,
      category: 'landing',
      tags: ['draft'],
      now: Date.now(),
    });
    if (!decision.ok) { setError(decision.reason); return; }
    const savedDesign = saveDesign(window.localStorage, draft);
    if (!savedDesign.ok) { setError(savedDesign.reason); return; }
    const saved = saveCatalog(window.localStorage, decision.catalog, withdrawn);
    if (!saved.ok) { setError(saved.reason); return; }
    setCatalog(decision.catalog);
    setDesigns((docs) => [...docs, draft]);
    setRemixNote(null);
    setError(null);
  }, [catalog, withdrawn, scene]);

  /**
   * REMIX a listing this viewer may fork (v547/v548): the marketplace handoff's first producer. The SOURCE
   * is the document the local design store keeps under the listing's `documentId`, and the fork is stamped
   * with the template it came from. The fork is then STORED (v548): v547 reported it and let a reload forget
   * it, which made the remix a demonstration rather than a project. It is written THROUGH `saveDesign`
   * before it is rendered, so the REMIXES strip below the store lists exactly what a reload will read.
   */
  const onRemix = useCallback((listing: TemplateListing) => {
    if (!ledger) return;
    const sourceDoc = designs.find((document) => document.id === listing.documentId);
    if (!sourceDoc) { setError(`no design with id "${listing.documentId}" is stored in this browser`); return; }
    const forked = remixTemplateToProject(sourceDoc, catalog, ledger, scene.viewerId, listing.id, {
      // The HOST supplies the instant (ADR 0010); the model never reads a clock.
      remixedAt: new Date().toISOString(),
      name: `${listing.title} (remix)`,
    });
    if (!forked.ok) { setError(forked.reason); return; }
    const saved = saveDesign(window.localStorage, forked.document);
    if (!saved.ok) { setError(saved.reason); return; }
    setDesigns((docs) => [...docs, forked.document]);
    const nodes = Object.keys(forked.document.nodes).length;
    setRemixNote(`remixed "${listing.title}" (${forked.basis}, from ${listing.id}) -> "${forked.document.name}" · doc ${forked.document.id} · ${nodes} node(s) · stored`);
    setError(null);
  }, [catalog, designs, ledger, scene]);

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
  // The creator's OWN take-downs (v544): the shelf's record is global, and a dashboard that only read
  // the shelf could not tell "never published" from "withdrawn". This reads the same record the strip
  // renders, filtered to the author the card is about.
  const myWithdrawn = withdrawnByAuthor(withdrawn, scene.creatorId);
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
  // The forks this browser's design store already HOLDS (v548): each one naming its source and whether
  // the shelf still lists it. Derived from the documents, never from a second list that could drift.
  const forks = forksOf(designs, catalog);
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
        This page reads and writes the ledger, the shelf AND the designs through the same local-first stores
        a real ledger, catalog and project library would use (<code>nexus.credits.v1</code>,{' '}
        <code>nexus.catalog.v1</code> and <code>nexus.designs.v1</code> in this browser). Buying a
        template appends a real two-entry transaction to that LOCAL ledger; refunding reverses the
        recorded purchase; retiring withdraws the listing from that LOCAL shelf and REMEMBERS it (v542),
        so it can be put back or discarded — even after a reload; publishing keeps the design it built
        (v547), so the buy-and-remix loop forks a real document, and the fork itself is STORED in that same
        design store (v548), so the REMIXES strip below lists projects a reload can still find. All of it
        spends demo credits, not money.
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
          Clear the local ledger and shelf
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
              <div data-credits-creator-withdrawn>
                withdrawn: {myWithdrawn.map((l) => l.title).join(', ') || 'none'}
              </div>
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
            <div style={{ marginTop: 6 }}>
              <button
                type="button"
                className="btn"
                data-credits-publish
                onClick={onPublish}
                style={{ fontSize: 10, padding: '1px 6px', opacity: 0.8 }}
              >
                Publish draft
              </button>
            </div>
            {/*
              The design store's face (v547). A listing names a document; this says how many of those
              documents this browser actually holds — the difference between "nothing to remix" and
              "the source is here", stated rather than implied by which buttons happen to appear.
            */}
            <div data-credits-designs style={{ color: 'var(--nexus-muted)', marginTop: 4 }}>
              designs stored in this browser: {designs.length}
            </div>
            {remixNote && (
              <div data-credits-remix-result style={{ marginTop: 4 }}>
                {remixNote}
              </div>
            )}
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
                  // The REMIX door (v547) exists only where BOTH facts hold: the ledger grants the right
                  // (free, or held by a recorded purchase) AND this browser holds the source design. A
                  // button that always answered "not stored" would be a lie about what the page can do.
                  const canRemix = !!listing && !!ledger && designs.some((document) => document.id === listing.documentId) &&
                    remixRightFor(catalog, ledger, scene.viewerId, listing.id).ok;
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
                        {canRemix && listing ? (
                          /*
                            The REMIX door (v547). `remixTemplateToProject` has had a proof since the
                            marketplace landed and no caller at all: a viewer who owns a template could
                            not fork it. The fork leaves with the source's lineage stamped on it.
                          */
                          <button
                            type="button"
                            className="btn"
                            data-credits-remix={listing.id}
                            onClick={() => onRemix(listing)}
                            style={{ fontSize: 10, padding: '1px 6px' }}
                          >
                            Remix
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

          {/*
            THE REMIX LIBRARY (v548). v547 stored the documents a listing names and stamped each fork with
            its source, then reported the fork in a note a reload forgot. This strip is the forks those
            documents ACTUALLY carry — read back out of the store through `forksOf`, not from the note — so
            a remix survives a reload as a project the browser holds, and a take-down of the source is
            stated ("no longer listed") instead of quietly taking the fork with it.
          */}
          {forks.length > 0 && (
            <section data-credits-forks style={{ border: '1px solid var(--nexus-border)', padding: 12 }}>
              <strong>REMIXES · {forks.length} fork(s) in this browser&apos;s design store</strong>
              <div style={{ color: 'var(--nexus-muted)', marginTop: 4 }}>
                Each row is a stored document carrying a lineage: what it is, where it came from, when.
              </div>
              {forks.map((row) => (
                <div
                  key={row.documentId}
                  data-credits-fork={row.documentId}
                  data-credits-fork-source={row.sourceProjectId}
                  data-credits-fork-listed={row.sourceTitle === null ? 'false' : 'true'}
                  style={{ marginTop: 6 }}
                >
                  {forkLine(row)}
                </div>
              ))}
            </section>
          )}
        </div>
      )}

      {/*
        WHAT THE SHELF WITHDREW (v542). A take-down leaves a listing off the shelf but ON the shelf's
        record, and this strip is that record said out loud: each withdrawn listing keeps its name, its
        price and a Put back action. It is rendered OUTSIDE the STORE card so that card's own count
        says what is FOR SALE without also counting what is not.
      */}
      {withdrawn.length > 0 && (
        <section
          data-credits-withdrawn-strip
          style={{ border: '1px solid var(--nexus-border)', padding: 12, marginTop: 14, maxWidth: 980 }}
        >
          <strong>WITHDRAWN · {withdrawn.length} listing(s) this shelf took down</strong>
          <div style={{ color: 'var(--nexus-muted)', marginTop: 4 }}>
            A retire is a move, not a delete: these listings are off the shelf, recorded beside it. Put one
            back, or discard the memory that it was ever listed.
          </div>
          {withdrawn.map((entry) => (
            <div
              key={entry.id}
              data-credits-withdrawn={entry.id}
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}
            >
              <span>
                {entry.title} · {priceText(entry.priceCents as PriceCents, 'CNY')}
              </span>
              <button
                type="button"
                className="btn"
                data-credits-relist={entry.id}
                onClick={() => onPutBack(entry.id)}
                style={{ fontSize: 10, padding: '1px 6px' }}
              >
                Put back
              </button>
              <button
                type="button"
                className="btn"
                data-credits-discard={entry.id}
                onClick={() => onDiscard(entry.id)}
                style={{ fontSize: 10, padding: '1px 6px', opacity: 0.7 }}
              >
                Discard
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
