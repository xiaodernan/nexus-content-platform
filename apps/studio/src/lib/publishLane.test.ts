import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishProject, unpublish, readPublished, listPublished, probePublish } from './publishLane';

function makeFetch(handler: (url: string, body: Record<string, unknown>) => Response) {
  return vi.fn(async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : undefined;
    return handler(url, body ?? {});
  }) as unknown as typeof fetch;

}

const OWNER = {
  kind: 'owner-claim' as const,
  accountId: 'acct-ada',
  handle: 'ada',
  assurance: 'unsigned-local' as const,
  claimedAt: 1_700_000_000_000,
};

describe('publishLane — publishProject (client half)', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends owner in the body when provided', async () => {
    const fetchImpl = makeFetch((_url, body) => {
      expect(body).toMatchObject({ action: 'publish', projectId: 'doc-1', owner: OWNER });
      return new Response(JSON.stringify({ ok: true, projectId: 'doc-1' }), { status: 200 });
    });
    globalThis.fetch = fetchImpl;
    const answer = await publishProject('doc-1', 'Harbour', { pages: [] }, OWNER);
    expect(answer.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('v338 — the call to the Studio carries a signal, so a slow COMPILE cannot hang the lane', async () => {
    // The Studio's own door is a `next dev` server, and the FIRST call to a route pays that route's
    // compile. A lane with no budget could be killed by a slow compile and report it as a failure of the
    // thing it was asking for — the same mistake the tip lane fixed in v294.
    let seen: AbortSignal | undefined;
    globalThis.fetch = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      seen = init?.signal ?? undefined;
      return new Response(JSON.stringify({ ok: true, projectId: 'doc-1' }), { status: 200 });
    }) as unknown as typeof fetch;

    const answer = await publishProject('doc-1', 'Harbour', { pages: [] });

    expect(answer.ok).toBe(true);
    expect(seen).toBeInstanceOf(AbortSignal);
  });

  it('omits owner from the body when not provided (pre-v242-compatible)', async () => {
    const fetchImpl = makeFetch((_url, body) => {
      expect(body.owner).toBeUndefined();
      expect(body.action).toBe('publish');
      return new Response(JSON.stringify({ ok: true, projectId: 'doc-1' }), { status: 200 });
    });
    globalThis.fetch = fetchImpl;
    const answer = await publishProject('doc-1', 'Harbour', { pages: [] });
    expect(answer.ok).toBe(true);
  });

  it('passes the service answer through unchanged', async () => {
    const fetchImpl = makeFetch((_url, _body) => {
      return new Response(
        JSON.stringify({ ok: true, projectId: 'doc-1', title: 'Harbour', version: 3, url: 'http://127.0.0.1:8080/projects/doc-1' }),
        { status: 200 },
      );
    });
    globalThis.fetch = fetchImpl;
    const answer = await publishProject('doc-1', 'Harbour', { pages: [] });
    expect(answer).toEqual({ ok: true, projectId: 'doc-1', title: 'Harbour', version: 3, url: 'http://127.0.0.1:8080/projects/doc-1' });
  });

  it('treats an unreachable service as a normal ok:false answer, never a throw', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const answer = await publishProject('doc-1', 'Harbour', { pages: [] });
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});

describe('publishLane — unpublish (client half)', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends claimer in the body when provided', async () => {
    const fetchImpl = makeFetch((_url, body) => {
      expect(body).toMatchObject({ action: 'unpublish', projectId: 'doc-1', claimer: 'acct-ada' });
      return new Response(JSON.stringify({ ok: true, projectId: 'doc-1', removed: true }), { status: 200 });
    });
    globalThis.fetch = fetchImpl;
    const answer = await unpublish('doc-1', 'acct-ada');
    expect(answer.ok).toBe(true);
    expect(answer.removed).toBe(true);
  });

  it('omits claimer from the body when not provided (pre-v242-compatible)', async () => {
    const fetchImpl = makeFetch((_url, body) => {
      expect(body.claimer).toBeUndefined();
      expect(body.action).toBe('unpublish');
      return new Response(JSON.stringify({ ok: true, projectId: 'doc-1', removed: true }), { status: 200 });
    });
    globalThis.fetch = fetchImpl;
    const answer = await unpublish('doc-1');
    expect(answer.ok).toBe(true);
    expect(answer.removed).toBe(true);
  });
});

describe('publishLane — readPublished (client half)', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends a read action naming the project', async () => {
    const fetchImpl = makeFetch((_url, body) => {
      expect(body).toMatchObject({ action: 'read', projectId: 'doc-1' });
      return new Response(JSON.stringify({ ok: true, projectId: 'doc-1', version: 2 }), { status: 200 });
    });
    globalThis.fetch = fetchImpl;
    const answer = await readPublished('doc-1');
    expect(answer.ok).toBe(true);
    expect(answer.version).toBe(2);
  });

  it('passes the document through when the service returns one', async () => {
    const doc = { pages: [{ id: 'p1' }] };
    const fetchImpl = makeFetch((_url, body) => {
      return new Response(JSON.stringify({ ok: true, projectId: 'doc-1', document: doc }), { status: 200 });
    });
    globalThis.fetch = fetchImpl;
    const answer = await readPublished('doc-1');
    expect(answer.document).toEqual(doc);
  });

  it('treats an unreachable service as ok:false without throwing', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const answer = await readPublished('doc-1');
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('unreachable');
  });
});

describe('publishLane — listPublished (client half)', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends a list action with the limit', async () => {
    const fetchImpl = makeFetch((_url, body) => {
      expect(body).toMatchObject({ action: 'list', limit: 24 });
      return new Response(JSON.stringify({ ok: true, count: 2, limit: 24 }), { status: 200 });
    });
    globalThis.fetch = fetchImpl;
    const answer = await listPublished(24);
    expect(answer.ok).toBe(true);
    expect(answer.count).toBe(2);
    expect(answer.limit).toBe(24);
  });

  it('treats a non-JSON body as ok:false', async () => {
    const fetchImpl = makeFetch(() => {
      return new Response('not json at all', { status: 200, headers: { 'content-type': 'text/plain' } });
    });
    globalThis.fetch = fetchImpl;
    const answer = await listPublished(24);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('non-JSON');
  });

  it('treats a 500 response as ok:false without throwing', async () => {
    const fetchImpl = makeFetch(() => {
      return new Response(JSON.stringify({ ok: false, reason: 'server error' }), { status: 500 });
    });
    globalThis.fetch = fetchImpl;
    const answer = await publishProject('doc-1', 'Harbour', { pages: [] });
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('server error');
  });
});

describe('publishLane — probePublish (client half)', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('passes the route answer through', async () => {
    globalThis.fetch = makeFetch(() => new Response(JSON.stringify({ available: true, apiBase: 'http://127.0.0.1:8080', probeStatus: 404 }), { status: 200 }));
    const p = await probePublish();
    expect(p.available).toBe(true);
    expect(p.apiBase).toBe('http://127.0.0.1:8080');
    expect(p.probeStatus).toBe(404);
  });

  it('answers a non-200 route with an honest unavailable', async () => {
    globalThis.fetch = makeFetch(() => new Response('nope', { status: 503 }));
    const p = await probePublish();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('publish route answered 503');
  });

  it('answers an unreachable server with an honest unavailable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const p = await probePublish();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('studio server unreachable');
  });
});

describe('publishLane — answer-shape edges', () => {
  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('publishProject: a non-JSON body is ok:false with the route status', async () => {
    globalThis.fetch = makeFetch(() => new Response('oops', { status: 502 }));
    const a = await publishProject('doc-1', 'Harbour', { pages: [] });
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('non-JSON body');
    expect(a.reason).toContain('502');
  });

  it('readPublished: a non-JSON body is ok:false with the route status', async () => {
    globalThis.fetch = makeFetch(() => new Response('oops', { status: 502 }));
    const a = await readPublished('doc-1');
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('non-JSON body');
    expect(a.reason).toContain('502');
  });

  it('listPublished: an unreachable service is ok:false, not a throw', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const a = await listPublished(24);
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('studio server unreachable');
  });

  it('unpublish: non-JSON and unreachable are both ok:false, not throws', async () => {
    globalThis.fetch = makeFetch(() => new Response('oops', { status: 502 }));
    const n = await unpublish('doc-1');
    expect(n.ok).toBe(false);
    expect(n.reason).toContain('non-JSON body');
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const u = await unpublish('doc-1');
    expect(u.ok).toBe(false);
    expect(u.reason).toContain('studio server unreachable');
  });
});
describe('publishLane — when the budget FIRES the door says it was LATE (v482)', () => {
  // The lane has carried a deadline since v294 (the writes) and v477–v481 (the reads), but a fired
  // budget surfaced the PLATFORM's string — "The operation was aborted due to timeout" — which names
  // neither the door nor the budget, and cannot tell a reader whether the door is gone or merely late.
  // The publish lane named this distinction in v294 and the service door in v337; v482 extends the
  // sentence to every lane.

  let originalFetch: typeof fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('a fired budget says the Studio was LATE — the v294 distinction, pinned at last', async () => {
    globalThis.fetch = vi.fn(async () => {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    }) as unknown as typeof fetch;
    const answer = await publishProject('doc-1', 'Harbour', { pages: [] });
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the Studio did not answer within 45 seconds');
    expect(answer.reason).not.toContain('aborted');
    expect(answer.reason).not.toContain('unreachable');
  });

  it('a Studio that is GONE still says unreachable — the distinction is real, not a rename', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const answer = await publishProject('doc-1', 'Harbour', { pages: [] });
    expect(answer.reason).toContain('studio server unreachable');
    expect(answer.reason).not.toContain('45 seconds');
  });
});

describe('publishLane — the probe answers a 200 it cannot read HONESTLY (v485)', () => {
  // The probe parsed its 200 body with a bare cast: a body that could not be read fell into the
  // catch and was answered "studio server unreachable" — a false sentence about a server that had
  // just answered. v485 parses it in its own try and names the route and the status instead, the
  // sentence every other door of this file already uses.

  it('a 200 with an unreadable body names the route and the status — not "unreachable"', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>nope</html>', { status: 200 })) as typeof fetch;
    const p = await probePublish();
    expect(p.available).toBe(false);
    expect(p.reason).toBe('publish route answered 200 with a non-JSON body');
    expect(p.reason).not.toContain('unreachable');
  });
});

describe('publishLane — a 200 whose body is JSON but NOT the probe’s shape is a named refusal (v486)', () => {
  // v485 closed the unreadable body; this closes the readable-but-wrong one. The dock reads
  // steps.length without a guard, so a wrong-shaped 200 would crash the panel — and a cast is not
  // a contract. The route ANSWERED; what it answered is not the thing this lane promised.

  it('a wrong-shaped 200 names the route and the status — never a crash, never a pass-through', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ available: 'yes', steps: 'nope' }), { status: 200 })) as typeof fetch;
    const p = await probePublish();
    expect(p.available).toBe(false);
    expect(p.reason).toBe('publish route answered 200 with a body that is not the probe’s shape');
    expect(p.apiBase).toBe('');
  });
});
