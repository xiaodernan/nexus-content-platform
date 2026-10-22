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
  subscriptionTotalsByPeriod?: { period: string; totalCents: number }[];
  /** v359 — the count for the RECEIVED side. */
  receivedCount?: number;
  /** v368 — and its totals, per period. */
  receivedTotalsByPeriod?: { period: string; totalCents: number }[];
  reason?: string;
}

/**
 * The service's per-period totals, in the shape the panel reads.
 *
 * <p>A malformed group is DROPPED rather than shown: a period without a name, or an amount that is not a
 * number, is not a total — and a panel that showed half of one would be wrong about money.
 */
function toPeriodTotals(raw: unknown): { period: string; totalCents: number }[] {
  if (!Array.isArray(raw)) return [];
  const totals: { period: string; totalCents: number }[] = [];
  for (const group of raw) {
    if (typeof group !== 'object' || group === null) continue;
    const g = group as { period?: unknown; totalCents?: unknown };
    if (typeof g.period !== 'string' || g.period.length === 0) continue;
    if (typeof g.totalCents !== 'number' || !Number.isFinite(g.totalCents)) continue;
    totals.push({ period: g.period, totalCents: g.totalCents });
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
export async function readEconomy(accountId: string, fetchImpl: FetchLike = fetch): Promise<EconomyAnswer> {
  try {
    const res = await fetchImpl(`/api/economy?account=${encodeURIComponent(accountId)}`, {
      headers: { accept: 'application/json' },
      signal: callSignal(),
    });
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
    const { subscriptions, received, plans, tips, subscriptionCount, subscriptionTotalsByPeriod, receivedCount, receivedTotalsByPeriod } = body as {
      subscriptions?: readonly unknown[];
      received?: readonly unknown[];
      plans?: readonly unknown[];
      tips?: readonly unknown[];
      subscriptionCount?: unknown;
      subscriptionTotalsByPeriod?: unknown;
      receivedCount?: unknown;
      receivedTotalsByPeriod?: unknown;
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
      // v359 — and the counts and the totals, which are about the WHOLE table and not about the rows
      // the answer happens to carry.
      subscriptionCount: typeof subscriptionCount === 'number' ? subscriptionCount : undefined,
      subscriptionTotalsByPeriod: toPeriodTotals(subscriptionTotalsByPeriod),
      receivedCount: typeof receivedCount === 'number' ? receivedCount : undefined,
      receivedTotalsByPeriod: toPeriodTotals(receivedTotalsByPeriod),
      tips: toTipRows(tips ?? [], (text) => text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>') ),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}