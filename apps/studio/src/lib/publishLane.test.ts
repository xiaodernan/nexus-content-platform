import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishProject, unpublish } from './publishLane';

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