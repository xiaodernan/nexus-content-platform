/**
 * M7 v298 — the browser half of the TIPS lane.
 *
 * The service's address is server-side, so the browser talks to THIS Studio's own `/api/tips`, which
 * forwards to the service. The lane answers with a REASON and never a thrown error.
 */

/**
 * How long a call to the Studio's own door may take — a READ or a write alike. A hung request is worse
 * than a refused one: the composer would sit there saying nothing.
 *
 * v294 — and it is 45 seconds, not 10. The Studio's own door is a `next dev` server in this repository, and
 * the FIRST call to a route pays that route's compile: a ten-second timeout was killing requests that were
 * about to be answered, and the lane reported a timeout where the truth was "the server was still building
 * it".
 *
 * v478 — the READS ride it too. `readMyTips` and `readMyTipsGiven` fetched with no signal at all, so a door
 * that never answered hung the tip history forever with no reason to show; a budget that covers only the
 * writes is a budget that believes only the writes can hang.
 */
export const CALL_TIMEOUT_MS = 45_000;

/** A signal that aborts the request when it takes too long. */
function callSignal(): AbortSignal {
  return AbortSignal.timeout(CALL_TIMEOUT_MS);
}

export interface TipLaneAnswer {
  ok: boolean;
  tip?: { recipientId: string; amountCents: number };
  reason?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * READ the tips an account received — the creator's own view of what people gave them.
 *
 * <p>The count and the total are the SERVICE's facts (the total is the DATABASE's sum), and the lane
 * reports them unchanged: a panel that added to the count would be showing a number the service never
 * said.
 */
export async function readMyTips(
  recipientAccountId: string,
  offset: number = 0,
  fetchImpl: FetchLike = fetch,
): Promise<{
  ok: boolean;
  /**
   * v331 — each tip carries WHO sent it.
   *
   * <p>The service has sent the payer's name since the tip's own beginning (the row keeps
   * `payer_handle`, and the wire has the slot) — and this lane was narrowing every tip to an amount, a
   * message and a flag, throwing the name away on the way in.
   */
  tips: {
    amountCents: number;
    message: string;
    anonymous: boolean;
    handle?: string | null;
    payerId?: string | null;
    /** v333 — WHEN the tip was given, in epoch millis. */
    createdAt?: number | null;
  }[];
  totalCents: number;
  count: number;
  /** The cap the service applied. */
  limit: number;
  /** v391 — the ROW this window starts at, echoed from the ask. */
  offset: number;
  reason?: string;
}> {
  const from = Math.max(offset, 0);
  try {
    const res = await fetchImpl(
      `/api/tips?recipient=${encodeURIComponent(recipientAccountId)}&offset=${encodeURIComponent(String(from))}`,
      { headers: { accept: 'application/json' }, signal: callSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, tips: [], totalCents: 0, count: 0, limit: 20, offset: from, reason: `the tips answered HTTP ${res.status} with something that is not JSON` };
    }
    const answer = parsed as { ok?: unknown; tips?: unknown; totalCents?: unknown; count?: unknown; limit?: unknown; reason?: unknown; message?: unknown };
    if (answer.ok === false || !res.ok) {
      const reason =
        typeof answer.reason === 'string'
          ? answer.reason
          : typeof answer.message === 'string'
            ? answer.message
            : `the tips answered HTTP ${res.status}`;
      return { ok: false, tips: [], totalCents: 0, count: 0, limit: 20, offset: from, reason };
    }
    return {
      ok: true,
      tips: Array.isArray(answer.tips)
        ? (answer.tips as {
            amountCents: number;
            message: string;
            anonymous: boolean;
            handle?: string | null;
            payerId?: string | null;
            createdAt?: number | null;
          }[])
        : [],
      totalCents: typeof answer.totalCents === 'number' ? answer.totalCents : 0,
      count: typeof answer.count === 'number' ? answer.count : 0,
      limit: typeof answer.limit === 'number' && Number.isFinite(answer.limit) ? answer.limit : 20,
      offset: from,
    };
  } catch (error) {
    return { ok: false, tips: [], totalCents: 0, count: 0, limit: 20, offset: from, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * READ the tips this account GAVE — the other side of the same relation (v332).
 *
 * <p>The count and the total are the SERVICE's facts (the total is the DATABASE's sum), and the lane
 * reports them unchanged.
 */
export async function readMyTipsGiven(
  payerAccountId: string,
  offset: number = 0,
  fetchImpl: FetchLike = fetch,
): Promise<{
  ok: boolean;
  tips: {
    amountCents: number;
    message: string;
    anonymous: boolean;
    handle?: string | null;
    payerId?: string | null;
    /** v333 — WHEN the tip was given, in epoch millis. */
    createdAt?: number | null;
  }[];
  totalCents: number;
  count: number;
  /** The cap the service applied. */
  limit: number;
  /** v391 — the ROW this window starts at, echoed from the ask. */
  offset: number;
  reason?: string;
}> {
  const from = Math.max(offset, 0);
  try {
    const res = await fetchImpl(
      `/api/tips?payer=${encodeURIComponent(payerAccountId)}&offset=${encodeURIComponent(String(from))}`,
      { headers: { accept: 'application/json' }, signal: callSignal() },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, tips: [], totalCents: 0, count: 0, limit: 20, offset: from, reason: `the tips answered HTTP ${res.status} with something that is not JSON` };
    }
    const answer = parsed as { ok?: unknown; tips?: unknown; totalCents?: unknown; count?: unknown; limit?: unknown; reason?: unknown; message?: unknown };
    if (answer.ok === false || !res.ok) {
      const reason =
        typeof answer.reason === 'string'
          ? answer.reason
          : typeof answer.message === 'string'
            ? answer.message
            : `the tips answered HTTP ${res.status}`;
      return { ok: false, tips: [], totalCents: 0, count: 0, limit: 20, offset: from, reason };
    }
    return {
      ok: true,
      tips: Array.isArray(answer.tips)
        ? (answer.tips as {
            amountCents: number;
            message: string;
            anonymous: boolean;
            handle?: string | null;
            payerId?: string | null;
            createdAt?: number | null;
          }[])
        : [],
      totalCents: typeof answer.totalCents === 'number' ? answer.totalCents : 0,
      count: typeof answer.count === 'number' ? answer.count : 0,
      limit: typeof answer.limit === 'number' && Number.isFinite(answer.limit) ? answer.limit : 20,
      offset: from,
    };
  } catch (error) {
    return { ok: false, tips: [], totalCents: 0, count: 0, limit: 20, offset: from, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Give a tip. */
export async function giveTip(
  recipientAccountId: string,
  amountCents: number,
  message: string,
  anonymous: boolean,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch,
): Promise<TipLaneAnswer> {
  try {
    const res = await fetchImpl('/api/tips', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ recipientAccountId, amountCents, message, anonymous, claim }),
      signal: callSignal(),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, reason: `the tips answered HTTP ${res.status} with something that is not JSON` };
    }
    const answer = parsed as { ok?: unknown; tips?: unknown; reason?: unknown; message?: unknown };
    if (answer.ok === false || !res.ok) {
      const reason =
        typeof answer.reason === 'string'
          ? answer.reason
          : typeof answer.message === 'string'
            ? answer.message
            : `the tips answered HTTP ${res.status}`;
      return { ok: false, reason };
    }
    const tips = Array.isArray(answer.tips) ? (answer.tips as { recipientId: string; amountCents: number }[]) : [];
    return { ok: true, tip: tips[0] };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
