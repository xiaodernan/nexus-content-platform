import { describe, expect, it, vi } from 'vitest';

import { readAuditTrail } from './auditServer';

/**
 * M9 v280 — the server-side half of the AUDIT TRAIL's reader.
 *
 * The lane's rule is the same rule every lane keeps: a FAILED read answers with a REASON and not a thrown
 * error, because a page that says "the history could not be read" is an honest page.
 */
function makeFetch(handler: (url: string) => Response) {
  return vi.fn(async (url: string) => handler(url)) as unknown as typeof fetch;
}

const TRAIL = {
  entries: [
    { id: '9', action: 'unpublish', actorId: 'acct-ada', targetId: 'pub-1', createdAt: 1_776_000_100_000, assurance: 'unsigned-local' },
    { id: '8', action: 'publish', actorId: 'acct-ada', targetId: 'pub-1', createdAt: 1_776_000_000_000, assurance: 'unsigned-local' },
    { id: '7', action: 'publish', actorId: null, targetId: 'pub-2', createdAt: 1_775_999_900_000, assurance: null },
  ],
  count: 3,
  limit: 20,
};

describe('auditServer — readAuditTrail (M9 v280)', () => {
  it('asks the SERVICE, server-side — the browser never learns its address', async () => {
    const fetchImpl = makeFetch((url) => {
      expect(url).toContain('/audit?limit=20');
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:8080\//);
      return new Response(JSON.stringify(TRAIL), { status: 200 });
    });
    const answer = await readAuditTrail(20, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.entries).toHaveLength(3);
    expect(answer.carried).toBe(3);
    expect(answer.limit).toBe(20);
  });

  it('keeps the SERVICE’S count of the whole answer, not just the rows for one target', async () => {
    const answer = await readAuditTrail(20, makeFetch(() => new Response(JSON.stringify(TRAIL), { status: 200 })));
    expect(answer.carried).toBe(3);
  });

  it('a non-200 answers with a reason, not a throw', async () => {
    const answer = await readAuditTrail(20, makeFetch(() => new Response('', { status: 500 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe("the service's audit door answered HTTP 500");
  });

  it('something that is not JSON is a reason', async () => {
    const answer = await readAuditTrail(20, makeFetch(() => new Response('<html>no</html>', { status: 200 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the service answered its audit door with something that is not JSON');
  });

  it('a body with no entries is a reason', async () => {
    const answer = await readAuditTrail(20, makeFetch(() => new Response(JSON.stringify({ count: 0 }), { status: 200 })));
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the service answered its audit door with no entries at all');
  });

  it('a thrown fetch answers with the error’s message rather than throwing into a route', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    const answer = await readAuditTrail(20, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('network down');
  });
});
