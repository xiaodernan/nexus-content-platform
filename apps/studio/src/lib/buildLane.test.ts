import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeBuildLane, requestBuildArcRun } from './buildLane';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('buildLane probe (v174)', () => {
  it('passes the route answer through', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ available: true, serverVersion: '29.8.2', reason: '', arcId: 'studio-build-arc', goal: 'g', engine: 'container:node:22-alpine', steps: [['node', '--version']] }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const p = await probeBuildLane();
    expect(p.available).toBe(true);
    expect(p.arcId).toBe('studio-build-arc');
    expect(p.engine).toBe('container:node:22-alpine');
    expect(p.steps).toEqual([['node', '--version']]);
  });

  it('answers a non-200 route with an honest unavailable', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof fetch;
    const p = await probeBuildLane();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('probe route answered 500');
  });

  it('answers an unreachable server with an honest unavailable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const p = await probeBuildLane();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('studio server unreachable');
  });
});

describe('buildLane run (v174)', () => {
  it('POSTs with NO body (the arc is pinned data) and passes the answer through', async () => {
    let captured: string | undefined = 'sentinel';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = init?.body as string | undefined;
      return new Response(
        JSON.stringify({ ok: true, status: 'completed', detail: 'build arc studio-build-arc: 2/2 step(s) green — engine container:node:22-alpine', steps: [], receipts: [] }),
        { status: 200 },
      );
    }) as typeof fetch;
    const a = await requestBuildArcRun();
    expect(captured).toBeUndefined();
    expect(a.ok).toBe(true);
    expect(a.status).toBe('completed');
    expect(a.detail).toContain('2/2 step(s) green');
  });

  it('answers an unreachable server with ok:false and a stated reason', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const a = await requestBuildArcRun();
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('studio server unreachable');
  });

  it('POSTs a JSON body naming the goal when one is given', async () => {
    let captured: string | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = init?.body as string | undefined;
      return new Response(JSON.stringify({ ok: true, goal: 'ship it', steps: [] }), { status: 200 });
    }) as typeof fetch;
    const a = await requestBuildArcRun('ship it');
    expect(captured).toBe(JSON.stringify({ goal: 'ship it' }));
    expect(a.ok).toBe(true);
    expect(a.goal).toBe('ship it');
  });

  it('answers a non-JSON body with ok:false and the route status', async () => {
    globalThis.fetch = vi.fn(async () => new Response('oops', { status: 502 })) as typeof fetch;
    const a = await requestBuildArcRun();
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('non-JSON body');
    expect(a.reason).toContain('502');
  });

  it('probe treats an unreadable 200 body as unreachable, not as a pass-through', async () => {
    globalThis.fetch = vi.fn(async () => new Response('not-json', { status: 200 })) as typeof fetch;
    const p = await probeBuildLane();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('studio server unreachable');
    expect(p.steps).toEqual([]);
  });
});


describe('buildLane — the Studio-route lane finally carries a budget (v484)', () => {
  // This lane calls the global fetch directly — it predates the injected-fetch lanes, and the signal
  // sweep that counts fetchImpl( call sites never saw it, so a route that never answered hung the panel
  // forever with no reason to show. v484 gives it the budget every other door has had since v294 — and
  // the same lateness sentence the publish lane carries.

  const OK_BODY = { available: true, serverVersion: '29.8.2', reason: '', arcId: 'studio-build-arc', goal: 'g', engine: 'container:node:22-alpine', steps: [['node', '--version']] };
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
    await probeBuildLane();
    await requestBuildArcRun();
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
      await probeBuildLane();
      await requestBuildArcRun();
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
    const a0 = await probeBuildLane();
    const a1 = await requestBuildArcRun();
    expect(a0.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a1.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a0.reason).not.toContain('aborted');
  });


  it('a Studio that is GONE keeps the unreachable sentence with its own message', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('connection refused');
    }) as typeof fetch;
    const probe = await probeBuildLane();
    expect(probe.reason).toBe('studio server unreachable: connection refused');
    expect(probe.reason).not.toContain('45 seconds');
  });
});
