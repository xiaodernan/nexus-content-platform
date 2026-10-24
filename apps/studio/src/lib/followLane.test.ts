import { describe, expect, it, vi } from 'vitest';

import { CALL_TIMEOUT_MS, followAccount, readMyFollowing, unfollowAccount } from './followLane';

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


/**
 * v438 — the WRITE half of the follows lane.
 *
 * `readMyFollowing` is graded above. The two writes were reached only through the profile bar that
 * calls them, so three things this lane does differently from every server-side door were never
 * asked: it talks to the STUDIO'S OWN door at a relative path — the service's address is
 * server-side and the browser never learns it — it carries a 45-second budget on a WRITE rather
 * than the read budget (v294: the first call to a route pays that route's compile), and it answers
 * a thrown fetch with the raw message rather than an "unreachable" sentence, because the thing that
 * failed is this Studio and not a remote service.
 */
describe('followLane — the write half (v438)', () => {
  it('a follow is POSTed to the Studio’s own door, at a relative path', async () => {
    // The service's address is server-side. A lane that built an absolute URL here would publish
    // that address to every browser that loads the page.
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, followerCount: 3, following: true }), { status: 200 });
    });

    const answer = await followAccount('acct-bob', { accountId: 'acct-ada', handle: 'ada' }, fetchImpl);

    expect(seenUrl).toBe('/api/follows');
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({ 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      accountId: 'acct-bob',
      claim: { accountId: 'acct-ada', handle: 'ada' },
    });
    expect(answer).toEqual({ ok: true, followerCount: 3, following: true });
  });

  it('the claim travels as the browser built it — this lane does not null-fill', async () => {
    // Pinned as MEASURED, and as a divergence: the server-side doors (v436, v437) write an absent
    // handle as null, while this lane serialises the claim object as given, so the key is simply
    // absent. Both reach the service; they say "empty" differently, and a caller reading one
    // door's shape for the other's would be reading a wire that is not there.
    let body: unknown;
    const fetchImpl = makeFetch((_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, followerCount: 1, following: true }), { status: 200 });
    });

    await followAccount('acct-bob', { accountId: 'acct-ada' }, fetchImpl);

    expect(body).toEqual({ accountId: 'acct-bob', claim: { accountId: 'acct-ada' } });
    expect((body as { claim: Record<string, unknown> }).claim).not.toHaveProperty('handle');
  });

  it('a write carries the 45-second budget, not the read budget (v294)', async () => {
    // The Studio's own door is a next dev server here, and the FIRST call to a route pays that
    // route's compile. A ten-second budget was killing requests that were about to be answered.
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() =>
        new Response(JSON.stringify({ ok: true, followerCount: 1, following: true }), { status: 200 }),
      );
      await followAccount('acct-bob', { accountId: 'acct-ada' }, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('following is read as the boolean the door said, not as truthiness', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, followerCount: 2, following: 'yes' }), { status: 200 }),
    );
    const answer = await followAccount('acct-bob', { accountId: 'acct-ada' }, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.following).toBe(false);
  });

  it('a refused follow carries a reason and NO count', async () => {
    const withReason = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'cannot follow yourself' }), { status: 200 }),
    );
    const refused = await followAccount('acct-bob', { accountId: 'acct-ada' }, withReason);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('cannot follow yourself');
    expect(refused.followerCount).toBeUndefined();
    expect(refused.following).toBeUndefined();

    // v313 — the door's error body carries no ok field, so the reason is read from message.
    const withMessage = makeFetch(() =>
      new Response(JSON.stringify({ error: 'follows-unavailable', message: 'the follows door is closed' }), { status: 503 }),
    );
    expect((await followAccount('acct-bob', { accountId: 'acct-ada' }, withMessage)).reason).toBe('the follows door is closed');

    const bare = makeFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    expect((await followAccount('acct-bob', { accountId: 'acct-ada' }, bare)).reason).toBe('the follows answered HTTP 500');
  });

  it('an answer that is not JSON is a refusal, not a crash', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    const answer = await followAccount('acct-bob', { accountId: 'acct-ada' }, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the follows answered HTTP 502 with something that is not JSON');
  });

  it('a follow that never arrived answers with the raw error, because the door is THIS Studio', async () => {
    // No "unreachable at <address>" sentence here: the thing that failed is this Studio's own route,
    // and naming a remote service would send a reader looking in the wrong place.
    const fetchImpl = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await followAccount('acct-bob', { accountId: 'acct-ada' }, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
    expect(answer.reason).not.toContain('unreachable');
  });

  it('taking a follow back is a DELETE naming the account and the claimer, and only those', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, followerCount: 2, following: false }), { status: 200 });
    });

    const answer = await unfollowAccount('acct-bob', 'acct-ada', fetchImpl);

    expect(seenUrl).toBe('/api/follows/acct-bob?claimer=acct-ada');
    expect(seenInit?.method).toBe('DELETE');
    expect(seenInit?.headers).toEqual({ accept: 'application/json' });
    expect(seenInit?.body).toBeUndefined();
    // The take-back answers with the count that is LEFT and that the follow is no longer standing.
    expect(answer).toEqual({ ok: true, followerCount: 2, following: false });
  });

  it('an account id that needs encoding is encoded in the take-back path', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ ok: true, followerCount: 0, following: false }), { status: 200 });
    });

    await unfollowAccount('acct bob/../x', 'acct-ada', fetchImpl);

    expect(seenUrl).toBe(`/api/follows/${encodeURIComponent('acct bob/../x')}?claimer=acct-ada`);
  });

  it('a take-back that never arrived answers with the raw error too', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await unfollowAccount('acct-bob', 'acct-ada', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
  });
});

describe('followLane — the read’s budget (v477)', () => {
  // v477 — the reads ride the same budget the writes earned in v294. Until now `readMyFollowing` fetched
  // with no signal at all: a door that never answered hung the desk's YOU FOLLOW section forever with no
  // reason to show, and a budget that covers only the writes is a budget that believes only the writes
  // can hang.
  it('the read carries a live signal — a door that never answers becomes a reason, not a silent panel', async () => {
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = makeFetch((_url, init) => {
      seenSignal = init?.signal ?? undefined;
      return new Response(JSON.stringify({ ok: true, following: [], count: 0 }), { status: 200 });
    });

    await readMyFollowing('acct-ada', 0, fetchImpl);

    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(false);
  });

  it('the read’s budget is the pinned 45 seconds — v294’s number, now the lane’s single budget', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true, following: [], count: 0 }), { status: 200 }));
      await readMyFollowing('acct-ada', 0, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('each read gets its own fresh signal — a deadline per call, never a shared one', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const fetchImpl = makeFetch((_url, init) => {
      seen.push(init?.signal ?? undefined);
      return new Response(JSON.stringify({ ok: true, following: [], count: 0 }), { status: 200 });
    });

    await readMyFollowing('acct-ada', 0, fetchImpl);
    await readMyFollowing('acct-ada', 0, fetchImpl);

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('one budget for the whole lane — the exported constant, the read and the write all say 45 seconds', async () => {
    expect(CALL_TIMEOUT_MS).toBe(45_000);

    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const read = makeFetch(() => new Response(JSON.stringify({ ok: true, following: [], count: 0 }), { status: 200 }));
      await readMyFollowing('acct-ada', 0, read);
      const write = makeFetch(() => new Response(JSON.stringify({ ok: true, followerCount: 1, following: true }), { status: 200 }));
      await followAccount('acct-bob', { accountId: 'acct-ada' }, write);

      expect(timeoutSpy).toHaveBeenCalledTimes(2);
      expect(timeoutSpy.mock.calls.map((c) => c[0])).toEqual([45_000, 45_000]);
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
describe('followLane — when the budget FIRES the door says it was LATE (v482)', () => {
  // The lane has carried a deadline since v294 (the writes) and v477–v481 (the reads), but a fired
  // budget surfaced the PLATFORM's string — "The operation was aborted due to timeout" — which names
  // neither the door nor the budget, and cannot tell a reader whether the door is gone or merely late.
  // The publish lane named this distinction in v294 and the service door in v337; v482 extends the
  // sentence to every lane.

  const late = () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    return error;
  };
  const claim = { accountId: 'acct-bob', handle: 'bob', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a fired budget says the follows was LATE — the lane’s own door and the 45 seconds, not the platform’s string', async () => {
    const fetchImpl = makeFetch(() => {
      throw late();
    });
    const answer = await followAccount('acct-ada', claim, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the follows did not answer within 45 seconds');
    expect(answer.reason).not.toContain('aborted');
  });


  it('a door that is GONE keeps its own message — the distinction is real, not a rename', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await followAccount('acct-ada', claim, fetchImpl);
    expect(answer.reason).toBe('network down');
    expect(answer.reason).not.toContain('45 seconds');
  });


  it('every call of the lane rides the same distinction — follow, read and unfollow alike', async () => {
    const fetchImpl = makeFetch(() => {
      throw late();
    });
    const followed = await followAccount('acct-ada', claim, fetchImpl);
    const read = await readMyFollowing('acct-ada', 0, fetchImpl);
    const unfollowed = await unfollowAccount('acct-ada', 'acct-bob', fetchImpl);
    expect(followed.reason).toBe('the follows did not answer within 45 seconds');
    expect(read.reason).toBe('the follows did not answer within 45 seconds');
    expect(unfollowed.reason).toBe('the follows did not answer within 45 seconds');
  });
});
