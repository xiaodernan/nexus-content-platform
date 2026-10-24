import { describe, expect, it } from 'vitest';

import { POST } from './route';

/**
 * M7 v498 (ADR 0016 amendment 491) — the build-arc DOOR, graded directly.
 *
 * `buildServer.test.ts` has always graded the arc with an INJECTED spawn: the planner, the walk, the
 * receipts. This file grades the hop above it — the route — whose decisions belong to nothing else:
 * which bodies are refused before the arc is even planned, and how the arc's own honest answer becomes
 * an HTTP status.
 *
 * Nothing here spawns a container. A goal that is not a string is refused by the route before the
 * planner runs, and a goal no template matches is answered by the planner as 'unplanned' — an honest
 * answer, not a walk — so both are graded without a single spawn.
 */

const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/agent/build-arc', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe('build-arc route — the POST ask (v498)', () => {
  it('a goal that is not a string is refused by name — a goal, never argv', async () => {
    const res = await post({ goal: 42 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'goal must be a string (a goal, never argv)' });
  });

  it('a goal that is an OBJECT is the same refusal — the body may name a goal, never a step', async () => {
    const res = await post({ goal: { argv: ['node', '--version'] } });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('goal must be a string (a goal, never argv)');
  });

  it('a goal no template matches is an HONEST ANSWER — a 200 that says unplanned, not a 400 and not a walk', async () => {
    const res = await post({ goal: 'publish the artifact to the whole world' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toBe('unplanned');
    expect(body.goal).toBe('publish the artifact to the whole world');
    expect(body.reason).toContain('no step template matches the goal');
    expect(body.reason).toContain('the planner invents nothing');
    expect(body.steps).toEqual([]);
    expect(body.receipts).toEqual([]);
  });
});
