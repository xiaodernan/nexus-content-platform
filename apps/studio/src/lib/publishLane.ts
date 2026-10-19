/**
 * M7 v194 (ADR 0016 amendment 194): the CLIENT half of the Studio's Publish face — a fetch adapter, nothing
 * more. It imports NOTHING from `publishServer.ts` (which holds the service's address): the browser bundle
 * gets only this module's locally-stated types, the same split v172 and v184 used for the container and disk
 * lanes.
 *
 * **Unavailability is a NORMAL answer**, not an error. `services/nexus-api` not running is the ordinary state
 * of a frontend-first repository, so `probePublish` reports `available: false` with a reason and the panel
 * says so — rather than rendering a failure the user would read as their own mistake.
 */

import { ownerClaim, type AccountRecord, type OwnerClaim } from './accounts';
import { currentAccount } from './currentAccount';

/**
 * M7 v263 — WHERE THE LANE ASKS "who is this device publishing as?".
 *
 * The account lives in the BROWSER's storage, and the service is one hop behind the Studio's own route, so
 * the claim has to be attached on THIS side of the wire: the server cannot read a browser's localStorage, and
 * the browser must not hold the service's address. The seam is injected (ADR 0002's testability) so a test
 * can name the answer, and the default reads the SAME record the account panel writes — which is the whole
 * point of the wiring: the account a person sets is the claim they publish, with no second thing to remember.
 */
export interface ClaimSource {
  /** The account this device currently is, or `null` when none is set. */
  current(): AccountRecord | null;
  /** The instant the claim carries. The caller names it so a test can pin it. */
  now(): number;
}

/** The browser's own current-device account — the record `AccountPanel` writes. */
const deviceClaimSource: ClaimSource = {
  current: () => currentAccount.getCurrentAccount(),
  now: () => Date.now(),
};

/**
 * The claim this device would publish under, or `null` when no account is set.
 *
 * `null` is a REAL answer, not a gap: the service's pre-v242 rule is that a publication naming nobody stays
 * open to anybody, and a device that has set no account is exactly that case.
 */
export function claimOf(source: ClaimSource = deviceClaimSource): OwnerClaim | null {
  const account = source.current();
  return account ? ownerClaim(account, source.now()) : null;
}

/** The route's GET answer (shape owned by publishServer.ts; re-stated here, not imported). */
export interface PublishLaneProbe {
  available: boolean;
  apiBase: string;
  probeStatus?: number;
  reason?: string;
}

/** What a publish recorded. Every field but `ok` is the SERVICE's answer, passed through. */
export interface PublishLaneAnswer {
  ok: boolean;
  projectId?: string;
  title?: string;
  version?: number;
  publishedAt?: string;
  url?: string;
  reason?: string;
}

export async function probePublish(): Promise<PublishLaneProbe> {
  try {
    const res = await fetch('/api/publish', { cache: 'no-store' });
    if (!res.ok) return { available: false, apiBase: '', reason: `publish route answered ${res.status}` };
    return (await res.json()) as PublishLaneProbe;
  } catch (e) {
    return { available: false, apiBase: '', reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Publish a document. The caller names the project, the title and the document; the version, the instant and
 * the URL come back from the service. `owner` is the Studio's claim of who published this — attached, never
 * enforced by the client (ADR 0018). When omitted the service answers under the pre-v242 rule.
 *
 * **v263:** when the caller names no owner, the lane attaches THE CLAIM OF THIS DEVICE — the account the
 * account panel set — so the rule lives in ONE place and no caller can forget it. An explicit `owner` still
 * wins, because a caller that names a claim means it.
 */
export async function publishProject(
  projectId: string,
  title: string,
  document: unknown,
  /** The Studio's claim of who published this (attach-only; the service decides what it is worth). */
  owner?: OwnerClaim,
  /** Where the device's own claim is read from. Defaults to this device's current account. */
  source: ClaimSource = deviceClaimSource,
): Promise<PublishLaneAnswer> {
  const claim = owner ?? claimOf(source);
  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'publish', projectId, title, document, ...(claim ? { owner: claim } : {}) }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as PublishLaneAnswer;
    return { ok: false, reason: `publish route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Read a publication back, document included. */
export async function readPublished(projectId: string): Promise<PublishLaneAnswer & { document?: unknown }> {
  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read', projectId }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as PublishLaneAnswer & { document?: unknown };
    return { ok: false, reason: `publish route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Who the service says owns a row — the claim it RECORDED, read back.
 *
 * The `kind: 'owner-claim'` marker the client puts on the wire is the client's own; the service does not
 * repeat it, so this is the SERVICE's shape and it is stated here rather than borrowed from `accounts.ts`.
 * `claimedAt` is in the client's unit (milliseconds since the epoch) on both sides of the wire, which is
 * what the service now reads and writes (ADR 0016 amendment 263).
 */
export interface PublishLaneOwner {
  accountId: string;
  handle: string;
  assurance: string;
  claimedAt: number;
}

/** One row of a listing, as the service states it — receipt facts and no document. */
export interface PublishLaneListingEntry {
  projectId: string;
  title: string;
  version: number;
  publishedAt: string;
  url: string;
  /** Who owns this row, or null when the row names nobody (the pre-v242 rule, still in force). */
  owner?: PublishLaneOwner | null;
}

/** A listing. `count` is what the answer carries; `limit` is the cap the SERVICE applied. */
export interface PublishLaneListing {
  ok: boolean;
  publications?: PublishLaneListingEntry[];
  count?: number;
  limit?: number;
  reason?: string;
}

/** What an unpublish did. `removed: false` means there was nothing to take down — not a failure. */
export interface PublishLaneRemoval {
  ok: boolean;
  projectId?: string;
  removed?: boolean;
  reason?: string;
}

/** What is published, newest first. The service caps it; nothing is trimmed here. */
export async function listPublished(limit: number, owner?: string): Promise<PublishLaneListing> {
  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // v270 — an owner narrows the listing to ONE account's publications (a profile). A blank owner is
      // the ABSENCE of one, so it is not sent: "the publications of nobody" is not the whole table.
      body: JSON.stringify({ action: 'list', limit, ...(owner && owner.trim() ? { owner: owner.trim() } : {}) }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as PublishLaneListing;
    return { ok: false, reason: `publish route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Take a publication down. `claimer` is the account id asking to take it down; required by the service
 *  when the row has an owner (ADR 0018). When omitted the service answers under the pre-v242 rule.
 *
 *  **v263:** when the caller names no claimer, the lane sends THIS DEVICE's account id — so an author can
 *  take down what they published, and a device with no account sends nobody (the pre-v242 rule, which the
 *  service applies to a row that names no owner). */
export async function unpublish(
  projectId: string,
  /** The account id asking to take the publication down. */
  claimer?: string,
  /** Where the device's own claim is read from. Defaults to this device's current account. */
  source: ClaimSource = deviceClaimSource,
): Promise<PublishLaneRemoval> {
  const who = claimer ?? claimOf(source)?.accountId;
  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'unpublish', projectId, ...(who ? { claimer: who } : {}) }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as PublishLaneRemoval;
    return { ok: false, reason: `publish route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}
