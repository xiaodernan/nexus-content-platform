import { afterEach, describe, expect, it, vi } from 'vitest';

import { DELETE, POST, PUT } from './route';

/**
 * M7 v493 (ADR 0016 amendment 486) — the plans ROUTE, graded directly.
 *
 * `planServer.test.ts` has always graded the lib: how a call to the service composes an address, waits,
 * and reads an answer back. This file grades the hop above it, whose decisions belong to nothing else:
 * which refusals happen BEFORE the service is asked, in what order the guards run, which values are
 * forwarded exactly as the caller wrote them and which are trimmed or defaulted first, what the
 * browser\u2019s HTTP status does and does not mean, and what vocabulary the route\u2019s own refusal sentences claim.
 *
 * The door is WRITE-ONLY: it offers, reprices and retires, and reads nothing — the plans a creator
 * offers are read through another door, and this one never pretends to answer a question it does not ask.
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
let answer: { status: number; json?: unknown } = { status: 200, json: { ok: true } };

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

const put = (search: string) => PUT(new Request(`http://studio.test/api/plans${search}`, { method: 'PUT' }));
const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/plans', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
const retire = (search: string) => DELETE(new Request(`http://studio.test/api/plans${search}`, { method: 'DELETE' }));

describe('plans route — the PUT ask (v493)', () => {
  it('a missing planId is refused BEFORE the service is asked', async () => {
    stubService({ status: 200, json: { ok: true } });
    const res = await put('?claimer=acct-ada&price=500');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the planId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a BLANK planId is the same refusal — whitespace is not an id', async () => {
    stubService({ status: 200, json: { ok: true } });
    const res = await put('?planId=%20&claimer=acct-ada&price=500');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the planId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a missing claimer is refused by name — changing a plan needs the account that offers it', async () => {
    stubService({ status: 200, json: { ok: true } });
    const res = await put('?planId=plan-1&price=500');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('changing a plan needs the account that offers it');
    expect(calls).toHaveLength(0);
  });

  it('a price that is not a number is refused by name — a plan needs a price, in cents', async () => {
    stubService({ status: 200, json: { ok: true } });
    const res = await put('?planId=plan-1&claimer=acct-ada&price=abc');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a plan needs a price, in cents');
    expect(calls).toHaveLength(0);
  });

  it('the ids are TRIMMED before the ask — the service is asked for the plan, not the padding', async () => {
    stubService({ status: 200, json: { ok: true, priceCents: 500, period: 'month' } });
    await put('?planId=%20plan-1%20&claimer=%20acct-ada%20&price=500');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('PUT');
    expect(calls[0]!.url).toContain('/plans/plan-1?');
    expect(calls[0]!.url).toContain('claimer=acct-ada');
    expect(calls[0]!.url).not.toContain('%20plan-1');
  });

  it('the price is TRUNCATED, not floored — a negative price loses its fraction toward zero', async () => {
    stubService({ status: 200, json: { ok: true, priceCents: -9, period: 'month' } });
    await put('?planId=plan-1&claimer=acct-ada&price=-9.9');
    expect(calls[0]!.url).toContain('price=-9');
  });

  it('a period that is not named is the month — the door does not forward an absent period', async () => {
    stubService({ status: 200, json: { ok: true, priceCents: 500, period: 'month' } });
    await put('?planId=plan-1&claimer=acct-ada&price=500');
    expect(calls[0]!.url).toContain('period=month');
  });

  it('a period that IS named is forwarded as asked', async () => {
    stubService({ status: 200, json: { ok: true, priceCents: 500, period: 'year' } });
    await put('?planId=plan-1&claimer=acct-ada&price=500&period=year');
    expect(calls[0]!.url).toContain('period=year');
  });

  it('the reprice claim carries ONLY the accountId — no handle, assurance or instant is invented or forwarded', async () => {
    stubService({ status: 200, json: { ok: true, priceCents: 500, period: 'month' } });
    await put('?planId=plan-1&claimer=acct-ada&price=500');
    expect(calls[0]!.url).not.toContain('handle=');
    expect(calls[0]!.url).not.toContain('assurance=');
    expect(calls[0]!.url).not.toContain('claimedAt=');
  });

  it('an ok answer is a 200 carrying the price and the period the service now holds', async () => {
    stubService({ status: 200, json: { ok: true, priceCents: 500, period: 'year' } });
    const res = await put('?planId=plan-1&claimer=acct-ada&price=500&period=year');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, priceCents: 500, period: 'year' });
  });

  it('the lib\u2019s refusal is a 502 carrying the lib\u2019s OWN reason', async () => {
    stubService({ status: 403, json: { error: 'forbidden', message: 'that plan is not yours to reprice' } });
    const res = await put('?planId=plan-1&claimer=acct-eve&price=500');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('that plan is not yours to reprice');
  });
});

describe('plans route — the POST ask (v493)', () => {
  const claim = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a body that is not JSON is refused before the service is asked', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    const res = await post(undefined, 'not json at all');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not JSON');
    expect(calls).toHaveLength(0);
  });

  it('a body that is not an object is refused by name', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    const res = await post(undefined, '"a string"');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not an object');
    expect(calls).toHaveLength(0);
  });

  it('a missing planId is refused by name', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    const res = await post({ priceCents: 500, claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the planId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a missing priceCents is refused by name — an offer with no price is not an offer', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    const res = await post({ planId: 'plan-1', claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the priceCents is missing');
    expect(calls).toHaveLength(0);
  });

  it('an offer with no claim is refused — a plan needs an account to offer it', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    const res = await post({ planId: 'plan-1', priceCents: 500 });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a plan needs an account to offer it');
    expect(calls).toHaveLength(0);
  });

  it('a claim with no accountId is the same refusal — a claim without an account is not a claim', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    const res = await post({ planId: 'plan-1', priceCents: 500, claim: { handle: 'ada' } });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a plan needs an account to offer it');
    expect(calls).toHaveLength(0);
  });

  it('the claim travels EXACTLY as the browser built it — absent fields are null, not invented', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    await post({ planId: 'plan-1', priceCents: 500, claim: { accountId: 'acct-ada' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({
      planId: 'plan-1',
      priceCents: 500,
      currency: 'CNY',
      period: 'month',
      claim: { accountId: 'acct-ada', handle: null, assurance: null, claimedAt: null },
    });
  });

  it('a currency that is not a string is the CNY — the door does not forward a currency that is not one', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    await post({ planId: 'plan-1', priceCents: 500, currency: 7, claim });
    expect(calls[0]!.body?.currency).toBe('CNY');
  });

  it('a FRACTIONAL price is floored — cents are whole', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    await post({ planId: 'plan-1', priceCents: 250.9, claim });
    expect(calls[0]!.body?.priceCents).toBe(250);
  });

  it('an offer is a NEW row — the door answers 201, not 200', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1', priceCents: 500 }] } });
    const res = await post({ planId: 'plan-1', priceCents: 500, claim });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, plan: { planId: 'plan-1', priceCents: 500 } });
  });

  it('the service\u2019s refusal is a 502 with the reason', async () => {
    stubService({ status: 502, json: { ok: false, reason: 'the service is down' } });
    const res = await post({ planId: 'plan-1', priceCents: 500, claim });
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('the service is down');
  });
});

describe('plans route — the DELETE ask (v493)', () => {
  it('a missing planId is refused before the service is asked', async () => {
    stubService({ status: 200, json: { ok: true, retired: true } });
    const res = await retire('?claimer=acct-ada');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the planId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a missing claimer is refused by name — retiring a plan needs the account that offers it', async () => {
    stubService({ status: 200, json: { ok: true, retired: true } });
    const res = await retire('?planId=plan-1');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('retiring a plan needs the account that offers it');
    expect(calls).toHaveLength(0);
  });

  it('the ids are TRIMMED before the ask — the service is asked for the plan, not the padding', async () => {
    stubService({ status: 200, json: { ok: true, retired: true } });
    await retire('?planId=%20plan-1%20&claimer=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toMatch(/\/plans\/plan-1\?claimer=acct-ada$/);
  });

  it('a 200 that says NOTHING about retiring is a refusal — silence is not success', async () => {
    stubService({ status: 200, json: { ok: true } });
    const res = await retire('?planId=plan-1&claimer=acct-ada');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('the service’s plans door answered HTTP 200');
  });

  it('a retirement that MOVED the plan is a 200 saying so', async () => {
    stubService({ status: 200, json: { ok: true, retired: true } });
    const res = await retire('?planId=plan-1&claimer=acct-ada');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, retired: true });
  });

  it('the service\u2019s refusal is a 502 carrying the service\u2019s OWN words', async () => {
    stubService({ status: 403, json: { error: 'forbidden', message: 'that plan is not yours to retire' } });
    const res = await retire('?planId=plan-1&claimer=acct-eve');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('that plan is not yours to retire');
  });
});

/**
 * M7 v521 (ADR 0016 amendment 507) — the body’s names join the rule the query names already kept.
 *
 * A plan id is the sharpest name in the house: the service’s own comment says an id “is an address people
 * are given”. The PUT and DELETE halves of this door already trimmed their names and refused a blank one;
 * the POST half checked only LENGTH, and v511 stripped the blank check off the offerer’s account. So the
 * same ask, offered instead of repriced, was answered by the service’s refusal at a 502.
 */
describe('plans route — the POST body’s names go through the one rule (v521)', () => {
  const claim = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a planId that is only space is not an address — refused BEFORE the service is asked', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    const res = await post({ planId: '   ', priceCents: 500, claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the planId is missing');
    expect(calls, 'a name that is blank after trimming is not asked about at all').toHaveLength(0);
  });

  it('a claim whose accountId is empty or only space is not an offerer — refused BEFORE the service is asked', async () => {
    for (const blank of ['', '   ']) {
      stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
      const res = await post({ planId: 'plan-1', priceCents: 500, claim: { accountId: blank } });
      expect(res.status, `accountId ${JSON.stringify(blank)} does not offer a plan`).toBe(400);
      expect((await res.json()).reason).toBe('a plan needs an account to offer it');
      expect(calls, 'the door answers the ask, so the service never hears about it').toHaveLength(0);
    }
  });

  it('both names are asked about TRIMMED — and the currency and period are the caller’s own words', async () => {
    stubService({ status: 201, json: { ok: true, plans: [{ planId: 'plan-1' }] } });
    await post({ planId: '  plan-1  ', priceCents: 500, currency: ' CNY ', claim: { accountId: '  acct-ada  ' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.body).toMatchObject({
      planId: 'plan-1',
      claim: { accountId: 'acct-ada' },
      currency: ' CNY ',
    });
  });
});
