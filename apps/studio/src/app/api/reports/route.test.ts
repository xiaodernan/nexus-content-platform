import { afterEach, describe, expect, it, vi } from 'vitest';

import { DELETE, GET, POST } from './route';

/**
 * M7 v489 (ADR 0016 amendment 482) — the reports ROUTE, graded directly.
 *
 * `reportServer.test.ts` has always graded the lib: how a call to the service composes an address,
 * waits, and reads an answer back. This file grades the hop above it, whose decisions belong to nothing
 * else: which refusals happen BEFORE the service is asked, in what order the guards run, which values are
 * forwarded exactly as the caller wrote them and which are trimmed first, what the browser\u2019s HTTP status
 * does and does not mean, and what vocabulary the route\u2019s own refusal sentences claim.
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
let answer: { status: number; json?: unknown } = { status: 200, json: { ok: true, reports: [], count: 0, limit: 20, offset: 0 } };

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

const get = (search: string) => GET(new Request(`http://studio.test/api/reports${search}`));
const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/reports', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );
const withdraw = (search: string) => DELETE(new Request(`http://studio.test/api/reports${search}`, { method: 'DELETE' }));

describe('reports route — the GET ask (v489)', () => {
  it('a missing reporter is refused BEFORE the service is asked — the question names whose reports they are', async () => {
    stubService({ status: 200, json: { ok: true, reports: [], count: 0, limit: 20, offset: 0 } });
    const res = await get('');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'the reports an account filed need that account to be named' });
    expect(calls).toHaveLength(0);
  });

  it('a BLANK reporter is the same refusal — whitespace is not an account', async () => {
    stubService({ status: 200, json: { ok: true, reports: [], count: 0, limit: 20, offset: 0 } });
    const res = await get('?reporter=%20%20');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the reports an account filed need that account to be named');
    expect(calls).toHaveLength(0);
  });

  it('the reporter is TRIMMED before the ask — the service is asked for the account, not the padding', async () => {
    stubService({ status: 200, json: { ok: true, reports: [], count: 0, limit: 20, offset: 0 } });
    await get('?reporter=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('reporter=acct-ada');
    expect(calls[0]!.url).not.toContain('%20acct-ada');
  });

  it('a limit that is not a number falls back to 20 — NaN is never forwarded to the service', async () => {
    stubService({ status: 200, json: { ok: true, reports: [], count: 0, limit: 20, offset: 0 } });
    await get('?reporter=acct-ada&limit=abc');
    expect(calls[0]!.url).toContain('limit=20');
  });

  it('a limit of ZERO is not a window of nothing — it is the default window', async () => {
    stubService({ status: 200, json: { ok: true, reports: [], count: 0, limit: 20, offset: 0 } });
    await get('?reporter=acct-ada&limit=0');
    expect(calls[0]!.url).toContain('limit=20');
  });

  it('a fractional limit is truncated, not rounded', async () => {
    stubService({ status: 200, json: { ok: true, reports: [], count: 0, limit: 20, offset: 0 } });
    await get('?reporter=acct-ada&limit=5.9');
    expect(calls[0]!.url).toContain('limit=5');
  });

  it('a NEGATIVE offset is clamped to the first page — a window before the first row is the newest rows', async () => {
    stubService({ status: 200, json: { ok: true, reports: [], count: 0, limit: 20, offset: 0 } });
    await get('?reporter=acct-ada&offset=-40');
    expect(calls[0]!.url).toContain('offset=0');
  });

  it('an offset that IS a number is forwarded as asked', async () => {
    stubService({ status: 200, json: { ok: true, reports: [], count: 0, limit: 20, offset: 0 } });
    await get('?reporter=acct-ada&offset=40');
    expect(calls[0]!.url).toContain('offset=40');
  });

  it('the lib\u2019s refusal becomes a 502 carrying the lib\u2019s OWN reason — not a 200 with an empty list', async () => {
    stubService({ status: 503, json: { error: 'down', message: 'the service is down' } });
    const res = await get('?reporter=acct-ada');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toContain('the service is down');
  });

  it('an ok answer is a 200 carrying the reports, the total count and the window it was asked for', async () => {
    stubService({ status: 200, json: { ok: true, reports: [{ id: 'r-1' }], count: 7, limit: 20, offset: 40 } });
    const res = await get('?reporter=acct-ada&offset=40');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reports: [{ id: 'r-1' }], count: 7, limit: 20, offset: 40 });
  });
});

describe('reports route — the POST ask (v489)', () => {
  const claim = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('a body that is not JSON is refused before the service is asked', async () => {
    stubService({ status: 201, json: { ok: true, reports: [{ id: 'r-1' }] } });
    const res = await post(undefined, 'not json at all');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not JSON');
    expect(calls).toHaveLength(0);
  });

  it('a body that is not an object is refused by name', async () => {
    stubService({ status: 201, json: { ok: true, reports: [{ id: 'r-1' }] } });
    const res = await post(undefined, '"a string"');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the body is not an object');
    expect(calls).toHaveLength(0);
  });

  it('a missing projectId is refused by name', async () => {
    stubService({ status: 201, json: { ok: true, reports: [{ id: 'r-1' }] } });
    const res = await post({ reason: 'spam', claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the projectId is missing');
    expect(calls).toHaveLength(0);
  });

  it('a missing reason is refused by name — and the sentence names the four the service takes', async () => {
    stubService({ status: 201, json: { ok: true, reports: [{ id: 'r-1' }] } });
    const res = await post({ projectId: 'pub-1', claim });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a report needs a reason: one of spam, harassment, illegal, other');
    expect(calls).toHaveLength(0);
  });

  it('a report with no claim is refused — an authorless report has nobody to follow it up', async () => {
    stubService({ status: 201, json: { ok: true, reports: [{ id: 'r-1' }] } });
    const res = await post({ projectId: 'pub-1', reason: 'spam' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a report needs an account: a report with no reporter cannot be followed up');
    expect(calls).toHaveLength(0);
  });

  it('a claim with no accountId is the same refusal — a claim without an account is not a claim', async () => {
    stubService({ status: 201, json: { ok: true, reports: [{ id: 'r-1' }] } });
    const res = await post({ projectId: 'pub-1', reason: 'spam', claim: { handle: 'ada' } });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a report needs an account: a report with no reporter cannot be followed up');
    expect(calls).toHaveLength(0);
  });

  it('the claim travels EXACTLY as the browser built it — absent fields are null, not invented', async () => {
    stubService({ status: 201, json: { ok: true, reports: [{ id: 'r-1' }] } });
    await post({ projectId: 'pub-1', reason: 'spam', claim: { accountId: 'acct-ada' } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.body).toEqual({
      projectId: 'pub-1',
      reason: 'spam',
      detail: '',
      claim: { accountId: 'acct-ada', handle: null, assurance: null, claimedAt: null },
    });
  });

  it('a detail that is not a string is forwarded as empty — the route does not invent a detail', async () => {
    stubService({ status: 201, json: { ok: true, reports: [{ id: 'r-1' }] } });
    await post({ projectId: 'pub-1', reason: 'spam', detail: 42, claim });
    expect(calls[0]!.body?.detail).toBe('');
  });

  it('the SUBJECT is not trimmed — the route trims the account it is asked about, not the thing reported', async () => {
    stubService({ status: 201, json: { ok: true, reports: [{ id: 'r-1' }] } });
    await post({ projectId: '  pub-1  ', reason: 'spam', claim });
    expect(calls[0]!.body?.projectId).toBe('  pub-1  ');
  });

  it('the service\u2019s own answer is passed through, and its refusal is a 502 with the reason', async () => {
    stubService({ status: 201, json: { ok: true, reports: [{ id: 'r-9' }] } });
    const ok = await post({ projectId: 'pub-1', reason: 'spam', claim });
    expect(ok.status).toBe(201);
    expect((await ok.json()).report.id).toBe('r-9');

    stubService({ status: 502, json: { ok: false, reason: 'the service is down' } });
    const refused = await post({ projectId: 'pub-1', reason: 'spam', claim });
    expect(refused.status).toBe(502);
    expect((await refused.json()).reason).toBe('the service is down');
  });
});

describe('reports route — the DELETE ask (v489)', () => {
  it('a missing reportId is refused before the service is asked', async () => {
    stubService({ status: 200, json: { ok: true, withdrawn: true } });
    const res = await withdraw('?claimer=acct-ada');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'the report needs an id to be withdrawn' });
    expect(calls).toHaveLength(0);
  });

  it('a BLANK reportId is the same refusal — whitespace is not an id', async () => {
    stubService({ status: 200, json: { ok: true, withdrawn: true } });
    const res = await withdraw('?reportId=%20&claimer=acct-ada');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('the report needs an id to be withdrawn');
    expect(calls).toHaveLength(0);
  });

  it('a missing claimer is refused by name — a report can only be withdrawn by the account that filed it', async () => {
    stubService({ status: 200, json: { ok: true, withdrawn: true } });
    const res = await withdraw('?reportId=r-1');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a withdrawal needs an account: a report can only be withdrawn by the account that filed it');
    expect(calls).toHaveLength(0);
  });

  it('the ids are TRIMMED before the ask — the service is asked for the report, not the padding', async () => {
    stubService({ status: 200, json: { ok: true, withdrawn: true } });
    await withdraw('?reportId=%20r-1%20&claimer=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toMatch(/\/reports\/r-1\?claimer=acct-ada$/);
  });

  it('a withdrawal that MOVED the report is a 200 saying so', async () => {
    stubService({ status: 200, json: { ok: true, withdrawn: true } });
    const res = await withdraw('?reportId=r-1&claimer=acct-ada');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, withdrawn: true });
  });

  it('a report that was ALREADY withdrawn is a 200 too — it is not an error, and the route does not make it one', async () => {
    stubService({ status: 200, json: { ok: true, withdrawn: false } });
    const res = await withdraw('?reportId=r-1&claimer=acct-ada');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, withdrawn: false });
  });

  it('the service\u2019s refusal is a 502 carrying the service\u2019s OWN words — a 403 for somebody else\u2019s report passes through', async () => {
    stubService({ status: 403, json: { error: 'forbidden', message: 'that report is not yours to withdraw' } });
    const res = await withdraw('?reportId=r-1&claimer=acct-eve');
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe('that report is not yours to withdraw');
  });
});
