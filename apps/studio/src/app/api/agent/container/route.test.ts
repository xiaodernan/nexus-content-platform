import { describe, expect, it } from 'vitest';

import { POST } from './route';

/**
 * M7 v498 (ADR 0016 amendment 491) — the container DOOR, graded directly.
 *
 * `containerServer.test.ts` has always graded the lane with an INJECTED spawn: the policy, the budget,
 * the answer. This file grades the hop above it — the route — whose decisions belong to nothing else:
 * which bodies are refused before docker is asked at all, and how the lane's own answer becomes an
 * HTTP status.
 *
 * Nothing here spawns a container. A body that is not JSON is refused by the route, and a body whose
 * argv is not a non-empty array of non-empty strings is refused by the lane BEFORE the host is built —
 * so both are graded without a single spawn.
 */

const post = (body: unknown, raw?: string) =>
  POST(
    new Request('http://studio.test/api/agent/container', {
      method: 'POST',
      ...(raw === undefined ? {} : { body: raw }),
      ...(raw === undefined ? { body: JSON.stringify(body) } : {}),
    }),
  );

describe('container route — the POST ask (v498)', () => {
  it('a body that is not JSON is refused by name — before docker is asked', async () => {
    const res = await post(undefined, 'not json at all');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, reason: 'body must be JSON' });
  });

  it('a body with no argv is refused by name — an exec with nothing to run is not an exec', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('argv must be a non-empty array of non-empty strings (no shell strings)');
  });

  it('an argv that is not an array is the same refusal', async () => {
    const res = await post({ argv: 'node --version' });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('argv must be a non-empty array of non-empty strings (no shell strings)');
  });

  it('an EMPTY argv is the same refusal', async () => {
    const res = await post({ argv: [] });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('argv must be a non-empty array of non-empty strings (no shell strings)');
  });

  it('an argv holding an empty string is the same refusal — a shell string is never a token', async () => {
    const res = await post({ argv: ['node', ''] });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('argv must be a non-empty array of non-empty strings (no shell strings)');
  });

  it('an argv holding a non-string is the same refusal', async () => {
    const res = await post({ argv: ['node', 17] });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe('argv must be a non-empty array of non-empty strings (no shell strings)');
  });
});
