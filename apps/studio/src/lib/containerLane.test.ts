import { afterEach, describe, expect, it, vi } from 'vitest';

import { probeContainerLane, requestContainerExec } from './containerLane';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('containerLane probe (v172)', () => {
  it('passes the route answer through', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ available: true, serverVersion: '29.8.2', reason: '', image: 'node:22-alpine', workdirRoot: '/workspace', rules: [['node', '-e', '*']] }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const p = await probeContainerLane();
    expect(p.available).toBe(true);
    expect(p.serverVersion).toBe('29.8.2');
    expect(p.image).toBe('node:22-alpine');
  });

  it('answers a non-200 route with an honest unavailable', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof fetch;
    const p = await probeContainerLane();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('probe route answered 500');
  });

  it('answers an unreachable server with an honest unavailable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const p = await probeContainerLane();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('studio server unreachable');
  });
});

describe('containerLane exec (v172)', () => {
  it('POSTs the argv as JSON and passes the answer through', async () => {
    let captured = '';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = String(init?.body ?? '');
      return new Response(JSON.stringify({ ok: true, ran: true, detail: 'container node:22-alpine node -e x → exit 0' }), { status: 200 });
    }) as typeof fetch;
    const a = await requestContainerExec({ argv: ['node', '-e', 'x'] });
    expect(JSON.parse(captured)).toEqual({ argv: ['node', '-e', 'x'] });
    expect(a.ok).toBe(true);
    expect(a.detail).toContain('exit 0');
  });

  it('answers an unreachable server with ok:false and a stated reason', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const a = await requestContainerExec({ argv: ['node', '-e', 'x'] });
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('studio server unreachable');
  });
});