import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

/**
 * M7 v492 (ADR 0016 amendment 485) — the follows DOORS, graded directly.
 *
 * `followServer.test.ts` has always graded the lib: how a call to the service composes an address,
 * waits, and reads an answer back. This file and its `[accountId]` sibling grade the hop above it,
 * whose decisions belong to nothing else: which refusals happen BEFORE the service is asked, which
 * values are forwarded exactly as the caller wrote them and which are trimmed first, what the
 * browser\u2019s HTTP status does and does not mean, and what vocabulary the route\u2019s own refusal sentences
 * claim.
 *
 * The service is faked at the `fetch` boundary rather than injected, because the routes call the lib\u2019s
 * defaults and those read the global `fetch` per call — so a stub grades them without asking any source
 * file to carry a seam for the test\u2019s benefit.
 */

interface Call {
  url: string;
  method?: string;
  body?: Record<string, unknown>;
}

let calls: Call[] = [];
let answer: { status: number; json?: unknown } = { status: 200, json: { ok: true, following: [], count: 0, limit: 20, offset: 0 } };

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

const get = (search: string) => GET(new Request(`http://studio.test/api/follows${search}`));
const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/follows', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe('follows route — the GET ask (v492)', () => {
  it('a missing follower is refused BEFORE the service is asked — a list of follows with no follower is nobody\u2019s list', async () => {
    stubService({ status: 200, json: { ok: true, following: [], count: 0, limit: 20, offset: 0 } });
    const res = await get('');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: 'the follower must be named: a list of follows with no follower is nobody’s list',
    });
    expect(calls).toHaveLength(0);
  });

  it('a BLANK follower is the same refusal — whitespace is not an account', async () => {
    stubService({ status: 200, json: { ok: true, following: [], count: 0, limit: 20, offset: 0 } });
    const res = await get('?follower=%20%20');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the follower must be named: a list of follows with no follower is nobody’s list');
    expect(calls).toHaveLength(0);
  });

  it('the follower is TRIMMED before the ask — the service is asked for the account, not the padding', async () => {
    stubService({ status: 200, json: { ok: true, following: [], count: 0, limit: 20, offset: 0 } });
    await get('?follower=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('follower=acct-ada');
    expect(calls[0]!.url).not.toContain('%20acct-ada');
  });

  it('an offset that is not a number is the first window — NaN is never forwarded to the service', async () => {
    stubService({ status: 200, json: { ok: true, following: [], count: 0, limit: 20, offset: 0 } });
    await get('?follower=acct-ada&offset=abc');
    expect(calls[0]!.url).toContain('offset=0');
  });

  it('a NEGATIVE offset is the first window — a page before the first is the newest rows', async () => {
    stubService({ status: 200, json: { ok: true, following: [], count: 0, limit: 20, offset: 0 } });
    await get('?follower=acct-ada&offset=-40');
    expect(calls[0]!.url).toContain('offset=0');
  });

  it('a fractional offset is truncated, not rounded', async () => {
    stubService({ status: 200, json: { ok: true, following: [], count: 0, limit: 20, offset: 0 } });
    await get('?follower=acct-ada&offset=40.9');
    expect(calls[0]!.url).toContain('offset=40');
  });

  it('an offset that IS a number is forwarded as asked', async () => {
    stubService({ status: 200, json: { ok: true, following: [], count: 0, limit: 20, offset: 0 } });
    await get('?follower=acct-ada&offset=40');
    expect(calls[0]!.url).toContain('offset=40');
  });

  it('the lib\u2019s refusal is a 502 carrying the lib\u2019s OWN reason — not a 200 with an empty list', async () => {
    stubService({ status: 503, json: { error: 'down', message: 'the service is down' } });
    const res = await get('?follower=acct-ada');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("the service's follows door answered HTTP 503");
  });

  it('a 200 that is not the follows shape is a refusal, not an empty list', async () => {
    stubService({ status: 200, json: { ok: true, somethingElse: true } });
    const res = await get('?follower=acct-ada');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('the service answered its follows door with no list');
  });

  it('an ok answer is a 200 carrying the lib\u2019s answer THROUGH — the window it names travels with it', async () => {
    stubService({ status: 200, json: { ok: true, following: [{ followerId: 'acct-ada', followeeId: 'acct-grace', createdAt: 1 }], followingCount: 7, limit: 20, offset: 40 } });
    const res = await get('?follower=acct-ada&offset=40');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      following: [{ followerId: 'acct-ada', followeeId: 'acct-grace', createdAt: 1 }],
      count: 7,
      limit: 20,
      offset: 40,
    });
  });
});

describe('follows route — the POST ask (v492)', () => {
  const claim = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a body that is not JSON is refused before the service is asked', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 1, following: true } });
    const res = await post(undefined, 'not json at all');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not JSON');
    expect(calls).toHaveLength(0);
  });

  it('a body that is not an object is refused by name', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 1, following: true } });
    const res = await post(undefined, '"a string"');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not an object');
    expect(calls).toHaveLength(0);
  });

  it('a missing accountId is refused by name', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 1, following: true } });
    const res = await post({ claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the accountId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a follow with no claim is refused — a follow with no follower has no edge to draw', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 1, following: true } });
    const res = await post({ accountId: 'acct-grace' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a follow needs an account: a follow with no follower has no edge to draw');
    expect(calls).toHaveLength(0);
  });

  it('a claim with no accountId is the same refusal — a claim without an account is not a claim', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 1, following: true } });
    const res = await post({ accountId: 'acct-grace', claim: { handle: 'ada' } });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a follow needs an account: a follow with no follower has no edge to draw');
    expect(calls).toHaveLength(0);
  });

  it('the claim travels EXACTLY as the browser built it — absent fields are null, not invented', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 1, following: true } });
    await post({ accountId: 'acct-grace', claim: { accountId: 'acct-ada' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({
      accountId: 'acct-grace',
      claim: { accountId: 'acct-ada', handle: null, assurance: null, claimedAt: null },
    });
  });

  it('a follow is NOT a new row every time — the door answers 200, not 201', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 4, following: true } });
    const res = await post({ accountId: 'acct-grace', claim });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, followerCount: 4, following: true });
  });

  it('the service\u2019s refusal is a 503 with the reason', async () => {
    stubService({ status: 502, json: { ok: false, reason: 'the service is down' } });
    const res = await post({ accountId: 'acct-grace', claim });
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe('the service is down');
  });
});
