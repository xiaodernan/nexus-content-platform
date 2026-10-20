/**
 * M7 v301 — the server-side half of the PLANS and SUBSCRIPTIONS reader and writer.
 *
 * The service's address is server-side, and both the profile page (server-rendered) and the Studio's own
 * route (server-side) read and write through here.
 *
 * A failed call answers with a REASON rather than a thrown error: a profile page that says "the plans
 * could not be read" is an honest page, and one that throws into a route handler is a 500 for a page whose
 * PUBLICATIONS are perfectly fine.
 */
import { nexusApiBase } from './publishServer';

/** One plan, in the service's own wire shape. */
export interface PlanEntry {
  planId: string;
  creatorId: string;
  priceCents: number;
  currency: string;
  period: string;
  active: boolean;
  createdAt: number;
  handle?: string | null;
  assurance?: string | null;
}

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
  handle?: string | null;
  assurance?: string | null;
}

/** What one read of the plans answered. */
export interface PlansAnswer {
  ok: boolean;
  plans: PlanEntry[];
  count: number;
  reason?: string;
}

/** What one read of the subscriptions answered. */
export interface SubscriptionsAnswer {
  ok: boolean;
  subscriptions: SubscriptionEntry[];
  /** What the subscriber has committed, in cents, over the STANDING subscriptions. */
  totalCents: number;
  count: number;
  reason?: string;
}

/** What one write answered. */
export interface PlanWriteAnswer {
  ok: boolean;
  plan?: PlanEntry;
  subscription?: SubscriptionEntry;
  reason?: string;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;

/** Read the plans one creator offers. */
export async function readPlans(
  creatorAccountId: string,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<PlansAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/plans?creator=${encodeURIComponent(creatorAccountId)}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, plans: [], count: 0, reason: `the service's plans door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, plans: [], count: 0, reason: 'the service answered its plans door with something that is not JSON' };
    }
    const body = parsed as { plans?: unknown; count?: unknown };
    if (!Array.isArray(body.plans)) {
      return { ok: false, plans: [], count: 0, reason: 'the service answered its plans door with no plans' };
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

/** Read the subscriptions one account holds. */
export async function readSubscriptions(
  subscriberAccountId: string,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<SubscriptionsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(subscriberAccountId)}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) {
      return { ok: false, subscriptions: [], totalCents: 0, count: 0, reason: `the service's subscriptions door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, subscriptions: [], totalCents: 0, count: 0, reason: 'the service answered its subscriptions door with something that is not JSON' };
    }
    const body = parsed as { subscriptions?: unknown; totalCents?: unknown; count?: unknown };
    if (!Array.isArray(body.subscriptions)) {
      return { ok: false, subscriptions: [], totalCents: 0, count: 0, reason: 'the service answered its subscriptions door with no subscriptions' };
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

/** BACK a plan, on the service. */
export async function subscribeOnService(
  planId: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<PlanWriteAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/subscriptions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        planId,
        claim: {
          accountId: claim.accountId,
          handle: claim.handle ?? null,
          assurance: claim.assurance ?? null,
          claimedAt: claim.claimedAt ?? null,
        },
      }),
    });
    return readWriteAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** OFFER a plan, on the service. */
export async function offerOnService(
  planId: string,
  priceCents: number,
  currency: string,
  period: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<PlanWriteAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        planId,
        priceCents,
        currency,
        period,
        claim: {
          accountId: claim.accountId,
          handle: claim.handle ?? null,
          assurance: claim.assurance ?? null,
          claimedAt: claim.claimedAt ?? null,
        },
      }),
    });
    return readWriteAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * A write's answer.
 *
 * The plan and the subscription are read ONLY when the answer says `ok`: a refusal carries a reason and no
 * numbers, and a lane that filled in a count of zero on a refusal would make a refused subscription look
 * like a subscription that found nobody.
 */
function readWriteAnswer(res: Response, body: unknown): PlanWriteAnswer {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: `the answer was HTTP ${res.status} with something that is not JSON` };
  }
  const answer = body as {
    ok?: unknown;
    plans?: unknown;
    subscriptions?: unknown;
    reason?: unknown;
    message?: unknown;
  };
  if (answer.ok === false) {
    const reason =
      typeof answer.reason === 'string'
        ? answer.reason
        : typeof answer.message === 'string'
          ? answer.message
          : `the answer was HTTP ${res.status}`;
    return { ok: false, reason };
  }
  if (!res.ok) {
    return { ok: false, reason: `the answer was HTTP ${res.status}` };
  }
  const plans = Array.isArray(answer.plans) ? (answer.plans as PlanEntry[]) : [];
  const subscriptions = Array.isArray(answer.subscriptions) ? (answer.subscriptions as SubscriptionEntry[]) : [];
  return { ok: true, plan: plans[0], subscription: subscriptions[0] };
}
