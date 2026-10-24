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
import { serviceCallSignal, serviceUnreachableReason, type ServiceFailureKind } from './serviceCall';

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
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
  plans: PlanEntry[];
  /**
   * v372 — how many plans the creator offers, over the WHOLE table — or null when the count could not be
   * read.
   *
   * <p>The count is NOT the window's length: the wire's count used to be the number of rows that happened
   * to be on the screen, which is a fact about the read and not about the creator.
   */
  count: number | null;
  /**
   * v396 — the cap the service applied, and the ROW this window starts at, echoed from the ask — the
   * same two numbers the economy panel's plans answer has carried since v392. The answer names the
   * window it is FOR: two reads in flight cannot be mistaken for each other's answers (v382's rule).
   */
  limit: number;
  offset: number;
  reason?: string;
}

/** What one read of the subscriptions answered. */
export interface SubscriptionsAnswer {
  ok: boolean;
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
  subscriptions: SubscriptionEntry[];
  /** What the subscriber has committed, in cents, over the STANDING subscriptions. */
  totalCents: number;
  count: number;
  reason?: string;
}

/** What one write answered. */
export interface PlanWriteAnswer {
  ok: boolean;
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
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
  limit: number,
  offset: number = 0,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<PlansAnswer> {
  const apiBase = nexusApiBase();
  // v396 — the offset is ROWS, and a negative one is the first window rather than a refusal: the
  // newest plans are the honest answer to a question about a page before the first.
  const from = Math.max(offset, 0);
  try {
    const res = await fetchImpl(
      `${apiBase}/plans?creator=${encodeURIComponent(creatorAccountId)}&limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(from))}`,
      { headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    if (!res.ok) {
      return { ok: false, plans: [], count: null, limit, offset: from, failure: 'invalid', reason: `the service's plans door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, plans: [], count: null, limit, offset: from, failure: 'invalid', reason: 'the service answered its plans door with something that is not JSON' };
    }
    const body = parsed as { plans?: unknown; count?: unknown; limit?: unknown };
    if (!Array.isArray(body.plans)) {
      return { ok: false, plans: [], count: null, limit, offset: from, failure: 'invalid', reason: 'the service answered its plans door with no plans' };
    }
    return {
      ok: true,
      plans: body.plans as PlanEntry[],
      // v372 — a wire with NO count says the count is UNKNOWN: falling back to the window's length would
      // be counting what happened to be on the screen and calling it the creator's whole catalogue.
      count: typeof body.count === 'number' ? body.count : null,
      // v396 — the window's size as the SERVICE applied it, and the row it starts at: the answer
      // names the window it is for, so the bar can say which plans it is showing and page from a fact.
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

/** Read the subscriptions one account holds. */
export async function readSubscriptions(
  subscriberAccountId: string,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<SubscriptionsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/subscriptions?subscriber=${encodeURIComponent(subscriberAccountId)}`, {
      headers: { accept: 'application/json' },
      signal: serviceCallSignal(),
    });
    if (!res.ok) {
      return { ok: false, subscriptions: [], totalCents: 0, count: 0, failure: 'invalid', reason: `the service's subscriptions door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, subscriptions: [], totalCents: 0, count: 0, failure: 'invalid', reason: 'the service answered its subscriptions door with something that is not JSON' };
    }
    const body = parsed as { subscriptions?: unknown; totalCents?: unknown; count?: unknown };
    if (!Array.isArray(body.subscriptions)) {
      return { ok: false, subscriptions: [], totalCents: 0, count: 0, failure: 'invalid', reason: 'the service answered its subscriptions door with no subscriptions' };
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
      failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error),
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
      signal: serviceCallSignal(),
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
    return { ok: false, failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error) };
  }
}

/** What one cancellation answered. */
export interface CancelAnswer {
  ok: boolean;
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
  /** Whether the subscription MOVED. A subscription that was already ended is "already ended". */
  ended: boolean;
  reason?: string;
}

/**
 * END a subscription on the service — and only the holder’s own.
 *
 * <p>Ending is not deleting: the row STAYS and its standing becomes `cancelled`, because a promise that
 * was ended is a fact that happened.
 */
export async function cancelSubscription(
  subscriptionId: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<CancelAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/subscriptions/${encodeURIComponent(subscriptionId)}?claimer=${encodeURIComponent(claim.accountId)}`,
      { method: 'DELETE', headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, ended: false, failure: 'invalid', reason: `the service's subscriptions door answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { ended?: unknown; reason?: unknown; message?: unknown };
    // v313 — the refusal’s own words, whenever the answer is NOT ok.
    if (!res.ok || body.ended === undefined) {
      const reason =
        typeof body.reason === 'string'
          ? body.reason
          : typeof body.message === 'string'
            ? body.message
            : `the service's subscriptions door answered HTTP ${res.status}`;
      return { ok: false, ended: false, reason };
    }
    return { ok: true, ended: body.ended === true };
  } catch (error) {
    return {
      ok: false,
      ended: false,
      failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error),
    };
  }
}

/**
 * What one retirement answered.
 */
export interface RetireAnswer {
  ok: boolean;
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
  /** Whether the plan was retired BY THIS CALL — a plan that was already retired is "already retired". */
  retired: boolean;
  reason?: string;
}

/**
 * RETIRE a plan, on the service — and only the creator’s own.
 *
 * <p>Retiring takes the OFFER away and leaves the promises alone: the subscriptions already made against
 * the plan keep standing, because a supporter who backed it for a month was promised that month.
 */
export async function retirePlan(
  planId: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<RetireAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/plans/${encodeURIComponent(planId)}?claimer=${encodeURIComponent(claim.accountId)}`,
      { method: 'DELETE', headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, retired: false, failure: 'invalid', reason: `the service's plans door answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { retired?: unknown; reason?: unknown; message?: unknown };
    // v313 — the refusal’s own words, whenever the answer is NOT ok. The service’s error body carries no
    // `ok` field (it is `{error, message}`), so a reader that only looked for the reason when `ok: false`
    // threw away every message the service ever wrote.
    if (!res.ok || body.retired === undefined) {
      const reason =
        typeof body.reason === 'string'
          ? body.reason
          : typeof body.message === 'string'
            ? body.message
            : `the service’s plans door answered HTTP ${res.status}`;
      return { ok: false, retired: false, reason };
    }
    return { ok: true, retired: body.retired === true };
  } catch (error) {
    return {
      ok: false,
      retired: false,
      failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error),
    };
  }
}

/** What one reprice answered. */
export interface RepriceAnswer {
  ok: boolean;
  /** v507 — which kind of “no” this is, when `ok` is false. */
  failure?: ServiceFailureKind;
  /** The plan's price now, in cents. */
  priceCents?: number;
  /** The plan's period now. */
  period?: string;
  reason?: string;
}

/**
 * CHANGE the price of a plan, on the service — and only the creator's own.
 *
 * <p>The subscriptions already made against the plan keep the price they were made at (the snapshot), and the
 * new price is what the NEXT subscriber agrees to.
 */
export async function repricePlan(
  planId: string,
  priceCents: number,
  period: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<RepriceAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/plans/${encodeURIComponent(planId)}?claimer=${encodeURIComponent(claim.accountId)}`
        + `&price=${encodeURIComponent(String(priceCents))}&period=${encodeURIComponent(period)}`,
      { method: 'PUT', headers: { accept: 'application/json' }, signal: serviceCallSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, failure: 'invalid', reason: `the service's plans door answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { ok?: unknown; priceCents?: unknown; period?: unknown; reason?: unknown; message?: unknown };
    // v313 — the refusal's own words, whenever the answer is NOT ok.
    if (body.ok === false || !res.ok) {
      const reason =
        typeof body.reason === 'string'
          ? body.reason
          : typeof body.message === 'string'
            ? body.message
            : `the service's plans door answered HTTP ${res.status}`;
      return { ok: false, reason };
    }
    return {
      ok: true,
      priceCents: typeof body.priceCents === 'number' ? body.priceCents : undefined,
      period: typeof body.period === 'string' ? body.period : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error),
    };
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
      signal: serviceCallSignal(),
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
    return { ok: false, failure: 'unreachable', reason: serviceUnreachableReason(apiBase, error) };
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
    return { ok: false, failure: 'invalid', reason: `the answer was HTTP ${res.status} with something that is not JSON` };
  }
  const answer = body as {
    ok?: unknown;
    plans?: unknown;
    subscriptions?: unknown;
    reason?: unknown;
    message?: unknown;
  };
  // v313 — the reason is read whenever the answer is NOT ok, and not only when the body
  // says `ok: false`: the service’s error body carries no `ok` field at all (it is `{error, message}`),
  // so the old shape threw away every message the service ever wrote.
  if (answer.ok === false || !res.ok) {
    const reason =
      typeof answer.reason === 'string'
        ? answer.reason
        : typeof answer.message === 'string'
          ? answer.message
          : `the answer was HTTP ${res.status}`;
    return { ok: false, reason };
  }
  const plans = Array.isArray(answer.plans) ? (answer.plans as PlanEntry[]) : [];
  const subscriptions = Array.isArray(answer.subscriptions) ? (answer.subscriptions as SubscriptionEntry[]) : [];
  return { ok: true, plan: plans[0], subscription: subscriptions[0] };
}
