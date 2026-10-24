import { describe, expect, it } from 'vitest';

import { POST } from './route';

/**
 * M7 v498 (ADR 0016 amendment 491) — the deploy DOOR, graded directly.
 *
 * `deployServer.test.ts` has always graded the arc with an INJECTED spawn and an INJECTED fs: the
 * walk, the measured facts, the records sink. This file grades the hop above it — the route — whose
 * decisions belong to nothing else: which bodies are refused before anything is walked or written, and
 * how the arc's own honest answer becomes an HTTP status.
 *
 * Nothing here spawns a container or writes a record. A goal that is not a string is refused by the
 * route, and a goal no template matches is answered as 'unplanned' — nothing deployed — so both are
 * graded without a single spawn or a single byte.
 */

const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/agent/deploy', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe('deploy route — the POST ask (v498)', () => {
  it('a goal that is not a string is refused by name — a goal, never argv, never a fact', async () => {
    const res = await post({ goal: 42 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'goal must be a string (a goal, never argv)' });
  });

  it('a goal that is an ARRAY is the same refusal — the body may name a goal, never a step', async () => {
    const res = await post({ goal: ['deploy', 'the', 'record'] });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('goal must be a string (a goal, never argv)');
  });

  it('a goal no template matches deploys NOTHING — a 200 that says unplanned, not a 400 and not a walk', async () => {
    const res = await post({ goal: 'publish the artifact to the whole world' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('unplanned');
    expect(body.goal).toBe('publish the artifact to the whole world');
    expect(body.detail).toContain('nothing deployed');
    expect(body.facts).toEqual([]);
    expect(body.unmeasured).toEqual([]);
    expect(body.deployReceipts).toEqual([]);
  });
});
