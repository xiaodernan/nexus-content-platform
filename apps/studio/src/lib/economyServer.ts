/**
 * M7 v309 — the server-side half of the CREATOR ECONOMY's reading lane.
 *
 * <p>The service's address is server-side, so the Studio's own route (server-side) reads through here. A
 * failed call answers with a REASON rather than a thrown error: a panel that says "the subscriptions could
 * not be read" is an honest panel, and one that throws into a route handler is a 500 for a panel whose
 * DOCUMENT is perfectly fine.
 */
import { nexusApiBase } from './publishServer';

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
export interface SubscriptionsAnswer {
  ok: boolean;
  subscriptions: SubscriptionEntry[];
  /** What the subscriber has committed, summed over the subscriptions that are STILL STANDING (v308). */
  totalCents: number;
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
      { headers: { accept: 'application/json' } },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        ok: false,
        subscriptions: [],
        totalCents: 0,
        count: 0,
        reason: `the service's subscriptions door answered HTTP ${res.status} with something that is not JSON`,
      };
    }
    const body = parsed as { subscriptions?: unknown; totalCents?: unknown; count?: unknown; message?: unknown };
    if (!Array.isArray(body.subscriptions)) {
      const why = typeof body.message === 'string' ? body.message : `the service's subscriptions door answered HTTP ${res.status}`;
      return { ok: false, subscriptions: [], totalCents: 0, count: 0, reason: why };
    }
    return {
      ok: true,
      subscriptions: body.subscriptions as SubscriptionEntry[],
      totalCents: typeof body.totalCents === 'number' ? body.totalCents : 0,
      count: typeof body.count === 'number' ? body.count : body.subscriptions.length,
    };
  } catch (error) {
    return {
      ok: false,
      subscriptions: [],
      totalCents: 0,
      count: 0,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
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
      { headers: { accept: 'application/json' } },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return {
        ok: false,
        subscriptions: [],
        totalCents: 0,
        count: 0,
        reason: `the service's subscriptions door answered HTTP ${res.status} with something that is not JSON`,
      };
    }
    const body = parsed as { subscriptions?: unknown; totalCents?: unknown; count?: unknown; message?: unknown };
    if (!Array.isArray(body.subscriptions)) {
      const why = typeof body.message === 'string' ? body.message : `the service's subscriptions door answered HTTP ${res.status}`;
      return { ok: false, subscriptions: [], totalCents: 0, count: 0, reason: why };
    }
    return {
      ok: true,
      subscriptions: body.subscriptions as SubscriptionEntry[],
      totalCents: typeof body.totalCents === 'number' ? body.totalCents : 0,
      count: typeof body.count === 'number' ? body.count : body.subscriptions.length,
    };
  } catch (error) {
    return {
      ok: false,
      subscriptions: [],
      totalCents: 0,
      count: 0,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
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
      { headers: { accept: 'application/json' } },
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
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
