import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readTrail } from './auditLane';

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
      expect(url).toContain('/api/audit?limit=20');
      return new Response(JSON.stringify(TRAIL), { status: 200 });
    });
    const answer = await readTrail(20, null, fetchImpl);
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
    return readTrail(20, null, makeFetch(() => new Response(JSON.stringify(dragged), { status: 200 }))).then((answer) => {
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
    const answer = await readTrail(20, null, makeFetch(() => new Response(JSON.stringify(kindless), { status: 200 })));
    expect(answer.ok).toBe(true);
    expect(answer.rows).toHaveLength(0); // dropped, not shown with an invented kind
    expect(answer.count).toBe(1); // and the discrepancy is visible
  });

  it('v385 — a named ACTION travels in the query, so the service narrows the window itself', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('/api/audit?limit=20&action=unpublish');
      return new Response(JSON.stringify(TRAIL), { status: 200 });
    });
    const answer = await readTrail(20, 'unpublish', fetchImpl);
    expect(answer.ok).toBe(true);
  });

  it('v385 — the WHOLE-TRAIL count travels beside the window, so a filter cannot hide its size', async () => {
    const narrowed = { ...TRAIL, entries: [TRAIL.entries[0]], count: 1, total: 3 };
    const answer = await readTrail(20, 'unpublish', makeFetch(() => new Response(JSON.stringify(narrowed), { status: 200 })));
    expect(answer.rows).toHaveLength(1);
    expect(answer.count).toBe(1); // what this answer carried
    expect(answer.total).toBe(3); // and what the whole trail holds, filter or no filter
  });

  it('v385 — a service that refuses an unknown filter BY NAME hands its reason to the panel', async () => {
    const answer = await readTrail(
      20,
      'frobnicate',
      makeFetch(() =>
        new Response(JSON.stringify({ ok: false, reason: 'a trail can be narrowed to one of publish, … — not "frobnicate"' }), {
          status: 503,
        }),
      ),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not "frobnicate"');
    expect(answer.total).toBe(0);
  });

  it('a refusal carries the SERVICE’S reason, not a status code', async () => {
    const answer = await readTrail(
      20,
      null,
      makeFetch(() => new Response(JSON.stringify({ ok: false, reason: 'the service is unreachable' }), { status: 503 })),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the service is unreachable');
  });

  it('a refusal with no body still says what it was', async () => {
    const answer = await readTrail(20, null, makeFetch(() => new Response('', { status: 503 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the trail answered HTTP 503');
  });

  it('something that is not JSON is a reason, not a throw', async () => {
    const answer = await readTrail(20, null, makeFetch(() => new Response('<html>no</html>', { status: 200 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the trail answered something that is not JSON');
  });

  it('a body with no entries at all is a reason', async () => {
    const answer = await readTrail(20, null, makeFetch(() => new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the trail answered with no entries at all');
  });

  it('a thrown fetch answers with the error’s message rather than throwing into React', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const answer = await readTrail(20, null, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
  });
});
