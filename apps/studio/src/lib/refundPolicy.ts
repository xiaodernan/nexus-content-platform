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
 * <p>Four rules keep it honest (§60):
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
 *   <li><b>The gate is SHARED with the preflight.</b> `refundEligibility` answers before a click the
 *       same question `refundPurchaseUnderPolicy` answers on one, so a disabled action and a refused
 *       write cannot tell different stories.</li>
 * </ul>
 */

import type { CreditEntry, CreditLedger } from './credits';
import { refundPairing, refundPurchase, type RefundDecision, type TemplateRefund } from './refund';
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

type RefundGate =
  | { ok: true; purchase: CreditEntry; closesAt: number | null; priceCents: number }
  | { ok: false; reason: string };

/**
 * The policy layer's ENTIRE judgement, in one place: validate the declaration, ask the mechanism
 * which purchase a refund would reverse, and measure the window on THAT purchase. The preflight and
 * the write both call it, so "the button is offered" and "the click succeeds" cannot disagree.
 */
function refundGate(
  catalog: TemplateCatalog,
  ledger: CreditLedger,
  ask: Pick<TemplateRefund, 'templateId' | 'buyerId'>,
  policy: RefundPolicy,
  now: number,
): RefundGate {
  const problem = refundPolicyProblem(policy);
  if (problem) return { ok: false, reason: problem };

  // The mechanism's structural rules answer FIRST and verbatim: "you never bought it" is not a window
  // opinion, and a policy must not speak where pairing or solvency already refused.
  const pairing = refundPairing(catalog, ledger, ask);
  if (!pairing.ok) return pairing;

  const closesAt = refundWindowClosesAt(pairing.purchase.at, policy);
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
      reason: `the refund window for "${templateById(catalog, ask.templateId)!.title}" closed ${late} ago — the policy allows ${describeRefundPolicy(policy)}, and the purchase it would reverse was made at ${pairing.purchase.at}`,
    };
  }
  return { ok: true, purchase: pairing.purchase, closesAt, priceCents: pairing.priceCents };
}

/** What the preflight says about one refund ask — the answer a surface needs BEFORE it offers a button. */
export type RefundEligibility =
  | { eligible: true; purchase: CreditEntry; purchaseAt: number; closesAt: number | null; priceCents: number }
  | { eligible: false; reason: string };

/**
 * Whether a refund WOULD be allowed right now — answered without writing a single entry.
 *
 * <p>For a surface deciding whether to offer the action at all. It reads the same gate the write
 * reads, so a disabled button and a refused click can never disagree. It does not promise the write
 * will succeed — the idempotency key and a concurrent ledger change are still the caller's — but
 * every reason it reports is a reason the write would report too.
 */
export function refundEligibility(
  catalog: TemplateCatalog,
  ledger: CreditLedger,
  ask: Pick<TemplateRefund, 'templateId' | 'buyerId'>,
  policy: RefundPolicy,
  now: number,
): RefundEligibility {
  const gate = refundGate(catalog, ledger, ask, policy, now);
  if (!gate.ok) return { eligible: false, reason: gate.reason };
  return {
    eligible: true,
    purchase: gate.purchase,
    purchaseAt: gate.purchase.at,
    closesAt: gate.closesAt,
    priceCents: gate.priceCents,
  };
}

/**
 * Reverse a purchase WITH the host's policy applied first.
 *
 * <p>The order is the point: the policy is validated, the purchase the mechanism WOULD reverse is
 * looked up, its own instant is compared to the window, and only then does the mechanism run. When
 * the gate refuses, nothing is appended — the ledger handed in is untouched.
 */
export function refundPurchaseUnderPolicy(
  catalog: TemplateCatalog,
  ledger: CreditLedger,
  refund: TemplateRefund,
  policy: RefundPolicy,
  now: number,
): RefundDecision {
  const gate = refundGate(catalog, ledger, refund, policy, now);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  return refundPurchase(catalog, ledger, refund);
}
