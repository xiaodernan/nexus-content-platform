/**
 * M7 v298 — the browser half of the TIPS lane.
 *
 * The service's address is server-side, so the browser talks to THIS Studio's own `/api/tips`, which
 * forwards to the service. The lane answers with a REASON and never a thrown error.
 */

/**
 * How long a write may take. A hung request is worse than a refused one: the composer would sit there
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

export interface TipLaneAnswer {
  ok: boolean;
  tip?: { recipientId: string; amountCents: number };
  reason?: string;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

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
