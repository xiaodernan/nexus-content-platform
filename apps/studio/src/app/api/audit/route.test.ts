import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

/**
 * M7 v496 (ADR 0016 amendment 489) — the audit ROUTE, graded directly.
 *
 * This door is the only one in the Studio that talks to the service DIRECTLY — no lib in between — and
 * it says so in its own comment: what crosses the door is the SERVICE'S OWN answer, not a re-shaping of
 * it. That makes its rules the route's alone: the clamp on a silly ask, the verbatim filter, and above
 * all the rule that a refused filter is answered with the SERVICE'S OWN NAME for the set it accepts,
 * because "HTTP 400" would throw away the one part a reader can act on.
 *
 * The service is faked at the `fetch` boundary, the same boundary the route itself calls.
 */

interface Call {
  url: string;
  init?: { headers?: Record<string, string>; signal?: AbortSignal };
}

let calls: Call[] = [];
let answer: { status: number; json?: unknown } = { status: 200, json: { ok: true, entries: [], count: 0, limit: 20, total: 0 } };

function stubService(next: { status: number; json?: unknown }) {
  answer = next;
  calls = [];
  vi.stubGlobal(
    'fetch',
    async (input: string | URL, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => {
      calls.push({ url: String(input), init });
      return new Response(answer.json === undefined ? '' : JSON.stringify(answer.json), { status: answer.status });
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const get = (search: string) => GET(new Request(`http://studio.test/api/audit${search}`));

describe('audit route — the GET ask (v496)', () => {
  it('a question with no limit asks for the default 20', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 20, total: 0 } });
    await get('');
    expect(calls[0]!.url).toContain('limit=20');
  });

  it('a limit of ZERO is clamped to one — a window of nothing is the first row, not a refusal', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 1, total: 0 } });
    await get('?limit=0');
    expect(calls[0]!.url).toContain('limit=1');
  });

  it('a NEGATIVE limit is clamped to one — the route refuses a silly ask by FIXING it, not by refusing', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 1, total: 0 } });
    await get('?limit=-5');
    expect(calls[0]!.url).toContain('limit=1');
  });

  it('a limit past the ceiling is clamped to 100 — the most the panel asks for', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 100, total: 0 } });
    await get('?limit=500');
    expect(calls[0]!.url).toContain('limit=100');
  });

  it('a limit that is not a number is the DEFAULT — an unparseable ask is not a refusal', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 20, total: 0 } });
    await get('?limit=abc');
    expect(calls[0]!.url).toContain('limit=20');
  });

  it('a fractional limit is truncated, not rounded', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 5, total: 0 } });
    await get('?limit=5.9');
    expect(calls[0]!.url).toContain('limit=5');
  });

  it('a question with no action asks for no narrowing at all', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 20, total: 0 } });
    await get('');
    expect(calls[0]!.url).not.toContain('action=');
  });

  it('an EMPTY action asks for no narrowing either — an empty filter is no filter', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 20, total: 0 } });
    await get('?action=');
    expect(calls[0]!.url).not.toContain('action=');
  });

  it('a named action travels VERBATIM — the service owns the closed set of verbs, so the route forwards the question', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 20, total: 0 } });
    await get('?action=%20publish%20');
    expect(calls[0]!.url).toContain('action=%20publish%20');
  });

  it('a question with no offset asks for the first window', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 20, total: 0 } });
    await get('');
    expect(calls[0]!.url).toContain('offset=0');
  });

  it('a NEGATIVE offset is the first window — a page before the first is the newest rows', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 20, total: 0 } });
    await get('?offset=-40');
    expect(calls[0]!.url).toContain('offset=0');
  });

  it('an offset that is not a number is the first window', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 20, total: 0 } });
    await get('?offset=abc');
    expect(calls[0]!.url).toContain('offset=0');
  });

  it('an offset that IS a number is forwarded as asked', async () => {
    stubService({ status: 200, json: { ok: true, entries: [], count: 0, limit: 20, total: 0 } });
    await get('?offset=40');
    expect(calls[0]!.url).toContain('offset=40');
  });

  it('a refused FILTER is a 502 carrying the service\u2019s OWN NAME for the set it accepts', async () => {
    stubService({ status: 400, json: { error: 'bad_filter', message: 'the action must be one of publish, unpublish, take-down' } });
    const res = await get('?action=nonsense');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('the action must be one of publish, unpublish, take-down');
  });

  it('a refused ask with NO message still names the HTTP number — it is not answered as a bare 502', async () => {
    stubService({ status: 400, json: { error: 'bad_filter' } });
    const res = await get('?action=nonsense');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe("the service's audit door answered HTTP 400");
  });

  it('a body that is not JSON is a 502 naming that, not an empty trail', async () => {
    stubService({ status: 200, json: undefined });
    const res = await get('');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('the service answered its audit door with something that is not JSON');
  });

  it('a 200 with no entries array is a refusal — the route does not report an empty trail it never read', async () => {
    stubService({ status: 200, json: { ok: true, somethingElse: true } });
    const res = await get('');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('the service answered its audit door with no entries at all');
  });

  it('an ok answer is a 200 carrying the SERVICE\u2019S OWN shape — entries, count, limit and total, unre-shaped', async () => {
    stubService({ status: 200, json: { ok: true, entries: [{ id: 'a-1' }], count: 3, limit: 20, total: 57 } });
    const res = await get('');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, entries: [{ id: 'a-1' }], count: 3, limit: 20, total: 57 });
  });

  it('a THROWN call is a 503 carrying the error\u2019s own words — the panel is told what went wrong', async () => {
    calls = [];
    vi.stubGlobal(
      'fetch',
      async () => {
        throw new Error('the network is unreachable');
      },
    );
    const res = await get('');
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe('the network is unreachable');
  });
});
