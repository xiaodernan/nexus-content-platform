/**
 * M7 v194 (ADR 0016 amendment 194): the SERVER half of the Studio's Publish face — the only place in the
 * Studio that talks to `services/nexus-api` (ADR 0011's system of record).
 *
 * It lives here rather than in the browser for one reason: the browser must not hold the service's address
 * or reach it directly. The Studio's own route (`app/api/publish`) fronts it, so the service stays behind
 * one hop that can add auth, a base URL and a timeout later without the client changing at all — the same
 * split v172 and v184 used for the container and disk lanes.
 *
 * **Unavailability is a NORMAL answer.** A service that is not running is the ordinary state of a
 * frontend-first repository, so `publishState()` reports `available: false` with a reason instead of
 * throwing, and a publish against a down service answers `ok: false` naming what happened. A 404 from the
 * probe path is how "reachable" is decided: the service answers 404 for a project it has never published,
 * which is exactly the answer that proves it is alive and speaking HTTP.
 */

/** Where the service lives. One variable, so a deployment can point the Studio at another host. */
const DEFAULT_API_BASE = 'http://127.0.0.1:8080';

/** How long a call to the service may take. A publish is a small write; a hung one should not hang the UI. */
const CALL_TIMEOUT_MS = 5000;

export function nexusApiBase(): string {
  const configured = process.env.NEXUS_API_URL;
  return configured && configured.trim() ? configured.trim().replace(/\/+$/, '') : DEFAULT_API_BASE;
}

/** What the Studio can say about the service without publishing anything. */
export interface PublishState {
  available: boolean;
  /** The base URL this Studio would call. Reported even when unavailable, so a reader knows where it looked. */
  apiBase: string;
  /** The service's own answer for the probe id — 404 means "alive, and has nothing published under it". */
  probeStatus?: number;
  reason?: string;
}

/** What a publish recorded, as the service stated it. */
export interface PublishAnswer {
  ok: boolean;
  projectId?: string;
  title?: string;
  version?: number;
  publishedAt?: string;
  /** The URL the SERVICE says serves this publication. Passed through, never rebuilt here. */
  url?: string;
  reason?: string;
}

/** A publication read back, document included. */
export interface PublicationAnswer {
  ok: boolean;
  projectId?: string;
  title?: string;
  version?: number;
  publishedAt?: string;
  url?: string;
  document?: unknown;
  /**
   * v196 — the service said NOTHING IS PUBLISHED under this id (a 404), which is a different fact from "the
   * service did not answer". A caller that needs to tell them apart must not read the `reason` sentence:
   * the artifact page's 404-vs-503 depends on this flag, and a route that pattern-matched the wording would
   * silently start answering 503 the day someone reworded it.
   */
  notFound?: boolean;
  reason?: string;
}

/** A `fetch` shaped narrowly enough to inject in a test and to stand in for the global one. */
export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<Response>;

/** How many publications a listing asks for when the caller names no limit. Mirrors the service's own
 *  default; the SERVICE still applies its cap, and the answer says which cap it used. */
export const DEFAULT_LIST_LIMIT = 20;

const probeId = '__nexus_studio_probe__';

/** A timeout that does not keep the process alive. */
function callSignal(): AbortSignal {
  return AbortSignal.timeout(CALL_TIMEOUT_MS);
}

/**
 * Is the service there? A 404 on the probe id is a YES — it means the service answered HTTP and has nothing
 * published under that id. Any other outcome is a NO that says what happened.
 */
export async function publishState(fetchImpl: FetchLike = fetch as FetchLike): Promise<PublishState> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/projects/${probeId}`, { signal: callSignal() });
    if (res.status === 404) return { available: true, apiBase, probeStatus: 404 };
    return { available: false, apiBase, probeStatus: res.status, reason: `the service answered ${res.status} for the probe id; a reachable nexus-api answers 404 for a project it has never published` };
  } catch (e) {
    return { available: false, apiBase, reason: `nexus-api unreachable at ${apiBase}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Publish a document. The Studio names the project, the title and the document; EVERYTHING else — the
 * version, the instant, the URL — is the service's answer, passed through unchanged. A Studio that computed
 * a version or a URL itself would be reporting its own guess about a record it did not write.
 */
export async function publishDocument(
  projectId: string,
  title: string,
  document: unknown,
  fetchImpl: FetchLike = fetch as FetchLike,
): Promise<PublishAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/projects/${encodeURIComponent(projectId)}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, document }),
      signal: callSignal(),
    });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') {
      const body = parsed as Record<string, unknown>;
      if (res.ok) {
        return {
          ok: true,
          projectId: typeof body.projectId === 'string' ? body.projectId : projectId,
          title: typeof body.title === 'string' ? body.title : title,
          version: typeof body.version === 'number' ? body.version : undefined,
          publishedAt: typeof body.publishedAt === 'string' ? body.publishedAt : undefined,
          url: typeof body.url === 'string' ? body.url : undefined,
        };
      }
      // The service's own refusal sentence is the useful one — it names the rule that was broken. Passing it
      // through beats replacing it with "publish failed".
      const message = typeof body.message === 'string' ? body.message : undefined;
      return { ok: false, reason: message ?? `nexus-api answered ${res.status}` };
    }
    return { ok: false, reason: `nexus-api answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `nexus-api unreachable at ${apiBase}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Read a publication back, document included. `ok: false` for a project nothing has published. */
export async function readPublication(projectId: string, fetchImpl: FetchLike = fetch as FetchLike): Promise<PublicationAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/projects/${encodeURIComponent(projectId)}`, { signal: callSignal() });
    if (res.status === 404) return { ok: false, notFound: true, reason: `nothing is published as "${projectId}"` };
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') {
      const body = parsed as Record<string, unknown>;
      return {
        ok: true,
        projectId: typeof body.projectId === 'string' ? body.projectId : projectId,
        title: typeof body.title === 'string' ? body.title : undefined,
        version: typeof body.version === 'number' ? body.version : undefined,
        publishedAt: typeof body.publishedAt === 'string' ? body.publishedAt : undefined,
        url: typeof body.url === 'string' ? body.url : undefined,
        document: body.document,
      };
    }
    return { ok: false, reason: `nexus-api answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `nexus-api unreachable at ${apiBase}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** One row of a listing: the receipt's facts, and NO document — the service's own shape. */
export interface ListingEntry {
  projectId: string;
  title: string;
  version: number;
  publishedAt: string;
  url: string;
}

/** A listing as the service states it. `count` is what this answer carries; `limit` is the cap applied. */
export interface ListingAnswer {
  ok: boolean;
  publications?: ListingEntry[];
  count?: number;
  limit?: number;
  reason?: string;
}

/** What an unpublish did. `removed: false` means there was nothing to take down — not a failure. */
export interface RemovalAnswer {
  ok: boolean;
  projectId?: string;
  removed?: boolean;
  reason?: string;
}

/**
 * What is published, newest first. The SERVICE caps the answer and says which cap it used, so this function
 * passes the limit through and reports what came back rather than trimming anything itself.
 */
export async function listPublications(limit: number, fetchImpl: FetchLike = fetch as FetchLike): Promise<ListingAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/projects?limit=${encodeURIComponent(String(limit))}`, { signal: callSignal() });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') {
      const body = parsed as Record<string, unknown>;
      if (res.ok && Array.isArray(body.publications)) {
        return {
          ok: true,
          publications: body.publications as ListingEntry[],
          count: typeof body.count === 'number' ? body.count : body.publications.length,
          limit: typeof body.limit === 'number' ? body.limit : limit,
        };
      }
      const message = typeof body.message === 'string' ? body.message : undefined;
      return { ok: false, reason: message ?? `nexus-api answered ${res.status}` };
    }
    return { ok: false, reason: `nexus-api answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `nexus-api unreachable at ${apiBase}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Take a publication down. `removed: false` for a project that has none is the service's own answer and is
 * reported as a success with `removed: false` — the same rule the Studio's disk lane uses for a delete of a
 * name that is not there.
 */
export async function unpublishProject(projectId: string, fetchImpl: FetchLike = fetch as FetchLike): Promise<RemovalAnswer> {
  const apiBase = nexusApiBase();
  try {
    const res = await fetchImpl(`${apiBase}/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE', signal: callSignal() });
    const parsed: unknown = await res.json().catch(() => null);
    if (parsed && typeof parsed === 'object') {
      const body = parsed as Record<string, unknown>;
      if (res.ok) {
        return { ok: true, projectId: typeof body.projectId === 'string' ? body.projectId : projectId, removed: body.removed === true };
      }
      const message = typeof body.message === 'string' ? body.message : undefined;
      return { ok: false, reason: message ?? `nexus-api answered ${res.status}` };
    }
    return { ok: false, reason: `nexus-api answered ${res.status} with a non-JSON body` };
  } catch (e) {
    return { ok: false, reason: `nexus-api unreachable at ${apiBase}: ${e instanceof Error ? e.message : String(e)}` };
  }
}
