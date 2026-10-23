import { describe, expect, it, vi } from 'vitest';

import { followOnService, readFollowers, readFollowing, unfollowOnService } from './followServer';
import { nexusApiBase } from './publishServer';

/**
 * M7 v397 — the server-side half of the FOLLOWS lane.
 *
 * The rule this file exists for: **an answer names the window it is FOR.** The follows door pages by
 * rows in both directions, and a read that came back without the window it answered would leave the
 * profile page's follow bar (v397) saying "the 2 newest of 37" about the rows from 20 on — a true
 * sentence about the first window and a false one about the third (v386's correction). The window is
 * forwarded on the way out and echoed on the way back, so two reads in flight cannot be mistaken for
 * each other's answers (v382's rule).
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

describe('followServer — readFollowers PAGES the followers (v397)', () => {
  const followersBody = (n: number, count: number) =>
    JSON.stringify({
      followerCount: count,
      followers: Array.from({ length: n }, (_unused, i) => ({
        followerId: `acct-${i}`,
        followeeId: 'acct-ada',
        createdAt: 1_700_000_000_000,
      })),
      limit: 20,
      offset: 20,
    });

  it('the ask carries the window as limit and offset rows', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(followersBody(2, 37), { status: 200 });
    });
    const answer = await readFollowers('acct-ada', null, 20, 20, fetchImpl);
    expect(seen).toContain('accountId=acct-ada');
    expect(seen).toContain('limit=20');
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(true);
    expect(answer.followerCount).toBe(37);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
  });

  it('the viewer travels as its own parameter, beside the window', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(followersBody(1, 1), { status: 200 });
    });
    await readFollowers('acct-ada', 'acct-bob', 20, 0, fetchImpl);
    expect(seen).toContain('viewer=acct-bob');
    expect(seen).toContain('offset=0');
  });

  it('a negative offset is clamped to the first window, not refused', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(followersBody(1, 1), { status: 200 });
    });
    const answer = await readFollowers('acct-ada', null, 20, -5, fetchImpl);
    expect(seen).toContain('offset=0');
    expect(answer.offset).toBe(0);
  });

  it('an answer that does not echo a limit keeps the one that was asked for', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ followerCount: 0, followers: [] }), { status: 200 }),
    );
    const answer = await readFollowers('acct-ada', null, 7, 0, fetchImpl);
    expect(answer.limit).toBe(7);
    expect(answer.offset).toBe(0);
  });

  it('a refusal still names the window it was asked for', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(JSON.stringify({ error: 'follows-unavailable' }), { status: 503 });
    });
    const answer = await readFollowers('acct-ada', null, 20, 20, fetchImpl);
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(false);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
    expect(answer.reason).toContain('503');
  });

  it('a refusal is NOT a count of zero followers — the count stays unread, not empty', async () => {
    // v288's rule, and the reason the answer carries a reason at all: "0 followers" and "the followers
    // could not be read" are different facts, and a page that showed the first when it knew the
    // second would make a reader conclude nobody is watching.
    const fetchImpl = makeFetch(() => new Response('not json', { status: 200 }));
    const answer = await readFollowers('acct-ada', null, 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not JSON');
  });
});

describe('followServer — readFollowing PAGES the other direction (v390, v397)', () => {
  const followingBody = (n: number, count: number) =>
    JSON.stringify({
      followingCount: count,
      following: Array.from({ length: n }, (_unused, i) => ({
        followerId: 'acct-ada',
        followeeId: `acct-${i}`,
        createdAt: 1_700_000_000_000,
      })),
      limit: 20,
    });

  it('the ask carries the offset in rows and the answer echoes the window', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(followingBody(2, 37), { status: 200 });
    });
    const answer = await readFollowing('acct-ada', 20, fetchImpl);
    expect(seen).toContain('follower=acct-ada');
    expect(seen).toContain('offset=20');
    expect(answer.count).toBe(37);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
  });

  it('a negative offset is the first window, not a refusal', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(followingBody(1, 1), { status: 200 });
    });
    const answer = await readFollowing('acct-ada', -3, fetchImpl);
    expect(seen).toContain('offset=0');
    expect(answer.offset).toBe(0);
  });

  it('the count is the WHOLE table’s even when the window is shorter', async () => {
    // v372's rule, in this direction: a reader who follows 37 accounts and is shown the first 20
    // must be told 37 and not 20. The window's length is a fact about the read, not about the
    // account, and telling it as the total is the mistake v372 was written to end.
    const fetchImpl = makeFetch(() => new Response(followingBody(2, 37), { status: 200 }));
    const answer = await readFollowing('acct-ada', 0, fetchImpl);
    expect(answer.following).toHaveLength(2);
    expect(answer.count).toBe(37);
  });

  it('a wire with NO count falls back to the window’s length, and says so nowhere — a BOUND', async () => {
    // Recorded rather than hidden: this direction's fallback is the window's length (v390's shape),
    // unlike the plans answer which answers null (v372). The service has carried the count since
    // v380, so the fallback is a path the real door does not take — but a reader of this file
    // should know it is there.
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ following: [{ followeeId: 'acct-bob' }] }), { status: 200 }),
    );
    const answer = await readFollowing('acct-ada', 0, fetchImpl);
    expect(answer.count).toBe(1);
    expect(answer.limit).toBe(20);
  });
});


/**
 * v445 — the WRITE half of the service-side follows door.
 *
 * Both reads are graded above. The two writes were reached only through the Studio's own route, so
 * what a follow carries on its way to the service and what a refusal answers were never asked. This
 * door is the third of the three server-side writes (likes in v436, comments in v437), and the family
 * shape is what makes it worth pinning: the claim is NULL-FILLED here, where the browser lane (v438)
 * sends it as built — and the budget is the SERVICE's 15 seconds, not the lane's 45.
 */
describe('followServer — the write half (v445)', () => {
  it('a follow is POSTed to the service with the claim null-filled, not as built', async () => {
    // The family shape, and the divergence from the lane (v438): the server-side doors write an
    // absent handle as null, so the service can tell "empty" from "never asked" either way.
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, followerCount: 7, following: true }), { status: 200 });
    });

    const answer = await followOnService('acct-bob', { accountId: 'acct-ada', handle: 'ada', claimedAt: 99 }, fetchImpl);

    expect(seenUrl).toBe(`${nexusApiBase()}/follows`);
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({ 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      accountId: 'acct-bob',
      claim: { accountId: 'acct-ada', handle: 'ada', assurance: null, claimedAt: 99 },
    });
    expect(answer).toEqual({ ok: true, followerCount: 7, following: true });
  });

  it('every absent claim field is written as null', async () => {
    let body: unknown;
    const fetchImpl = makeFetch((_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, followerCount: 1, following: true }), { status: 200 });
    });

    await followOnService('acct-bob', { accountId: 'acct-ada' }, fetchImpl);

    expect(body).toEqual({
      accountId: 'acct-bob',
      claim: { accountId: 'acct-ada', handle: null, assurance: null, claimedAt: null },
    });
  });

  it('following is read as the boolean the service said, not as truthiness', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, followerCount: 2, following: 'yes' }), { status: 200 }),
    );
    const answer = await followOnService('acct-bob', { accountId: 'acct-ada' }, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.following).toBe(false);
  });

  it('a refused follow carries a reason and NO count', async () => {
    const withReason = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'cannot follow yourself' }), { status: 200 }),
    );
    const refused = await followOnService('acct-bob', { accountId: 'acct-ada' }, withReason);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('cannot follow yourself');
    expect(refused.followerCount).toBeUndefined();
    expect(refused.following).toBeUndefined();

    // v313 — the service's error body carries no ok field, so the reason is read from message.
    const withMessage = makeFetch(() =>
      new Response(JSON.stringify({ error: 'follows-unavailable', message: 'the follows door is closed' }), { status: 503 }),
    );
    expect((await followOnService('acct-bob', { accountId: 'acct-ada' }, withMessage)).reason).toBe('the follows door is closed');

    const bare = makeFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    expect((await followOnService('acct-bob', { accountId: 'acct-ada' }, bare)).reason).toBe('the follows answered HTTP 500');
  });

  it('an answer that is not JSON is a refusal, not a crash', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    const answer = await followOnService('acct-bob', { accountId: 'acct-ada' }, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the follows answered HTTP 502 with something that is not JSON');
  });

  it('a follow that never reached the service says UNREACHABLE — and a slow one says it was late', async () => {
    // The contrast with the lane (v438): this door talks to a REMOTE service, so a failure here has
    // an address to name, and a busy service is not a gone one.
    const down = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const refused = await followOnService('acct-bob', { accountId: 'acct-ada' }, down);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('nexus-api unreachable');

    const late = new Error('the budget ran out');
    late.name = 'TimeoutError';
    const slow = makeFetch(() => {
      throw late;
    });
    const timedOut = await followOnService('acct-bob', { accountId: 'acct-ada' }, slow);
    expect(timedOut.reason).toContain('did not answer within 15 seconds');
    expect(timedOut.reason).not.toContain('unreachable');
  });

  it('the ask carries the SERVICE budget of 15 seconds, not the lane’s 45', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() =>
        new Response(JSON.stringify({ ok: true, followerCount: 1, following: true }), { status: 200 }),
      );
      await followOnService('acct-bob', { accountId: 'acct-ada' }, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(15_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('taking a follow back is a DELETE naming the account and the claimer, and only those', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, followerCount: 6, following: false }), { status: 200 });
    });

    const answer = await unfollowOnService('acct-bob', 'acct-ada', fetchImpl);

    expect(seenUrl).toBe(`${nexusApiBase()}/follows/acct-bob?claimer=acct-ada`);
    expect(seenInit?.method).toBe('DELETE');
    expect(seenInit?.headers).toEqual({ accept: 'application/json' });
    // The claimer is the account id — and only that. No handle, no assurance, no instant, no body.
    expect(seenInit?.body).toBeUndefined();
    expect(answer).toEqual({ ok: true, followerCount: 6, following: false });
  });

  it('an account id that needs encoding is encoded in the take-back path', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ ok: true, followerCount: 0, following: false }), { status: 200 });
    });

    await unfollowOnService('acct bob/../x', 'acct-ada', fetchImpl);

    expect(seenUrl).toBe(`${nexusApiBase()}/follows/${encodeURIComponent('acct bob/../x')}?claimer=acct-ada`);
  });

  it('a take-back that never reached the service names the service too', async () => {
    const down = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    const answer = await unfollowOnService('acct-bob', 'acct-ada', down);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('nexus-api unreachable');
  });
});
