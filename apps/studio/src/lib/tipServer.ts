/**
 * M7 v298 — the server-side half of the TIPS reader and writer.
 *
 * The service's address is server-side, and both the profile page (server-rendered) and the Studio's own
 * route (server-side) read and write through here.
 *
 * A failed call answers with a REASON rather than a thrown error: a profile page that says "the tips could
 * not be read" is an honest page, and one that throws into a route handler is a 500 for a page whose
 * PUBLICATIONS are perfectly fine.
 */
import { nexusApiBase } from './publishServer';

/** One tip, in the service's own wire shape. */
export interface TipEntry {
  id: string;
  recipientId: string;
  payerId: string;
  amountCents: number;
  currency: string;
  message: string;
  anonymous: boolean;
  createdAt: number;
  handle?: string | null;
  assurance?: string | null;
}

/** What one read of the tips answered. */
export interface TipsAnswer {
  ok: boolean;
  tips: TipEntry[];
  /** How much the account was given, in cents, as the DATABASE summed it. */
  totalCents: number;
  /** How many tips the answer carried. */
  count: number;
  reason?: string;
}

/** What one write answered. */
export interface TipWriteAnswer {
  ok: boolean;
  tip?: TipEntry;
  reason?: string;
}

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;

/** Read the tips one account received. */
/**
 * v332 — READ the tips one account GAVE — the other side of the same relation.
 *
 * <p>Same door, same shape: the query names the PAYER, and the answer carries the tips and the total the
 * DATABASE summed. A reader who gave money and could not see what they gave had a receipt with no place
 * to read it.
 */
export async function readTipsGiven(
  payerAccountId: string,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<TipsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/tips?payer=${encodeURIComponent(payerAccountId)}&limit=${encodeURIComponent(String(limit))}`,
      { headers: { accept: 'application/json' } },
    );
    const parsed: unknown = await res.json().catch(() => null);
    if (typeof parsed !== 'object' || parsed === null) {
      return { ok: false, tips: [], totalCents: 0, count: 0, reason: `the service's tips door answered HTTP ${res.status} with something that is not JSON` };
    }
    const body = parsed as { ok?: unknown; tips?: unknown; totalCents?: unknown; count?: unknown; message?: unknown };
    if (body.ok === false || !res.ok) {
      const reason =
        typeof body.message === 'string' ? body.message : `the service's tips door answered HTTP ${res.status}`;
      return { ok: false, tips: [], totalCents: 0, count: 0, reason };
    }
    return {
      ok: true,
      tips: Array.isArray(body.tips) ? (body.tips as TipEntry[]) : [],
      totalCents: typeof body.totalCents === 'number' ? body.totalCents : 0,
      count: typeof body.count === 'number' ? body.count : 0,
    };
  } catch (error) {
    return { ok: false, tips: [], totalCents: 0, count: 0, reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function readTips(
  recipientAccountId: string,
  limit: number,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<TipsAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(
      `${apiBase}/tips?recipient=${encodeURIComponent(recipientAccountId)}&limit=${encodeURIComponent(String(limit))}`,
      { headers: { accept: 'application/json' } },
    );
    if (!res.ok) {
      return { ok: false, tips: [], totalCents: 0, count: 0, reason: `the service's tips door answered HTTP ${res.status}` };
    }
    const parsed: unknown = await res.json().catch(() => null);
    if (!parsed || typeof parsed !== 'object') {
      return { ok: false, tips: [], totalCents: 0, count: 0, reason: 'the service answered its tips door with something that is not JSON' };
    }
    const body = parsed as { tips?: unknown; totalCents?: unknown; count?: unknown };
    if (!Array.isArray(body.tips)) {
      return { ok: false, tips: [], totalCents: 0, count: 0, reason: 'the service answered its tips door with no tips' };
    }
    return {
      ok: true,
      tips: body.tips as TipEntry[],
      totalCents: typeof body.totalCents === 'number' ? body.totalCents : 0,
      count: typeof body.count === 'number' ? body.count : body.tips.length,
    };
  } catch (error) {
    return {
      ok: false,
      tips: [],
      totalCents: 0,
      count: 0,
      reason: `nexus-api unreachable at ${apiBase}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** GIVE a tip, on the service. The claim travels exactly as the browser built it. */
export async function tipOnService(
  recipientAccountId: string,
  amountCents: number,
  message: string,
  anonymous: boolean,
  claim: { accountId: string; handle?: string | null; assurance?: string | null; claimedAt?: number | null },
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<TipWriteAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/tips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        recipientAccountId,
        amountCents,
        message,
        anonymous,
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
 * The tip is read ONLY when the answer says `ok`: a refusal carries a reason and no numbers, and a lane
 * that filled in a count of zero on a refusal would make a refused tip look like a tip that found nobody.
 */
function readWriteAnswer(res: Response, body: unknown): TipWriteAnswer {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: `the tips answered HTTP ${res.status} with something that is not JSON` };
  }
  const answer = body as { ok?: unknown; tips?: unknown; reason?: unknown; message?: unknown };
  // v313 — the reason is read whenever the answer is NOT ok, and not only when the body
  // says `ok: false`: the service’s error body carries no `ok` field at all (it is `{error, message}`),
  // so the old shape threw away every message the service ever wrote.
  if (answer.ok === false || !res.ok) {
    const reason =
      typeof answer.reason === 'string'
        ? answer.reason
        : typeof answer.message === 'string'
          ? answer.message
          : `the tips answered HTTP ${res.status}`;
    return { ok: false, reason };
  }
  const tips = Array.isArray(answer.tips) ? (answer.tips as TipEntry[]) : [];
  return { ok: true, tip: tips[0] };
}
