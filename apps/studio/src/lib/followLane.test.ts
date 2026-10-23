import { describe, expect, it, vi } from 'vitest';

import { readMyFollowing } from './followLane';

/**
 * M7 v316 — the browser half of the FOLLOWS lane, and the read that gives the desk its "YOU FOLLOW"
 * section.
 *
 * The rule this file exists for: **a failed read is NOT an empty list.** "You follow nobody" and "the list
 * could not be read" are different facts, and a panel that showed the first when it knew the second would
 * tell a reader their follows had gone.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

describe('followLane — readMyFollowing (client half)', () => {
  it('asks the Studio\u2019s own door, naming the follower', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/follows?follower=acct-ada&offset=0');
      return new Response(
        JSON.stringify({
          ok: true,
          following: [{ followerId: 'acct-ada', followeeId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local' }],
          count: 1,
        }),
        { status: 200 },
      );
    });
    const answer = await readMyFollowing('acct-ada', 0, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.following).toHaveLength(1);
    expect(answer.following[0]?.followeeId).toBe('acct-bob');
  });

  it('v380 — carries the service’s WHOLE-TABLE count, not the window’s length', async () => {
    // The service counts every account the device follows; the rows are a WINDOW. A panel that said
    // "1 follow" when the device follows nine would be wrong in the direction that hides.
    const fetchImpl = makeFetch(() =>
      new Response(
        JSON.stringify({
          ok: true,
          following: [{ followerId: 'acct-ada', followeeId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local' }],
          count: 9,
        }),
        { status: 200 },
      ),
    );
    const answer = await readMyFollowing('acct-ada', 0, fetchImpl);
    expect(answer.count).toBe(9);
    expect(answer.following).toHaveLength(1);
  });

  it('v380 — and a REFUSED read carries NO count, because a refused read is not a count of zero', async () => {
    const answer = await readMyFollowing(
      'acct-ada',
      0,
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'the list could not be read' }), { status: 502 })),
    );
    expect(answer.count).toBe(0);
    expect(answer.following).toEqual([]);
  });

  it('a REFUSED read carries the reason and NO rows', async () => {
    const answer = await readMyFollowing(
      'acct-ada',
      0,
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'the list could not be read' }), { status: 502 })),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the list could not be read');
    expect(answer.following).toEqual([]);
  });

  it('a THROWN fetch answers with a reason, never an exception', async () => {
    const answer = await readMyFollowing(
      'acct-ada',
      0,
      makeFetch(() => {
        throw new Error('network down');
      }),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('network down');
  });

  // v390 \u2014 the following window can be PAGED, and the page is part of the ask.

  it('v390 \u2014 a named OFFSET travels in the query, in rows', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/follows?follower=acct-ada&offset=40');
      return new Response(
        JSON.stringify({
          ok: true,
          following: [{ followerId: 'acct-ada', followeeId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local' }],
          count: 57,
          limit: 20,
        }),
        { status: 200 },
      );
    });
    const answer = await readMyFollowing('acct-ada', 40, fetchImpl);
    expect(answer.ok).toBe(true);
    // and the answer echoes the window it is FOR: two reads in flight cannot be mistaken for each other.
    expect(answer.offset).toBe(40);
    expect(answer.limit).toBe(20);
    expect(answer.count).toBe(57);
  });

  it('v390 \u2014 a negative offset is the first window, not a refusal', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toBe('/api/follows?follower=acct-ada&offset=0');
      return new Response(JSON.stringify({ ok: true, following: [], count: 0, limit: 20 }), { status: 200 });
    });
    const answer = await readMyFollowing('acct-ada', -5, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.offset).toBe(0);
  });
});
