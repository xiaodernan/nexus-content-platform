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
  /** v315 — the subscription's own id: the cancellation names the subscription, not the plan. */
  id?: string;
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
  /**
   * v327 — WHO subscribed.
   *
   * <p>The service's wire has carried the subscriber's account id all along (the same shape every social
   * fact takes — the account, the handle and the assurance the claim carried), and the client simply
   * dropped it: a creator reading the subscriptions they received could see a plan, a price and a status,
   * and not who had put their money behind it.
   *
   * <p>The `handle` and `assurance` slots are on the wire and are FILLED WITH NULL for a subscription
   * — the row stores the account id and no handle — so the name a creator sees today is the account
   * id, the same identity the trail already names.
   */
  subscriberId?: string;
  handle?: string | null;
  assurance?: string | null;
  /**
   * v328 — WHEN the subscription was taken back, in epoch millis. Null when it was not taken back.
   */
  endedAt?: number | null;
  /**
   * v330 — the plan's creator's NAME, as it was when the subscription was made.
   */
  creatorHandle?: string | null;
}

/** What the service's tip row would carry. */
export interface EconomyTip {
  recipientId: string;
  amountCents: PriceCents;
  message: string;
  anonymous: boolean;
  /**
   * v331 — the PAYER's name, as their claim carried it.
   *
   * <p>The service has sent it since the tip's own beginning (the row keeps `payer_handle`, and the
   * wire has the slot) — and the panel was calling every payer "a supporter" and throwing the name away.
   */
  handle?: string | null;
  payerId?: string | null;
}

/** A subscription reduced to the facts a person can act on. */
export interface SubscriptionRow {
  planId: string;
  /**
   * v315 — the SUBSCRIPTION's own id.
   *
   * <p>Ending a subscription names the subscription, not the plan: two subscriptions of the same plan are
   * two promises, and a panel that could only name the plan could not end one of them.
   */
  subscriptionId: string;
  priceText: string;
  currency: Currency;
  statusText: string;   // 'Active' | 'Expired' | 'Never'
  daysLeftText: string; // 'N d left' | 'Expired' | 'N/A'
  isActive: boolean;
  /**
   * v313 — the note to show when this subscription cannot be made again.
   *
   * <p>A subscription that has ENDED cannot be renewed in this build, and a panel that says only "Expired"
   * leaves the reader hunting for a button that does not exist. The note names the rule instead — one
   * subscription per supporter per plan is the DATABASE’s rule, and there is no billing to renew it with — so
   * the way out is a creator offering a NEW plan.
   */
  renewNote: string | null;
  /**
   * v327 — who subscribed, in a reader’s words.
   *
   * <p>The handle when the claim carried one, the account id when it did not, and "nobody" when neither
   * is there: a name a creator can read is a fact about their own business, and a blank would be a
   * small hole in it.
   */
  subscriberText: string;
  /**
   * v328 — WHEN the subscription was taken back, in a reader's words — or null when it was not.
   *
   * <p>The ending is the CANCELLATION's: a subscription that merely ran out of its period ended on its
   * expiry, which is a different date and a different fact, and a standing subscription has no ending
   * at all. So this line is only ever there for a cancellation — and the panel says so in the same
   * words the service does.
   */
  endedText: string | null;
  /**
   * v329 — WHEN the support began, in a reader's words.
   *
   * <p>The other half of the pair v328 completed: a creator looking at a subscription could see when it
   * ENDED and not when it STARTED, and a relationship is two dates. The wire has carried
   * `subscribedAt` since v300 — the panel just never said it.
   */
  startedText: string | null;
  /**
   * v330 — WHOSE plan it is, in a reader's words — or null when the wire did not say.
   *
   * <p>A plan id is an ADDRESS (the plan is "pro"), and a supporter reading their own list should not
   * have to know which of three addresses belongs to the person whose work they are backing. The name
   * is the creator's own claim, copied onto the subscription at the moment it was made — the same
   * snapshot rule the price follows.
   */
  creatorText: string | null;
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
  /**
   * v344 — WHEN the plan was opened, in a reader's words — or null when the wire did not say.
   *
   * <p>The service has carried the instant since the plan's own beginning, and the profile page's plan bar
   * said it since v342; the creator's OWN panel did not. It is the same wire and the same clock, and a
   * creator reading the plans they offer could not tell a long-standing plan from a fresh one.
   */
  openedText: string | null;
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
/**
 * WHEN a plan was opened, in a reader's words — or null when the wire did not say.
 *
 * <p>The instant is the service's own, in UTC, in the same style as the profile bar's dates (v342) and the
 * tip receipt's (v333): one clock, one style, so a reader comparing a plan's date with a tip's date is
 * reading two dates written the same way.
 */
function planOpenedTextOf(createdAt: number | null | undefined): string | null {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  return new Date(createdAt).toISOString().replace('.000Z', 'Z');
}

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
    // v344 — and when it was opened. The instant is the service's own, in UTC, in the same style as the
    // profile bar's dates (v342) and the tip receipt's (v333).
    openedText: planOpenedTextOf(p.createdAt),
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
  /**
   * v331 — WHO sent it, in a reader's words.
   *
   * <p>"Anonymous" when the tip was ANONYMOUS — that is the payer's own choice about their own money,
   * and the recipient is told the tip is anonymous rather than being shown a name the payer withheld.
   * Otherwise the name, or the account id when the claim carried no handle.
   */
  payerText: string;
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
/**
 * WHOSE plan it is, in a reader's words — or null when the wire did not say.
 *
 * <p>The creator's name when the wire carries one, the account id when it does not: a creator is a
 * PUBLIC identity (their name is in the byline of everything they publish), and an address is better
 * than a blank.
 */
function creatorTextOf(sub: EconomySubscription): string | null {
  const handle = typeof sub.creatorHandle === 'string' && sub.creatorHandle.length > 0 ? sub.creatorHandle : null;
  if (handle) return `@${handle}`;
  return typeof sub.creatorId === 'string' && sub.creatorId.length > 0 ? sub.creatorId : null;
}

/**
 * WHEN the support began, in a reader's words — or null when the wire did not say.
 *
 * <p>Same shape as the ending: a fact about a machine (the service's own clock), formatted the same way
 * the ending is, so a reader sees two dates in one style.
 */
function startedTextOf(sub: EconomySubscription): string | null {
  const started = typeof sub.subscribedAt === 'number' && Number.isFinite(sub.subscribedAt) ? sub.subscribedAt : null;
  if (started === null) return null;
  return new Date(started).toISOString().replace('.000Z', 'Z');
}

/**
 * WHEN the subscription was taken back, in a reader's words — or null when it was not.
 *
 * <p>The instant is the service's own (v328): the creator is told when the supporter took it back, and
 * the date is a fact about a machine rather than about a browser. A row with no instant is a row that
 * was never taken back, and it says nothing rather than guessing.
 */
function endedTextOf(sub: EconomySubscription): string | null {
  const ended = typeof sub.endedAt === 'number' && Number.isFinite(sub.endedAt) ? sub.endedAt : null;
  if (ended === null) return null;
  return new Date(ended).toISOString().replace('.000Z', 'Z');
}

/**
 * WHO subscribed, in a reader's words.
 *
 * <p>The handle when the wire carries one, the account id when it does not, and "nobody" when neither is
 * there. A handle is a PUBLIC name — it is on the account's own profile — so naming it to the creator
 * of the plan is not a new disclosure; it is the name the supporter already publishes.
 *
 * <p><b>What the wire carries TODAY, stated rather than assumed:</b> the service's subscription row
 * stores the SUBSCRIBER'S ACCOUNT ID and no handle, and the wire's `handle` and `assurance` slots are
 * filled with null for a subscription. So the name a creator sees today is the account id — which is
 * the same identity the trail already names (v270's finding: the service has no account table to
 * resolve an id into a handle with). The handle branch is kept because the wire HAS the slot, and a
 * service that started filling it would make the panel say the supporter's name without a single
 * change here.
 */
function subscriberTextOf(sub: EconomySubscription): string {
  const handle = typeof sub.handle === 'string' && sub.handle.length > 0 ? sub.handle : null;
  const id = typeof sub.subscriberId === 'string' && sub.subscriberId.length > 0 ? sub.subscriberId : null;
  if (handle) return `@${handle}`;
  return id ?? 'nobody';
}

export function toSubscriptionRow(sub: unknown): SubscriptionRow | null {
  if (typeof sub !== 'object' || sub === null) return null;
  const s = sub as EconomySubscription;
  if (typeof s.planId !== 'string' || s.planId.length === 0) return null;
  if (typeof s.priceCents !== 'number' || !Number.isFinite(s.priceCents)) return null;
  // The standing is computed ONCE (v313): the row's status, its `isActive` and its note must not be able to
  // disagree, and three computations of the same thing across a clock tick could.
  const standing = subscriptionStandingOf(s, Date.now());

  return {
    planId: s.planId,
    subscriptionId: typeof s.id === 'string' ? s.id : '',
    priceText: priceText(s.priceCents, s.currency),
    currency: s.currency,
    // v308 — the service’s standing when it gave one, the client’s own computation otherwise.
    statusText: subscriptionStandingText(standing),
    daysLeftText: subscriptionDaysLeftText(s, Date.now()),
    // v308 — and the same standing, so the row's two answers cannot disagree.
    isActive: standing === 'active',
    // v327 — and who subscribed.
    subscriberText: subscriberTextOf(s),
    // v328 — and when it was taken back, when it was.
    endedText: endedTextOf(s),
    // v329 — and when the support began.
    startedText: startedTextOf(s),
    // v330 — and whose plan it is.
    creatorText: creatorTextOf(s),
    // v313 — and the note, for a subscription that ended: it cannot be made again, and the panel says why
    // rather than leaving the reader hunting for a button that does not exist.
    renewNote:
      standing === 'expired' || standing === 'cancelled'
        ? 'this build cannot renew it: one subscription per supporter per plan is the database’s rule, and there is no billing'
        : null,
  };
}

/**
 * One tip row, or `null` when it cannot be shown honestly.
 * A tip needs a recipient, a finite amount, and the caller must have already
 * escaped the message (the pure half does not escape — it formats).
 */
/**
 * WHO sent the tip, in a reader's words.
 *
 * <p>An ANONYMOUS tip says "Anonymous" — the payer’s choice about their own money, and the recipient is told
 * the tip is anonymous rather than being shown a name the payer withheld. Otherwise the name, or the
 * account id when the claim carried no handle: an address is better than a hole, and the panel never
 * invents a name.
 */
/**
 * WHEN a tip was given, in a reader's words — or null when the wire did not say.
 *
 * <p>Same shape as the subscription's two dates (v328, v329): the instant is the service's own clock, and
 * it is formatted in one style everywhere so a reader can compare a tip's date with a subscription's.
 */
export function tipGivenText(createdAt: number | null | undefined): string | null {
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null;
  return new Date(createdAt).toISOString().replace('.000Z', 'Z');
}

export function tipPayerText(tip: {
  anonymous?: boolean;
  handle?: string | null;
  payerId?: string | null;
}): string {
  if (tip.anonymous === true) return 'Anonymous';
  const handle = typeof tip.handle === 'string' && tip.handle.length > 0 ? tip.handle : null;
  if (handle) return `@${handle}`;
  const id = typeof tip.payerId === 'string' && tip.payerId.length > 0 ? tip.payerId : null;
  return id ?? 'nobody';
}

/** The same answer, for the economy module's own tip wire. */
function payerTextOf(tip: EconomyTip): string {
  return tipPayerText(tip);
}

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
    // v331 — and who sent it.
    payerText: payerTextOf(t),
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