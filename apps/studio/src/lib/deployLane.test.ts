import { afterEach, describe, expect, it } from 'vitest';

import { probeDeployLane, requestDeployArcRun } from './deployLane';

/**
 * M7 v417 — the CLIENT half of the dock's deploy face, graded directly.
 *
 * The module is a fetch adapter and nothing more (M6 v177): it imports nothing from the runtime or the
 * spawn-capable package, and the browser bundle holds only locally-stated types. Two rules are its whole
 * character. **Unavailability is a NORMAL answer, not an error** — a probe that cannot reach the studio
 * server answers a named unavailability with every field at its empty default, and never throws into the
 * panel. And **the browser names a GOAL — never argv, never a fact**: the POST carries one field, and the
 * server plans and walks the arc. The module calls the global `fetch` directly (it predates the injected-
 * fetch lanes), so this file stubs the global and restores it — the adapter's seam is the global itself.
 */
const realFetch = globalThis.fetch;

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const seen: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input);
    seen.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return seen;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('probeDeployLane — the availability read (v417)', () => {
  it('a 200 answer passes through untouched — the route owns the shape and the lane re-maps nothing', async () => {
    const body = {
      available: true,
      serverVersion: '25',
      reason: '',
      arcId: 'arc-1',
      goal: 'ship it',
      engine: 'java',
      steps: [['compile']],
      recordsPath: '/tmp/records.jsonl',
      recordCount: 3,
    };
    const seen = stubFetch(() => new Response(JSON.stringify(body), { status: 200 }));
    const probe = await probeDeployLane();
    expect(probe).toEqual(body);
    expect(seen[0]!.init?.cache).toBe('no-store');
  });

  it('a non-ok answer is a NAMED unavailability — every field at its empty default', async () => {
    stubFetch(() => new Response('nope', { status: 503 }));
    const probe = await probeDeployLane();
    expect(probe).toEqual({
      available: false,
      serverVersion: '',
      reason: 'probe route answered 503',
      arcId: '',
      goal: '',
      engine: '',
      steps: [],
      recordsPath: '',
      recordCount: 0,
    });
  });

  it('a thrown fetch is caught — unavailability is a normal answer, not an error', async () => {
    stubFetch(() => {
      throw new Error('connection refused');
    });
    const probe = await probeDeployLane();
    expect(probe.available).toBe(false);
    expect(probe.reason).toBe('studio server unreachable: connection refused');
    expect(probe.recordCount).toBe(0);
  });
});

describe('requestDeployArcRun — the goal goes up, the stdout comes back (v417)', () => {
  it('the POST names the goal as one JSON field', async () => {
    const seen = stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await requestDeployArcRun('ship the dock');
    expect(seen[0]!.url).toBe('/api/agent/deploy');
    expect(seen[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({ goal: 'ship the dock' });
  });

  it('NO goal means no body and no content-type — the ask is the route itself', async () => {
    const seen = stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await requestDeployArcRun();
    expect(seen[0]!.init?.body).toBeUndefined();
    expect(seen[0]!.init?.headers).toBeUndefined();
  });

  it('an EMPTY-string goal still travels — the server refuses by name rather than the client inventing "no goal"', async () => {
    const seen = stubFetch(() => new Response(JSON.stringify({ ok: false, reason: 'a goal is required' }), { status: 200 }));
    const answer = await requestDeployArcRun('');
    expect(JSON.parse(String(seen[0]!.init?.body))).toEqual({ goal: '' });
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('a goal is required');
  });

  it('a JSON object answer passes through as the lane answer', async () => {
    const body = { ok: true, status: 'green', facts: [{ stepId: 'compile', stdout: 'BUILD SUCCESS' }] };
    stubFetch(() => new Response(JSON.stringify(body), { status: 200 }));
    expect(await requestDeployArcRun('ship it')).toEqual(body);
  });

  it('an HTTP error whose body still speaks is passed through — the route’s own verdict is the answer', async () => {
    const body = { ok: false, reason: 'the arc stopped at build', stoppedAt: 'build' };
    stubFetch(() => new Response(JSON.stringify(body), { status: 500 }));
    expect(await requestDeployArcRun('ship it')).toEqual(body);
  });

  it('a non-JSON body is a named refusal', async () => {
    stubFetch(() => new Response('<html>gateway error</html>', { status: 502 }));
    const answer = await requestDeployArcRun('ship it');
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('deploy route answered 502 with a non-JSON body');
  });

  it('a thrown fetch is caught and named', async () => {
    stubFetch(() => {
      throw new Error('connection refused');
    });
    const answer = await requestDeployArcRun('ship it');
    expect(answer.ok).toBe(false);
    expect(answer.reason).toBe('studio server unreachable: connection refused');
  });
});
