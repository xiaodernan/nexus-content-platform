import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

/**
 * M7 v491 (ADR 0016 amendment 484) — the likes DOORS, graded directly.
 *
 * `likeServer.test.ts` has always graded the lib: how a call to the service composes an address, waits,
 * and reads an answer back. This file and its `[projectId]` sibling grade the hop above it, whose
 * decisions belong to nothing else: which refusals happen BEFORE the service is asked, which values are
 * forwarded exactly as the caller wrote them, what the browser\u2019s HTTP status does and does not mean, and
 * what vocabulary the route\u2019s own refusal sentences claim.
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
let answer: { status: number; json?: unknown } = { status: 200, json: { ok: true, count: 0, likes: [] } };

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

const get = (search: string) => GET(new Request(`http://studio.test/api/likes${search}`));
const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/likes', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe('likes route — the GET ask (v491)', () => {
  it('a missing projectId is refused BEFORE the service is asked', async () => {
    stubService({ status: 200, json: { ok: true, count: 0, likes: [] } });
    const res = await get('');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'the projectId parameter is missing' });
    expect(calls).toHaveLength(0);
  });

  it('an EMPTY projectId is the same refusal — an empty name is no name', async () => {
    stubService({ status: 200, json: { ok: true, count: 0, likes: [] } });
    const res = await get('?projectId=');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the projectId parameter is missing');
    expect(calls).toHaveLength(0);
  });

  it('a padded projectId is asked about as the name the caller MEANT (v508)', async () => {
    // v521 corrected the claim made under this case — that the service never trims. It trims every name it
    // reads; what the case grades is the door’s own URL, which asks about the name without the padding.
    stubService({ status: 200, json: { ok: true, count: 0, likes: [] } });
    await get('?projectId=%20pub-1%20&viewer=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('projectId=pub-1');
    expect(calls[0]!.url).toContain('viewer=acct-ada');
    expect(calls[0]!.url).not.toContain('%20pub-1');
  });

  it('a projectId that is only space is refused before the service is asked (v508)', async () => {
    stubService({ status: 200, json: { ok: true, count: 0, likes: [] } });
    const res = await get('?projectId=%20%20');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the projectId parameter is missing');
    expect(calls).toHaveLength(0);
  });

  it('a question with no viewer asks the service for no viewer — and answers liked: false', async () => {
    stubService({ status: 200, json: { ok: true, count: 1, likes: [{ accountId: 'acct-ada', projectId: 'pub-1', createdAt: 1 }] } });
    const res = await get('?projectId=pub-1');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).not.toContain('viewer=');
    expect(await res.json()).toEqual({ ok: true, count: 1, likes: [{ accountId: 'acct-ada', projectId: 'pub-1', createdAt: 1 }], liked: false });
  });

  it('a question naming a VIEWER asks the service with the viewer — and liked is true when the viewer is among the likes', async () => {
    stubService({ status: 200, json: { ok: true, count: 2, likes: [{ accountId: 'acct-grace', projectId: 'pub-1', createdAt: 1 }, { accountId: 'acct-ada', projectId: 'pub-1', createdAt: 2 }] } });
    const res = await get('?projectId=pub-1&viewer=acct-ada');
    expect(calls[0]!.url).toContain('viewer=acct-ada');
    const body = await res.json();
    expect(body.liked).toBe(true);
  });

  it('a viewer who is NOT among the likes gets liked: false — the door does not guess', async () => {
    stubService({ status: 200, json: { ok: true, count: 1, likes: [{ accountId: 'acct-grace', projectId: 'pub-1', createdAt: 1 }] } });
    const res = await get('?projectId=pub-1&viewer=acct-eve');
    expect((await res.json()).liked).toBe(false);
  });

  it('a limit that is not a number falls back to 20 — NaN is never forwarded to the service', async () => {
    stubService({ status: 200, json: { ok: true, count: 0, likes: [] } });
    await get('?projectId=pub-1&limit=abc');
    expect(calls[0]!.url).toContain('limit=20');
  });

  it('the lib\u2019s refusal is a 502 carrying the lib\u2019s OWN reason \u2014 not a 200 with an empty count', async () => {
    stubService({ status: 503, json: { error: 'down', message: 'the service is down' } });
    const res = await get('?projectId=pub-1');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("the service's likes door answered HTTP 503");
  });

  it('a 200 that is not the likes shape is a refusal, not a count of zero', async () => {
    stubService({ status: 200, json: { ok: true, somethingElse: true } });
    const res = await get('?projectId=pub-1');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('the service answered its likes door with no count');
  });

  it('an ok answer is a 200 carrying the count and the likes — and NOT the window the lib answered with', async () => {
    stubService({ status: 200, json: { ok: true, count: 3, likes: [], limit: 5, offset: 40 } });
    const res = await get('?projectId=pub-1&limit=5');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 3, likes: [], liked: false });
  });
});

describe('likes route — the POST ask (v491)', () => {
  const claim = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a body that is not JSON is refused before the service is asked', async () => {
    stubService({ status: 200, json: { ok: true, count: 1, liked: true } });
    const res = await post(undefined, 'not json at all');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not JSON');
    expect(calls).toHaveLength(0);
  });

  it('a body that is not an object is refused by name', async () => {
    stubService({ status: 200, json: { ok: true, count: 1, liked: true } });
    const res = await post(undefined, '"a string"');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not an object');
    expect(calls).toHaveLength(0);
  });

  it('a missing projectId is refused by name', async () => {
    stubService({ status: 200, json: { ok: true, count: 1, liked: true } });
    const res = await post({ claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the projectId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a like with no claim is refused — the service cannot tell one anonymous like from the same one twice', async () => {
    stubService({ status: 200, json: { ok: true, count: 1, liked: true } });
    const res = await post({ projectId: 'pub-1' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a like needs an account: the service cannot tell one anonymous like from the same one twice');
    expect(calls).toHaveLength(0);
  });

  it('a claim with no accountId is the same refusal — a claim without an account is not a claim', async () => {
    stubService({ status: 200, json: { ok: true, count: 1, liked: true } });
    const res = await post({ projectId: 'pub-1', claim: { handle: 'ada' } });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a like needs an account: the service cannot tell one anonymous like from the same one twice');
    expect(calls).toHaveLength(0);
  });

  it('the claim travels EXACTLY as the browser built it — absent fields are null, not invented', async () => {
    stubService({ status: 200, json: { ok: true, count: 1, liked: true } });
    await post({ projectId: 'pub-1', claim: { accountId: 'acct-ada' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({
      projectId: 'pub-1',
      claim: { accountId: 'acct-ada', handle: null, assurance: null, claimedAt: null },
    });
  });

  it('a like is NOT a new row every time — the door answers 200, not 201', async () => {
    stubService({ status: 200, json: { ok: true, count: 4, liked: true } });
    const res = await post({ projectId: 'pub-1', claim });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 4, liked: true });
  });

  it('the service\u2019s refusal is a 502 with the reason', async () => {
    stubService({ status: 502, json: { ok: false, reason: 'the service is down' } });
    const res = await post({ projectId: 'pub-1', claim });
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('the service is down');
  });
});

/**
 * M7 v521 (ADR 0016 amendment 507) — the body’s names join the rule the query names already kept.
 *
 * This door is where v508’s `doorName` already reads the QUERY names; the POST body’s names kept the
 * length-only check, and the claim’s account lost its blank check in v511 — so a caller who named an
 * account as three spaces was answered by the SERVICE’s refusal, as a 502, instead of by this door’s own
 * sentence at a 400. The three questions the GET block asks a query parameter are asked here of the body.
 */
describe('likes route — the POST body’s names go through the one rule (v521)', () => {
  const claim = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a projectId that is only space is not a publication — refused BEFORE the service is asked', async () => {
    stubService({ status: 200, json: { ok: true, count: 1, liked: true } });
    const res = await post({ projectId: '   ', claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the projectId is missing');
    expect(calls, 'a name that is blank after trimming is not asked about at all').toHaveLength(0);
  });

  it('a claim whose accountId is empty or only space is not a claim — refused BEFORE the service is asked', async () => {
    for (const blank of ['', '   ']) {
      stubService({ status: 200, json: { ok: true, count: 1, liked: true } });
      const res = await post({ projectId: 'pub-1', claim: { accountId: blank } });
      expect(res.status, `accountId ${JSON.stringify(blank)} is not an account`).toBe(400);
      expect((await res.json()).reason).toBe('a like needs an account: the service cannot tell one anonymous like from the same one twice');
      expect(calls, 'the door answers the ask, so the service never hears about it').toHaveLength(0);
    }
  });

  it('a padded projectId and a padded claim account are asked about TRIMMED', async () => {
    stubService({ status: 200, json: { ok: true, count: 1, liked: true } });
    await post({ projectId: '  pub-1  ', claim: { accountId: '  acct-ada  ', handle: '  ada  ' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      projectId: 'pub-1',
      claim: { accountId: 'acct-ada', handle: '  ada  ' },
    });
  });
});
