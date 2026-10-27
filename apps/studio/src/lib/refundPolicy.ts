/**
 * M8 v530 — the REFUND POLICY: WHEN a refund is allowed, kept apart from HOW one is reversed.
 *
 * <p>`refund.ts` is the MECHANISM and says so: it answers "how do you reverse this purchase
 * correctly", not "when may you". ADR 0019 refused to invent the second question, and ADR 0020 left it
 * open as a bound. This module is the missing half, and it keeps the same discipline: it does not
 * choose a business rule, it declares a SHAPE a host fills in (`RefundPolicy`) and applies it.
 *
 * <p>One field, because one field is what this layer can defend: how long after a purchase a refund
 * may be asked for. `windowMs: null` is a DECLARED policy — "this host sets no deadline" — not the
 * absence of one; `NO_REFUND_DEADLINE` names it so a surface never has to guess.
 *
 * <p>Three rules keep it honest (§60):
 * <ul>
 *   <li><b>The policy never decides whether the mechanism would reverse the purchase.</b> Pairing
 *       (FIFO), "a refund is not repeatable", the author's solvency and the listing's existence stay
 *       `refund.ts`'s answers; a policy ask with no refundable purchase is answered with the
 *       mechanism's own sentence rather than a policy opinion.</li>
 *   <li><b>The window is measured from the purchase the refund would REVERSE</b> — the oldest
 *       unrefunded one — not from the newest, so a re-purchase starts its own window.</li>
 *   <li><b>The closing instant is inclusive.</b> A refund asked at exactly `purchaseAt + windowMs` is
 *       inside the window; the first millisecond after it is outside. A boundary nobody states is a
 *       boundary every host interprets differently.</li>
 * </ul>
 */

import type { CreditLedger } from './credits';
import { purchaseAwaitingRefund, refundPurchase, type RefundDecision, type TemplateRefund } from './refund';
import { templateById, type TemplateCatalog } from './templateCatalog';

/** What a host declares about refunds. One field today; a shape so a second rule has a home. */
export interface RefundPolicy {
  /**
   * How long after the purchase a refund may be asked for, in milliseconds — or `null` for no deadline.
   *
   * <p>Any finite non-negative number is a policy this layer can apply. A negative, non-finite or
   * missing value is a broken declaration and is refused by name rather than read as "no deadline".
   */
  windowMs: number | null;
}

/** The policy a host declares when it sets no deadline at all — stated, not implied. */
export const NO_REFUND_DEADLINE: RefundPolicy = { windowMs: null };

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Why this policy cannot be applied, or null when it can. Host-supplied data is a boundary, so it is
 * checked here rather than trusted: `{}` is not "no deadline", it is a policy that never said.
 */
export function refundPolicyProblem(policy: RefundPolicy | null | undefined): string | null {
  if (!policy || typeof policy !== 'object') {
    return 'a refund needs a declared policy — windowMs: null means "no deadline", it is not the same as saying nothing';
  }
  const window = (policy as { windowMs?: unknown }).windowMs;
  if (window === null) return null;
  if (typeof window !== 'number' || !Number.isFinite(window) || window < 0) {
    return `the policy's windowMs must be null or a finite non-negative number of milliseconds, and it is ${String(window)}`;
  }
  return null;
}

/** A policy in a reader's words — "no deadline" says so out loud. */
export function describeRefundPolicy(policy: RefundPolicy): string {
  const problem = refundPolicyProblem(policy);
  if (problem) return problem;
  const ms = policy.windowMs;
  if (ms === null) return 'no deadline';
  if (ms === 0) return 'the purchase instant only';
  if (ms % DAY_MS === 0) return `${ms / DAY_MS}-day window from the purchase`;
  if (ms % HOUR_MS === 0) return `${ms / HOUR_MS}-hour window from the purchase`;
  if (ms % MINUTE_MS === 0) return `${ms / MINUTE_MS}-minute window from the purchase`;
  return `${ms} ms from the purchase`;
}

/**
 * When the window closes for a purchase made at `purchaseAt`, or null when the policy sets none.
 *
 * <p>Call it with a policy that passed `refundPolicyProblem`; an unvalidated policy is the caller's
 * bug, and quietly answering "no deadline" here would hide it.
 */
export function refundWindowClosesAt(purchaseAt: number, policy: RefundPolicy): number | null {
  if (policy.windowMs === null) return null;
  return purchaseAt + policy.windowMs;
}

/**
 * Reverse a purchase WITH the host's policy applied first.
 *
 * <p>The order is the point: the policy is validated, the purchase the mechanism WOULD reverse is
 * looked up, its own instant is compared to the window, and only then does the mechanism run. When
 * there is no refundable purchase the mechanism's refusal is returned verbatim — a policy cannot
 * resurrect a purchase that pairing or solvency would refuse.
 */
export function refundPurchaseUnderPolicy(
  catalog: TemplateCatalog,
  ledger: CreditLedger,
  refund: TemplateRefund,
  policy: RefundPolicy,
  now: number,
): RefundDecision {
  const problem = refundPolicyProblem(policy);
  if (problem) return { ok: false, reason: problem };

  // Ask the mechanism's own pairing rule WHICH purchase this refund would reverse. `refundPurchase`
  // recomputes it below; the lookup here exists so the window is measured on the same purchase and a
  // structural refusal comes back in the mechanism's words, not in a policy opinion.
  const purchase = purchaseAwaitingRefund(ledger, refund.buyerId, refund.templateId);
  if (!purchase) return refundPurchase(catalog, ledger, refund);
  if (!templateById(catalog, refund.templateId)) return refundPurchase(catalog, ledger, refund);

  const closesAt = refundWindowClosesAt(purchase.at, policy);
  if (closesAt !== null && now > closesAt) {
    const closedFor = now - closesAt;
    const late =
      closedFor >= DAY_MS
        ? `${Math.floor(closedFor / DAY_MS)} day(s)`
        : closedFor >= HOUR_MS
          ? `${Math.floor(closedFor / HOUR_MS)} hour(s)`
          : closedFor >= MINUTE_MS
            ? `${Math.floor(closedFor / MINUTE_MS)} minute(s)`
            : `${closedFor} ms`;
    return {
      ok: false,
      reason: `the refund window for "${templateById(catalog, refund.templateId)!.title}" closed ${late} ago — the policy allows ${describeRefundPolicy(policy)}, and the purchase it would reverse was made at ${purchase.at}`,
    };
  }

  return refundPurchase(catalog, ledger, refund);
}
