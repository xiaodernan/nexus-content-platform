import { afterEach, describe, expect, it, vi } from 'vitest';
import { listPublications, publishDocument, publishState, readPublication, unpublishProject, nexusApiBase, type FetchLike } from './publishServer';

/**
 * M7 v194 — the Studio's half of the publish lane.
 *
 * The service is FAKED here on purpose: what this suite checks is what the Studio does with the service's
 * answers — pass them through unchanged, keep the service's own refusal sentence, and treat "not running" as
 * a normal answer. Whether the real service behaves is `docs/evidence/m7/publish-proof.mjs`'s subject, and
 * faking it here is what keeps these cases fast enough to run on every change.
 */

/** A minimal Response stand-in: only the two things publishServer reads. */
function response(status: number, body: unknown): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  } as unknown as Response;
}

const RECEIPT = {
  projectId: 'doc-1',
  title: 'Harbour at dusk',
  version: 2,
  publishedAt: '2026-10-07T15:19:01.824829Z',
  url: 'http://127.0.0.1:8080/projects/doc-1',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('publishServer — the base URL', () => {
  it('defaults to the local service and takes NEXUS_API_URL when it is set', () => {
    vi.stubEnv('NEXUS_API_URL', '');
    expect(nexusApiBase()).toBe('http://127.0.0.1:8080');

    vi.stubEnv('NEXUS_API_URL', 'https://api.example.test/');
    // The trailing slash is stripped: a base with one would build `…//projects/…`.
    expect(nexusApiBase()).toBe('https://api.example.test');
  });
});

describe('publishServer — probing whether the service is there', () => {
  it('a 404 for the probe id means AVAILABLE — it answered HTTP and has nothing published', async () => {
    const fetchImpl = vi.fn(async () => response(404, undefined)) as unknown as FetchLike;
    const state = await publishState(fetchImpl);

    expect(state.available).toBe(true);
    expect(state.probeStatus).toBe(404);
    expect(state.apiBase).toBe('http://127.0.0.1:8080');
  });

  it('any other status is UNAVAILABLE, and the reason says what the service answered', async () => {
    const fetchImpl = vi.fn(async () => response(500, undefined)) as unknown as FetchLike;
    const state = await publishState(fetchImpl);

    expect(state.available).toBe(false);
    expect(state.probeStatus).toBe(500);
    expect(state.reason).toContain('answered 500');
  });

  it('a service that is not running is a NORMAL answer, not a thrown error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch failed');
    }) as unknown as FetchLike;

    const state = await publishState(fetchImpl);

    expect(state.available).toBe(false);
    expect(state.reason).toContain('unreachable at http://127.0.0.1:8080');
    expect(state.reason).toContain('fetch failed');
  });
});

describe('publishServer — publishing', () => {
  it('passes the service’s receipt through unchanged', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      return response(201, RECEIPT);
    }) as unknown as FetchLike;

    const answer = await publishDocument('doc-1', 'Harbour at dusk', { pages: [] }, fetchImpl);

    expect(answer).toEqual({ ok: true, ...RECEIPT });
    // The Studio sends the project, the title and the document — nothing else. It does not send a version,
    // an instant or a URL, because those are the service's to decide.
    expect(calls[0]!.url).toBe('http://127.0.0.1:8080/projects/doc-1/publish');
    expect(calls[0]!.body).toEqual({ title: 'Harbour at dusk', document: { pages: [] } });
  });

  it('attaches the owner claim when the Studio names one — the claim rides in the body, not in the URL', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = (async (url: string, init?: { body?: string }) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      return response(201, { ...RECEIPT, owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 } });
    }) as unknown as FetchLike;

    const owner = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local' as const, claimedAt: 1_700_000_000_000 };
    const answer = await publishDocument('doc-1', 'Harbour at dusk', { pages: [] }, fetchImpl, owner as any);

    expect(answer.ok).toBe(true);
    expect(calls[0]!.body).toEqual({
      title: 'Harbour at dusk',
      document: { pages: [] },
      owner: { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 },
    });
  });

  it('URL-encodes the project id so a document id with a slash cannot change the path', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return response(201, RECEIPT);
    }) as unknown as FetchLike;

    await publishDocument('doc/with/slashes', 't', {}, fetchImpl);

    expect(urls[0]).toBe('http://127.0.0.1:8080/projects/doc%2Fwith%2Fslashes/publish');
  });

  it('keeps the SERVICE’S OWN refusal sentence — it names the rule that was broken', async () => {
    const fetchImpl = vi.fn(async () => response(400, { error: 'invalid-publication', message: 'document must be a JSON object, got string' })) as unknown as FetchLike;

    const answer = await publishDocument('doc-1', 't', 'nope', fetchImpl);

    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('document must be a JSON object, got string');
  });

  it('a non-JSON answer and an unreachable service both answer ok:false with a reason', async () => {
    const nonJson = vi.fn(async () => response(502, undefined)) as unknown as FetchLike;
    expect((await publishDocument('doc-1', 't', {}, nonJson)).reason).toContain('non-JSON body');

    const down = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as FetchLike;
    const answer = await publishDocument('doc-1', 't', {}, down);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('ECONNREFUSED');
  });
});

describe('publishServer — reading a publication back', () => {
  it('returns the publication with its document', async () => {
    const publication = { ...RECEIPT, document: { pages: [{ id: 'p1' }] } };
    const fetchImpl = vi.fn(async () => response(200, publication)) as unknown as FetchLike;

    const answer = await readPublication('doc-1', fetchImpl);

    expect(answer.ok).toBe(true);
    expect(answer.version).toBe(2);
    expect(answer.document).toEqual({ pages: [{ id: 'p1' }] });
  });

  it('a 404 is “nothing is published as …”, not a failure with no explanation', async () => {
    const fetchImpl = vi.fn(async () => response(404, undefined)) as unknown as FetchLike;

    const answer = await readPublication('nobody', fetchImpl);

    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('nothing is published as "nobody"');
  });
});

describe('publishServer — listing (v195)', () => {
  const LISTING = {
    publications: [
      { projectId: 'doc-b', title: 'Newer', version: 2, publishedAt: '2026-10-07T15:20:00Z', url: 'http://127.0.0.1:8080/projects/doc-b' },
      { projectId: 'doc-a', title: 'Older', version: 1, publishedAt: '2026-10-07T15:19:00Z', url: 'http://127.0.0.1:8080/projects/doc-a' },
    ],
    count: 2,
    limit: 20,
  };

  it('asks the service for a listing and reports the cap the SERVICE applied', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return response(200, LISTING);
    }) as unknown as FetchLike;

    const answer = await listPublications(20, fetchImpl);

    expect(urls[0]).toBe('http://127.0.0.1:8080/projects?limit=20');
    expect(answer.ok).toBe(true);
    expect(answer.count).toBe(2);
    // The cap comes from the service's answer, not from the number this caller asked for: asking for 10 000
    // would be answered with `limit: 100`, and the panel must show THAT.
    expect(answer.limit).toBe(20);
    expect(answer.publications).toHaveLength(2);
    expect(answer.publications?.[0]?.projectId).toBe('doc-b');
  });

  it('a listing entry carries no document — the service sends none and nothing here adds one', async () => {
    const fetchImpl = vi.fn(async () => response(200, LISTING)) as unknown as FetchLike;

    const answer = await listPublications(20, fetchImpl);

    for (const row of answer.publications ?? []) {
      expect(row).not.toHaveProperty('document');
    }
  });

  it('a refused limit keeps the service’s own sentence', async () => {
    const fetchImpl = vi.fn(async () => response(400, { error: 'invalid-publication', message: 'limit must be a positive number, got 0' })) as unknown as FetchLike;

    const answer = await listPublications(0, fetchImpl);

    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('limit must be a positive number, got 0');
  });

  it('an unreachable service is a normal answer', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as FetchLike;

    const answer = await listPublications(20, fetchImpl);

    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('ECONNREFUSED');
  });
});

describe('publishServer — unpublish (v195)', () => {
  it('sends a DELETE to the project URL and reports what was removed', async () => {
    const calls: { url: string; method?: string }[] = [];
    const fetchImpl = (async (url: string, init?: { method?: string }) => {
      calls.push({ url, method: init?.method });
      return response(200, { projectId: 'doc-1', removed: true });
    }) as unknown as FetchLike;

    const answer = await unpublishProject('doc-1', fetchImpl);

    expect(calls[0]).toEqual({ url: 'http://127.0.0.1:8080/projects/doc-1', method: 'DELETE' });
    expect(answer).toEqual({ ok: true, projectId: 'doc-1', removed: true });
  });

  it('sends the claimer as ?claimer= when the row has an owner to defend', async () => {
    const calls: { url: string; method?: string }[] = [];
    const fetchImpl = (async (url: string, init?: { method?: string }) => {
      calls.push({ url, method: init?.method });
      return response(200, { projectId: 'doc-1', removed: true });
    }) as unknown as FetchLike;

    const answer = await unpublishProject('doc-1', fetchImpl, 'acct-ada');

    expect(calls[0]).toEqual({ url: 'http://127.0.0.1:8080/projects/doc-1?claimer=acct-ada', method: 'DELETE' });
    expect(answer).toEqual({ ok: true, projectId: 'doc-1', removed: true });
  });

  it('“already down” is ok:true with removed:false — not a failure', async () => {
    const fetchImpl = vi.fn(async () => response(200, { projectId: 'gone', removed: false })) as unknown as FetchLike;

    const answer = await unpublishProject('gone', fetchImpl);

    expect(answer.ok).toBe(true);
    expect(answer.removed).toBe(false);
  });

  it('URL-encodes the project id so a slash cannot change the path', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => {
      urls.push(url);
      return response(200, { projectId: 'a/b', removed: true });
    }) as unknown as FetchLike;

    await unpublishProject('a/b', fetchImpl);

    expect(urls[0]).toBe('http://127.0.0.1:8080/projects/a%2Fb');
  });
});
