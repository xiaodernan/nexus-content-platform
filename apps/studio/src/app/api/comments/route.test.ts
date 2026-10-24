import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

/**
 * M7 v488 (ADR 0016 amendment 481) — the comments ROUTE, graded directly.
 *
 * `commentServer.test.ts` has always graded the lib: how a call to the service composes an address,
 * waits, and reads an answer back. This file grades the hop above it, whose decisions belong to nothing
 * else: which refusals happen BEFORE the service is asked, in what order the guards run, which values
 * are forwarded exactly as the caller wrote them and which are trimmed first, what the browser's HTTP
 * status does and does not mean, and what vocabulary the route's own refusal sentences claim.
 *
 * The service is faked at the `fetch` boundary rather than injected, because the route calls the lib's
 * defaults and those read the global `fetch` per call — so a stub grades the route without asking any
 * source file to carry a seam for the test's benefit.
 */

interface Call {
  url: string;
  method?: string;
  body?: unknown;
}

let calls: Call[] = [];
let answer: { status: number; json?: unknown } = { status: 200, json: { ok: true, comments: [], visible: 0 } };

function stubService(next: { status: number; json?: unknown }) {
  answer = next;
  calls = [];
  vi.stubGlobal(
    'fetch',
    async (input: string | URL, init?: { method?: string; body?: string }) => {
      calls.push({ url: String(input), method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
      return new Response(init?.body === undefined && answer.json === undefined ? '' : JSON.stringify(answer.json ?? {}), { status: answer.status });
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const get = (search: string) => GET(new Request(`http://studio.test/api/comments${search}`));
const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/comments', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe('comments route — the GET ask (v488)', () => {
  it('a missing author is refused BEFORE the service is asked — the question names whose comments they are', async () => {
    stubService({ status: 200, json: { ok: true, comments: [], visible: 0 } });
    const res = await get('');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'the question names whose comments they are' });
    expect(calls).toHaveLength(0);
  });

  it('a BLANK author is the same refusal — whitespace is not an account', async () => {
    stubService({ status: 200, json: { ok: true, comments: [], visible: 0 } });
    const res = await get('?author=%20%20');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the question names whose comments they are');
    expect(calls).toHaveLength(0);
  });

  it('the author is TRIMMED before the ask — the service is asked for the account, not the padding', async () => {
    stubService({ status: 200, json: { ok: true, comments: [], visible: 0 } });
    await get('?author=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('author=acct-ada');
    expect(calls[0]!.url).not.toContain('%20acct-ada');
  });

  it('a limit that is not a number falls back to 20 — NaN is never forwarded to the service', async () => {
    stubService({ status: 200, json: { ok: true, comments: [], visible: 0 } });
    await get('?author=acct-ada&limit=abc');
    expect(calls[0]!.url).toContain('limit=20');
  });

  it('a limit that IS a number is forwarded as asked', async () => {
    stubService({ status: 200, json: { ok: true, comments: [], visible: 0 } });
    await get('?author=acct-ada&limit=5');
    expect(calls[0]!.url).toContain('limit=5');
  });

  it("the lib's refusal becomes a 502 carrying the lib's OWN reason — not a 200 with an empty list", async () => {
    stubService({ status: 503, json: { error: 'down', message: 'the service is down' } });
    const res = await get('?author=acct-ada');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toContain('the service is down');
  });

  it('an ok answer is a 200 carrying the comments and the visible count', async () => {
    stubService({ status: 200, json: { ok: true, comments: [{ id: 'c-1' }], visible: 1 } });
    const res = await get('?author=acct-ada');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, comments: [{ id: 'c-1' }], visible: 1 });
  });
});

describe('comments route — the POST ask (v488)', () => {
  const claim = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a body that is not JSON is refused before the service is asked', async () => {
    stubService({ status: 201, json: { ok: true } });
    const res = await post(undefined, 'not json at all');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not JSON');
    expect(calls).toHaveLength(0);
  });

  it('a body that is not an object is refused by name', async () => {
    stubService({ status: 201, json: { ok: true } });
    const res = await post(undefined, '"a string"');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not an object');
    expect(calls).toHaveLength(0);
  });

  it('a missing projectId is refused by name', async () => {
    stubService({ status: 201, json: { ok: true } });
    const res = await post({ claim, body: 'hello' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the projectId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a BLANK body is not a comment — the route says so in the house’s own words', async () => {
    stubService({ status: 201, json: { ok: true } });
    const res = await post({ projectId: 'pub-1', claim, body: '   ' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a comment must say something: a blank body is not a comment');
    expect(calls).toHaveLength(0);
  });

  it('a comment with no claim is refused — an authorless comment has nobody to take it back', async () => {
    stubService({ status: 201, json: { ok: true } });
    const res = await post({ projectId: 'pub-1', body: 'hello' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a comment needs an account: a comment with no author has nobody to take it back and nobody to answer to');
    expect(calls).toHaveLength(0);
  });

  it('a claim with no accountId is the same refusal — a claim without an account is not a claim', async () => {
    stubService({ status: 201, json: { ok: true } });
    const res = await post({ projectId: 'pub-1', body: 'hello', claim: { handle: 'ada' } });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a comment needs an account: a comment with no author has nobody to take it back and nobody to answer to');
    expect(calls).toHaveLength(0);
  });

  it('the claim travels EXACTLY as the browser built it — absent fields are null, not invented', async () => {
    stubService({ status: 201, json: { ok: true, comment: { id: 'c-1' } } });
    await post({ projectId: 'pub-1', body: 'hello', claim: { accountId: 'acct-ada' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({
      projectId: 'pub-1',
      body: 'hello',
      claim: { accountId: 'acct-ada', handle: null, assurance: null, claimedAt: null },
    });
  });

  it('the service’s own answer is passed through, and its refusal is a 502 with the reason', async () => {
    stubService({ status: 201, json: { ok: true, comments: [{ id: 'c-9' }] } });
    const ok = await post({ projectId: 'pub-1', body: 'hello', claim });
    expect(ok.status).toBe(201);
    expect((await ok.json()).comment.id).toBe('c-9');

    stubService({ status: 502, json: { ok: false, reason: 'the service is down' } });
    const refused = await post({ projectId: 'pub-1', body: 'hello', claim });
    expect(refused.status).toBe(502);
    expect((await refused.json()).reason).toBe('the service is down');
  });
});
