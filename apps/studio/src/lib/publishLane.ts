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

import type { OwnerClaim } from './accounts';

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
 */
export async function publishProject(
  projectId: string,
  title: string,
  document: unknown,
  /** The Studio's claim of who published this (attach-only; the service decides what it is worth). */
  owner?: OwnerClaim,
): Promise<PublishLaneAnswer> {
  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'publish', projectId, title, document, ...(owner ? { owner } : {}) }),
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

/** One row of a listing, as the service states it — receipt facts and no document. */
export interface PublishLaneListingEntry {
  projectId: string;
  title: string;
  version: number;
  publishedAt: string;
  url: string;
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
export async function listPublished(limit: number): Promise<PublishLaneListing> {
  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'list', limit }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as PublishLaneListing;
    return { ok: false, reason: `publish route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Take a publication down. `claimer` is the account id asking to take it down; required by the service
 *  when the row has an owner (ADR 0018). When omitted the service answers under the pre-v242 rule. */
export async function unpublish(
  projectId: string,
  /** The account id asking to take the publication down. */
  claimer?: string,
): Promise<PublishLaneRemoval> {
  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'unpublish', projectId, ...(claimer ? { claimer } : {}) }),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') return parsed as PublishLaneRemoval;
    return { ok: false, reason: `publish route answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `studio server unreachable: ${e instanceof Error ? e.message : String(e)}` };
  }
}
