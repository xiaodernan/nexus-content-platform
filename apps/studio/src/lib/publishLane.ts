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
 * the URL come back from the service.
 */
export async function publishProject(projectId: string, title: string, document: unknown): Promise<PublishLaneAnswer> {
  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'publish', projectId, title, document }),
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
