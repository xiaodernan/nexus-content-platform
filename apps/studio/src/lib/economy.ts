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

/** A tip reduced to display text. */
export interface TipRow {
  recipientId: string;
  amountText: string;
  messageText: string;  // pre-escaped by caller, empty string if none
  anonymous: boolean;
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
    statusText: subscriptionActiveText(s, Date.now()),
    daysLeftText: subscriptionDaysLeftText(s, Date.now()),
    isActive: s.active && (s.expiresAt === null || s.expiresAt > Date.now()),
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