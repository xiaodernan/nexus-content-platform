# 0020 — The refund mechanism: reversing one purchase, atomically

- **Status:** Accepted (the mechanism is landed and proven; no policy decides WHEN a refund is allowed)
- **Date:** 2026-10-27
- **Milestone:** M8 (Creator Economy)
- **Extends:** 0019 — which bounded refunds OUT as a policy; this record adds the MECHANISM and leaves the policy open

## Context

ADR 0019 landed the credits ledger with `CreditEntry.kind` including `'refund'`, and bounded refunds out:
*"no refund policy … a revenue share is a policy this layer has no business inventing."* The bound was
right about POLICY and wrong about MECHANISM: the kind was a supported shape with **no writer**, so a
refunded purchase could only be expressed by hand. Meanwhile ownership was derived from `spend` entries,
which means a refund that merely appended a `refund` entry would leave the buyer *owning* what they had
been paid back for — the ledger would disagree with itself.

## Options

| Option | What it is | Why not |
|--------|-----------|---------|
| **A. Leave refunds out** | keep 0019's bound | The `'refund'` kind stays dead, and the first host that needs a refund invents one outside the model |
| **B. A refund policy in this layer** | decide when a refund is allowed (window, reason, approval) | A policy is the host's or a service's; inventing one here is exactly what 0019 refused |
| **C. A refund MECHANISM, policy left open** | a pure `refundPurchase` that reverses one recorded purchase correctly | Chosen |

## Decision

**C.**

1. `refund.ts` exposes `refundPurchase(catalog, ledger, {templateId, buyerId, entryId, at})`. It refuses
   by name: an unknown template; a blank `buyerId`/`entryId`; no purchase to refund; a purchase already
   refunded; a recorded price that is not positive; an author who cannot cover the claw-back.
2. **The purchase is the fact.** The buyer is credited the price the PURCHASE recorded
   (`-purchase.delta`), not the listing's price today. A creator may have repriced since; refunding the
   new price would invent a movement that never happened.
3. **Atomic.** The buyer's credit and the author's claw-back are appended together or neither is. A
   refund that credited the buyer and failed to debit the author would mint credits.
4. **Ownership is NET of refunds.** `credits.ts` gains `heldRefsOf(ledger, accountId)`: `spend − refund`
   per ref, held when the net is positive. The wallet view and the remix right BOTH read that one
   answer, so a refunded purchase stops being ownership and stops granting a remix, and a re-purchase
   starts both again. This replaces the two inline "any spend ref" scans that would otherwise disagree.

## Reason

- It closes a real gap without deciding a policy: the mechanism is arithmetic, the policy stays the host's.
- Net-of-refunds is the only ownership rule that survives a refund AND a re-purchase; a simple "refunded
  set" would wrongly deny a buyer who bought the same template again.
- One shared `heldRefsOf` keeps the derived-not-stored discipline 0019 set: there is no second ownership
  list to drift from the ledger.

## Tradeoffs

- **Accepted:** no policy. Nothing decides when a refund is allowed, who may request one, or whether the
  author consents. A host that exposed `refundPurchase` directly would let a buyer reverse any purchase at
  will — the bound is stated, not hidden.
- **Accepted:** the author must be able to cover the claw-back. A creator who has already spent the money
  cannot be refunded until they hold it; the mechanism refuses rather than driving the author negative.
- **Accepted:** a refund does not touch the catalog or a listing's price; it reverses one recorded movement.
- **Rejected:** refunding the listing's current price (invents a movement), a refund window (policy), and a
  partial refund (a different mechanism with its own arithmetic).

## Consequences

- `apps/studio/src/lib/refund.ts` + `refund.test.ts` (8 cases); `credits.ts` gains `heldRefsOf` (+2 cases).
- `walletView.ts` and `templateRemix.ts` now read `heldRefsOf`; their suites gain refund cases.
- The proof gains §9 (a refund reverses ownership and the remix right, and is not repeatable) and the
  mutation probe gains M13 (a purchase refunded twice) → 13/13 killed.
- ADR 0019 is unchanged: its "no refund policy" bound still holds. This record adds the mechanism only.

## Amendment 1 (v529, studio) — refunds PAIR with purchases: the n-th refund reverses the n-th purchase

- **The false sentence, corrected where it stands.** The Consequences above say a refund "is not repeatable". Read as a per-REF rule, it refused the second refund of a template a buyer had refunded and then bought AGAIN — the second purchase was never refunded, so the refusal was reversing a fact that had not happened. The rule narrows to: a refund is not repeatable for the SAME purchase; purchases and refunds pair in order (FIFO).
- **The repair.** `refundPurchase` counts the buyer's spends and refunds of the template and reverses `purchases[refunds.length]` — the OLDEST unrefunded purchase — at ITS recorded price. A refund is still refused when the counts are equal; after a refund the balance returns to where it began.
- **Files:** `apps/studio/src/lib/refund.ts` (the pairing), `refund.test.ts` (+1 case: buy → refund → buy → refund succeeds; a third refund is refused), `m8Invariants.test.ts` (the seeded property now exercises the two-refund path), `docs/evidence/studio/credits-proof.mjs` (§9 gains the re-purchase leg), `mutation-probe.mjs` (M13's target reads the pair, not the ref).
- **Measured (2026-10-27):** studio suite **2686/2686**; `tsc --noEmit` 0; `eslint . --max-warnings=0` 0; `next build` clean; `verify:credits` **17/17** in a real browser, including "the refunded listing can be bought again" and the ledger persisting across a reload.
- **Bounds (§60), stated.** The POLICY question remains open and belongs to the host or a future service: nothing here decides WHEN a refund is allowed, only that one refund pairs with one purchase. The ledger is still local; a refund over a service-held ledger must re-run these rules server-side.

## Amendment 2 (v530, studio) — the POLICY half: a host declares a window, and the mechanism obeys it

- **The open bound, closed as a SHAPE rather than a business rule.** The Tradeoffs above say "no policy" and ADR 0019 repeats it. This amendment adds the missing half without inventing a rule: `refundPolicy.ts` declares `RefundPolicy` — one field, `windowMs: number | null` — and applies it. `NO_REFUND_DEADLINE` names the "no deadline" choice, so a surface never has to guess whether silence meant "always" or "never".
- **The order is the point.** `refundPurchaseUnderPolicy` validates the policy, asks the mechanism WHICH purchase the refund would reverse (`refund.ts` now exports `purchaseAwaitingRefund`, the single owner of FIFO pairing), measures the window from THAT purchase's own instant, and only then runs `refundPurchase`. A closed window refuses before anything is appended: the ledger handed in is untouched.
- **Three rules, each pinned.** (a) The policy never answers a question the mechanism owns — a buyer with no purchase gets "holds no purchase", not a window opinion. (b) The window follows the purchase that would be reversed, not the newest one, so a re-purchase starts its own window. (c) The closing instant is INCLUSIVE: `now === purchase.at + windowMs` is inside, the next millisecond is outside.
- **A broken declaration is refused by name.** `{}`, a negative, a `NaN` or an `Infinity` window is refused with the value quoted; none of them is read as "no deadline". Host-supplied data is a boundary, so it is checked rather than trusted.
- **The demo is the host.** `/credits` gains a policy strip: it declares "no deadline" by default (the same behaviour the surface had) and offers a 30-day window as ITS OWN example — not a model default. The demo's purchase is recorded at a fixed 2023 instant, so switching to 30 days and pressing Refund produces a visible refusal ("…closed 1047 day(s) ago") while the wallet stays at 500 and `tpl-saas` stays held; switching back allows the same refund (500 → 1000).
- **Files:** `apps/studio/src/lib/refundPolicy.ts` + `refundPolicy.test.ts` (19 cases); `refund.ts` (`purchaseAwaitingRefund`, and `refundPurchase` now reads it); `components/CreditsPanel.tsx` (policy strip + `refundPurchaseUnderPolicy`); `tools/harness/studio-credits.mjs` (+4 checks); `docs/evidence/studio/credits-proof.mjs` (§10 + `refundPolicy` in the module graph); `mutation-probe.mjs` (M15–M18).
- **Measured (2026-10-27):** studio suite **2711/2711** (138 files); `tsc --noEmit` 0; `eslint . --max-warnings=0` 0; `next build` clean; harness **21/21** in a real browser (including the closed-window refusal leaving the local ledger untouched); the proof passes §1–§10; the mutation probe **18/18 KILLED**, with M18 showing the new policy tests are what pin "measure the window on the purchase FIFO would reverse".
- **Bounds (§60), stated.** The window is the only rule declared. Nothing here decides who may ask (the buyer is the mechanism's caller), whether an author consents, or how a service would store a per-listing policy; a service-held ledger must re-run this layer server-side. ADR 0019's "no policy" bound narrows to "no policy CONTENT — a shape, and the host still chooses the window".

## Amendment 3 (v531, studio) — the PREFLIGHT: the same gate answers before a click

- **The gap.** Amendment 2 could only refuse a refund AFTER the click: `/credits` offered a Refund button inside a closed window and reported the refusal in an error banner. A surface that knows an action cannot succeed should not invite it — but a second "is it allowed?" implementation would be a second owner of the rules, and the two would drift.
- **One gate, two readers.** The policy layer gains a private `refundGate`: validate the declaration, ask the mechanism's `refundPairing` (now the single owner of listing existence, `buyerId`, FIFO pairing, a positive recorded price and author solvency), then measure the window on the purchase FIFO would reverse. `refundPurchaseUnderPolicy` writes only when the gate passes; `refundEligibility` returns the gate's answer — `{eligible: true, purchaseAt, closesAt, priceCents}` or `{eligible: false, reason}` — without appending anything.
- **The `entryId` is not part of the preflight.** It is the host's idempotency key for the write, and a question that writes nothing has no key to give. Structural refusals keep their mechanism sentences ("holds no purchase", "already been refunded", "cannot cover it") because `refundPairing` owns them: a policy never answers a question the mechanism owns, and a preflight never invents one.
- **The surface uses it honestly.** `/credits` disables the Refund action when the preflight refuses, puts the gate's sentence in the button's `title`, and marks it `data-credits-refund-blocked`; pressing a disabled button is inert, so the ledger does not move. The click itself still re-runs the gate with its own `Date.now()` — a stale render can never authorise a write.
- **Files:** `apps/studio/src/lib/refundPolicy.ts` (`refundGate`, `refundEligibility`), `refund.ts` (`refundPairing` as the sole structural owner; `refundPurchase` reads it), `refundPolicy.test.ts` (+8 cases; 27 total), `components/CreditsPanel.tsx`, `tools/harness/studio-credits.mjs` (the refusal check became three: disabled+named, an inert press, re-enabled), `docs/evidence/studio/credits-proof.mjs` (§10), `mutation-probe.mjs` (M19).
- **Measured (2026-10-28):** studio suite **2729/2729** (138 files); `tsc --noEmit` 0; `eslint . --max-warnings=0` 0; `next build` clean; harness **23/23** in a real browser (the disabled action carries the window sentence; pressing it moves nothing; switching back re-enables it and the same refund succeeds 500 → 1000); the proof passes §1–§10; the mutation probe **19/19 KILLED**, with M19 showing the eligibility tests pin the closing instant it reports.
- **Bounds (§60), stated.** The preflight answers a question about a GIVEN ledger at a GIVEN instant; it promises nothing about the write (an idempotency key, a concurrent append and the host's own checks are still the caller's), and it is not a reservation — nothing is held between the preflight and the write. The policy-content bound of Amendment 2 is unchanged.

## Amendment 4 (v532, studio) — the claw-back gets its own NAME: it is not a purchase

- **The defect, named where it stood.** Since the mechanism landed, `refundPurchase` wrote the seller's side as `kind: 'spend'`. Everything downstream then told a false story: `heldRefsOf` counts a `spend` per ref as +1, so the ledger claimed the AUTHOR held a template because they had just LOST a sale on it; the creator dashboard's `spent` (any negative delta) reported the claw-back as the author buying something; and the statement's `earned` (any positive delta) reported a buyer's returned money as income. None of these was a rounding error — each was one movement called by a name it does not mean.
- **The decision.** `CreditEntry.kind` gains `'clawback'` — by definition NEGATIVE — and the seller's entry uses it. The buyer's side stays `'refund'` — by definition POSITIVE. `appendCreditEntry` refuses an entry whose sign contradicts its kind, and `validateCreditLedger` names the same contradiction (`refund-sign`, `clawback-sign`) for a record that did not come from the appender.
- **One classification, two readers.** `credits.ts` gains `creditFlowOf(entry)` → `{kind: 'earned' | 'spent' | 'refunded' | 'clawedBack', amount}`. The creator dashboard and the settlement statement BOTH read it, so one movement cannot be income in one projection and spending in the other. Both identities grew the same two buckets: `earned − spent + refunded − clawedBack` is the balance, and `opening + earned − spent + refunded − clawedBack + after` is the whole-ledger balance over any window.
- **`heldRefsOf` ignores a claw-back, deliberately.** It carries the listing's ref because it reverses a movement about that listing, but it is not a purchase by the seller: losing a sale must never read as acquiring the template. Only `spend` and `refund` move the ownership count.
- **The wire format keeps version 1.** The ENVELOPE did not change; the kind vocabulary is part of it. A reader that predates `clawback` refuses the record by name ("unknown kind") rather than mis-reading it — the safe failure `ledgerStore.ts` already promised. No stored ledger from before this amendment contains the kind, so nothing is migrated.
- **Files:** `apps/studio/src/lib/credits.ts` (kind, sign rules, `creditFlowOf`), `refund.ts` (the seller entry), `creatorDashboard.ts` (`refunded` / `clawedBack` and the line), `settlement.ts` (the two buckets, the closing identity, the line), `ledgerStore.ts` (`KINDS`); tests — `credits.test.ts` (+4), `creatorDashboard.test.ts` (+1 and the identity now covers a refunded ledger), `settlement.test.ts` (+2 and the identity), `ledgerStore.test.ts` (+1 round-trip over a clawback), `refund.test.ts` (the kind, and the seller does not gain ownership); `docs/evidence/studio/credits-proof.mjs` (§4 identity, §9 the claw-back is named and both projections separate it), `mutation-probe.mjs` (M20–M23), `tools/harness/studio-credits.mjs` (check 6b: the rendered dashboard says `clawed back 500` / `spent 0` and the statement says `refunded 700` after the two refunds).
- **Measured (2026-10-28):** studio suite **2737/2737** (138 files); `tsc --noEmit` 0; `eslint . --max-warnings=0` 0; `next build` clean; harness **24/24** in a real browser (creator `holds 100 · earned 600 · spent 0 · refunded 0 · clawed back 500`, statement `+1000 / −700 · refunded 700 … reconciles: yes`); the proof passes §1–§10; the mutation probe **23/23 KILLED**, with M20 (kind reverted to `spend`), M21 (classifier ignores the kind), M22 (closing forgets the buckets) and M23 (claw-back counted as spending) each caught by the suite.
- **Bounds (§60), stated.** Nothing about WHEN a refund may be asked, WHAT it reverses or WHO may ask changes; a refund is still two atomic entries and one FIFO pair. A negative `adjust` is still classified as `spent` and a positive one as `earned` — an adjustment is a correction, not a trade, and this layer does not pretend to know which way it "should" read. A service-held ledger must re-run the kind/sign rules server-side.
