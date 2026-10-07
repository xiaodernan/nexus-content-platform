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
});
