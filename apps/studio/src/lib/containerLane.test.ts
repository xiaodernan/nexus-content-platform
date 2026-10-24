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

  it('serializes cwd alongside argv when one is given', async () => {
    let captured = '';
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = String(init?.body ?? '');
      return new Response(JSON.stringify({ ok: true, ran: true, detail: 'ok' }), { status: 200 });
    }) as typeof fetch;
    await requestContainerExec({ argv: ['ls'], cwd: '/workspace' });
    expect(JSON.parse(captured)).toEqual({ argv: ['ls'], cwd: '/workspace' });
  });

  it('answers a non-JSON body with ok:false and the route status', async () => {
    globalThis.fetch = vi.fn(async () => new Response('oops', { status: 503 })) as typeof fetch;
    const a = await requestContainerExec({ argv: ['ls'] });
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('non-JSON body');
    expect(a.reason).toContain('503');
  });
});

describe('containerLane — the Studio-route lane finally carries a budget (v484)', () => {
  // This lane calls the global fetch directly — it predates the injected-fetch lanes, and the signal
  // sweep that counts fetchImpl( call sites never saw it, so a route that never answered hung the panel
  // forever with no reason to show. v484 gives it the budget every other door has had since v294 — and
  // the same lateness sentence the publish lane carries.

  const OK_BODY = { available: true, serverVersion: '29.8.2', reason: '', image: 'node:22-alpine', workdirRoot: '/workspace', rules: [['node', '-e', '*']] };
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
    await probeContainerLane();
    await requestContainerExec({ argv: ['node', '-e', 'x'] });
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
      await probeContainerLane();
      await requestContainerExec({ argv: ['node', '-e', 'x'] });
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
    const a0 = await probeContainerLane();
    const a1 = await requestContainerExec({ argv: ['node', '-e', 'x'] });
    expect(a0.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a1.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a0.reason).not.toContain('aborted');
  });


  it('a Studio that is GONE keeps the unreachable sentence with its own message', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('connection refused');
    }) as typeof fetch;
    const probe = await probeContainerLane();
    expect(probe.reason).toBe('studio server unreachable: connection refused');
    expect(probe.reason).not.toContain('45 seconds');
  });
});

describe('containerLane — the probe answers a 200 it cannot read HONESTLY (v485)', () => {
  // The probe parsed its 200 body with a bare cast: a body that could not be read fell into the
  // catch and was answered "studio server unreachable" — a false sentence about a server that had
  // just answered. v485 parses it in its own try and names the route and the status instead, the
  // sentence every other door of this file already uses.

  it('a 200 with an unreadable body names the route and the status — not "unreachable"', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>nope</html>', { status: 200 })) as typeof fetch;
    const p = await probeContainerLane();
    expect(p.available).toBe(false);
    expect(p.reason).toBe('container route answered 200 with a non-JSON body');
    expect(p.reason).not.toContain('unreachable');
  });
});
