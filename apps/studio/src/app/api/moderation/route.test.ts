import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

/**
 * M7 v494 (ADR 0016 amendment 487) — the moderation ROUTE, graded directly.
 *
 * `moderationServer.test.ts` has always graded the lib: how a call to the service composes an address,
 * waits, and reads an answer back. This file grades the hop above it, whose decisions belong to nothing
 * else: which refusals happen BEFORE the service is asked, what travels to the service and what is
 * trimmed first, what the browser\u2019s HTTP status does and does not mean, and what vocabulary the route\u2019s
 * own refusal sentences claim.
 *
 * Two rules here belong to no other door. The TALLY is a decoration, not a gate: the desk's rows arrive
 * whether or not the counts did, and a failed tally answers null rather than emptying the desk. And an
 * unparseable body is answered by the rule it VIOLATES — the reportId rule — not by a complaint about
 * JSON, because a panel that could not parse the body has nothing to acknowledge either way.
 *
 * The service is faked at the `fetch` boundary rather than injected, because the route calls the lib\u2019s
 * defaults and those read the global `fetch` per call — so a stub grades the route without asking any
 * source file to carry a seam for the test\u2019s benefit.
 */

interface Call {
  url: string;
  method?: string;
  body?: unknown;
}

let calls: Call[] = [];
let desk: { status: number; json?: unknown } = { status: 200, json: { reports: [], limit: 20 } };
let tally: { status: number; json?: unknown } = { status: 200, json: { total: 0, open: 0, byReason: {}, byStatus: {} } };

function stubService(next: { desk?: { status: number; json?: unknown }; tally?: { status: number; json?: unknown } }) {
  desk = next.desk ?? { status: 200, json: { reports: [], limit: 20 } };
  tally = next.tally ?? { status: 200, json: { total: 0, open: 0, byReason: {}, byStatus: {} } };
  calls = [];
  vi.stubGlobal(
    'fetch',
    async (input: string | URL, init?: { method?: string; body?: string }) => {
      const url = String(input);
      calls.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
      const answer = url.includes('/moderation/tally') ? tally : desk;
      return new Response(answer.json === undefined ? '' : JSON.stringify(answer.json), { status: answer.status });
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const get = (search: string) => GET(new Request(`http://studio.test/api/moderation${search}`));
const post = (body: unknown, raw?: string, search = '?owner=acct-ada') =>
  POST(
    new Request(`http://studio.test/api/moderation${search}`, {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe('moderation route — the GET ask (v494)', () => {
  it('a missing owner is refused BEFORE the service is asked — and the refusal still carries an empty desk', async () => {
    stubService({});
    const res = await get('');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reports: [],
      reason: 'the desk belongs to an account, and this request names none',
    });
    expect(calls).toHaveLength(0);
  });

  it('a BLANK owner is the same refusal — whitespace is not an account', async () => {
    stubService({});
    const res = await get('?owner=%20%20');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the desk belongs to an account, and this request names none');
    expect(calls).toHaveLength(0);
  });

  it('the desk AND the tally are both asked — two hops, not one', async () => {
    stubService({});
    await get('?owner=acct-ada');
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.url.includes('/moderation/reports?'))).toBe(true);
    expect(calls.some((c) => c.url.includes('/moderation/tally?'))).toBe(true);
  });

  it('the owner is TRIMMED before both asks — the service is asked for the account, not the padding', async () => {
    stubService({});
    await get('?owner=%20acct-ada%20');
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url).toContain('owner=acct-ada');
      expect(call.url).not.toContain('%20acct-ada');
    }
  });

  it('a limit that is not a number falls back to 20 — NaN is never forwarded to the service', async () => {
    stubService({});
    await get('?owner=acct-ada&limit=abc');
    expect(calls.find((c) => c.url.includes('/moderation/reports?'))!.url).toContain('limit=20');
  });

  it('a NEGATIVE offset is clamped to the first window — a page before the first is the newest rows', async () => {
    stubService({});
    await get('?owner=acct-ada&offset=-40');
    expect(calls.find((c) => c.url.includes('/moderation/reports?'))!.url).toContain('offset=0');
  });

  it('a named REASON travels to the service, trimmed — the narrowing is the service\u2019s, not the browser\u2019s', async () => {
    stubService({});
    await get('?owner=acct-ada&reason=%20spam%20');
    expect(calls.find((c) => c.url.includes('/moderation/reports?'))!.url).toContain('reason=spam');
  });

  it('no reason named asks for no narrowing at all', async () => {
    stubService({});
    await get('?owner=acct-ada');
    expect(calls.find((c) => c.url.includes('/moderation/reports?'))!.url).not.toContain('reason=');
  });

  it('a FAILED TALLY is not a failed desk — the rows arrive and the tally answers null', async () => {
    stubService({ desk: { status: 200, json: { reports: [{ reportId: 'r-1' }], limit: 20 } }, tally: { status: 503, json: { error: 'down', message: 'the tally is down' } } });
    const res = await get('?owner=acct-ada');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reports: [{ reportId: 'r-1' }], limit: 20, tally: null });
  });

  it('a failed DESK is a 502 carrying the desk\u2019s OWN reason — and the counts still travel', async () => {
    stubService({ desk: { status: 503, json: { error: 'down', message: 'the desk is down' } } });
    const res = await get('?owner=acct-ada');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('the desk is down');
    expect(body.tally).toEqual({ total: 0, open: 0, byReason: {}, byStatus: {} });
  });

  it('an ok answer is a 200 carrying the rows AND the counts — the window is never mistaken for the whole', async () => {
    stubService({
      desk: { status: 200, json: { reports: [{ reportId: 'r-1' }], limit: 20 } },
      tally: { status: 200, json: { total: 9, open: 3, byReason: { spam: 9 }, byStatus: { open: 3 } } },
    });
    const res = await get('?owner=acct-ada');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      reports: [{ reportId: 'r-1' }],
      limit: 20,
      tally: { total: 9, open: 3, byReason: { spam: 9 }, byStatus: { open: 3 } },
    });
  });
});

describe('moderation route — the POST ask (v494)', () => {
  it('a missing owner is refused BEFORE the body is even read', async () => {
    stubService({});
    const res = await post({ reportId: 'r-1' }, undefined, '');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the desk belongs to an account, and this request names none');
    expect(calls).toHaveLength(0);
  });

  it('an unparseable body is answered by the rule it VIOLATES — not by a complaint about JSON', async () => {
    stubService({});
    const res = await post(undefined, 'not json at all');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the desk needs a reportId to acknowledge');
    expect(calls).toHaveLength(0);
  });

  it('a body that is not an object is the same refusal — there is no reportId in it to acknowledge', async () => {
    stubService({});
    const res = await post(undefined, '"a string"');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the desk needs a reportId to acknowledge');
    expect(calls).toHaveLength(0);
  });

  it('a reportId that is not a string is the same refusal', async () => {
    stubService({});
    const res = await post({ reportId: 42 });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the desk needs a reportId to acknowledge');
    expect(calls).toHaveLength(0);
  });

  it('a BLANK reportId is the same refusal — whitespace is not an id', async () => {
    stubService({});
    const res = await post({ reportId: '   ' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the desk needs a reportId to acknowledge');
    expect(calls).toHaveLength(0);
  });

  it('the reportId and the owner are TRIMMED before the ask — the service is asked for the report, not the padding', async () => {
    stubService({});
    await post({ reportId: ' r-1 ' }, undefined, '?owner=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/moderation/reports/r-1/acknowledge?');
    expect(calls[0]!.url).toContain('owner=acct-ada');
    expect(calls[0]!.url).not.toContain('%20r-1');
  });

  it('an ok answer is a 200 carrying the report, its status and whether it MOVED', async () => {
    stubService({ desk: { status: 200, json: { reportId: 'r-1', status: 'acknowledged', moved: true } } });
    const res = await post({ reportId: 'r-1' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reportId: 'r-1', status: 'acknowledged', moved: true });
  });

  it('the service\u2019s refusal is a 502 carrying the service\u2019s OWN words', async () => {
    stubService({ desk: { status: 403, json: { error: 'forbidden', message: 'that report is not on your desk' } } });
    const res = await post({ reportId: 'r-1' });
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('that report is not on your desk');
  });
});
