import { describe, expect, it, vi } from 'vitest';

import { readLikes } from './likeServer';

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
