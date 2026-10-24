import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CALL_TIMEOUT_MS, readTrail } from './auditLane';

/**
 * M9 v272 — the browser half of the AUDIT TRAIL's reading lane.
 *
 * The lane is the thing between the panel and `/api/audit`. Its rule is the same rule every lane here
 * keeps: a FAILED read answers with a REASON and not a thrown error, because a panel that says "could not
 * read: service unreachable" is an honest panel and one that throws into React is not a panel at all.
 */
function makeFetch(handler: (url: string) => Response) {
  return vi.fn(async (url: string) => handler(url)) as unknown as typeof fetch;
}

const TRAIL = {
  ok: true,
  entries: [
    { id: '9', action: 'unpublish', actorId: 'acct-ada', targetId: 'pub-1', targetType: 'publication', createdAt: 1_776_000_100_000, assurance: 'unsigned-local' },
    { id: '8', action: 'publish', actorId: 'acct-ada', targetId: 'pub-1', targetType: 'publication', createdAt: 1_776_000_000_000, assurance: 'unsigned-local' },
    { id: '7', action: 'publish', actorId: null, targetId: 'pub-2', targetType: 'publication', createdAt: 1_775_999_900_000, assurance: null },
  ],
  count: 3,
  limit: 20,
  total: 3,
};

describe('auditLane — readTrail (client half)', () => {
  it('asks the Studio’s own door, not the service', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('/api/audit?limit=20&offset=0');
      return new Response(JSON.stringify(TRAIL), { status: 200 });
    });
    const answer = await readTrail(20, null, 0, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.rows).toHaveLength(3);
    expect(answer.count).toBe(3);
    expect(answer.limit).toBe(20);
  });

  it('keeps the SERVICE’S count beside what could be rendered — a drop must be visible', () => {
    const dragged = {
      ok: true,
      entries: [
        { id: '9', action: 'publish', actorId: null, targetId: 'pub-1', targetType: 'publication', createdAt: 1, assurance: null },
        { id: 'broken', action: 'publish', actorId: null, targetId: null, createdAt: 1, assurance: null },
      ],
      count: 2,
      limit: 20,
    };
    return readTrail(20, null, 0, makeFetch(() => new Response(JSON.stringify(dragged), { status: 200 }))).then((answer) => {
      expect(answer.ok).toBe(true);
      expect(answer.rows).toHaveLength(1); // the malformed entry was dropped, not faked
      expect(answer.count).toBe(2); // and the service still says there are two
    });
  });

  it('v384 — a row the service sent with no KIND is dropped, and the count still says it was carried', async () => {
    const kindless = {
      ok: true,
      entries: [
        { id: '9', action: 'publish', actorId: 'acct-ada', targetId: 'pub-1', createdAt: 1, assurance: 'unsigned-local' },
      ],
      count: 1,
      limit: 20,
    };
    const answer = await readTrail(20, null, 0, makeFetch(() => new Response(JSON.stringify(kindless), { status: 200 })));
    expect(answer.ok).toBe(true);
    expect(answer.rows).toHaveLength(0); // dropped, not shown with an invented kind
    expect(answer.count).toBe(1); // and the discrepancy is visible
  });

  it('v385 — a named ACTION travels in the query, so the service narrows the window itself', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('/api/audit?limit=20&offset=0&action=unpublish');
      return new Response(JSON.stringify(TRAIL), { status: 200 });
    });
    const answer = await readTrail(20, 'unpublish', 0, fetchImpl);
    expect(answer.ok).toBe(true);
  });

  it('v385 — the WHOLE-TRAIL count travels beside the window, so a filter cannot hide its size', async () => {
    const narrowed = { ...TRAIL, entries: [TRAIL.entries[0]], count: 1, total: 3 };
    const answer = await readTrail(20, 'unpublish', 0, makeFetch(() => new Response(JSON.stringify(narrowed), { status: 200 })));
    expect(answer.rows).toHaveLength(1);
    expect(answer.count).toBe(1); // what this answer carried
    expect(answer.total).toBe(3); // and what the whole trail holds, filter or no filter
  });

  it('v388 — a named OFFSET travels in the query, in rows', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('/api/audit?limit=20&offset=40');
      return new Response(JSON.stringify(TRAIL), { status: 200 });
    });
    const answer = await readTrail(20, null, 40, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.offset).toBe(40); // and the answer names the window it is for
  });

  it('v388 — a negative offset is the first window, not a refusal', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('offset=0');
      return new Response(JSON.stringify(TRAIL), { status: 200 });
    });
    const answer = await readTrail(20, null, -40, fetchImpl);
    expect(answer.offset).toBe(0);
  });

  it('v385 — a service that refuses an unknown filter BY NAME hands its reason to the panel', async () => {
    const answer = await readTrail(
      20,
      'frobnicate',
      0,
      makeFetch(() =>
        new Response(JSON.stringify({ ok: false, reason: 'a trail can be narrowed to one of publish, … — not "frobnicate"' }), {
          status: 503,
        }),
      ),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not "frobnicate"');
    expect(answer.total).toBe(0);
    expect(answer.offset).toBe(0);
  });

  it('a refusal carries the SERVICE’S reason, not a status code', async () => {
    const answer = await readTrail(
      20,
      null,
      0,
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'the service is unreachable' }), { status: 503 })),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the service is unreachable');
  });

  it('a refusal with no body still says what it was', async () => {
    const answer = await readTrail(20, null, 0, makeFetch(() => new Response('', { status: 503 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the trail answered HTTP 503');
  });

  it('something that is not JSON is a reason, not a throw', async () => {
    const answer = await readTrail(20, null, 0, makeFetch(() => new Response('<html>no</html>', { status: 200 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the trail answered something that is not JSON');
  });

  it('a body with no entries at all is a reason', async () => {
    const answer = await readTrail(20, null, 0, makeFetch(() => new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the trail answered with no entries at all');
  });

  it('a thrown fetch answers with the error’s message rather than throwing into React', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const answer = await readTrail(20, null, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
  });
});

describe('auditLane — the read finally has a budget (v480)', () => {
  // v480 — this was the only lane that read with no deadline at all: a door that never answered hung the
  // trail forever with no reason to show. The budget is the same 45 seconds every other lane rides.
  it('the read carries a live, un-aborted signal', async () => {
    let seenSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seenSignal = init?.signal ?? undefined;
      return new Response(JSON.stringify(TRAIL), { status: 200 });
    }) as unknown as typeof fetch;

    await readTrail(20, null, 0, fetchImpl);

    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(false);
  });

  it('the budget is the pinned 45 seconds — the same number every other lane rides', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify(TRAIL), { status: 200 })) as unknown as typeof fetch;
      await readTrail(20, null, 0, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it('each read gets its own fresh signal — a deadline per call, never a shared one', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(init?.signal ?? undefined);
      return new Response(JSON.stringify(TRAIL), { status: 200 });
    }) as unknown as typeof fetch;

    await readTrail(20, null, 0, fetchImpl);
    await readTrail(20, null, 0, fetchImpl);

    expect(seen[0]).toBeInstanceOf(AbortSignal);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('the exported constant names the one number the lane rides', () => {
    expect(CALL_TIMEOUT_MS).toBe(45_000);
  });
});
describe('auditLane — when the budget FIRES the door says it was LATE (v482)', () => {
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

  it('a fired budget says the trail was LATE — the lane’s own door and the 45 seconds, not the platform’s string', async () => {
    const fetchImpl = makeFetch(() => {
      throw late();
    });
    const answer = await readTrail(20, null, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the trail did not answer within 45 seconds');
    expect(answer.reason).not.toContain('aborted');
  });


  it('a door that is GONE keeps its own message — the distinction is real, not a rename', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await readTrail(20, null, 0, fetchImpl);
    expect(answer.reason).toBe('network down');
    expect(answer.reason).not.toContain('45 seconds');
  });


  it('the fired budget keeps the answer’s shape — a refusal that still names the window it was asked for', async () => {
    const fetchImpl = makeFetch(() => {
      throw late();
    });
    const answer = await readTrail(20, null, 40, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.count).toBe(0);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(40);
    expect(answer.reason).toBe('the trail did not answer within 45 seconds');
  });

  it('a DOMException from a real AbortSignal is read the same way — the branch keys on the name, not the class', async () => {
    const fetchImpl = makeFetch(() => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    const answer = await readTrail(20, null, 0, fetchImpl);
    expect(answer.reason).toBe('the trail did not answer within 45 seconds');
  });
});
