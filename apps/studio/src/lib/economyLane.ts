/**
 * M8 v274 — the browser half of the CREATOR ECONOMY's reading lane.
 *
 * The server does not have monetization endpoints yet (ADR 0018 blocks accounts/sessions/tokens).
 * This lane GETs this Studio's own `/api/economy` and answers with a REASON, never a thrown error.
 * When the service is built, the route will forward the service's own answer.
 */
import { toPlanRows, toSubscriptionRows, toTipRows, type PlanRow, type SubscriptionRow, type TipRow } from './economy';

/**
 * v338 — how long this lane waits for the Studio.
 *
 * <p>The Studio's own door is a `next dev` server, and the FIRST call to a route pays that route's
 * compile — so a lane with no budget could be killed by a slow COMPILE and report it as a failure
 * of the thing it was asking for. That is the same mistake the tip lane fixed in v294, and the
 * other lanes have been waiting their turn.
 *
 * <p>45 seconds, not 10: the compile is the cost, and a compile is not a hung service.
 */
const WRITE_TIMEOUT_MS = 45_000;

/** A signal that stops a call that the Studio does not answer in time. */
function callSignal(): AbortSignal {
  return AbortSignal.timeout(WRITE_TIMEOUT_MS);
}

export interface EconomyAnswer {
  ok: boolean;
  subscriptions?: SubscriptionRow[];
  /** v309 — the plans this account offers. */
  plans?: PlanRow[];
  /**
   * v373 — how many plans the account offers, over the WHOLE table — null when the count could not be read.
   */
  planCount?: number | null;
  /** v310 — the subscriptions this account has RECEIVED (the creator's other side). */
  received?: SubscriptionRow[];
  tips?: TipRow[];
  /**
   * v359 — how many subscriptions this account holds, over the WHOLE table.
   *
   * <p>The service counts the whole table now (v359) — the count used to be the number of rows the
   * answer happened to carry, which is a fact about a window and not about the account.
   */
  subscriptionCount?: number;
  /**
   * v368 — what they come to, PER PERIOD.
   *
   * <p>A single sum over subscriptions of different periods is a meaningless number, so the answer says
   * what is owed for each period instead.
   */
  subscriptionTotalsByPeriod?: { period: string; currency: string; totalCents: number }[];
  /** v359 — the count for the RECEIVED side. */
  receivedCount?: number;
  /** v368 — and its totals, per period. */
  receivedTotalsByPeriod?: { period: string; currency: string; totalCents: number }[];
  /**
   * v392 — the cap the service applied, echoed from the ask: a panel that pages needs to know the
   * window's size to say which rows it is showing (the same field the tips read's answer carries, v391).
   */
  limit?: number;
  /**
   * v392 — the ROW each window starts at, echoed from the ask, one per list.
   *
   * <p>Three reads go out together here and answer in whatever order the network chooses; an answer
   * that names its own window cannot be mistaken for another one's (v382's rule).
   */
  subscriptionOffset?: number;
  receivedOffset?: number;
  planOffset?: number;
  reason?: string;
}

/**
 * The service's per-period totals, in the shape the panel reads.
 *
 * <p>A malformed group is DROPPED rather than shown: a period without a name, or an amount that is not a
 * number, is not a total — and a panel that showed half of one would be wrong about money.
 */
function toPeriodTotals(raw: unknown): { period: string; currency: string; totalCents: number }[] {
  if (!Array.isArray(raw)) return [];
  const totals: { period: string; currency: string; totalCents: number }[] = [];
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

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Read the economy surface — the subscriptions this account holds and the plans it offers.
 *
 * <p>v309 — the account is NAMED in the request: this build has no session (ADR 0018), so the account the
 * device holds is the claim the service compares. A device with no account has no economy, and the panel
 * says so rather than reading somebody else's.
 */
export async function readEconomy(
  accountId: string,
  subsOffset: number = 0,
  receivedOffset: number = 0,
  plansOffset: number = 0,
  fetchImpl: FetchLike = fetch,
): Promise<EconomyAnswer> {
  // v392 — the three lists page INDEPENDENTLY: the subscriptions held, the subscriptions received and
  // the plans offered are three different questions about three different sets, and one page for all
  // three would answer none of them. A negative offset is the first window, not a question about a
  // page before the first.
  const subsFrom = Math.max(subsOffset, 0);
  const receivedFrom = Math.max(receivedOffset, 0);
  const plansFrom = Math.max(plansOffset, 0);
  try {
    const res = await fetchImpl(
      `/api/economy?account=${encodeURIComponent(accountId)}&offset=${subsFrom}&receivedOffset=${receivedFrom}&plansOffset=${plansFrom}`,
      {
        headers: { accept: 'application/json' },
        signal: callSignal(),
      },
    );
    if (!res.ok) {
      let why = `the economy answered HTTP ${res.status}`;
      try {
        const failure = await res.json();
        if (typeof failure === 'object' && failure !== null && typeof (failure as { reason?: unknown }).reason === 'string') {
          why = (failure as { reason: string }).reason;
        }
      } catch {
        // no body — the status line stays as the reason
      }
      return { ok: false, reason: why };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { ok: false, reason: 'the economy answered something that is not JSON' };
    }
    if (typeof body !== 'object' || body === null) {
      return { ok: false, reason: 'the economy answered with neither an object nor a reason' };
    }
    const { subscriptions, received, plans, tips, subscriptionCount, subscriptionTotalsByPeriod, receivedCount, receivedTotalsByPeriod, planCount, limit, subscriptionOffset, receivedOffset: receivedOffsetEcho, planOffset } = body as {
      subscriptions?: readonly unknown[];
      received?: readonly unknown[];
      plans?: readonly unknown[];
      tips?: readonly unknown[];
      subscriptionCount?: unknown;
      subscriptionTotalsByPeriod?: unknown;
      receivedCount?: unknown;
      receivedTotalsByPeriod?: unknown;
      planCount?: unknown;
      limit?: unknown;
      subscriptionOffset?: unknown;
      receivedOffset?: unknown;
      planOffset?: unknown;
    };
    if (!Array.isArray(subscriptions) && !Array.isArray(plans)) {
      return { ok: false, reason: 'the economy answered with no subscriptions or plans' };
    }
    return {
      ok: true,
      subscriptions: toSubscriptionRows(subscriptions ?? []),
      // v310 — and the creator's other side: who backs this account.
      received: toSubscriptionRows(received ?? []),
      // v309 — the creator's own side of the economy.
      plans: toPlanRows(plans ?? []),
    // v373 — and the count beside them, so the panel can say its list is a window.
    planCount: typeof planCount === 'number' ? planCount : null,
      // v359 — and the counts and the totals, which are about the WHOLE table and not about the rows
      // the answer happens to carry.
      subscriptionCount: typeof subscriptionCount === 'number' ? subscriptionCount : undefined,
      subscriptionTotalsByPeriod: toPeriodTotals(subscriptionTotalsByPeriod),
      receivedCount: typeof receivedCount === 'number' ? receivedCount : undefined,
      receivedTotalsByPeriod: toPeriodTotals(receivedTotalsByPeriod),
      tips: toTipRows(tips ?? [], (text) => text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>') ),
      // v392 — and the windows these rows are FOR, echoed from the ask: three reads in flight cannot
      // be mistaken for each other's answers (v382's rule).
      limit: typeof limit === 'number' && Number.isFinite(limit) ? limit : undefined,
      subscriptionOffset: typeof subscriptionOffset === 'number' ? subscriptionOffset : subsFrom,
      receivedOffset: typeof receivedOffsetEcho === 'number' ? receivedOffsetEcho : receivedFrom,
      planOffset: typeof planOffset === 'number' ? planOffset : plansFrom,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}