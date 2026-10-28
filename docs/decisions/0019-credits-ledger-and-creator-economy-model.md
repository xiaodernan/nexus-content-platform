# 0019 — The credits ledger and the creator-economy model layer

- **Status:** Accepted (the model layer is landed, tested and proven; the server half and payment are not built)
- **Date:** 2026-10-27
- **Milestone:** M8 (Creator Economy)

## Context

M8 names four pillars: marketplace, templates, credits, subscriptions. By 2026-10-27 the parallel lane
had built the subscriptions/plans/tips surface (`monetization.ts`, `economy.ts`, `economyLane.ts`,
`economyServer.ts`, `planLane.ts`, `planServer.ts`, `tipLane.ts` + tests) over a service whose
monetization endpoints are still blocked by ADR 0018's enforcement gap. What did not exist was the
UNIT OF ACCOUNT the rest of the economy could be priced against: measured 2026-10-25, the word
"credit" had zero occurrences under `apps/studio`, `services/nexus-api`, `packages` and `agents`.

Two forces shaped the design:

1. **§60.** A creator economy is exactly the kind of surface where a UI can *look* correct while the
   arithmetic underneath is wrong — a stored balance that drifts from its history, a purchase that
   debits the buyer and fails to credit the author, a statement that does not reconcile.
2. **ADR 0010 (determinism).** A model that reads a clock or a random id cannot be replayed, so every
   instant and every id is HOST-SUPPLIED.

## Options

| Option | What it is | Why not |
|--------|-----------|---------|
| **A. A stored balance per account** | `accounts[accountId] = 500` | A second spelling of one fact; two spellings drift, and the balance cannot be audited against its history |
| **B. Per-purpose records** | purchases, tips and subscriptions each keep their own list | N lists that can disagree; the same movement gets recorded twice |
| **C. An append-only ledger with a DERIVED balance and OPAQUE refs** | one `CreditEntry[]`; `balance = sum`; `ref` names what a movement was for | Chosen |

## Decision

**C**, as a pure model layer that stores nothing and decides nothing.

1. **The ledger is append-only and the balance is DERIVED.** `credits.ts`: `CreditEntry {id, accountId,
   delta, reason, at, kind, ref?}`; `balanceOf` sums the entries; there is no stored balance. An entry
   id is an IDEMPOTENCY KEY (a retry is refused, never applied twice); a delta must be a non-zero
   INTEGER; a spend may not drive a balance below zero. `validateCreditLedger` replays EVERY prefix and
   names the entry that dipped negative — and names a non-finite `at` or a blank `reason`, the fields a
   settlement window reads.
2. **The catalog is the inventory, and every view is derived.** `templateCatalog.ts`: listings with
   normalized tags; search is HONEST exact-token AND (no synonyms, no fuzzy "did you mean"), and a
   query that matches nothing answers nothing. Sort and filter views are computed, never stored.
3. **A purchase is ONE atomic transaction of TWO entries.** `marketplace.ts`: the buyer's debit and the
   author's credit are appended together, or the whole purchase is refused; both carry the template id
   in `ref`, so "what did this account buy" is derived from the ledger. A free template is CLONED, not
   bought; an author cannot buy their own listing.
4. **Ownership is derived, never stored.** A viewer owns a template iff the ledger has a `spend` entry
   whose `ref` NAMES that template, or they authored it. `walletView.ts` counts a ref as ownership only
   when it resolves to a catalog listing — the ledger is shared, so a subscription's plan id in `ref`
   must not read as template ownership (a defect found after the first proof and fixed).
5. **A statement reconciles by arithmetic, not by decoration.** `settlement.ts`:
   `opening + earned − spent + after === the whole-ledger balance`, for every account and every window;
   `after` carries the entries past a bounded window's close. The identity is pinned by tests and by a
   seeded invariant suite, not asserted in prose.
6. **A remix forks a NEW document id.** `templateRemix.ts` calls the Design Model's `forkDocument`, so
   a remix can never re-publish over its source; it catches the fork's throw on a malformed graph and
   reports the reason by name. A remix moves NO credits — you already own the template.
7. **The dashboard and the wallet are projections, not authorities.** `creatorDashboard.ts` composes
   credits + catalog + marketplace for the creator; `walletView.ts` for the buyer. Neither verifies the
   `viewerId` it is handed: per ADR 0018 a claim is carried and labelled, and only the service could
   verify one.

## Reason

- One ledger cannot disagree with its own history, and every consumer — dashboard, statement, wallet,
  marketplace — reads the same bytes.
- Opaque `ref` is what lets ONE ledger serve purchases, subscriptions and tips without holding a
  second, purpose-specific list: the consumer interprets the ref it wrote.
- Host-supplied `at` and ids keep the whole layer replayable (ADR 0010), so a proof can pin an exact
  sequence and a test can name a known case.
- The atomic two-entry purchase is the smallest rule that makes "a buyer is never debited for a sale
  that did not land" true by construction rather than by hope.

## Tradeoffs

- **Accepted:** no server half. There is no endpoint, no persistence and no payment; the ledger is
  arithmetic over bytes a caller hands in. Until a service owns it, a balance is only as trustworthy as
  the entries it is given.
- **Accepted:** no platform fee, no payout schedule and no refund policy. The author receives the whole
  price; a revenue share is a policy this layer has no business inventing.
- **Accepted:** a buyer CAN buy the same template twice — nothing refuses it. That is a stated bound,
  not an oversight: the refusal set is deliberately small, and a double purchase is a policy decision
  for the server that owns the ledger.
- **Accepted:** the wallet's `affordable` is the marketplace's own gate, so a listing the viewer already
  owns can still appear affordable (they can, in fact, buy it again). A panel that wants a "still to
  buy" list should subtract `owned`.
- **Accepted:** `viewerId` is unverified. A dashboard built from an unverified id shows what that id
  holds; it does not pretend the id is authentic.

## Consequences

- Seven pure modules under `apps/studio/src/lib/`: `credits.ts`, `templateCatalog.ts`, `marketplace.ts`,
  `creatorDashboard.ts`, `settlement.ts`, `templateRemix.ts`, `walletView.ts`.
- 84 tests across 8 files, including a SEEDED invariant suite (`m8Invariants.test.ts`) that pins the
  properties over hundreds of generated ledgers, catalogs, windows and viewers.
- A runnable §32 proof: `docs/evidence/studio/credits-proof.mjs` (`npm run verify:credits`) exercises
  the SHIPPED modules end-to-end — ledger, catalog, atomic marketplace, reconciling statement, remix
  fork, derived wallet — and asserts HEAD is unchanged.
- The ROADMAP's M8 row records the model half honestly. The server half and the Studio UI wiring remain
  open, and the lane's subscriptions/plans/tips stay blocked by ADR 0018.

## Amendment 1 (v529–v530, studio) — the refund mechanism and its policy SHAPE

- The "no refund policy" bound in Tradeoffs narrows rather than disappears. Two pure modules were added beside the seven above: `refund.ts` (the MECHANISM: reverse one recorded purchase atomically, pay the recorded price, claw the author back, pair the n-th refund with the n-th purchase — ADR 0020 + its Amendment 1) and `refundPolicy.ts` (the POLICY SHAPE: a host declares `windowMs: number | null`, `NO_REFUND_DEADLINE` names "no deadline", the window is measured from the purchase FIFO would reverse, the closing instant is inclusive, and a broken declaration is refused by name — ADR 0020 Amendment 2).
- What remains the host's: WHO may ask (the mechanism's caller), whether an author consents, where a service stores a per-listing policy, and how a service-held ledger re-runs either layer server-side. The modules still invent no business rule; they make one declarable and apply it.
- The seven-module Consequences above are now nine, and `credits-proof.mjs` gains §9 (refund) and §10 (policy).

## Amendment 2 (v539, studio) — a catalog can RETIRE a listing, and a retire erases nothing the record says

- **The gap, named where it stood.** Decision 2's catalog could only ADD: `addTemplate` was its only writer, so a listing was immortal once it landed, and "a listing that LEFT the catalog" — the situation the refund mechanism learned to reverse from the record in v538 — had no producer at all; it could only be reached by a hand-built fixture. Take-down is not a detail of this economy: an author withdraws a template, a host removes one that breaks the rules, and a shelf that can only grow is not a shelf a creator would publish to. Worse, decision 4's ownership rule ("a ref counts only when it resolves to a catalog listing") means a retire, once it existed, would have ERASED ownership of a template someone paid for: the shelf would overrule the record.
- **The verb.** `retireTemplate(catalog, id)` returns the NEW catalog and the withdrawn listing, or refuses BY NAME — an empty id, an id the catalog does not carry, and a SECOND retire of the same id (which is an error the caller must see, not a silent no-op). It is pure: the input catalog is untouched, the remaining listings keep their order, and the ledger is not consulted — a take-down is a decision about what is FOR SALE, never about what was bought. A retired id may be ADDED again, as the same listing or under a different author, because a catalog is a window that can reopen; the earlier purchase stays with whichever account the SALE credited.
- **Ownership follows the record when the shelf forgets.** Decision 4 is refined: a viewer owns a ref the catalog lists OR a ref the RECORD shows was SOLD. The distinguishing fact is the one the marketplace writes — a purchase and its sale at ONE instant, both carrying the ref — so a subscription's plan id (never sold by anyone) still cannot read as a template, while a retired listing the buyer paid for still does. `saleOfPurchase` moved from `refund.ts` to `marketplace.ts`, beside the paired write that makes it true, so the refund mechanism and the wallet ask ONE owner rather than each re-deriving it; `refSoldIn(ledger, ref)` is the wallet's read over that owner.
- **Files:** `apps/studio/src/lib/templateCatalog.ts` (`TemplateRetireDecision`, `retireTemplate` and its doc), `marketplace.ts` (`saleOfPurchase` moved in, `refSoldIn`), `refund.ts` (imports the sale lookup instead of defining it), `walletView.ts` (the `listed || refSoldIn(...)` ownership rule), `templateCatalog.test.ts` (+3: withdraw/order/purity, the three refusals by name, re-listing under a new author), `walletView.test.ts` (+1: a retired ref the record sold is still owned; the plan-id case now proves the record never sold it), `marketplace.test.ts` (+2: the sale is the paired instant, and a grant at another instant is not one), `docs/evidence/studio/credits-proof.mjs` (§11 and the HEAD check renumbered §12), `mutation-probe.mjs` (M31: a retire removes nothing; M32: ownership falls back to the shelf alone — M08 retargeted at the new rule), `docs/evidence/studio/README.md` and `docs/ROADMAP.md`.
- **Measured (2026-10-28):** the M8 slice 98/98 (catalog 19, marketplace 14, wallet 11, refund 14, policy 31, invariants 9); studio suite **2776/2776** (140 files — the tree also carried the parallel lane's additions); `tsc --noEmit` 0; `eslint . --max-warnings=0` 0; `next build` clean; the browser harness **31/31** against the freshly built `next dev` on 3211 (unchanged — the page offers no retire action yet, so this increment adds a capability without altering a sentence it already renders); the proof passes §1–§12 (§12 HEAD `c424747cdf11`, re-read at run time rather than assumed), reading `the listing withdrew cleanly … the buyer still OWNS the retired ref … the refund made the buyer whole (1000) and clawed back exactly the recorded seller (0), naming "tpl-paid" (not in this catalog); the retired id re-listed under a new author`; the mutation probe **32/32 KILLED** (the 32-arm run was ALL KILLED on 2026-10-28; its wall time was not separately recorded).
- **Bounds (§60), stated.** The record can only answer for refs the marketplace SOLD: a hand-built ledger holding a purchase with no paired grant leaves a retired ref unowned, and a refund for it is refused by name — the catalog is the only fallback, exactly as v538 stated. A retire never refuses because purchases exist: withdrawing a listing does not owe its buyers anything by itself, and whether it should is a host policy this model does not invent. The surface does not offer a retire action yet, so the browser harness cannot demonstrate one, and the `/credits` page still lists only what the catalog carries. And `refSoldIn` scans the ledger per consult: the demo ledgers are tiny, and an indexed read is a host's optimisation rather than a rule.
## Amendment 3 (v540, studio) — the shelf can take a listing DOWN, and the STORE keeps what the record says you own

- **The bound, closed where it stood.** Amendment 2 built `retireTemplate` and then recorded, in its own Bounds, that "the surface does not offer a retire action yet, so the browser harness cannot demonstrate one, and the `/credits` page still lists only what the catalog carries". That is how a model increment usually ends — a capability with no producer on the page — and it left the point of the increment unmeasured in a browser: whether a person who PAID for a listing can still see it and reverse it after the shelf withdraws it.
- **The surface.** The STORE section gains a `Retire` control on every listed row, and the page holds the shelf in state (`catalog`) instead of reading the fixture's catalog through the render, so a take-down applies a NEW catalog — pure model in, pure model out, no ledger write. `onRefund` now takes a REF rather than a listing: a retired purchase has no listing left to hand over, and the record is what the mechanism reads anyway.
- **The one new model fact: the rows.** `storeRows(catalog, ledger, viewerId)` answers the catalog's listings in their own order, followed by every ref `buildWalletView` says this viewer still owns that the shelf no longer carries — sorted, marked `listed: false`. It INHERITS the v539 ownership rule instead of re-deriving it, so a plan id (never sold) cannot appear, and a retired listing NOBODY bought is not a row: the shelf forgot it and it is not yours. The page renders such a row with the ref where a title was, `—` where the shelf's author and price were, the state `owned · retired, no longer listed`, and the same Refund action — whose eligibility the policy layer answers from the RECORD.
- **Files:** `apps/studio/src/lib/walletView.ts` (`StoreRow`, `storeRows`), `walletView.test.ts` (+3), `components/CreditsPanel.tsx` (catalog state, `onRetire`, ref-based `onRefund`, rows from `storeRows`, a `Retire` control and `data-credits-retired` per row), `tools/harness/studio-credits.mjs` (+3 browser checks), `docs/evidence/studio/credits-proof.mjs` (§11 also proves the rows), `docs/evidence/studio/mutation-probe.mjs` (M33/M34), `docs/evidence/studio/README.md` and `docs/ROADMAP.md`.
- **Measured (2026-10-28):** the M8 slice 101/101 (wallet now 14); studio suite **2779/2779** (140 files); `tsc --noEmit` 0; `eslint . --max-warnings=0` 0; `next build` clean (`/credits` 8.74 kB); the browser harness **34/34** against the rebuilt `next dev` on 3211, including the three retire checks — an unowned listing leaves the shelf and the header reports 2; the listing the buyer paid for keeps its row, marked retired, still owned at balance 800, with an enabled Refund; pressing it makes the buyer whole (1000), releases the hold and the row leaves with no error; the proof passes §1–§12 (§12 HEAD `acc50aaab30d`), reading the store's rows off the same §11 fixture (`[free listed, paid retired]` for the buyer, `[free listed]` for a stranger); the mutation probe **34/34 KILLED** (M33 drops the retired row; M34 makes every shelf row read as retired).
- **Bounds (§60), stated.** A retire on this page is a LOCAL shelf operation and is not persisted (`catalogStore` can persist a catalog, the page does not save this one), so a reload returns the fixture's shelf — a host that owns the shelf is where persistence belongs. ANY row may be retired because the page IS the host in DEMO MODE and there is no account authority on it; who may take a listing down is a host policy, and ADR 0018 blocks a service that would enforce one. A retired row names the REF where a title was, because the record never stored one — the catalog was the only place a title lived, and inventing one back would be the same mistake v538's `"ref" (not in this catalog)` sentence refuses. And `storeRows` scans the owned set per call: tiny here, an index a host's business.