/**
 * M7 v309 — the server-side half of the CREATOR ECONOMY's reading lane.
 *
 * <p>The service's address is server-side, so the Studio's own route (server-side) reads through here. A
 * failed call answers with a REASON rather than a thrown error: a panel that says "the subscriptions could
 * not be read" is an honest panel, and one that throws into a route handler is a 500 for a panel whose
 * DOCUMENT is perfectly fine.
 */
import { nexusApiBase } from './publishServer';
import { serviceCallSignal, serviceUnreachableReason } from './serviceCall';

/** One subscription, in the service's own wire shape. */
export interface SubscriptionEntry {
  creatorId: string;
  planId: string;
  priceCents: number;
  currency: string;
  active: boolean;
  subscribedAt: number;
  expiresAt: number | null;
  subscriberId: string;
  id: string;
  /**
   * v327 — the SUBSCRIBER's name and assurance.
   *
   * <p>The service's wire has carried these slots since v300 and the service filled them with null; it
   * fills them now (the subscription row keeps the name the subscriber's claim carried), so a creator
   * reading the subscriptions they received sees a person and not an address.
   */
  handle?: string | null;
  assurance?: string | null;
  /**
   * v367 — the PERIOD this subscription is for, as it was when it was made.
   *
   * <p>The service has kept the plan's period as a snapshot beside the price since v300; the wire now
   * carries it too, so a reader can tell a monthly pledge from a yearly one.
   */
  period?: string | null;
  /**
   * v328 — WHEN the subscription was taken back, in epoch millis. Null when it was not.
   */
  endedAt?: number | null;
  /**
   * v330 — the plan's creator's NAME, as it was when the subscription was made.
   */
  creatorHandle?: string | null;
  status?: string;
}

/** One plan, in the service's own wire shape. */
export interface PlanEntry {
  planId: string;
  creatorId: string;
  priceCents: number;
  currency: string;
  period: string;
  active: boolean;
  createdAt: number;
}

/** What one read of the subscriptions answered. */
/**
 * v368 — what one PERIOD comes to.
 *
 * <p>A single sum over subscriptions of different periods is a meaningless number, so the answer says
 * what is owed for each period instead.
 */
export interface PeriodTotal {
  period: string;
  totalCents: number;
}

/**
 * The service's per-period totals, in the shape the panel reads.
 *
 * <p>A malformed group is DROPPED rather than shown: a period without a name, or an amount that is not a
 * number, is not a total — and a panel that showed half of one would be wrong about money.
 */
function toPeriodTotals(raw: unknown): PeriodTotal[] {
  if (!Array.isArray(raw)) return [];
  const totals: PeriodTotal[] = [];
  for (const group of raw) {
    if (typeof group !== 'object' || group === null) continue;
    const g = group as { period?: unknown; totalCents?: unknown };
    if (typeof g.period !== 'string' || g.period.length === 0) continue;
    if (typeof g.totalCents !== 'number' || !Number.isFinite(g.totalCents)) continue;
    totals.push({ period: g.period, totalCents: g.totalCents });
  }
  return totals;
}

export interface SubscriptionsAnswer {
  ok: boolean;
  subscriptions: SubscriptionEntry[];
  /** What the subscriber has committed, summed over the subscriptions that are STILL STANDING (v308). */
  /** v368 — the totals, PER PERIOD. */
  totalsByPeriod?: PeriodTotal[];
  count: number;
  reason?: string;
}

/** What one read of the plans answered. */
export interface PlansAnswer {
  ok: boolean;
  plans: PlanEntry[];
  count: number;
  reason?: string;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;

/**
 * READ the subscriptions one account holds.
 *
 * <p>The subscriber is named in the query: this build has no session (ADR 0018), so the account the device
 * holds is the claim the service compares — the same claim the take-down and the withdrawal name.
 */
export async function readSubscriptions(
  subscriberAccountId: string,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<SubscriptionsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/subscriptions?subscriber=${encodeURIComponent(subscriberAccountId)}&limit=${encodeURIComponent(String(limit))}`,
      { headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        ok: false,
        subscriptions: [],
        totalsByPeriod: [],
        count: 0,
        reason: `the service's subscriptions door answered HTTP ${res.status} with something that is not JSON`,
      };
    }
    const body = parsed as { subscriptions?: unknown; totalsByPeriod?: unknown; count?: unknown; message?: unknown };
    if (!Array.isArray(body.subscriptions)) {
      const why = typeof body.message === 'string' ? body.message : `the service's subscriptions door answered HTTP ${res.status}`;
      return { ok: false, subscriptions: [], totalsByPeriod: [], count: 0, reason: why };
    }
    return {
      ok: true,
      subscriptions: body.subscriptions as SubscriptionEntry[],
      totalsByPeriod: toPeriodTotals(body.totalsByPeriod),
      count: typeof body.count === 'number' ? body.count : body.subscriptions.length,
    };
  } catch (error) {
    return {
      ok: false,
      subscriptions: [],
      totalsByPeriod: [],
      count: 0,
      reason: serviceUnreachableReason(apiBase, error),
    };
  }
}

/**
 * READ the subscriptions one creator has RECEIVED — the creator's other side.
 *
 * <p>"What do I back" and "who backs me" are different questions, and the service has had the method for the
 * second one since v300 without a door for it (v310).
 */
export async function readReceivedSubscriptions(
  creatorAccountId: string,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<SubscriptionsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/subscriptions?creator=${encodeURIComponent(creatorAccountId)}&limit=${encodeURIComponent(String(limit))}`,
      { headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        ok: false,
        subscriptions: [],
        totalsByPeriod: [],
        count: 0,
        reason: `the service's subscriptions door answered HTTP ${res.status} with something that is not JSON`,
      };
    }
    const body = parsed as { subscriptions?: unknown; totalsByPeriod?: unknown; count?: unknown; message?: unknown };
    if (!Array.isArray(body.subscriptions)) {
      const why = typeof body.message === 'string' ? body.message : `the service's subscriptions door answered HTTP ${res.status}`;
      return { ok: false, subscriptions: [], totalsByPeriod: [], count: 0, reason: why };
    }
    return {
      ok: true,
      subscriptions: body.subscriptions as SubscriptionEntry[],
      totalsByPeriod: toPeriodTotals(body.totalsByPeriod),
      count: typeof body.count === 'number' ? body.count : body.subscriptions.length,
    };
  } catch (error) {
    return {
      ok: false,
      subscriptions: [],
      totalsByPeriod: [],
      count: 0,
      reason: serviceUnreachableReason(apiBase, error),
    };
  }
}

/** READ the plans one creator offers — the creator’s own side of the economy. */
export async function readPlans(
  creatorAccountId: string,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<PlansAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/plans?creator=${encodeURIComponent(creatorAccountId)}&limit=${encodeURIComponent(String(limit))}`,
      { headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        ok: false,
        plans: [],
        count: 0,
        reason: `the service's plans door answered HTTP ${res.status} with something that is not JSON`,
      };
    }
    const body = parsed as { plans?: unknown; count?: unknown; message?: unknown };
    if (!Array.isArray(body.plans)) {
      const why = typeof body.message === 'string' ? body.message : `the service's plans door answered HTTP ${res.status}`;
      return { ok: false, plans: [], count: 0, reason: why };
    }
    return {
      ok: true,
      plans: body.plans as PlanEntry[],
      count: typeof body.count === 'number' ? body.count : body.plans.length,
    };
  } catch (error) {
    return {
      ok: false,
      plans: [],
      count: 0,
      reason: serviceUnreachableReason(apiBase, error),
    };
  }
}
