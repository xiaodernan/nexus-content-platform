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

/**
 * The name the door asked the service to look up — the segment of the address the lib composed, decoded
 * the way the service decodes it. A byte needle on the URL cannot tell `acct%2Fgrace` (the name `acct/grace`)
 * from `acct%252Fgrace` (the name `acct%2Fgrace`); the parser can.
 */
const nameAsked = (url: string): string => decodeURIComponent(new URL(url).pathname.split('/')[2]!);

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
    // v521 corrected the claim made under this case — that the service never trims. It trims every name it
    // reads; what the case grades is the door’s own URL, which names the claimer without the padding.
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

  it('the segment is asked about AS THE FRAMEWORK HANDED IT — a percent in a name is not a second escape (v523)', async () => {
    // v492 wrote this case as a normalisation of a lowercase escape into an uppercase one, which assumed a
    // route receives the RAW path bytes of the URL. It does not: Next decodes a dynamic segment before a
    // route sees it (`base-server.js`'s `prepareDestination`, the file dev and prod share), so bytes
    // wearing an escape can only have arrived DOUBLE-encoded — and decoding them again asks the service
    // about a name nobody sent. The door forwards what it was handed; the service looks up exactly that.
    stubService({ status: 200, json: { ok: true, followerCount: 3, following: false } });
    await unfollow('acct%2fgrace', '?claimer=acct-ada');
    expect(calls).toHaveLength(1);
    expect(nameAsked(calls[0]!.url)).toBe('acct%2fgrace');
  });

  it('a padded segment is asked about as the name the caller MEANT (v523)', async () => {
    // The trim this door already runs on the SEGMENT (`doorName`) is the rule amendment 501 wrote for
    // names read from a query; this keeps it on the record beside the ask, not only in the source.
    stubService({ status: 200, json: { ok: true, followerCount: 3, following: false } });
    await unfollow(' acct-grace ', '?claimer=acct-ada');
    expect(calls).toHaveLength(1);
    expect(nameAsked(calls[0]!.url)).toBe('acct-grace');
  });

  it('a segment that NAMES a broken escape is still a name — the door asks, and nothing throws (v523)', async () => {
    // The bytes `acct%` are what the framework hands a route for the URL `/api/follows/acct%25`. The second
    // decode threw `URIError` out of the handler, and a thrown handler is a 500 with no sentence about a
    // name the caller can see they sent.
    stubService({ status: 200, json: { ok: true, followerCount: 3, following: false } });
    const res = await unfollow('acct%', '?claimer=acct-ada');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(nameAsked(calls[0]!.url)).toBe('acct%');
  });

  it('a segment that is only space is refused before the service is asked (v523)', async () => {
    // The trim came first, so forwarding the padding was how this door ended up asking `/follows/` — the
    // COLLECTION door — about a name that is nothing, and answering whatever that returns.
    stubService({ status: 200, json: { ok: true, followerCount: 3, following: false } });
    const res = await unfollow(' ', '?claimer=acct-ada');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a follow needs the account it points at: this URL names none');
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
