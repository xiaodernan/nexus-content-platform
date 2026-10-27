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
