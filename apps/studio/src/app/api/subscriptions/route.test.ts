import { afterEach, describe, expect, it, vi } from 'vitest';

import { DELETE, POST } from './route';

/**
 * M7 v497 (ADR 0016 amendment 490) — the subscriptions DOORS, graded directly.
 *
 * `planServer.test.ts` has always graded the lib: how a call to the service composes an address, waits,
 * and reads an answer back. This file grades the hop above it, whose decisions belong to nothing else:
 * which refusals happen BEFORE the service is asked, in what order the guards run, which values are
 * forwarded exactly as the caller wrote them and which are trimmed first, and what the browser\u2019s HTTP
 * status does and does not mean.
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
let answer: { status: number; json?: unknown } = { status: 201, json: { ok: true, subscriptions: [{ id: 's-1' }] } };

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

const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/subscriptions', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
const end = (search: string) => DELETE(new Request(`http://studio.test/api/subscriptions${search}`, { method: 'DELETE' }));

describe('subscriptions route — the POST ask (v497)', () => {
  const claim = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a body that is not JSON is refused before the service is asked', async () => {
    stubService({ status: 201, json: { ok: true, subscriptions: [{ id: 's-1' }] } });
    const res = await post(undefined, 'not json at all');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not JSON');
    expect(calls).toHaveLength(0);
  });

  it('a body that is not an object is refused by name', async () => {
    stubService({ status: 201, json: { ok: true, subscriptions: [{ id: 's-1' }] } });
    const res = await post(undefined, '"a string"');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not an object');
    expect(calls).toHaveLength(0);
  });

  it('a missing planId is refused by name', async () => {
    stubService({ status: 201, json: { ok: true, subscriptions: [{ id: 's-1' }] } });
    const res = await post({ claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the planId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a subscription with no claim is refused — a subscription needs an account to hold it', async () => {
    stubService({ status: 201, json: { ok: true, subscriptions: [{ id: 's-1' }] } });
    const res = await post({ planId: 'plan-1' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a subscription needs an account to hold it');
    expect(calls).toHaveLength(0);
  });

  it('a claim with no accountId is the same refusal — a claim without an account is not a claim', async () => {
    stubService({ status: 201, json: { ok: true, subscriptions: [{ id: 's-1' }] } });
    const res = await post({ planId: 'plan-1', claim: { handle: 'ada' } });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a subscription needs an account to hold it');
    expect(calls).toHaveLength(0);
  });

  it('the claim travels EXACTLY as the browser built it — absent fields are null, not invented', async () => {
    stubService({ status: 201, json: { ok: true, subscriptions: [{ id: 's-1' }] } });
    await post({ planId: 'plan-1', claim: { accountId: 'acct-ada' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({
      planId: 'plan-1',
      claim: { accountId: 'acct-ada', handle: null, assurance: null, claimedAt: null },
    });
  });

  it('a subscription is a NEW row — the door answers 201 with the service\u2019s own answer', async () => {
    stubService({ status: 201, json: { ok: true, subscriptions: [{ id: 's-9' }] } });
    const res = await post({ planId: 'plan-1', claim });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, subscription: { id: 's-9' } });
  });

  it('the service\u2019s refusal is a 502 with the reason', async () => {
    stubService({ status: 502, json: { ok: false, reason: 'the service is down' } });
    const res = await post({ planId: 'plan-1', claim });
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('the service is down');
  });
});

describe('subscriptions route — the DELETE ask (v497)', () => {
  it('a missing subscriptionId is refused before the service is asked', async () => {
    stubService({ status: 200, json: { ok: true, ended: true } });
    const res = await end('?claimer=acct-ada');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the subscriptionId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a BLANK subscriptionId is the same refusal — whitespace is not an id', async () => {
    stubService({ status: 200, json: { ok: true, ended: true } });
    const res = await end('?subscriptionId=%20&claimer=acct-ada');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the subscriptionId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a missing claimer is refused by name — ending a subscription needs the account that holds it', async () => {
    stubService({ status: 200, json: { ok: true, ended: true } });
    const res = await end('?subscriptionId=s-1');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('ending a subscription needs the account that holds it');
    expect(calls).toHaveLength(0);
  });

  it('a BLANK claimer is the same refusal — whitespace is not an account', async () => {
    stubService({ status: 200, json: { ok: true, ended: true } });
    const res = await end('?subscriptionId=s-1&claimer=%20%20');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('ending a subscription needs the account that holds it');
    expect(calls).toHaveLength(0);
  });

  it('the ids are TRIMMED before the ask — the service is asked for the subscription, not the padding', async () => {
    stubService({ status: 200, json: { ok: true, ended: true } });
    await end('?subscriptionId=%20s-1%20&claimer=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toMatch(/\/subscriptions\/s-1\?claimer=acct-ada$/);
  });

  it('a 200 that says NOTHING about ending is a refusal — silence is not success', async () => {
    stubService({ status: 200, json: { ok: true } });
    const res = await end('?subscriptionId=s-1&claimer=acct-ada');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("the service's subscriptions door answered HTTP 200");
  });

  it('an ending that MOVED the subscription is a 200 saying so', async () => {
    stubService({ status: 200, json: { ok: true, ended: true } });
    const res = await end('?subscriptionId=s-1&claimer=acct-ada');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ended: true });
  });

  it('the service\u2019s refusal is a 502 carrying the service\u2019s OWN words', async () => {
    stubService({ status: 403, json: { error: 'forbidden', message: 'that subscription is not yours to end' } });
    const res = await end('?subscriptionId=s-1&claimer=acct-eve');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('that subscription is not yours to end');
  });
});

/**
 * M7 v521 (ADR 0016 amendment 507) — the body’s names join the rule the query names already kept.
 *
 * The ending half of this door already read both of its names through the blank rule — a blank claimer
 * is refused at the door, by name, before the service is asked. The subscribing half asked the SAME two
 * names of the BODY with a length-only check and, after v511, no blank check at all on the holder’s
 * account. One door, two answers to one question; this is the half that caught up.
 */
describe('subscriptions route — the POST body’s names go through the one rule (v521)', () => {
  const claim = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a planId that is only space is not an address — refused BEFORE the service is asked', async () => {
    stubService({ status: 201, json: { ok: true, subscriptions: [{ id: 's-1' }] } });
    const res = await post({ planId: '   ', claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the planId is missing');
    expect(calls, 'a name that is blank after trimming is not asked about at all').toHaveLength(0);
  });

  it('a claim whose accountId is empty or only space is not a holder — refused BEFORE the service is asked', async () => {
    for (const blank of ['', '   ']) {
      stubService({ status: 201, json: { ok: true, subscriptions: [{ id: 's-1' }] } });
      const res = await post({ planId: 'plan-1', claim: { accountId: blank } });
      expect(res.status, `accountId ${JSON.stringify(blank)} holds no subscription`).toBe(400);
      expect((await res.json()).reason).toBe('a subscription needs an account to hold it');
      expect(calls, 'the door answers the ask, so the service never hears about it').toHaveLength(0);
    }
  });

  it('both names are asked about TRIMMED — the plan and the subscriber alike', async () => {
    stubService({ status: 201, json: { ok: true, subscriptions: [{ id: 's-1' }] } });
    await post({ planId: '  plan-1  ', claim: { accountId: '  acct-ada  ', handle: '  ada  ' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      planId: 'plan-1',
      claim: { accountId: 'acct-ada', handle: '  ada  ' },
    });
  });
});
