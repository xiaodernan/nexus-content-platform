/**
 * M8 — INVARIANT tests for the credits sub-system, as a seeded, deterministic property suite.
 *
 * <p>The hand-written cases in the seven M8 modules pin the examples a person thought of. This file
 * pins the PROPERTIES that must hold for every input, over hundreds of generated ledgers, catalogs,
 * windows and viewers — and it is seeded, so a failing case is reproducible from its seed rather than
 * "somewhere in the fuzz". No external property-testing dependency: a 32-bit mulberry32 PRNG.
 *
 * <p>What each invariant says, and why it is not vacuous:
 * <ul>
 *   <li><b>balance is the sum</b> — `balanceOf` equals an independent sum over the account's entries,
 *       and the appender never produces a ledger the validator refuses.</li>
 *   <li><b>append is atomic and idempotent</b> — a retried id and an overdraw are refused, and the
 *       ledger they were handed is byte-identical afterwards.</li>
 *   <li><b>a purchase conserves credits</b> — when it succeeds the buyer loses exactly what the author
 *       gains and both entries name the template; when it is refused the ledger does not move.</li>
 *   <li><b>the statement reconciles</b> — `opening + earned − spent + after === balance` for every
 *       account and every window, AND `opening` equals an independent sum of the entries before the
 *       window (so the identity cannot pass by both sides being wrong the same way).</li>
 *   <li><b>the wallet never invents ownership</b> — every id it reports as owned or affordable is a
 *       listing in the catalog. This is the class of bug fixed in `3ac210e`: a shared ledger's
 *       subscription `ref` must not read as template ownership.</li>
 *   <li><b>affordability agrees with the purchase</b> — `templateAffordable` is true exactly when a
 *       fresh purchase of that listing succeeds.</li>
 * </ul>
 */

import { describe, expect, it } from 'vitest';

import {
  accountsOf,
  appendCreditEntry,
  balanceOf,
  emptyCreditLedger,
  validateCreditLedger,
  type CreditEntry,
  type CreditLedger,
} from './credits';
import { addTemplate, emptyTemplateCatalog, type TemplateCatalog, type TemplateListing } from './templateCatalog';
import { purchaseTemplate, templateAffordable } from './marketplace';
import { statementFor, statementReconciles } from './settlement';
import { buildWalletView } from './walletView';

// ── a deterministic PRNG: a failing seed reproduces the failing case exactly ──────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function int(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

function pick<T>(rnd: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}

const ACCOUNTS = ['acc-a', 'acc-b', 'acc-c'] as const;

/** A ledger built ONLY through the appender, so it is valid by construction. */
function randomLedger(seed: number, n: number): CreditLedger {
  const rnd = mulberry32(seed);
  let ledger = emptyCreditLedger();
  let guard = 0;
  for (let i = 0; i < n && guard < n * 20; i++, guard++) {
    const accountId = pick(rnd, ACCOUNTS);
    const kind = pick(rnd, ['grant', 'spend', 'adjust', 'refund'] as const);
    let delta: number;
    if (kind === 'spend') {
      const balance = balanceOf(ledger, accountId);
      if (balance <= 0) continue; // no affordable spend for this account; try another entry
      delta = -int(rnd, 1, balance);
    } else {
      delta = int(rnd, 1, 100);
    }
    const entry: CreditEntry = {
      id: `e${i}`,
      accountId,
      delta,
      reason: `r${i}`,
      at: int(rnd, 0, 1000),
      kind,
      // A ref that is NOT a template id (t0..t5) — this is what the wallet must not call ownership.
      ...(rnd() < 0.3 ? { ref: `ref-${int(rnd, 0, 3)}` } : {}),
    };
    const res = appendCreditEntry(ledger, entry);
    if (res.ok) ledger = res.ledger;
  }
  return ledger;
}

function randomCatalog(seed: number): { catalog: TemplateCatalog; listings: TemplateListing[] } {
  const rnd = mulberry32(seed * 7 + 1);
  const categories = ['landing', 'dashboard', 'mobile', 'social', 'print', 'other'] as const;
  let catalog = emptyTemplateCatalog();
  const listings: TemplateListing[] = [];
  const count = int(rnd, 1, 6);
  for (let i = 0; i < count; i++) {
    const listing: TemplateListing = {
      id: `t${i}`,
      title: `Template ${i}`,
      description: `Description ${i}`,
      authorId: pick(rnd, ['author-x', 'author-y']),
      priceCents: pick(rnd, [0, 100, 250, 500, 900]),
      category: pick(rnd, categories),
      tags: [],
      documentId: `doc-${i}`,
      createdAt: int(rnd, 0, 100),
    };
    const res = addTemplate(catalog, listing);
    if (res.ok) { catalog = res.catalog; listings.push(res.listing); }
  }
  return { catalog, listings };
}

describe('M8 invariants: the ledger', () => {
  it('balance is the sum of deltas, never negative, and the appender never makes an invalid ledger', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const ledger = randomLedger(seed, 40);
      for (const accountId of ACCOUNTS) {
        const independent = ledger.entries
          .filter((e) => e.accountId === accountId)
          .reduce((sum, e) => sum + e.delta, 0);
        expect(balanceOf(ledger, accountId)).toBe(independent);
        expect(balanceOf(ledger, accountId)).toBeGreaterThanOrEqual(0);
      }
      expect(validateCreditLedger(ledger)).toEqual({ ok: true, problems: [] });
    }
  });

  it('a retried id and an overdraw are refused, and the ledger is byte-identical afterwards', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const ledger = randomLedger(seed, 30);
      if (ledger.entries.length === 0) continue;
      const snapshot = ledger.entries.slice();

      const first = ledger.entries[0]!;
      expect(appendCreditEntry(ledger, { ...first }).ok).toBe(false);

      for (const accountId of accountsOf(ledger)) {
        const balance = balanceOf(ledger, accountId);
        const over = appendCreditEntry(ledger, {
          id: `over-${accountId}`, accountId, delta: -(balance + 1), reason: 'overdraw', at: 1, kind: 'spend',
        });
        expect(over.ok).toBe(false);
      }
      expect(ledger.entries).toEqual(snapshot); // neither refusal mutated the input
    }
  });
});

describe('M8 invariants: the marketplace', () => {
  it('a purchase conserves credits and names the template — or moves nothing', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { catalog, listings } = randomCatalog(seed);
      if (listings.length === 0) continue;
      const rnd = mulberry32(seed * 13 + 3);

      let ledger = emptyCreditLedger();
      const grant = appendCreditEntry(ledger, {
        id: 'g', accountId: 'buyer', delta: int(rnd, 1, 2000), reason: 'top-up', at: 0, kind: 'grant',
      });
      if (!grant.ok) throw new Error('unreachable');
      ledger = grant.ledger;

      const listing = pick(rnd, listings);
      const beforeBuyer = balanceOf(ledger, 'buyer');
      const beforeAuthor = balanceOf(ledger, listing.authorId);
      const beforeEntries = ledger.entries.length;

      const decision = purchaseTemplate(catalog, ledger, { templateId: listing.id, buyerId: 'buyer', entryId: `buy-${seed}`, at: 1 });
      if (decision.ok) {
        expect(balanceOf(decision.ledger, 'buyer') + balanceOf(decision.ledger, listing.authorId))
          .toBe(beforeBuyer + beforeAuthor);
        expect(decision.buyerEntry.delta).toBe(-listing.priceCents);
        expect(decision.authorEntry.delta).toBe(listing.priceCents);
        expect(decision.buyerEntry.ref).toBe(listing.id);
        expect(decision.authorEntry.ref).toBe(listing.id);
        expect(decision.ledger.entries.length).toBe(beforeEntries + 2);
      } else {
        expect(ledger.entries.length).toBe(beforeEntries);
        expect(balanceOf(ledger, 'buyer')).toBe(beforeBuyer);
      }
    }
  });

  it('affordability is true exactly when a fresh purchase succeeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { catalog, listings } = randomCatalog(seed);
      if (listings.length === 0) continue;
      const rnd = mulberry32(seed * 19 + 7);

      let ledger = emptyCreditLedger();
      const grant = appendCreditEntry(ledger, {
        id: 'g', accountId: 'buyer', delta: int(rnd, 1, 2000), reason: 'top-up', at: 0, kind: 'grant',
      });
      if (!grant.ok) throw new Error('unreachable');
      ledger = grant.ledger;

      for (const listing of listings) {
        const affordable = templateAffordable(catalog, ledger, 'buyer', listing.id);
        const decision = purchaseTemplate(catalog, ledger, { templateId: listing.id, buyerId: 'buyer', entryId: `b-${listing.id}`, at: 1 });
        expect(decision.ok).toBe(affordable);
      }
    }
  });
});

describe('M8 invariants: the settlement statement', () => {
  it('reconciles for every account and every window, with `opening` independently re-derived', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const ledger = randomLedger(seed, 50);
      const rnd = mulberry32(seed * 17 + 5);

      for (let w = 0; w < 12; w++) {
        const a = int(rnd, 0, 1000);
        const b = int(rnd, 0, 1000);
        const from = rnd() < 0.2 ? undefined : Math.min(a, b);
        const to = rnd() < 0.2 ? undefined : Math.max(a, b);

        for (const accountId of ACCOUNTS) {
          const statement = statementFor(ledger, accountId, { from, to });
          expect(statementReconciles(ledger, statement)).toBe(true);
          expect(statement.opening + statement.earned - statement.spent + statement.after)
            .toBe(balanceOf(ledger, accountId));

          // Non-vacuous: opening must equal an INDEPENDENT sum of the entries before the window.
          const independentOpening = ledger.entries
            .filter((e) => e.accountId === accountId && from !== undefined && e.at < from)
            .reduce((sum, e) => sum + e.delta, 0);
          expect(statement.opening).toBe(independentOpening);
        }
      }
    }
  });
});

describe('M8 invariants: the wallet view', () => {
  it('the generator really produces spend refs that are NOT listing ids (so the check is non-vacuous)', () => {
    let adversarial = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const { listings } = randomCatalog(seed);
      const ids = new Set(listings.map((l) => l.id));
      const ledger = randomLedger(seed, 40);
      adversarial += ledger.entries.filter((e) => e.kind === 'spend' && e.ref !== undefined && !ids.has(e.ref)).length;
    }
    expect(adversarial).toBeGreaterThan(0); // measured, not assumed: the old buggy code would fail the next test
  });

  it('never reports ownership or affordability of something that is not a catalog listing', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { catalog, listings } = randomCatalog(seed);
      const ledger = randomLedger(seed, 40);
      const ids = new Set(listings.map((l) => l.id));

      for (const viewerId of [...ACCOUNTS, 'author-x', 'author-y', 'stranger']) {
        const view = buildWalletView(catalog, ledger, viewerId);
        for (const owned of view.ownedTemplateIds) expect(ids.has(owned)).toBe(true);
        for (const affordable of view.affordableTemplateIds) expect(ids.has(affordable)).toBe(true);
        expect(view.balanceCents).toBe(balanceOf(ledger, viewerId));
        expect(view.catalogSize).toBe(listings.length);
      }
    }
  });
});
