import { afterEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from './route';

/**
 * M7 v492 (ADR 0016 amendment 485) — the follows DOORS, graded directly (the take-back door).
 *
 * `followServer.test.ts` has always graded the lib: how a call to the service composes an address,
 * waits, and reads an answer back. This file grades the hop above it — a DYNAMIC SEGMENT, because a
 * route that reads a path parameter has to BE one (v294) — whose decisions belong to nothing else:
 * which refusals happen BEFORE the service is asked, what the path segment and the claimer are turned
 * into before the ask, and what the browser\u2019s HTTP status does and does not mean.
 *
 * The service is faked at the `fetch` boundary rather than injected, because the route calls the lib\u2019s
 * default and that reads the global `fetch` per call — so a stub grades the route without asking any
 * source file to carry a seam for the test\u2019s benefit.
 */

interface Call {
  url: string;
  method?: string;
}

let calls: Call[] = [];
let answer: { status: number; json?: unknown } = { status: 200, json: { ok: true, followerCount: 3, following: false } };

function stubService(next: { status: number; json?: unknown }) {
  answer = next;
  calls = [];
  vi.stubGlobal(
    'fetch',
    async (input: string | URL, init?: { method?: string }) => {
      calls.push({ url: String(input), method: init?.method });
      return new Response(answer.json === undefined ? '' : JSON.stringify(answer.json), { status: answer.status });
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const unfollow = (accountId: string, search: string) =>
  DELETE(new Request(`http://studio.test/api/follows/${accountId}${search}`), {
    params: Promise.resolve({ accountId }),
  });

describe('follows [accountId] route — the DELETE ask (v492)', () => {
  it('a missing claimer is refused BEFORE the service is asked — a follow with no follower has no edge to draw', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 3, following: false } });
    const res = await unfollow('acct-grace', '');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: 'a follow needs an account: a follow with no follower has no edge to draw',
    });
    expect(calls).toHaveLength(0);
  });

  it('a BLANK claimer is the same refusal — an empty name is no name', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 3, following: false } });
    const res = await unfollow('acct-grace', '?claimer=');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a follow needs an account: a follow with no follower has no edge to draw');
    expect(calls).toHaveLength(0);
  });

  it('a padded claimer is asked about as the name the caller MEANT (v508)', async () => {
    // The service never trims, so a padded claimer would be compared against an account that does
    // not exist and refused as “not yours” — the wrong sentence for a name that was never really named.
    stubService({ status: 200, json: { ok: true, followerCount: 3, following: false } });
    await unfollow('acct-grace', '?claimer=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toContain('claimer=acct-ada');
    expect(calls[0]!.url).not.toContain('%20acct-ada');
  });

  it('a claimer that is only space is refused before the service is asked (v508)', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 3, following: false } });
    const res = await unfollow('acct-grace', '?claimer=%20%20');
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('the path segment is DECODED before the ask — a lowercase escape arrives at the service in its canonical form', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 3, following: false } });
    await unfollow('acct%2fgrace', '?claimer=acct-ada');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/follows/acct%2Fgrace?');
  });

  it('a path segment that is not a valid escape THROWS — the door guards the claimer and nothing else', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 3, following: false } });
    await expect(unfollow('acct%', '?claimer=acct-ada')).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it('an ok answer is a 200 carrying the service\u2019s own words', async () => {
    stubService({ status: 200, json: { ok: true, followerCount: 2, following: false } });
    const res = await unfollow('acct-grace', '?claimer=acct-ada');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, followerCount: 2, following: false });
  });

  it('the service\u2019s refusal is a 502 with the reason', async () => {
    stubService({ status: 403, json: { error: 'forbidden', message: 'that follow is not yours to take back' } });
    const res = await unfollow('acct-grace', '?claimer=acct-eve');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('that follow is not yours to take back');
  });
});
