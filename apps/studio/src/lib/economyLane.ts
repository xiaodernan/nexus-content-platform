/**
 * M8 v274 — the browser half of the CREATOR ECONOMY's reading lane.
 *
 * The server does not have monetization endpoints yet (ADR 0018 blocks accounts/sessions/tokens).
 * This lane GETs this Studio's own `/api/economy` and answers with a REASON, never a thrown error.
 * When the service is built, the route will forward the service's own answer.
 */
import { toPlanRows, toSubscriptionRows, toTipRows, type PlanRow, type SubscriptionRow, type TipRow } from './economy';

export interface EconomyAnswer {
  ok: boolean;
  subscriptions?: SubscriptionRow[];
  /** v309 — the plans this account offers. */
  plans?: PlanRow[];
  tips?: TipRow[];
  reason?: string;
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
    const { subscriptions, plans, tips } = body as {
      subscriptions?: readonly unknown[];
      plans?: readonly unknown[];
      tips?: readonly unknown[];
    };
    if (!Array.isArray(subscriptions) && !Array.isArray(plans)) {
      return { ok: false, reason: 'the economy answered with no subscriptions or plans' };
    }
    return {
      ok: true,
      subscriptions: toSubscriptionRows(subscriptions ?? []),
      // v309 — the creator's own side of the economy.
      plans: toPlanRows(plans ?? []),
      tips: toTipRows(tips ?? [], (text) => text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>') ),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}