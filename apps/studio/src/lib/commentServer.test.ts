import { describe, expect, it, vi } from 'vitest';

import { readComments, readCommentsWritten, removeCommentOnService, writeComment } from './commentServer';
import { nexusApiBase } from './publishServer';

/**
 * M7 v399 — the server-side half of the COMMENTS reader.
 *
 * The rule this file exists for: **the answer names the window it is FOR.** The comments door pages by
 * rows, and a read that came back without the window it answered would leave the artifact page saying
 * "the 2 newest" about the rows from 20 on — a true sentence about the first window and a false one
 * about the third (v386's correction). The window is forwarded on the way out and echoed on the way
 * back, so two reads in flight cannot be mistaken for each other's answers (v382's rule).
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

describe('commentServer — readComments PAGES the thread (v399)', () => {
  const threadBody = (n: number, visible: number, total: number) =>
    JSON.stringify({
      comments: Array.from({ length: n }, (_unused, i) => ({
        id: `c-${i}`,
        accountId: 'acct-ada',
        projectId: 'pub-1',
        body: `comment ${i}`,
        createdAt: 1_776_000_000_000,
        deleted: false,
      })),
      visible,
      limit: 20,
      offset: 20,
      total,
    });

  it('the ask carries the window as limit and offset rows', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(threadBody(2, 37, 50), { status: 200 });
    });
    const answer = await readComments('pub-1', 20, 20, fetchImpl);
    expect(seen).toContain('projectId=pub-1');
    expect(seen).toContain('limit=20');
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(true);
    expect(answer.visible).toBe(37);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
    expect(answer.total).toBe(50);
  });

  it('a negative offset is clamped to the first window, not refused', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(threadBody(1, 1, 1), { status: 200 });
    });
    const answer = await readComments('pub-1', 20, -5, fetchImpl);
    expect(seen).toContain('offset=0');
    expect(answer.offset).toBe(0);
  });

  it('the ROW count travels beside the visible count — they are different numbers', async () => {
    // A thread of fifty comments of which thirty were taken back has thirty VISIBLE and fifty ROWS.
    // The pager pages by rows, so it needs the second number, and a page that only had the first would
    // stop a reader twenty rows short of the end.
    const fetchImpl = makeFetch(() => new Response(threadBody(2, 30, 50), { status: 200 }));
    const answer = await readComments('pub-1', 20, 0, fetchImpl);
    expect(answer.visible).toBe(30);
    expect(answer.total).toBe(50);
  });

  it('an answer with no row count leaves it absent rather than inventing one', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ comments: [], visible: 0, limit: 20 }), { status: 200 }),
    );
    const answer = await readComments('pub-1', 20, 0, fetchImpl);
    expect(answer.total).toBeUndefined();
    expect(answer.limit).toBe(20);
  });

  it('a refusal still names the window it was asked for', async () => {
    let seen = '';
    const fetchImpl = makeFetch((url) => {
      seen = url;
      return new Response(JSON.stringify({ error: 'comments-unavailable' }), { status: 503 });
    });
    const answer = await readComments('pub-1', 20, 20, fetchImpl);
    expect(seen).toContain('offset=20');
    expect(answer.ok).toBe(false);
    expect(answer.limit).toBe(20);
    expect(answer.offset).toBe(20);
    expect(answer.reason).toContain('503');
  });

  it('a refusal is NOT a thread with no comments', async () => {
    // v286's rule: "no comments" and "the comments could not be read" are different facts, and a page
    // that showed the first when it knew the second would call a busy thread empty.
    const fetchImpl = makeFetch(() => new Response('not json', { status: 200 }));
    const answer = await readComments('pub-1', 20, 0, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toContain('not JSON');
  });
});


/**
 * v437 — the WRITE half of the comments door, and the author's own read.
 *
 * `readComments` is graded above. The two writes and the other-side read — `writeComment`,
 * `removeCommentOnService`, `readCommentsWritten` — were reached only through the lanes that call
 * them, so what a comment carries on its way out and what an answer means on its way back were
 * never asked directly. Two rules here have no counterpart in the likes door and are the reason this
 * is its own increment: a take-back that found nothing is still a SUCCESS (the service answers 200
 * either way and says which), and the comment a write answers with is the first entry of the
 * answer's list rather than a field of its own.
 */
describe('commentServer — the write path (v437)', () => {
  const comment = (id: string, body: string, createdAt = 5) => ({
    id,
    accountId: 'acct-9',
    projectId: 'pub-1',
    body,
    createdAt,
    deleted: false,
  });

  it('a comment is POSTed with the text a person wrote and the claim beside it', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, comments: [comment('c-new', 'hello')] }), { status: 200 });
    });

    const answer = await writeComment(
      'pub-1',
      'hello',
      { accountId: 'acct-9', handle: 'mira', assurance: 'unsigned-local', claimedAt: 99 },
      fetchImpl,
    );

    expect(seenUrl).toBe(`${nexusApiBase()}/comments`);
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({ 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toEqual({
      projectId: 'pub-1',
      body: 'hello',
      claim: { accountId: 'acct-9', handle: 'mira', assurance: 'unsigned-local', claimedAt: 99 },
    });
    // The comment the write answers with is the FIRST entry of the answer's list, not a field of its own.
    expect(answer.ok).toBe(true);
    expect(answer.comment?.id).toBe('c-new');
  });

  it('the text travels intact through JSON, quotes, newlines and markup included', async () => {
    const text = 'line one\nline two "quoted" <&> \u2014 end';
    let sent: unknown;
    const fetchImpl = makeFetch((_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, comments: [comment('c-new', text)] }), { status: 200 });
    });

    await writeComment('pub-1', text, { accountId: 'acct-9' }, fetchImpl);

    expect((sent as { body: string }).body).toBe(text);
  });

  it('an absent handle, assurance or claimedAt is written as null, not dropped', async () => {
    let body: unknown;
    const fetchImpl = makeFetch((_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, comments: [comment('c-new', 'hi')] }), { status: 200 });
    });

    await writeComment('pub-1', 'hi', { accountId: 'acct-9' }, fetchImpl);

    expect(body).toEqual({
      projectId: 'pub-1',
      body: 'hi',
      claim: { accountId: 'acct-9', handle: null, assurance: null, claimedAt: null },
    });
  });

  it('an ok answer carrying no comment leaves the field absent rather than inventing one', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const answer = await writeComment('pub-1', 'hi', { accountId: 'acct-9' }, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.comment).toBeUndefined();
  });

  it('a refused comment carries a reason and no comment', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'comments are closed' }), { status: 200 }),
    );
    const answer = await writeComment('pub-1', 'hi', { accountId: 'acct-9' }, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('comments are closed');
    expect(answer.comment).toBeUndefined();
  });

  it('the error body has no ok field, so the reason is read from message, then the status', async () => {
    const withMessage = makeFetch(() =>
      new Response(JSON.stringify({ error: 'comments-unavailable', message: 'the comments door is closed' }), { status: 503 }),
    );
    expect((await writeComment('pub-1', 'hi', { accountId: 'a' }, withMessage)).reason).toBe('the comments door is closed');

    const bare = makeFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    expect((await writeComment('pub-1', 'hi', { accountId: 'a' }, bare)).reason).toBe('the comments answered HTTP 500');
  });

  it('an answer that is not JSON is a refusal, not a crash', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    const answer = await writeComment('pub-1', 'hi', { accountId: 'acct-9' }, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the comments answered HTTP 502 with something that is not JSON');
  });

  it('a comment that never arrived says unreachable; a slow one says it was late', async () => {
    const down = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    expect((await writeComment('pub-1', 'hi', { accountId: 'a' }, down)).reason).toContain('nexus-api unreachable');

    const late = new Error('the budget ran out');
    late.name = 'TimeoutError';
    const slow = makeFetch(() => {
      throw late;
    });
    const answer = await writeComment('pub-1', 'hi', { accountId: 'a' }, slow);
    expect(answer.reason).toContain('did not answer within 15 seconds');
    expect(answer.reason).not.toContain('unreachable');
  });
});

describe('commentServer — taking a comment back (v437)', () => {
  it('is a DELETE naming the comment and the claimer, and only those', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(JSON.stringify({ ok: true, removed: true }), { status: 200 });
    });

    const answer = await removeCommentOnService('c-1', 'acct-9', fetchImpl);

    expect(seenUrl).toBe(`${nexusApiBase()}/comments/c-1?claimer=acct-9`);
    expect(seenInit?.method).toBe('DELETE');
    expect(seenInit?.headers).toEqual({ accept: 'application/json' });
    // The take-back names WHICH comment and WHO, and nothing else: no body rides along.
    expect(seenInit?.body).toBeUndefined();
    expect(answer).toEqual({ ok: true, removed: true });
  });

  it('a comment id that needs encoding is encoded in the path', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ ok: true, removed: false }), { status: 200 });
    });

    await removeCommentOnService('c 1/../x', 'acct-9', fetchImpl);

    expect(seenUrl).toBe(`${nexusApiBase()}/comments/${encodeURIComponent('c 1/../x')}?claimer=acct-9`);
  });

  it('a take-back that found nothing is still a SUCCESS — the service answers 200 either way', async () => {
    // The marquee rule of this half. "Already gone" and "taken back now" are two different facts and
    // the service says which; a caller that read removed:false as a failure would tell an author
    // their take-back failed when the comment had been gone all along.
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true, removed: false }), { status: 200 }));
    const answer = await removeCommentOnService('c-1', 'acct-9', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.removed).toBe(false);
  });

  it('removed is read as the boolean the service said, not as truthiness', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true, removed: 'yes' }), { status: 200 }));
    const answer = await removeCommentOnService('c-1', 'acct-9', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.removed).toBe(false);
  });

  it('a refusal carries a reason and no removed flag', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'not the author' }), { status: 200 }),
    );
    const answer = await removeCommentOnService('c-1', 'acct-9', fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('not the author');
    expect(answer.removed).toBeUndefined();
  });

  it('a non-JSON or unreachable take-back is a refusal that says which', async () => {
    const html = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    expect((await removeCommentOnService('c-1', 'a', html)).reason).toBe(
      "the service's comments door answered HTTP 502 with something that is not JSON",
    );

    const down = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    expect((await removeCommentOnService('c-1', 'a', down)).reason).toContain('nexus-api unreachable');
  });
});

describe('commentServer — the comments one account WROTE (v437)', () => {
  it('asks by author and limit, with no window — it is the other side of the relation, not a page', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ ok: true, comments: [], visible: 4 }), { status: 200 });
    });

    const answer = await readCommentsWritten('acct-9', 20, fetchImpl);

    expect(seenUrl).toBe(`${nexusApiBase()}/comments?author=acct-9&limit=20`);
    expect(seenUrl).not.toContain('offset');
    expect(answer).toEqual({ ok: true, comments: [], visible: 4 });
  });

  it('an author id that needs encoding is encoded', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ ok: true, comments: [], visible: 0 }), { status: 200 });
    });

    await readCommentsWritten('acct 9/../x', 20, fetchImpl);

    expect(seenUrl).toBe(`${nexusApiBase()}/comments?author=${encodeURIComponent('acct 9/../x')}&limit=20`);
  });

  it('an answer with no visible count answers 0 rather than leaving the field absent', async () => {
    // Pinned as MEASURED, and as a divergence: `readComments` above leaves `visible` absent when the
    // service does not say, while this reader answers 0. Both refuse to invent a count they were not
    // given; they say the silence differently, and a caller must not read one shape for the other.
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true, comments: [] }), { status: 200 }));
    const answer = await readCommentsWritten('acct-9', 20, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.visible).toBe(0);
  });

  it('a refusal is not an author who wrote nothing', async () => {
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ message: 'the comments door is closed' }), { status: 503 }),
    );
    const answer = await readCommentsWritten('acct-9', 20, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.comments).toEqual([]);
    expect(answer.visible).toBe(0);
    expect(answer.reason).toBe('the comments door is closed');
  });

  it('a non-JSON answer and an unreachable service both name themselves', async () => {
    const html = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    expect((await readCommentsWritten('acct-9', 20, html)).reason).toBe(
      "the service's comments door answered HTTP 502 with something that is not JSON",
    );

    const down = makeFetch(() => {
      throw new Error('connect ECONNREFUSED');
    });
    expect((await readCommentsWritten('acct-9', 20, down)).reason).toContain('nexus-api unreachable');
  });
});
