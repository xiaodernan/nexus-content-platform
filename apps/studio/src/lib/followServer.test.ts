import { describe, expect, it, vi } from 'vitest';

import { readFollowers, readFollowing } from './followServer';

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
