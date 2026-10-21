import { describe, expect, it, vi } from 'vitest';

import { removeComment } from './commentLane';

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
