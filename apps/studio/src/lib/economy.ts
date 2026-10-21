/**
 * M8 v274 (ADR 0016 amendment 274) — the CREATOR ECONOMY's READING half.
 *
 * The parallel lane's `monetization.ts` declares the client's pure types and formatters.
 * The server does not have monetization endpoints yet (blocked by ADR 0018), so this half
 * maps the wire shapes (when they arrive) to display facts, and states the service's own
 * absence honestly rather than faking data.
 *
 * Two limits this module keeps visible instead of papering over:
 *
 * - **No server endpoints exist.** The lane answers "the economy door is not built" with a
 *   reason, not with mock data. A panel that showed subscription cards with no service behind
 *   them would be a demo, not a surface.
 * - **Prices are cents and the formatter owns the symbol.** `priceText` is the single source
 *   of truth for "¥15.00 / 月" — a panel that formatted cents differently would drift.
 */
import type { Subscription, Tip, PriceCents, Currency } from './monetization';
import { priceText, subscriptionActiveText, subscriptionDaysLeftText } from './monetization';

/** What the service's subscription row would carry — mirrors the client's own type. */
export interface EconomySubscription {
  creatorId: string;
  planId: string;
  priceCents: PriceCents;
  currency: Currency;
  active: boolean;
  subscribedAt: number | null;
  expiresAt: number | null;
  /**
   * v308 — the service's own word for where the subscription STANDS: `active`, `expired` or
   * `cancelled`.
   *
   * <p>It is the authority when it is there: the service computes it against ITS clock, and a clock is a
   * fact about a machine. The client's own computation (below) is the fallback for a service that does not
   * say — and the client says which one it used.
   */
  status?: string | null;
}

/** What the service's tip row would carry. */
export interface EconomyTip {
  recipientId: string;
  amountCents: PriceCents;
  message: string;
  anonymous: boolean;
}

/** A subscription reduced to the facts a person can act on. */
export interface SubscriptionRow {
  planId: string;
  priceText: string;
  currency: Currency;
  statusText: string;   // 'Active' | 'Expired' | 'Never'
  daysLeftText: string; // 'N d left' | 'Expired' | 'N/A'
  isActive: boolean;
}

/**
 * What the service's PLAN row would carry.
 *
 * <p>The plan is the CREATOR's own offer — what they set, at what price, for what period. The client does
 * not decide any of it: the service holds the price and the period, and the plan is the creator's claim.
 */
export interface EconomyPlan {
  planId: string;
  creatorId: string;
  priceCents: PriceCents;
  currency: Currency;
  /** One of the service's three: `once`, `month` or `year`. */
  period: string;
  active: boolean;
  createdAt: number;
}

/** A plan reduced to the facts a creator can act on. */
export interface PlanRow {
  planId: string;
  priceText: string;
  /** The period in a reader's words. */
  periodText: string;
  /** Whether the plan is still offered. */
  active: boolean;
}

/**
 * The period in a reader's words.
 *
 * A KNOWN period is spelled the way a person would say it; an unknown one is passed through as it arrived
 * — a panel that labelled an unknown period as "per month" would be claiming a term the creator never set.
 */
export function planPeriodText(period: string): string {
  switch (period) {
    case 'once':
      return 'one time';
    case 'month':
      return 'per month';
    case 'year':
      return 'per year';
    default:
      return period;
  }
}

/**
 * One plan, or `null` when it cannot be shown honestly.
 *
 * A plan needs an id and a finite price to say what it is: a plan with no id is nobody's plan, and a plan
 * with no price is not an offer.
 */
export function toPlanRow(plan: unknown): PlanRow | null {
  if (typeof plan !== 'object' || plan === null) return null;
  const p = plan as EconomyPlan;
  if (typeof p.planId !== 'string' || p.planId.length === 0) return null;
  if (typeof p.priceCents !== 'number' || !Number.isFinite(p.priceCents)) return null;
  return {
    planId: p.planId,
    priceText: priceText(p.priceCents, p.currency),
    periodText: planPeriodText(typeof p.period === 'string' ? p.period : ''),
    active: p.active === true,
  };
}

/** The plans, in the order the service gave them. */
export function toPlanRows(plans: readonly unknown[]): PlanRow[] {
  const rows: PlanRow[] = [];
  for (const plan of plans) {
    const row = toPlanRow(plan);
    if (row) rows.push(row);
  }
  return rows;
}

/** A tip reduced to display text. */
export interface TipRow {
  recipientId: string;
  amountText: string;
  messageText: string;  // pre-escaped by caller, empty string if none
  anonymous: boolean;
}

/** Where a subscription stands. */
export type SubscriptionStanding = 'active' | 'expired' | 'cancelled';

/**
 * Where the subscription STANDS.
 *
 * <p>v308 — the SERVICE's word when it gave one. The service computes the standing from the row and its own
 * clock, because `active` in the row is a fact about the PAST (the supporter has not cancelled) and the
 * standing is a fact about NOW (the period may have run out since). A client that always computed it itself
 * would be answering a question about time with a clock that is not the service’s — so the service’s
 * word wins, and the client’s own computation is the fallback for a service that does not say.
 */
export function subscriptionStandingOf(sub: unknown, now: number): SubscriptionStanding {
  if (typeof sub !== 'object' || sub === null) return 'cancelled';
  const s = sub as { status?: unknown; active?: unknown; expiresAt?: unknown };
  if (s.status === 'active' || s.status === 'expired' || s.status === 'cancelled') {
    return s.status;
  }
  // The client's own computation — the same rule the monetization module states.
  if (s.active !== true) return 'cancelled';
  if (typeof s.expiresAt === 'number' && s.expiresAt <= now) return 'expired';
  return 'active';
}

/**
 * The standing in the words the economy surface already uses.
 *
 * <p>A cancelled subscription reads `Never` — the word this surface has always used for a subscription
 * that is not standing, and the one its own formatters expect.
 */
export function subscriptionStandingText(standing: SubscriptionStanding): string {
  switch (standing) {
    case 'active':
      return 'Active';
    case 'expired':
      return 'Expired';
    default:
      return 'Never';
  }
}

/**
 * One subscription row, or `null` when it cannot be shown honestly.
 * A row needs a planId and a finite price to say what it costs.
 */
export function toSubscriptionRow(sub: unknown): SubscriptionRow | null {
  if (typeof sub !== 'object' || sub === null) return null;
  const s = sub as EconomySubscription;
  if (typeof s.planId !== 'string' || s.planId.length === 0) return null;
  if (typeof s.priceCents !== 'number' || !Number.isFinite(s.priceCents)) return null;

  return {
    planId: s.planId,
    priceText: priceText(s.priceCents, s.currency),
    currency: s.currency,
    // v308 — the service’s standing when it gave one, the client’s own computation otherwise.
    statusText: subscriptionStandingText(subscriptionStandingOf(s, Date.now())),
    daysLeftText: subscriptionDaysLeftText(s, Date.now()),
    // v308 — and the same standing, so the row's two answers cannot disagree.
    isActive: subscriptionStandingOf(s, Date.now()) === 'active',
  };
}

/**
 * One tip row, or `null` when it cannot be shown honestly.
 * A tip needs a recipient, a finite amount, and the caller must have already
 * escaped the message (the pure half does not escape — it formats).
 */
export function toTipRow(tip: unknown, escape: (text: string) => string): TipRow | null {
  if (typeof tip !== 'object' || tip === null) return null;
  const t = tip as EconomyTip;
  if (typeof t.recipientId !== 'string' || t.recipientId.length === 0) return null;
  if (typeof t.amountCents !== 'number' || !Number.isFinite(t.amountCents)) return null;

  return {
    recipientId: t.recipientId,
    amountText: priceText(t.amountCents, 'CNY'),
    messageText: typeof t.message === 'string' && t.message.length > 0 ? escape(t.message) : '',
    anonymous: t.anonymous === true,
  };
}

/** The whole subscription list, in service order (newest first by subscribedAt). */
export function toSubscriptionRows(subs: readonly unknown[]): SubscriptionRow[] {
  const rows: SubscriptionRow[] = [];
  for (const s of subs) {
    const row = toSubscriptionRow(s);
    if (row) rows.push(row);
  }
  return rows;
}

/** The whole tip list, in service order (newest first by createdAt). */
export function toTipRows(tips: readonly unknown[], escape: (text: string) => string): TipRow[] {
  const rows: TipRow[] = [];
  for (const t of tips) {
    const row = toTipRow(t, escape);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Re-export the formatters from monetization so the panel imports from ONE place.
 * A panel that formatted cents twice would drift; this is the single door.
 */
export {
  priceText,
  tipText,
  tipAmountText,
  isFreePrice,
  tipsTotalByAgent,
  tipCount,
  subscriptionActiveText,
  currencySymbol,
  isSubscribed,
  subscriptionStatusText,
  tipsTotal,
  subscriptionDaysLeftText,
  tipPercentShare,
  tipsByRecipient,
} from './monetization';