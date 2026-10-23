import { describe, expect, it, vi } from 'vitest';

import { likeOnService, readLikes, readLikesOnService, unlikeOnService } from './likeServer';
import { nexusApiBase } from './publishServer';

/**
 * M7 v400 — the server-side half of the LIKES reader.
 *
 * The rule this file exists for: **the answer names the window it is FOR.** The likers list pages by
 * rows, and a read that came back without the window it answered would leave the artifact page saying
 * "the 2 newest of 5" about the rows from 20 on — a true sentence about the first window and a false
 * one about the third (v386's correction). The window is forwarded on the way out and echoed on the
 * way back, so two reads in flight cannot be mistaken for each other's answers (v382's rule).
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

describe('likeServer — readLikes PAGES the likers (v400)', () => {
  const likersBody = (n: number, count: number) =>
    JSON.stringify({
      likes: Array.from({ length: n }, (_unused, i) => ({
        accountId: `acct-${i}`,
        projectId: 'pub-1',
        createdAt: 1_776_000_000_000,
        handle: `h${i}`,
        assurance: 'unsigned-local',
      })),
      liked: false,
      count,
      limit: 20,
      offset: 20,
    });

  it('the ask carries the window as limit and offset rows', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(likersBody(2, 21), { status: 200 });
    });
    const answer = await readLikes('pub-1', 20, 20, fetchImpl);
    expect(seen).toContain('projectId=pub-1');
    expect(seen).toContain('limit=20');
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(true);
    expect(answer.count).toBe(21);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
    expect(answer.likes).toHaveLength(2);
  });

  it('a negative offset is clamped to the first window, not refused', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(likersBody(1, 1), { status: 200 });
    });
    const answer = await readLikes('pub-1', 20, -5, fetchImpl);
    expect(seen).toContain('offset=0');
    expect(answer.offset).toBe(0);
  });

  it('the count is the WHOLE list and the window is the rows the answer carries', async () => {
    // A publication liked by twenty-one accounts, read with a window of twenty: the count is the
    // number a pager pages by, and the two likers in the window are not all of them.
    const fetchImpl = makeFetch(() => new Response(likersBody(2, 21), { status: 200 }));
    const answer = await readLikes('pub-1', 20, 20, fetchImpl);
    expect(answer.count).toBe(21);
    expect(answer.likes).toHaveLength(2);
  });

  it('an answer with no window keeps the one that was asked for', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ likes: [], liked: false, count: 0 }), { status: 200 }),
    );
    const answer = await readLikes('pub-1', 20, 20, fetchImpl);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
  });

  it('a refusal still names the window it was asked for', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(JSON.stringify({ error: 'likes-unavailable' }), { status: 503 });
    });
    const answer = await readLikes('pub-1', 20, 20, fetchImpl);
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(false);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
    expect(answer.reason).toContain('503');
  });

  it('a refusal is NOT a publication nobody liked', async () => {
    // v284's rule: "0 likes" and "the likes could not be read" are different facts, and a page that
    // showed the first when it knew the second would tell a reader nobody cared.
    const fetchImpl = makeFetch(() => new Response('not json', { status: 200 }));
    const answer = await readLikes('pub-1', 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not JSON');
  });
});


/**
 * v436 — the WRITE half of the likes door.
 *
 * `readLikes` is graded above; the two writes and the viewer read were reached only through the lanes
 * that call them, so the rules that make a write honest were never asked directly: what the claim
 * carries, which verb goes where, and above all that a REFUSAL carries no numbers. A lane that
 * answered a refused like with `count: 0` would make a like the service turned away look like a like
 * that found nothing — the same lie the read path refuses above, one HTTP verb later.
 */
describe('likeServer — the write path (v436)', () => {
  const okBody = (extra: Record<string, unknown> = {}) => JSON.stringify({ ok: true, ...extra });

  it('a like is POSTed to the likes door with the claim exactly as the browser built it', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(okBody({ count: 7, liked: true }), { status: 200 });
    });

    const answer = await likeOnService(
      'pub-1',
      { accountId: 'acct-9', handle: 'mira', assurance: 'unsigned-local', claimedAt: 1234 },
      fetchImpl,
    );

    expect(seenUrl).toBe(`${nexusApiBase()}/likes`);
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({ 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      projectId: 'pub-1',
      claim: { accountId: 'acct-9', handle: 'mira', assurance: 'unsigned-local', claimedAt: 1234 },
    });
    expect(answer).toEqual({ ok: true, count: 7, liked: true });
  });

  it('an absent handle, assurance or claimedAt is written as null, not dropped', async () => {
    // A field the browser did not fill is a field the claim says is EMPTY. Omitting it instead would
    // leave the service guessing whether the client knew and declined, or never asked.
    let body: unknown;
    const fetchImpl = makeFetch((_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(okBody({ count: 1, liked: true }), { status: 200 });
    });

    await likeOnService('pub-1', { accountId: 'acct-9' }, fetchImpl);

    expect(body).toEqual({
      projectId: 'pub-1',
      claim: { accountId: 'acct-9', handle: null, assurance: null, claimedAt: null },
    });
  });

  it('liked is the boolean the service said: a missing flag is false, not absent', async () => {
    const fetchImpl = makeFetch(() => new Response(okBody({ count: 3 }), { status: 200 }));
    const answer = await likeOnService('pub-1', { accountId: 'acct-9' }, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.count).toBe(3);
    expect(answer.liked).toBe(false);
  });

  it('a refused like carries a reason and NO count — a refusal is not a like that found nothing', async () => {
    // The rule this file exists for. A 200 that says ok:false is still a refusal, and filling in a
    // count of zero here would show the reader a like the service never took.
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'already liked' }), { status: 200 }),
    );
    const answer = await likeOnService('pub-1', { accountId: 'acct-9' }, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('already liked');
    expect(answer.count).toBeUndefined();
    expect(answer.liked).toBeUndefined();
  });

  it('the service error body carries no ok field, so the reason is read from message (v313)', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ error: 'likes-unavailable', message: 'the likes door is closed' }), { status: 503 }),
    );
    const answer = await likeOnService('pub-1', { accountId: 'acct-9' }, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the likes door is closed');
  });

  it('a refusal with neither reason nor message still names the HTTP status', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    const answer = await likeOnService('pub-1', { accountId: 'acct-9' }, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the likes answered HTTP 500');
  });

  it('an answer that is not JSON is a refusal, not a crash', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    const answer = await likeOnService('pub-1', { accountId: 'acct-9' }, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the likes answered HTTP 502 with something that is not JSON');
  });

  it('a like that never arrived says unreachable; a slow one says it was late, not gone', async () => {
    const down = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const refused = await likeOnService('pub-1', { accountId: 'acct-9' }, down);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('nexus-api unreachable');

    const late = new Error('the budget ran out');
    late.name = 'TimeoutError';
    const slow = makeFetch(() => {
      throw late;
    });
    const timedOut = await likeOnService('pub-1', { accountId: 'acct-9' }, slow);
    expect(timedOut.reason).toContain('did not answer within 15 seconds');
    expect(timedOut.reason).not.toContain('unreachable');
  });

  it('taking a like back is a DELETE naming the claimer, and only the claimer', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(okBody({ count: 6, liked: false }), { status: 200 });
    });

    const answer = await unlikeOnService('pub-1', 'acct-9', fetchImpl);

    expect(seenUrl).toBe(`${nexusApiBase()}/likes/pub-1?claimer=acct-9`);
    expect(seenInit?.method).toBe('DELETE');
    expect(seenInit?.headers).toEqual({ accept: 'application/json' });
    // The take-back names WHO, and nothing else: no handle, no assurance, no instant travels with it.
    expect(seenInit?.body).toBeUndefined();
    expect(answer).toEqual({ ok: true, count: 6, liked: false });
  });

  it('the POST names the publication in its body while the DELETE names it in its path', async () => {
    let postBody: unknown;
    let deleteUrl = '';
    const fetchImpl = makeFetch((url, init) => {
      if (init?.method === 'DELETE') deleteUrl = url;
      else postBody = JSON.parse(String(init?.body));
      return new Response(okBody({ count: 0, liked: false }), { status: 200 });
    });

    await likeOnService('pub 1/../x', { accountId: 'acct-9' }, fetchImpl);
    await unlikeOnService('pub 1/../x', 'acct-9', fetchImpl);

    expect(postBody).toEqual({ projectId: 'pub 1/../x', claim: { accountId: 'acct-9', handle: null, assurance: null, claimedAt: null } });
    expect(deleteUrl).toBe(`${nexusApiBase()}/likes/${encodeURIComponent('pub 1/../x')}?claimer=acct-9`);
  });

  it('the viewer read asks with the viewer when there is one', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ likes: [], count: 3, liked: true }), { status: 200 });
    });

    const answer = await readLikesOnService('pub-1', 'acct-9', 20, fetchImpl);

    expect(seenUrl).toBe(`${nexusApiBase()}/likes?projectId=pub-1&viewer=acct-9&limit=20`);
    expect(answer).toEqual({ ok: true, count: 3, likes: [] });
  });

  it('with no viewer the parameter is absent, not an empty one', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ likes: [], count: 0, liked: false }), { status: 200 });
    });

    await readLikesOnService('pub-1', null, 20, fetchImpl);

    expect(seenUrl).toBe(`${nexusApiBase()}/likes?projectId=pub-1&limit=20`);
    expect(seenUrl).not.toContain('viewer');
  });

  it('the viewer read answers with no window — it is the who-am-I read, not a page', async () => {
    // readLikes pages and echoes its window; this one answers one question about one viewer, so a
    // limit or offset in its answer would be a window nobody asked to page through.
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ likes: [], count: 0, liked: false, limit: 20, offset: 0 }), { status: 200 }),
    );
    const answer = await readLikesOnService('pub-1', 'acct-9', 20, fetchImpl);
    expect(answer.limit).toBeUndefined();
    expect(answer.offset).toBeUndefined();
  });

  it('every ask carries the service-call budget, so a silent service cannot hang a page', async () => {
    const signals: Array<AbortSignal | null | undefined> = [];
    const fetchImpl = makeFetch((_url, init) => {
      signals.push(init?.signal ?? null);
      return new Response(okBody({ count: 1, liked: true }), { status: 200 });
    });

    await likeOnService('pub-1', { accountId: 'acct-9' }, fetchImpl);
    await unlikeOnService('pub-1', 'acct-9', fetchImpl);
    await readLikesOnService('pub-1', 'acct-9', 20, fetchImpl);

    expect(signals).toHaveLength(3);
    for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
  });
});
