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
