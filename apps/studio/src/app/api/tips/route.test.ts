import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';

/**
 * M7 v490 (ADR 0016 amendment 483) — the tips ROUTE, graded directly.
 *
 * `tipServer.test.ts` has always graded the lib: how a call to the service composes an address, waits,
 * and reads an answer back. This file grades the hop above it, whose decisions belong to nothing else:
 * which refusals happen BEFORE the service is asked, which side of the door a question names, which
 * values are forwarded exactly as the caller wrote them, what the browser\u2019s HTTP status does and does not
 * mean, and what vocabulary the route\u2019s own refusal sentences claim.
 *
 * The service is faked at the `fetch` boundary rather than injected, because the route calls the lib\u2019s
 * defaults and those read the global `fetch` per call — so a stub grades the route without asking any
 * source file to carry a seam for the test\u2019s benefit.
 */

interface Call {
  url: string;
  method?: string;
  body?: Record<string, unknown>;
}

let calls: Call[] = [];
let answer: { status: number; json?: unknown } = { status: 200, json: { ok: true, tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 } };

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

const get = (search: string) => GET(new Request(`http://studio.test/api/tips${search}`));
const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/tips', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe('tips route — the GET ask (v490)', () => {
  it('a question naming NEITHER side is refused BEFORE the service is asked', async () => {
    stubService({ status: 200, json: { ok: true, tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 } });
    const res = await get('');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'the question names who received the tips or who gave them' });
    expect(calls).toHaveLength(0);
  });

  it('a question naming neither side with BLANKS is the same refusal — an empty name is no name', async () => {
    stubService({ status: 200, json: { ok: true, tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 } });
    const res = await get('?recipient=&payer=');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the question names who received the tips or who gave them');
    expect(calls).toHaveLength(0);
  });

  it('a question naming the RECIPIENT asks the service for the recipient side', async () => {
    stubService({ status: 200, json: { ok: true, tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 } });
    await get('?recipient=acct-ada');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('recipient=acct-ada');
    expect(calls[0]!.url).not.toContain('payer=');
  });

  it('a question naming the PAYER asks the service for the payer side — the receipt has a place to be read', async () => {
    stubService({ status: 200, json: { ok: true, tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 } });
    await get('?payer=acct-grace');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('payer=acct-grace');
    expect(calls[0]!.url).not.toContain('recipient=');
  });

  it('a question naming BOTH is answered from the recipient side — the door serves the recipient first', async () => {
    stubService({ status: 200, json: { ok: true, tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 } });
    await get('?recipient=acct-ada&payer=acct-grace');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('recipient=acct-ada');
    expect(calls[0]!.url).not.toContain('payer=');
  });

  it('a limit that is not a number falls back to 20 — NaN is never forwarded to the service', async () => {
    stubService({ status: 200, json: { ok: true, tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 } });
    await get('?recipient=acct-ada&limit=abc');
    expect(calls[0]!.url).toContain('limit=20');
  });

  it('a NEGATIVE offset is clamped to the first window — a page before the first is the newest rows', async () => {
    stubService({ status: 200, json: { ok: true, tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 } });
    await get('?recipient=acct-ada&offset=-40');
    expect(calls[0]!.url).toContain('offset=0');
  });

  it('an offset that IS a number is forwarded as asked', async () => {
    stubService({ status: 200, json: { ok: true, tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 } });
    await get('?recipient=acct-ada&offset=40');
    expect(calls[0]!.url).toContain('offset=40');
  });

  it('the door trims NOTHING — a whitespace recipient is forwarded exactly as the browser asked it', async () => {
    stubService({ status: 200, json: { ok: true, tips: [], totalCents: 0, count: 0, limit: 20, offset: 0 } });
    await get('?recipient=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('recipient=%20acct-ada%20');
  });

  it('the lib\u2019s refusal on the RECIPIENT side is a 503 that names the HTTP number — not a 200 with an empty list', async () => {
    stubService({ status: 503, json: { error: 'down', message: 'the service is down' } });
    const res = await get('?recipient=acct-ada');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("the service's tips door answered HTTP 503");
  });

  it('the lib\u2019s refusal on the PAYER side is a 503 carrying the service\u2019s OWN words', async () => {
    stubService({ status: 503, json: { error: 'down', message: 'the service is down' } });
    const res = await get('?payer=acct-grace');
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('the service is down');
  });

  it('an ok answer is a 200 carrying the tips, the total the database summed and the cap — and NOT the page', async () => {
    stubService({ status: 200, json: { ok: true, tips: [{ id: 't-1' }], totalCents: 500, count: 2, limit: 5, offset: 40 } });
    const res = await get('?recipient=acct-ada&limit=5&offset=40');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, tips: [{ id: 't-1' }], totalCents: 500, count: 2, limit: 5 });
  });
});

describe('tips route — the POST ask (v490)', () => {
  const claim = { accountId: 'acct-grace', handle: 'grace', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a body that is not JSON is refused before the service is asked', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    const res = await post(undefined, 'not json at all');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not JSON');
    expect(calls).toHaveLength(0);
  });

  it('a body that is not an object is refused by name', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    const res = await post(undefined, '"a string"');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not an object');
    expect(calls).toHaveLength(0);
  });

  it('a missing recipientAccountId is refused by name', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    const res = await post({ amountCents: 500, claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the recipientAccountId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a missing amountCents is refused by name — a tip with no amount is not a tip', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    const res = await post({ recipientAccountId: 'acct-ada', claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the amountCents is missing');
    expect(calls).toHaveLength(0);
  });

  it('a tip with no claim is refused — the service refuses a tip with no payer BY NAME, and the route does not invent one', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    const res = await post({ recipientAccountId: 'acct-ada', amountCents: 500 });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a tip needs an account to be from');
    expect(calls).toHaveLength(0);
  });

  it('a claim with no accountId is the same refusal — a claim without an account is not a claim', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    const res = await post({ recipientAccountId: 'acct-ada', amountCents: 500, claim: { handle: 'grace' } });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a tip needs an account to be from');
    expect(calls).toHaveLength(0);
  });

  it('the claim travels EXACTLY as the browser built it — absent fields are null, not invented', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    await post({ recipientAccountId: 'acct-ada', amountCents: 500, claim: { accountId: 'acct-grace' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({
      recipientAccountId: 'acct-ada',
      amountCents: 500,
      message: '',
      anonymous: false,
      claim: { accountId: 'acct-grace', handle: null, assurance: null, claimedAt: null },
    });
  });

  it('a FRACTIONAL amount is floored, not rounded — cents are whole', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    await post({ recipientAccountId: 'acct-ada', amountCents: 250.9, claim });
    expect(calls[0]!.body?.amountCents).toBe(250);
  });

  it('a message that is not a string is forwarded as empty — the route does not invent a message', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    await post({ recipientAccountId: 'acct-ada', amountCents: 500, message: 42, claim });
    expect(calls[0]!.body?.message).toBe('');
  });

  it('only a LITERAL true is anonymous — a truthy string is a named tip', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    await post({ recipientAccountId: 'acct-ada', amountCents: 500, anonymous: 'true', claim });
    expect(calls[0]!.body?.anonymous).toBe(false);
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-1' }] } });
    await post({ recipientAccountId: 'acct-ada', amountCents: 500, anonymous: true, claim });
    expect(calls[0]!.body?.anonymous).toBe(true);
  });

  it('the service\u2019s own answer is passed through, and its refusal is a 503 with the reason', async () => {
    stubService({ status: 201, json: { ok: true, tips: [{ id: 't-9' }] } });
    const ok = await post({ recipientAccountId: 'acct-ada', amountCents: 500, claim });
    expect(ok.status).toBe(201);
    expect((await ok.json()).tip.id).toBe('t-9');

    stubService({ status: 502, json: { ok: false, reason: 'the service is down' } });
    const refused = await post({ recipientAccountId: 'acct-ada', amountCents: 500, claim });
    expect(refused.status).toBe(503);
    expect((await refused.json()).reason).toBe('the service is down');
  });
});
