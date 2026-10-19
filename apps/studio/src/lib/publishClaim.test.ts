import { describe, expect, it } from 'vitest';
import { claimOf, publishProject, unpublish, type ClaimSource } from './publishLane';
import type { AccountRecord } from './accounts';

/**
 * M7 v263 — the account you set is the claim you publish.
 *
 * These cases grade the WIRE, not the intention: what the lane actually puts in the request body is the only
 * thing the service can act on, and the defect this increment closed was precisely that the account the
 * account panel set never reached the wire at all.
 */

const ACCOUNT: AccountRecord = {
  id: 'acct-ada-000000000000000000',
  handle: 'ada',
  displayName: 'Ada',
  createdAt: 1_700_000_000_000,
  assurance: 'unsigned-local',
};

function source(account: AccountRecord | null, now = 1_700_000_500_000): ClaimSource {
  return { current: () => account, now: () => now };
}

/** The ONE body the lane sent. Throws when there was none, rather than asserting a non-null index. */
function firstBody(bodies: Record<string, unknown>[]): Record<string, unknown> {
  const body = bodies[0];
  if (!body) throw new Error('the lane sent no request body at all');
  return body;
}

/** A fetch that records the body it was given and answers 200. */
function recordingFetch(): { fetchImpl: typeof fetch; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = [];
  const fetchImpl = (async (_url: string, init?: { body?: string }) => {
    bodies.push(JSON.parse(init?.body ?? '{}') as Record<string, unknown>);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, bodies };
}

describe('publishLane — the device claim (v263)', () => {
  it('attaches THIS device\'s claim when the caller names no owner', async () => {
    const { fetchImpl, bodies } = recordingFetch();
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      await publishProject('doc-1', 'Harbour', { pages: [] }, undefined, source(ACCOUNT));
    } finally {
      globalThis.fetch = original;
    }
    expect(firstBody(bodies).owner).toEqual({
      kind: 'owner-claim',
      accountId: ACCOUNT.id,
      handle: ACCOUNT.handle,
      assurance: 'unsigned-local',
      claimedAt: 1_700_000_500_000,
    });
  });

  it('sends NO claim when no account is set — the pre-v242 rule, and a real answer', async () => {
    const { fetchImpl, bodies } = recordingFetch();
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      await publishProject('doc-1', 'Harbour', { pages: [] }, undefined, source(null));
    } finally {
      globalThis.fetch = original;
    }
    expect(firstBody(bodies).owner).toBeUndefined();
    expect(firstBody(bodies).action).toBe('publish');
  });

  it('an explicitly named owner WINS over the device claim', async () => {
    const { fetchImpl, bodies } = recordingFetch();
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      await publishProject(
        'doc-1',
        'Harbour',
        { pages: [] },
        { kind: 'owner-claim', accountId: 'acct-grace', handle: 'grace', assurance: 'unsigned-local', claimedAt: 1 },
        source(ACCOUNT),
      );
    } finally {
      globalThis.fetch = original;
    }
    expect(firstBody(bodies).owner).toMatchObject({ accountId: 'acct-grace', handle: 'grace' });
  });

  it('the take-down carries THIS device\'s account id as the claimer', async () => {
    const { fetchImpl, bodies } = recordingFetch();
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      await unpublish('doc-1', undefined, source(ACCOUNT));
    } finally {
      globalThis.fetch = original;
    }
    expect(firstBody(bodies).claimer).toBe(ACCOUNT.id);
    expect(firstBody(bodies).action).toBe('unpublish');
  });

  it('a take-down with no account sends NO claimer', async () => {
    const { fetchImpl, bodies } = recordingFetch();
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      await unpublish('doc-1', undefined, source(null));
    } finally {
      globalThis.fetch = original;
    }
    expect(firstBody(bodies).claimer).toBeUndefined();
  });

  it('an explicitly named claimer WINS over the device account', async () => {
    const { fetchImpl, bodies } = recordingFetch();
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      await unpublish('doc-1', 'acct-grace', source(ACCOUNT));
    } finally {
      globalThis.fetch = original;
    }
    expect(firstBody(bodies).claimer).toBe('acct-grace');
  });

  it('claimOf answers the whole claim, in the client\'s own unit, and null with no account', () => {
    expect(claimOf(source(ACCOUNT))).toEqual({
      kind: 'owner-claim',
      accountId: ACCOUNT.id,
      handle: ACCOUNT.handle,
      assurance: 'unsigned-local',
      claimedAt: 1_700_000_500_000,
    });
    expect(claimOf(source(null))).toBeNull();
  });
});
