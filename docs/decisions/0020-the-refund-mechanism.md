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
