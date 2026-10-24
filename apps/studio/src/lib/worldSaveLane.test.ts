import { afterEach, describe, expect, it, vi } from 'vitest';

import { WORLD_SAVE_LANE_DISK_SAVE_PATH, probeWorldSaves, readWorldSaveFromDisk, writeWorldSaveToDisk } from './worldSaveLane';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('worldSaveLane probe (v191)', () => {
  it('passes the route answer through: available, root, kind, saves, count', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ available: true, serverVersion: 'studio-world-save-v1', root: '.nexus/world-saves', kind: 'fs', saves: ['world-saved'], count: 1 }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const p = await probeWorldSaves();
    expect(p.available).toBe(true);
    expect(p.root).toBe('.nexus/world-saves');
    expect(p.kind).toBe('fs');
    expect(p.saves).toEqual(['world-saved']);
    expect(p.count).toBe(1);
  });

  it('answers a non-200 route with an honest unavailable', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof fetch;
    const p = await probeWorldSaves();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('probe route answered 500');
  });

  it('answers an unreachable server with an honest unavailable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const p = await probeWorldSaves();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('studio server unreachable');
  });
});

describe('worldSaveLane write/read (v191)', () => {
  it('POSTs { action: "write", path, file } to /api/agent/world-saves and passes the answer (bytes) through', async () => {
    let capturedBody: string | undefined;
    let capturedUrl: string | undefined;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = init?.body as string | undefined;
      return new Response(JSON.stringify({ ok: true, path: 'world-saved', bytes: 512 }), { status: 200 });
    }) as typeof fetch;
    const file = { world: { name: 'New World' }, currentTick: 3 };
    const a = await writeWorldSaveToDisk(WORLD_SAVE_LANE_DISK_SAVE_PATH, file);
    expect(a.ok).toBe(true);
    expect(a.bytes).toBe(512);
    expect(capturedUrl).toContain('/api/agent/world-saves');
    expect(JSON.parse(capturedBody ?? '{}')).toEqual({ action: 'write', path: 'world-saved', file });
  });

  it('POSTs { action: "read", path } and hands the parsed file to the caller', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string | undefined;
      return new Response(JSON.stringify({ ok: true, path: 'world-saved', file: { world: { name: 'New World' } } }), { status: 200 });
    }) as typeof fetch;
    const a = await readWorldSaveFromDisk('world-saved');
    expect(a.ok).toBe(true);
    expect(a.file).toEqual({ world: { name: 'New World' } });
    expect(JSON.parse(capturedBody ?? '{}')).toEqual({ action: 'read', path: 'world-saved' });
  });

  it("a refusal (bad name, missing file, no world) arrives as ok:false plus the store's own sentence", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, reason: "saveStore: 'C:/x' is an absolute path; a save is named inside the store's own namespace, never by a location on the host" }), { status: 400 }),
    ) as typeof fetch;
    const a = await writeWorldSaveToDisk('C:/x', { world: {} });
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('absolute path');
  });

  it('a non-JSON route body is answered ok:false, not thrown', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>nope</html>', { status: 502 })) as typeof fetch;
    const a = await readWorldSaveFromDisk('world-saved');
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('non-JSON body');
  });

  it('a WRITE whose route answers a non-JSON body gets ok:false with the status', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 502 })) as typeof fetch;
    const a = await writeWorldSaveToDisk('world-saved', { world: {} });
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('non-JSON body');
    expect(a.reason).toContain('502');
  });

  it('an unreachable server is ok:false for both write and read, not a throw', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const w = await writeWorldSaveToDisk('world-saved', { world: {} });
    expect(w.ok).toBe(false);
    expect(w.reason).toContain('studio server unreachable');
    const r = await readWorldSaveFromDisk('world-saved');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('studio server unreachable');
  });
});


describe('worldSaveLane — the Studio-route lane finally carries a budget (v484)', () => {
  // This lane calls the global fetch directly — it predates the injected-fetch lanes, and the signal
  // sweep that counts fetchImpl( call sites never saw it, so a route that never answered hung the panel
  // forever with no reason to show. v484 gives it the budget every other door has had since v294 — and
  // the same lateness sentence the publish lane carries.

  const OK_BODY = { available: true, serverVersion: 'studio-world-save-v1', root: '.nexus/world-saves', kind: 'fs', saves: ['world-saved'], count: 1 };
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
    await probeWorldSaves();
    await writeWorldSaveToDisk(WORLD_SAVE_LANE_DISK_SAVE_PATH, { format: 'x' });
    await readWorldSaveFromDisk(WORLD_SAVE_LANE_DISK_SAVE_PATH);
    for (const init of seen) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect((init?.signal as AbortSignal).aborted).toBe(false);
    }
    expect(seen).toHaveLength(3);
    expect(seen[0]?.signal).not.toBe(seen[1]?.signal);
  });


  it('the budget is the pinned 45 seconds — spy-witnessed on AbortSignal.timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(OK_BODY), { status: 200 })) as typeof fetch;
      await probeWorldSaves();
      await writeWorldSaveToDisk(WORLD_SAVE_LANE_DISK_SAVE_PATH, { format: 'x' });
      await readWorldSaveFromDisk(WORLD_SAVE_LANE_DISK_SAVE_PATH);
      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
      expect(timeoutSpy).toHaveBeenCalledTimes(3);
    } finally {
      timeoutSpy.mockRestore();
    }
  });


  it('a fired budget says the Studio was LATE — not "unreachable", and not the platform’s string', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw late();
    }) as typeof fetch;
    const a0 = await probeWorldSaves();
    const a1 = await writeWorldSaveToDisk(WORLD_SAVE_LANE_DISK_SAVE_PATH, { format: 'x' });
    const a2 = await readWorldSaveFromDisk(WORLD_SAVE_LANE_DISK_SAVE_PATH);
    expect(a0.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a1.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a2.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a0.reason).not.toContain('aborted');
  });


  it('a Studio that is GONE keeps the unreachable sentence with its own message', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('connection refused');
    }) as typeof fetch;
    const probe = await probeWorldSaves();
    expect(probe.reason).toBe('studio server unreachable: connection refused');
    expect(probe.reason).not.toContain('45 seconds');
  });
});

describe('worldSaveLane — the probe answers a 200 it cannot read HONESTLY (v485)', () => {
  // The probe parsed its 200 body with a bare cast: a body that could not be read fell into the
  // catch and was answered "studio server unreachable" — a false sentence about a server that had
  // just answered. v485 parses it in its own try and names the route and the status instead, the
  // sentence every other door of this file already uses.

  it('a 200 with an unreadable body names the route and the status — not "unreachable"', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>nope</html>', { status: 200 })) as typeof fetch;
    const p = await probeWorldSaves();
    expect(p.available).toBe(false);
    expect(p.reason).toBe('world-saves route answered 200 with a non-JSON body');
    expect(p.reason).not.toContain('unreachable');
  });
});
