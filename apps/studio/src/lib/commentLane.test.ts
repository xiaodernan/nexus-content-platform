import { describe, expect, it, vi } from 'vitest';

import { postComment, readMyComments, removeComment } from './commentLane';

/**
 * M7 v321 — the browser half of the COMMENTS lane, and the take-back it gained.
 *
 * The rule this file exists for: **the answer says WHICH of the two things happened.** The service
 * answers 200 whether a comment was taken back or was already gone, and it says which in `removed`. A
 * lane that dropped that flag would make the caller say "took it back" about a comment nobody took back.
 */
function makeFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) => handler(url, init)) as unknown as typeof fetch;
}

describe('commentLane — removeComment (client half)', () => {
  it('asks the Studio\u2019s own door, with the comment id and the claimer', async () => {
    const fetchImpl = makeFetch((url, init) => {
      expect(url).toBe('/api/comments/c-1?claimer=acct-ada');
      expect(init?.method).toBe('DELETE');
      return new Response(JSON.stringify({ ok: true, commentId: 'c-1', removed: true }), { status: 200 });
    });
    const answer = await removeComment('c-1', 'acct-ada', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.removed).toBe(true);
  });

  it('a comment that was ALREADY gone says so, and is not a failure', async () => {
    const answer = await removeComment(
      'c-1',
      'acct-ada',
      makeFetch(() => new Response(JSON.stringify({ ok: true, commentId: 'c-1', removed: false }), { status: 200 })),
    );
    expect(answer.ok).toBe(true);
    expect(answer.removed).toBe(false);
  });

  it('a REFUSAL keeps the reason, not a status code', async () => {
    const answer = await removeComment(
      'c-1',
      'acct-bob',
      makeFetch(() =>
        new Response(
          JSON.stringify({ ok: false, reason: 'this comment was written by another account' }),
          { status: 502 },
        ),
      ),
    );
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('this comment was written by another account');
  });
});


/**
 * v442 — the WRITE and the author's own read in the comments lane.
 *
 * `removeComment` is graded above. `postComment` and `readMyComments` were reached only through the
 * comment bar, and the rule that makes the write interesting is the one that separates it from the
 * server-side door (v437): there the comment a write answers with is the FIRST entry of a list, while
 * HERE it is a field of its own. A lane that read one shape against the other door would answer a
 * posted comment with nothing.
 */
describe('commentLane — postComment (v442)', () => {
  const CLAIM = { accountId: 'acct-ada', handle: 'ada', assurance: 'unsigned-local', claimedAt: 1_700_000_000_000 };

  it('writes a comment at the Studio’s own door with the text and the claim', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const fetchImpl = makeFetch((url, init) => {
      seenUrl = url;
      seenInit = init;
      return new Response(
        JSON.stringify({ ok: true, comment: { id: 'c-new', body: 'hello', accountId: 'acct-ada', createdAt: 5 } }),
        { status: 200 },
      );
    });

    const answer = await postComment('pub-1', 'hello', CLAIM, fetchImpl);

    expect(seenUrl).toBe('/api/comments');
    expect(seenInit?.method).toBe('POST');
    expect(seenInit?.headers).toEqual({ 'content-type': 'application/json', accept: 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toEqual({ projectId: 'pub-1', body: 'hello', claim: CLAIM });
    expect(answer.ok).toBe(true);
    expect(answer.comment?.id).toBe('c-new');
  });

  it('the comment comes back as its OWN field — not the first of a list (the server door differs)', async () => {
    // The marquee pin of this increment. The server-side door (v437) answers a write with a LIST and
    // the lane reads comments[0]; the Studio's own door answers with a `comment` field. A lane that
    // looked for a list here would answer a posted comment with nothing at all.
    const fetchImpl = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, comment: { id: 'c-new', body: 'hello', accountId: 'acct-ada', createdAt: 5 } }), { status: 200 }),
    );
    const answer = await postComment('pub-1', 'hello', CLAIM, fetchImpl);
    expect(answer.comment).toEqual({ id: 'c-new', body: 'hello', accountId: 'acct-ada', createdAt: 5 });

    const listing = makeFetch(() =>
      new Response(JSON.stringify({ ok: true, comments: [{ id: 'c-other', body: 'hello', accountId: 'acct-ada', createdAt: 5 }] }), { status: 200 }),
    );
    // A listing shape reaches this lane as no comment at all — the divergence, pinned as measured.
    const fromListing = await postComment('pub-1', 'hello', CLAIM, listing);
    expect(fromListing.ok).toBe(true);
    expect(fromListing.comment).toBeUndefined();
  });

  it('the text travels intact through JSON, quotes and newlines included', async () => {
    const text = 'line one\nline two "quoted" <&> — end';
    let sent: unknown;
    const fetchImpl = makeFetch((_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, comment: { id: 'c-new', body: text, accountId: 'acct-ada', createdAt: 5 } }), { status: 200 });
    });

    await postComment('pub-1', text, CLAIM, fetchImpl);

    expect((sent as { body: string }).body).toBe(text);
  });

  it('an ok answer carrying no comment leaves the field absent rather than inventing one', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const answer = await postComment('pub-1', 'hello', CLAIM, fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.comment).toBeUndefined();
  });

  it('a refused comment carries a reason and no comment', async () => {
    const withReason = makeFetch(() =>
      new Response(JSON.stringify({ ok: false, reason: 'comments are closed' }), { status: 200 }),
    );
    const refused = await postComment('pub-1', 'hello', CLAIM, withReason);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe('comments are closed');
    expect(refused.comment).toBeUndefined();

    const withMessage = makeFetch(() =>
      new Response(JSON.stringify({ error: 'comments-unavailable', message: 'the comments door is closed' }), { status: 503 }),
    );
    expect((await postComment('pub-1', 'hello', CLAIM, withMessage)).reason).toBe('the comments door is closed');

    const bare = makeFetch(() => new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    expect((await postComment('pub-1', 'hello', CLAIM, bare)).reason).toBe('the comments answered HTTP 500');
  });

  it('an answer that is not JSON is a refusal, not a crash', async () => {
    const fetchImpl = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    const answer = await postComment('pub-1', 'hello', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('the comments answered HTTP 502 with something that is not JSON');
  });

  it('a comment that never arrived answers with the raw error, not a remote address', async () => {
    const fetchImpl = makeFetch(() => {
      throw new Error('network down');
    });
    const answer = await postComment('pub-1', 'hello', CLAIM, fetchImpl);
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('network down');
    expect(answer.reason).not.toContain('unreachable');
  });

  it('a write carries the 45-second budget (v294), pinned on AbortSignal.timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      const fetchImpl = makeFetch(() =>
        new Response(JSON.stringify({ ok: true, comment: { id: 'c-new', body: 'hello', accountId: 'acct-ada', createdAt: 5 } }), { status: 200 }),
      );
      await postComment('pub-1', 'hello', CLAIM, fetchImpl);
      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});

describe('commentLane — readMyComments (v442)', () => {
  it('asks by author, with no window — it is the other side of the relation, not a page', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(
        JSON.stringify({ ok: true, comments: [{ id: 'c-1', body: 'hello', createdAt: 5, deleted: false, projectId: 'pub-1' }] }),
        { status: 200 },
      );
    });

    const answer = await readMyComments('acct-ada', fetchImpl);

    expect(seenUrl).toBe('/api/comments?author=acct-ada');
    expect(seenUrl).not.toContain('offset');
    expect(answer.ok).toBe(true);
    expect(answer.comments).toHaveLength(1);
    expect(answer.comments[0]?.projectId).toBe('pub-1');
  });

  it('an author id that needs encoding is encoded', async () => {
    let seenUrl = '';
    const fetchImpl = makeFetch((url) => {
      seenUrl = url;
      return new Response(JSON.stringify({ ok: true, comments: [] }), { status: 200 });
    });

    await readMyComments('acct ada/../x', fetchImpl);

    expect(seenUrl).toBe(`/api/comments?author=${encodeURIComponent('acct ada/../x')}`);
  });

  it('an ok answer with no comments array answers an empty list', async () => {
    const fetchImpl = makeFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const answer = await readMyComments('acct-ada', fetchImpl);
    expect(answer.ok).toBe(true);
    expect(answer.comments).toEqual([]);
  });

  it('a refusal is NOT an author who wrote nothing', async () => {
    const withMessage = makeFetch(() =>
      new Response(JSON.stringify({ message: 'the comments door is closed' }), { status: 503 }),
    );
    const answer = await readMyComments('acct-ada', withMessage);
    expect(answer.ok).toBe(false);
    expect(answer.comments).toEqual([]);
    expect(answer.reason).toBe('the comments door is closed');
  });

  it('a non-JSON answer and a thrown fetch both name themselves', async () => {
    const html = makeFetch(() => new Response('<html>gateway', { status: 502 }));
    expect((await readMyComments('acct-ada', html)).reason).toBe('the comments answered HTTP 502 with something that is not JSON');

    const down = makeFetch(() => {
      throw new Error('network down');
    });
    expect((await readMyComments('acct-ada', down)).reason).toBe('network down');
  });
});
