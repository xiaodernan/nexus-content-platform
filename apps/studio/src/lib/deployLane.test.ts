import { afterEach, describe, expect, it, vi } from 'vitest';

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


describe('deployLane — the Studio-route lane finally carries a budget (v484)', () => {
  // This lane calls the global fetch directly — it predates the injected-fetch lanes, and the signal
  // sweep that counts fetchImpl( call sites never saw it, so a route that never answered hung the panel
  // forever with no reason to show. v484 gives it the budget every other door has had since v294 — and
  // the same lateness sentence the publish lane carries.

  const OK_BODY = { available: true, serverVersion: '25', reason: '', arcId: 'arc-1', goal: 'ship it', engine: 'java', steps: [['compile']], recordsPath: '/tmp/records.jsonl', recordCount: 3 };
  const late = () => {
    const error = new Error('The operation was aborted due to timeout');
    error.name = 'TimeoutError';
    return error;
  };

  it('every call carries an active signal — the route can no longer hang the panel forever', async () => {
    const seen: (RequestInit | undefined)[] = [];
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(init);
      return new Response(JSON.stringify(OK_BODY), { status: 200 });
    }) as typeof fetch;
    await probeDeployLane();
    await requestDeployArcRun();
    for (const init of seen) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect((init?.signal as AbortSignal).aborted).toBe(false);
    }
    expect(seen).toHaveLength(2);
    expect(seen[0]?.signal).not.toBe(seen[1]?.signal);
  });


  it('the budget is the pinned 45 seconds — spy-witnessed on AbortSignal.timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(OK_BODY), { status: 200 })) as typeof fetch;
      await probeDeployLane();
      await requestDeployArcRun();
      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
      expect(timeoutSpy).toHaveBeenCalledTimes(2);
    } finally {
      timeoutSpy.mockRestore();
    }
  });


  it('a fired budget says the Studio was LATE — not "unreachable", and not the platform’s string', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw late();
    }) as typeof fetch;
    const a0 = await probeDeployLane();
    const a1 = await requestDeployArcRun();
    expect(a0.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a1.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a0.reason).not.toContain('aborted');
  });


  it('a Studio that is GONE keeps the unreachable sentence with its own message', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('connection refused');
    }) as typeof fetch;
    const probe = await probeDeployLane();
    expect(probe.reason).toBe('studio server unreachable: connection refused');
    expect(probe.reason).not.toContain('45 seconds');
  });
});

describe('deployLane — the probe answers a 200 it cannot read HONESTLY (v485)', () => {
  // The probe parsed its 200 body with a bare cast: a body that could not be read fell into the
  // catch and was answered "studio server unreachable" — a false sentence about a server that had
  // just answered. v485 parses it in its own try and names the route and the status instead, the
  // sentence every other door of this file already uses.

  it('a 200 with an unreadable body names the route and the status — not "unreachable"', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>nope</html>', { status: 200 })) as typeof fetch;
    const p = await probeDeployLane();
    expect(p.available).toBe(false);
    expect(p.reason).toBe('deploy route answered 200 with a non-JSON body');
    expect(p.reason).not.toContain('unreachable');
    expect(p.recordCount).toBe(0);
  });
});
