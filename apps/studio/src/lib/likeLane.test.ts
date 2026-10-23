import { describe, expect, it, vi } from 'vitest';

import { CALL_TIMEOUT_MS, likePublication, unlikePublication, readLikes } from './likeLane';

/**
 * M7 v284 — the browser half of the LIKES lane.
 *
 * The lane's rule is the one every lane here keeps: a FAILED read or write answers with a REASON and
 * never a thrown error, and a refusal carries NO count — a lane that filled in a count of zero on a
 * refusal would make a refused like look like a like that found nothing.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

const CLAIM = {
  kind: 'owner-claim' as const,
  accountId: 'acct-ada',
  handle: 'ada',
  assurance: 'unsigned-local' as const,
  claimedAt: 1_700_000_000_000,
};

describe('likeLane — likePublication (client half)', () => {
  it('asks the Studio\u2019s own door, with the project id and the claim', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/likes');
      expect(init?.method).toBe('POST');
      const body = JSON.parse(String(init?.body)) as { projectId: string; claim: { accountId: string } };
      expect(body.projectId).toBe('pub-1');
      expect(body.claim.accountId).toBe('acct-ada');
      return new Response(JSON.stringify({ ok: true, count: 1, liked: true }), { status: 200 });
    });
    const answer = await likePublication('pub-1', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.count).toBe(1);
    expect(answer.liked).toBe(true);
  });

  it('a REFUSAL carries the reason and NO count', async () => {
    const answer = await likePublication(
      'pub-1',
      CLAIM,
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'a like needs an account' }), { status: 400 })),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('a like needs an account');
    expect(answer.count).toBeUndefined();
  });

  it('a thrown fetch answers with the error\u2019s message rather than throwing into React', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    const answer = await likePublication('pub-1', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
  });

  it('something that is not JSON is a reason', async () => {
    const answer = await likePublication(
      'pub-1',
      CLAIM,
      makeFetch(() => new Response('<html>no</html>', { status: 200 })),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not JSON');
  });
});

describe('likeLane — unlikePublication (client half)', () => {
  it('asks the Studio\u2019s own door, with the claimer as a query parameter', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/likes/pub-1?claimer=acct-ada');
      expect(init?.method).toBe('DELETE');
      return new Response(JSON.stringify({ ok: true, count: 0, liked: false }), { status: 200 });
    });
    const answer = await unlikePublication('pub-1', 'acct-ada', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.count).toBe(0);
    expect(answer.liked).toBe(false);
  });

  it('encodes the project id', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('/api/likes/a%2Fb%20c?claimer=');
      return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
    });
    await unlikePublication('a/b c', 'acct-ada', fetchImpl);
  });
});

describe('likeLane — readLikes (client half)', () => {
  it('asks for the publication and the viewer', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/likes?projectId=pub-1&viewer=acct-ada');
      return new Response(JSON.stringify({ ok: true, count: 2, liked: true }), { status: 200 });
    });
    const answer = await readLikes('pub-1', 'acct-ada', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.count).toBe(2);
    expect(answer.liked).toBe(true);
  });

  it('a reader who is nobody asks WITHOUT a viewer', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/likes?projectId=pub-1');
      return new Response(JSON.stringify({ ok: true, count: 2, liked: false }), { status: 200 });
    });
    const answer = await readLikes('pub-1', null, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.liked).toBe(false);
  });

  it('a non-200 answers with a reason, not a throw', async () => {
    const answer = await readLikes('pub-1', null, makeFetch(() => new Response('', { status: 503 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('503');
  });
});

describe('likeLane — every call rides the one budget (v479)', () => {
  // v479 — the LIKE rode the budget from the start, but the TAKE-BACK (a DELETE) and the READ fetched
  // with no signal at all: a door that never answered hung the unlike forever and the likers list forever,
  // with no reason to show.
  it('the take-back and the read both carry a live, un-aborted signal', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const fetchImpl = makeFetch((_url, init) => {
      seen.push(init?.signal ?? undefined);
      return new Response(JSON.stringify({ ok: true, count: 0, liked: false }), { status: 200 });
    });

    await unlikePublication('pub-1', 'acct-ada', fetchImpl);
    await readLikes('pub-1', 'acct-ada', fetchImpl);

    expect(seen).toHaveLength(2);
    for (const signal of seen) {
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal?.aborted).toBe(false);
    }
  });

  it('the budget is the pinned 45 seconds on every call of the lane', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true, count: 1, liked: true }), { status: 200 }));
      await likePublication('pub-1', CLAIM, fetchImpl);
      await unlikePublication('pub-1', 'acct-ada', fetchImpl);
      await readLikes('pub-1', 'acct-ada', fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledTimes(3);
      expect(timeoutSpy.mock.calls.map((c) => c[0])).toEqual([45_000, 45_000, 45_000]);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('each call gets its own fresh signal — a deadline per call, never a shared one', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const fetchImpl = makeFetch((_url, init) => {
      seen.push(init?.signal ?? undefined);
      return new Response(JSON.stringify({ ok: true, count: 1, liked: true }), { status: 200 });
    });

    await readLikes('pub-1', 'acct-ada', fetchImpl);
    await readLikes('pub-1', 'acct-ada', fetchImpl);

    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('the exported constant names the one number the whole lane rides', () => {
    expect(CALL_TIMEOUT_MS).toBe(45_000);
  });
});