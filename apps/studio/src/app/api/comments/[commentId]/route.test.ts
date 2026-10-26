import { afterEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from './route';

/**
 * M7 v497 (ADR 0016 amendment 490) — the comments take-back DOOR, graded directly.
 *
 * `commentServer.test.ts` has always graded the lib: how a call to the service composes an address,
 * waits, and reads an answer back. This file grades the hop above it — a DYNAMIC SEGMENT, because a
 * route that reads a path parameter has to BE one (v321) — whose decisions belong to nothing else:
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
let answer: { status: number; json?: unknown } = { status: 200, json: { ok: true, removed: true } };

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

const remove = (commentId: string, search: string) =>
  DELETE(new Request(`http://studio.test/api/comments/${commentId}${search}`), {
    params: Promise.resolve({ commentId }),
  });

/**
 * The name the door asked the service to look up — the segment of the address the lib composed, decoded
 * the way the service decodes it. A byte needle on the URL cannot tell `c%2F1` (the name `c/1`) from
 * `c%252F1` (the name `c%2F1`); the parser can.
 */
const nameAsked = (url: string): string => decodeURIComponent(new URL(url).pathname.split('/')[2]!);

describe('comments [commentId] route — the DELETE ask (v497)', () => {
  it('a missing claimer is refused BEFORE the service is asked — a comment with no author has nobody to take it back', async () => {
    stubService({ status: 200, json: { ok: true, removed: true } });
    const res = await remove('c-1', '');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      reason: 'a comment needs an account to take it back: a comment with no author has nobody to take it back and nobody to answer to',
    });
    expect(calls).toHaveLength(0);
  });

  it('a BLANK claimer is the same refusal — whitespace is not an account', async () => {
    stubService({ status: 200, json: { ok: true, removed: true } });
    const res = await remove('c-1', '?claimer=%20%20');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a comment needs an account to take it back: a comment with no author has nobody to take it back and nobody to answer to');
    expect(calls).toHaveLength(0);
  });

  it('the claimer is TRIMMED before the ask — the service is asked for the account, not the padding', async () => {
    stubService({ status: 200, json: { ok: true, removed: true } });
    await remove('c-1', '?claimer=%20acct-ada%20');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('DELETE');
    expect(calls[0]!.url).toContain('claimer=acct-ada');
    expect(calls[0]!.url).not.toContain('%20acct-ada');
  });

  it('the segment is asked about AS THE FRAMEWORK HANDED IT — a percent in a name is not a second escape (v523)', async () => {
    // v497 wrote this case as a normalisation of a lowercase escape into an uppercase one, which assumed a
    // route receives the RAW path bytes of the URL. It does not: Next decodes a dynamic segment before a
    // route sees it (`base-server.js`'s `prepareDestination`, the file dev and prod share), so bytes
    // wearing an escape can only have arrived DOUBLE-encoded — and decoding them again asks the service
    // about a comment that was never filed.
    stubService({ status: 200, json: { ok: true, removed: true } });
    await remove('c%2f1', '?claimer=acct-ada');
    expect(calls).toHaveLength(1);
    expect(nameAsked(calls[0]!.url)).toBe('c%2f1');
  });

  it('a padded segment is asked about as the name the caller MEANT (v523)', async () => {
    // This door read the claimer through a hand-copied `claimer.trim()` while the likes and follows doors
    // had moved to `doorName`; the copy is the same rule, and this is what makes it say so.
    stubService({ status: 200, json: { ok: true, removed: true } });
    await remove(' c-1 ', '?claimer=acct-ada');
    expect(calls).toHaveLength(1);
    expect(nameAsked(calls[0]!.url)).toBe('c-1');
  });

  it('a segment that NAMES a broken escape is still a name — the door asks, and nothing throws (v523)', async () => {
    // The bytes `c%` are what the framework hands a route for the URL `/api/comments/c%25`. The second
    // decode threw `URIError` out of the handler, and a thrown handler is a 500 with no sentence about a
    // name the caller can see they sent.
    stubService({ status: 200, json: { ok: true, removed: true } });
    const res = await remove('c%', '?claimer=acct-ada');
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(nameAsked(calls[0]!.url)).toBe('c%');
  });

  it('a segment that is only space is refused before the service is asked (v523)', async () => {
    // The trim came first, so forwarding it untrimmed was how this door ended up asking `/comments/` — the
    // COLLECTION door — about a name that is nothing, and answering whatever that returns.
    stubService({ status: 200, json: { ok: true, removed: true } });
    const res = await remove(' ', '?claimer=acct-ada');
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('a take-back needs the comment it points at: this URL names none');
    expect(calls).toHaveLength(0);
  });

  it('a removal that MOVED the comment is a 200 saying so', async () => {
    stubService({ status: 200, json: { ok: true, removed: true } });
    const res = await remove('c-1', '?claimer=acct-ada');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removed: true });
  });

  it('a comment that was ALREADY removed is a 200 too — it is not an error, and the route does not make it one', async () => {
    stubService({ status: 200, json: { ok: true, removed: false } });
    const res = await remove('c-1', '?claimer=acct-ada');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removed: false });
  });

  it('the service\u2019s refusal is a 502 carrying the service\u2019s OWN words — somebody else\u2019s comment is refused by name', async () => {
    stubService({ status: 403, json: { error: 'forbidden', message: 'that comment is not yours to remove' } });
    const res = await remove('c-1', '?claimer=acct-eve');
    expect(res.status).toBe(502);
    expect((await res.json()).reason).toBe('that comment is not yours to remove');
  });
});
