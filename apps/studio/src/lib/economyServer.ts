/**
 * M7 v309 — the server-side half of the CREATOR ECONOMY's reading lane.
 *
 * <p>The service's address is server-side, so the Studio's own route (server-side) reads through here. A
 * failed call answers with a REASON rather than a thrown error: a panel that says "the subscriptions could
 * not be read" is an honest panel, and one that throws into a route handler is a 500 for a panel whose
 * DOCUMENT is perfectly fine.
 */
import { nexusApiBase } from './publishServer';
import { serviceCallSignal, serviceUnreachableReason, type ServiceFailureKind } from './serviceCall';

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
   * v375 — the plan's price NOW, in cents, or null when the wire did not say.
   *
   * <p>The price above is the SNAPSHOT: what the supporter agreed to. This is what the plan costs
   * today, so a reader can see that the terms have moved since.
   */
  currentPriceCents?: number | null;
  /**
   * v375 — and the plan's period NOW, or null when the wire did not say.
   */
  currentPeriod?: string | null;
  /** v376 — whether the plan is STILL ON OFFER, or null when the wire did not say. */
  currentActive?: boolean | null;
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
  /** v369 — the CURRENCY the amount is in: money in two currencies does not add up to one number. */
  currency: string;
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
    const g = group as { period?: unknown; currency?: unknown; totalCents?: unknown };
    if (typeof g.period !== 'string' || g.period.length === 0) continue;
    if (typeof g.currency !== 'string' || g.currency.length === 0) continue;
    if (typeof g.totalCents !== 'number' || !Number.isFinite(g.totalCents)) continue;
    totals.push({ period: g.period, currency: g.currency, totalCents: g.totalCents });
  }
  return totals;
}

export interface SubscriptionsAnswer {
  ok: boolean;
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
  subscriptions: SubscriptionEntry[];
  /** What the subscriber has committed, summed over the subscriptions that are STILL STANDING (v308). */
  /** v368 — the totals, PER PERIOD. */
  totalsByPeriod?: PeriodTotal[];
  count: number;
  /** The cap the service applied. */
  limit: number;
  /**
   * v392 — the ROW this window starts at, echoed from the ask.
   *
   * <p>The answer carries the window it is FOR rather than leaving the panel to remember which ask it
   * belongs to: three reads go out together here, and they answer in whatever order the network
   * chooses — an answer that names its own window cannot be mistaken for another one's (v382's rule).
   */
  offset: number;
  reason?: string;
}

/** What one read of the plans answered. */
export interface PlansAnswer {
  ok: boolean;
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
  plans: PlanEntry[];
  /**
   * v373 — how many plans the creator offers, over the WHOLE table — or null when the count could not be
   * read.
   *
   * <p>The count is NOT the window's length: the wire's count used to be the number of rows that happened
   * to be on the screen, which is a fact about the read and not about the creator.
   */
  count: number | null;
  /** The cap the service applied. */
  limit: number;
  /** v392 — the ROW this window starts at, echoed from the ask (v382's rule). */
  offset: number;
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
  offset: number = 0,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<SubscriptionsAnswer> {
  const apiBase = nexusApiBase();
  const from = Math.max(offset, 0);
  try {
    const res = await fetchImpl(
      `${apiBase}/subscriptions?subscriber=${encodeURIComponent(subscriberAccountId)}&limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(from))}`,
      { headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        ok: false,
        subscriptions: [],
        totalsByPeriod: [],
        count: 0,
        limit,
        offset: from,
        failure: 'invalid', reason: `the service's subscriptions door answered HTTP ${res.status} with something that is not JSON`,
      };
    }
    const body = parsed as { subscriptions?: unknown; totalsByPeriod?: unknown; count?: unknown; limit?: unknown; message?: unknown };
    if (!Array.isArray(body.subscriptions)) {
      const why = typeof body.message === 'string' ? body.message : `the service's subscriptions door answered HTTP ${res.status}`;
      return { ok: false, subscriptions: [], totalsByPeriod: [], count: 0, limit, offset: from, failure: 'invalid', reason: why };
    }
    return {
      ok: true,
      subscriptions: body.subscriptions as SubscriptionEntry[],
      totalsByPeriod: toPeriodTotals(body.totalsByPeriod),
      count: typeof body.count === 'number' ? body.count : body.subscriptions.length,
      limit: typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : limit,
      offset: from,
    };
  } catch (error) {
    return {
      ok: false,
      subscriptions: [],
      totalsByPeriod: [],
      count: 0,
      limit,
      offset: from,
      failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error),
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
  offset: number = 0,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<SubscriptionsAnswer> {
  const apiBase = nexusApiBase();
  const from = Math.max(offset, 0);
  try {
    const res = await fetchImpl(
      `${apiBase}/subscriptions?creator=${encodeURIComponent(creatorAccountId)}&limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(from))}`,
      { headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        ok: false,
        subscriptions: [],
        totalsByPeriod: [],
        count: 0,
        limit,
        offset: from,
        failure: 'invalid', reason: `the service's subscriptions door answered HTTP ${res.status} with something that is not JSON`,
      };
    }
    const body = parsed as { subscriptions?: unknown; totalsByPeriod?: unknown; count?: unknown; limit?: unknown; message?: unknown };
    if (!Array.isArray(body.subscriptions)) {
      const why = typeof body.message === 'string' ? body.message : `the service's subscriptions door answered HTTP ${res.status}`;
      return { ok: false, subscriptions: [], totalsByPeriod: [], count: 0, limit, offset: from, failure: 'invalid', reason: why };
    }
    return {
      ok: true,
      subscriptions: body.subscriptions as SubscriptionEntry[],
      totalsByPeriod: toPeriodTotals(body.totalsByPeriod),
      count: typeof body.count === 'number' ? body.count : body.subscriptions.length,
      limit: typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : limit,
      offset: from,
    };
  } catch (error) {
    return {
      ok: false,
      subscriptions: [],
      totalsByPeriod: [],
      count: 0,
      limit,
      offset: from,
      failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error),
    };
  }
}

/** READ the plans one creator offers — the creator’s own side of the economy. */
export async function readPlans(
  creatorAccountId: string,
  limit: number,
  offset: number = 0,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<PlansAnswer> {
  const apiBase = nexusApiBase();
  const from = Math.max(offset, 0);
  try {
    const res = await fetchImpl(
      `${apiBase}/plans?creator=${encodeURIComponent(creatorAccountId)}&limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(from))}`,
      { headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        ok: false,
        plans: [],
        count: null,
        limit,
        offset: from,
        failure: 'invalid', reason: `the service's plans door answered HTTP ${res.status} with something that is not JSON`,
      };
    }
    const body = parsed as { plans?: unknown; count?: unknown; limit?: unknown; message?: unknown };
    if (!Array.isArray(body.plans)) {
      const why = typeof body.message === 'string' ? body.message : `the service's plans door answered HTTP ${res.status}`;
      return { ok: false, plans: [], count: null, limit, offset: from, failure: 'invalid', reason: why };
    }
    return {
      ok: true,
      plans: body.plans as PlanEntry[],
      // v373 — a wire with NO count says the count is UNKNOWN: falling back to the window's length would
      // be counting what happened to be on the screen and calling it the creator's whole catalogue.
      count: typeof body.count === 'number' ? body.count : null,
      limit: typeof body.limit === 'number' && Number.isFinite(body.limit) ? body.limit : limit,
      offset: from,
    };
  } catch (error) {
    return {
      ok: false,
      plans: [],
      count: null,
      limit,
      offset: from,
      failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error),
    };
  }
}
