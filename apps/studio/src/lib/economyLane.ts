/**
 * M8 v274 — the browser half of the CREATOR ECONOMY's reading lane.
 *
 * The server does not have monetization endpoints yet (ADR 0018 blocks accounts/sessions/tokens).
 * This lane GETs this Studio's own `/api/economy` and answers with a REASON, never a thrown error.
 * When the service is built, the route will forward the service's own answer.
 */
import { toSubscriptionRows, toTipRows, type SubscriptionRow, type TipRow } from './economy';

export interface EconomyAnswer {
  ok: boolean;
  subscriptions?: SubscriptionRow[];
  tips?: TipRow[];
  reason?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Read the economy surface — subscriptions and tips for the current viewer. */
export async function readEconomy(fetchImpl: FetchLike = fetch): Promise<EconomyAnswer> {
  try {
    const res = await fetchImpl('/api/economy', { headers: { accept: 'application/json' } });
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
    const { subscriptions, tips } = body as { subscriptions?: readonly unknown[]; tips?: readonly unknown[] };
    if (!Array.isArray(subscriptions) && !Array.isArray(tips)) {
      return { ok: false, reason: 'the economy answered with no subscriptions or tips' };
    }
    return {
      ok: true,
      subscriptions: toSubscriptionRows(subscriptions ?? []),
      tips: toTipRows(tips ?? [], (text) => text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>') ),
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}