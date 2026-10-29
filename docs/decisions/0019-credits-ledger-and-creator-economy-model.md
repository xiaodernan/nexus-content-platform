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
## Amendment 4 (v541, studio) — the shelf is LOCAL-FIRST too, so a retire survives a reload

- **The bound, closed where it stood.** Amendment 3 recorded that "a retire on this page is a LOCAL shelf operation and is not persisted (`catalogStore` can persist a catalog, the page does not save this one), so a reload returns the fixture's shelf". That was the shape of the gap: `catalogStore` had a format, a loader, a writer and a suite since the catalog landed, but NO producer on any page — a store nothing writes to is a format, not a feature — and the take-down Amendment 3 measured vanished on the first refresh.
- **The wiring.** The page's shelf is now READ from `catalogStore` on mount (`nexus.catalog.v1`): an ABSENT key gives the empty shelf, and a CORRUPT one is refused by name, so a fresh page offers nothing to buy until `Load demo` writes the fixture's shelf; `loadDemo` SAVES the fixture shelf before it renders it; `Retire` persists the NEW catalog with `saveCatalog` BEFORE `setCatalog`, so what the page shows is what was written; `Clear` writes an empty ledger AND an empty shelf. The catalog's initial state is `emptyTemplateCatalog()` rather than the fixture, so no render ever shows a shelf that was neither read nor saved.
- **Files:** `apps/studio/src/components/CreditsPanel.tsx` (the read/save/clear wiring), `apps/studio/src/lib/catalogStore.test.ts` (+1: a retired shelf — one listing, the retired id gone — round-trips through save/load with `source: 'stored'` and a deeply equal catalog), `tools/harness/studio-credits.mjs` (+1 browser check, 6f: after a retire, a FULL page reload reads back one listing, no retired row, `balance: 1000 credits` and a header of `1 listing(s)`), `docs/evidence/studio/credits-proof.mjs` (§11 now also saves the retired shelf and reads it back; MODULES gains `catalogStore`), `docs/evidence/studio/mutation-probe.mjs` (M35: the loader accepts a format version it does not know), `docs/evidence/studio/README.md` and `docs/ROADMAP.md`.
- **Measured (2026-10-29):** `catalogStore` + `walletView` 26/26; studio suite **2802/2802** (140 files — the tree also carried the parallel lane's uncommitted tests); `tsc --noEmit` 0; `eslint . --max-warnings=0` 0; `next build` clean (`/credits` 9.06 kB, 112 kB first load); the browser harness **35/35** against the rebuilt `next dev` on 3211, including the reload check — a full navigate to `/credits` after a retire reads one listing, zero retired rows, `balance: 1000 credits`, header `1 listing(s)`; the proof passes §1–§12 (§12 HEAD `6222b7f066d4`, re-read at run time rather than assumed), with §11 reading that the retired shelf "SAVED and READ BACK unchanged"; the mutation probe **35/35 KILLED** (M35 survives none: the version gate is pinned).
- **Bounds (§60), stated.** The shelf lives in `localStorage` under one versioned key: a browser that clears site data loses it, and a host that owns the shelf is where a durable one belongs (ADR 0018 still blocks the service). The format is version 1 and REFUSES an unknown version rather than guessing a migration; a saved shelf is bytes a person can edit, and the loader re-validates only what the format itself can check — the catalog is not a signature. `storeRows` still scans the owned set per call, and the page still trusts the `viewerId` it is handed, exactly as Amendment 3 and ADR 0018 state. And a retire persists a SHELF, not a decision log: nothing in the browser says WHO took a listing down or WHY, which is a service record this layer does not invent.

## Amendment 5 (v542, studio) — a take-down can be PUT BACK, and the shelf remembers what it withdrew

- **The bound, closed where it stood.** Amendment 4 saved the shelf and then recorded the next gap in its own words: a retire persisted "a SHELF, not a decision log", and the catalog's format kept only what was FOR SALE. That made a take-down a DELETE at the storage layer: the listing left `listings` and nothing else remembered it, so the only way back was to re-publish the bytes from somewhere else. A shelf an author cannot undo is a shelf people will hesitate to use, and "retire" on a page that can never put the listing back is one-way without saying so.
- **The format change, and the migration rule.** `catalogStore` format 1 → 2 adds a `withdrawn` list BESIDE `listings`: the same listing records, kept apart from the shelf. The two lists are ONE inventory, so a version-2 document that names one id in both is refused BY NAME (`template X is both listed and withdrawn`) — a listing cannot be simultaneously for sale and taken down — and a duplicate id inside either list is refused through the same `addTemplate` rebuild the loader already used. A version-1 document is MIGRATED, not rejected: it loads with `withdrawn: []`, because the absence of a withdrawal record in a document written before any were kept is a truthful reading, not corruption. Every write is format 2 (`serializeCatalog` always states `version: 2`), and `saveCatalog` rebuilds BOTH lists before writing, so the store cannot persist a document its own loader would refuse.
- **The key did NOT move.** It stays `nexus.catalog.v1`. A key is a namespace, not the document's version: renaming it to match the format would orphan every shelf already written under it, which is the exact failure the migration rule exists to avoid.
- **The surface.** The page now holds `withdrawn` beside `catalog`, read on mount and written with every change. `Retire` MOVES the listing (`[...withdrawn, decision.listing]`) and saves; a new `Put back` re-ADDS the remembered listing through `addTemplate` — the same validation a publish gets, not a second path — removes it from the record, and saves in the same write. The withdrawn record renders in its own strip OUTSIDE the STORE card (`data-credits-withdrawn-strip`, one `data-credits-withdrawn="<id>"` row per take-down with its title, price and `data-credits-relist` action), so the card's count still says what is FOR SALE without also counting what is not. `Load demo` and `Clear` write an empty withdrawal record rather than leaving a stale one.
- **Files:** `apps/studio/src/lib/catalogStore.ts` (format 2, `readShelf`, the migration branch, the cross-list refusal, withdrawn-aware `serializeCatalog`/`loadCatalog`/`saveCatalog`), `catalogStore.test.ts` (+5: the withdrawn round-trip and the written format, the version-1 migration, the both-lists refusal, a duplicate inside the record, and a save that refuses to write an overlapping document), `components/CreditsPanel.tsx` (withdrawn state, `onPutBack`, the strip), `tools/harness/studio-credits.mjs` (+4 browser checks, 6g), `docs/evidence/studio/credits-proof.mjs` (§11 also saves a withdrawn record, reads it back, puts the listing back, and migrates a version-1 shelf), `docs/evidence/studio/mutation-probe.mjs` (M35 retargeted at the widened version gate, plus M36 the old format on write, M37 the overlap refusal disabled, M38 the migration branch removed), `docs/evidence/studio/README.md` and `docs/ROADMAP.md`.
- **Measured (2026-10-29):** `catalogStore` 17/17; studio suite **2807/2807** (140 files — the tree also carried the parallel lane's uncommitted tests); `tsc --noEmit` 0; `eslint` 0; `next build` clean (`/credits` 9.66 kB, 112 kB first load); the browser harness **39/39** against the rebuilt `next dev` on 3211, including the four 6g checks — retiring the LAST listed template empties the shelf (0 rows) while the WITHDRAWN strip records all three take-downs and names the newest, the record survives a FULL reload (0 rows, 3 withdrawn ids in order), `Put back` returns `tpl-saas` to the shelf (1 row) and shrinks the record to 2, and that put-back survives a reload too; the proof passes §1–§12 (§12 HEAD `0abbbf996968`, re-read at run time rather than assumed), reading that "the WITHDRAWN record round-tripped (format 2) and the listing could be put back; a version-1 shelf migrated with no withdrawals"; the mutation probe **38/38 KILLED**.
- **Bounds (§60), stated.** The withdrawn record is unbounded: this build keeps every take-down and the strip lists them all — a host that needs a retention policy, or a cap, owns it and this layer invents none. What a take-down means is still only "not for sale now": nothing here says WHO withdrew a listing, WHY, or whether its buyers should be told, and the record names no actor (ADR 0018 still blocks the service that would). A put-back restores the listing as it was remembered, including its author and price, even if the world changed while it was away: that is a shelf decision, not a re-publish — a host wanting fresh metadata publishes again under the same id, which `addTemplate` still refuses while the listing is listed. And a version-1 shelf cannot be un-migrated: once this build saves it, the document is format 2 and a build that reads only 1 would refuse it — the intended direction, since formats move forward.

## Amendment 6 (v543, studio) — a take-down has TWO exits, and the move back is one decision

- **The gap Amendment 5 left, named where it stood.** v542 taught the shelf to REMEMBER a take-down but left the move back to the caller: putting a listing back was "add it to the catalog, then filter it out of the record", two statements a page had to keep in step. Doing only the first is not a harmless slip — the pair is exactly the overlap `catalogStore` refuses to save (`template X is both listed and withdrawn`), so a hand-rolled put-back that adds without removing fails at the WRITE, after the UI has already been told it succeeded. The same contradiction blocked a re-publish: while an id sat in the withdrawal record, adding a fresh listing under that id could never be saved, and nothing in the surface could release it.
- **The verbs.** `relistTemplate(catalog, withdrawn, id)` returns the new catalog, the new record and the listing, or refuses BY NAME: an empty id, an id the record does not hold, and an id the shelf already lists (via `addTemplate`). The listing goes back through `addTemplate`, so a put-back is validated exactly as a publish is, and it leaves the record in the SAME value — one id on one side by construction, not by the caller remembering to do both. `discardWithdrawn(withdrawn, id)` is the record's other exit: it forgets exactly the named listing, refuses an unknown id, and never touches the shelf. Both are pure: inputs untouched, order preserved, no ledger consulted.
- **Why a DISCARD is not a quiet delete.** The memory shrinks only when a caller names what to forget, which is the difference between "a take-down can be accepted as final" and "a take-down quietly became a delete". It is also the only honest way an id becomes free for a NEW listing with fresh metadata: the record must release it before the store will save the new listing beside it.
- **The surface.** The WITHDRAWN strip's row gains a `Discard` action beside `Put back`, and `onPutBack` now applies `relistTemplate` rather than composing the two halves. Both write through `catalogStore` before they render, so a reload reads the same record the click produced.
- **Files:** `apps/studio/src/lib/templateCatalog.ts` (`TemplateRelistDecision`, `relistTemplate`, `TemplateDiscardDecision`, `discardWithdrawn`), `templateCatalog.test.ts` (+3: the relist moves and is pure; the two put-back refusals by name; the discard forgets one and refuses an unknown id), `components/CreditsPanel.tsx` (`onPutBack` on the model verb, `onDiscard`, the `Discard` control), `tools/harness/studio-credits.mjs` (+2 browser checks, 6h), `docs/evidence/studio/credits-proof.mjs` (§11 now puts the listing back through `relistTemplate` and discards it deliberately), `docs/evidence/studio/mutation-probe.mjs` (M39/M40), `docs/evidence/studio/README.md` and `docs/ROADMAP.md`.
- **Measured (2026-10-29):** `templateCatalog` 22/22, `catalogStore` 17/17; studio suite **2810/2810** (140 files); `tsc --noEmit` 0; `eslint` 0; `next build` clean; the browser harness **41/41** against the rebuilt `next dev` on 3211, including the two 6h checks — Discard on `tpl-starter` shrinks the record 2 → 1 (only `tpl-mobile` kept), leaves the shelf at one listing with no error, and a full reload reads that smaller record back; the proof passes §1–§12 (§12 HEAD `667c38df2b3b`, re-read at run time rather than assumed), reading that the put-back "left the listing in the withdrawal record" not at all and a discard of an unknown id is refused; the mutation probe **40/40 KILLED**.
- **Bounds (§60), stated.** `relistTemplate` restores the listing as it was remembered, even if the world changed while it was away — Amendment 5's rule, unchanged: fresh metadata is a re-publish, and a re-publish under the same id now requires a deliberate discard first. A discard keeps no tombstone: after it, nothing in this browser says the listing ever existed, which is the point of the exit and also its cost — an audit of take-downs is a service record (ADR 0018), not this store's. Neither verb is authority: the page IS the host in DEMO MODE, and who may put a listing back or accept a take-down as final is a policy this layer still refuses to invent.
