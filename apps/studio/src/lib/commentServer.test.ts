import { describe, expect, it, vi } from 'vitest';

import { readComments } from './commentServer';

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
