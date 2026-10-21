/**
 * M7 v301 — the browser half of the PLANS and SUBSCRIPTIONS lane.
 *
 * The service's address is server-side, so the browser talks to THIS Studio's own doors, which forward to
 * the service. The lane answers with a REASON and never a thrown error.
 */

/**
 * How long a write may take. A hung request is worse than a refused one: the panel would sit there
 * saying nothing.
 *
 * v294 — and it is 45 seconds, not 10. The Studio's own door is a `next dev` server in this repository, and
 * the FIRST call to a route pays that route's compile: a ten-second timeout was killing requests that were
 * about to be answered, and the lane reported a timeout where the truth was "the server was still building
 * it".
 */
const WRITE_TIMEOUT_MS = 45_000;

/** A signal that aborts the request when it takes too long. */
function callSignal(): AbortSignal {
  return AbortSignal.timeout(WRITE_TIMEOUT_MS);
}

export interface PlanLaneAnswer {
  ok: boolean;
  plan?: { planId: string; priceCents: number; period: string };
  subscription?: { planId: string; priceCents: number; period: string };
  reason?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** BACK a plan. */
export async function subscribeToPlan(
  planId: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch,
): Promise<PlanLaneAnswer> {
  try {
    const res = await fetchImpl('/api/subscriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ planId, claim }),
      signal: callSignal(),
    });
    return readAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** What one retirement answered — the browser half. */
export interface RetireLaneAnswer {
  ok: boolean;
  /** Whether the plan was retired BY THIS CALL. */
  retired: boolean;
  reason?: string;
}

/**
 * RETIRE a plan — the creator’s own.
 *
 * <p>The claimer is the account id, and only that: the service compares it with the plan’s creator and
 * refuses anybody else’s plan by name.
 */
export async function retirePlan(
  planId: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch,
): Promise<RetireLaneAnswer> {
  try {
    const res = await fetchImpl(`/api/plans?planId=${encodeURIComponent(planId)}&claimer=${encodeURIComponent(claim.accountId)}`, {
      method: 'DELETE',
      headers: { accept: 'application/json' },
      signal: callSignal(),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, retired: false, reason: `the plans answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { ok?: unknown; retired?: unknown; reason?: unknown; message?: unknown };
    if (body.ok === false || !res.ok) {
      const reason =
        typeof body.reason === 'string'
          ? body.reason
          : typeof body.message === 'string'
            ? body.message
            : `the plans answered HTTP ${res.status}`;
      return { ok: false, retired: false, reason };
    }
    return { ok: true, retired: body.retired === true };
  } catch (error) {
    return { ok: false, retired: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** OFFER a plan. */
export async function offerPlan(
  planId: string,
  priceCents: number,
  currency: string,
  period: string,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch,
): Promise<PlanLaneAnswer> {
  try {
    const res = await fetchImpl('/api/plans', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ planId, priceCents, currency, period, claim }),
      signal: callSignal(),
    });
    return readAnswer(res, await safeJson(res));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
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
 * One answer, from the response and its body.
 *
 * The plan and the subscription are read ONLY when the answer says `ok`: a refusal carries a reason and no
 * numbers, and a lane that filled in a count of zero on a refusal would make a refused subscription look
 * like a subscription that found nobody.
 */
function readAnswer(res: Response, body: unknown): PlanLaneAnswer {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: `the answer was HTTP ${res.status} with something that is not JSON` };
  }
  const answer = body as {
    ok?: unknown;
    plans?: unknown;
    subscriptions?: unknown;
    plan?: unknown;
    subscription?: unknown;
    reason?: unknown;
    message?: unknown;
  };
  if (answer.ok === false || !res.ok) {
    const reason =
      typeof answer.reason === 'string'
        ? answer.reason
        : typeof answer.message === 'string'
          ? answer.message
          : `the answer was HTTP ${res.status}`;
    return { ok: false, reason };
  }
  // The service answers with a LIST (it is a listing shape) and the Studio's own door forwards a SINGLE
  // row (it is a write shape). Both are read here, so the lane does not care which shape it was handed
  // — and a lane that only understood one of them would report a price of zero for a real subscription.
  const planRow = answer.plan as { planId: string; priceCents: number; period: string } | undefined;
  const subscriptionRow = answer.subscription as { planId: string; priceCents: number; period: string } | undefined;
  const plans = Array.isArray(answer.plans) ? (answer.plans as { planId: string; priceCents: number; period: string }[]) : [];
  const subscriptions = Array.isArray(answer.subscriptions)
    ? (answer.subscriptions as { planId: string; priceCents: number; period: string }[])
    : [];
  return {
    ok: true,
    plan: planRow ?? plans[0],
    subscription: subscriptionRow ?? subscriptions[0],
  };
}
