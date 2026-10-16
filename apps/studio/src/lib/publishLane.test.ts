import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishProject, unpublish, readPublished, listPublished } from './publishLane';

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