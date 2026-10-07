import { afterEach, describe, expect, it, vi } from 'vitest';

import { SAVE_FS_LANE_DISK_SAVE_PATH, probeSaveFs, readSaveFromDisk, writeSaveToDisk } from './saveFsLane';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('saveFsLane probe (v184)', () => {
  it('passes the route answer through: available, root, kind, saves, count', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ available: true, serverVersion: 'studio-save-fs-v1', root: '.nexus/scene-saves', kind: 'fs', saves: ['last-saved'], count: 1 }),
        { status: 200 },
      ),
    ) as typeof fetch;
    const p = await probeSaveFs();
    expect(p.available).toBe(true);
    expect(p.root).toBe('.nexus/scene-saves');
    expect(p.kind).toBe('fs');
    expect(p.saves).toEqual(['last-saved']);
    expect(p.count).toBe(1);
  });

  it('answers a non-200 route with an honest unavailable', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as typeof fetch;
    const p = await probeSaveFs();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('probe route answered 500');
  });

  it('answers an unreachable server with an honest unavailable', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const p = await probeSaveFs();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('studio server unreachable');
  });
});

describe('saveFsLane write/read (v184)', () => {
  it('POSTs { action: "write", path, file } and passes the answer (bytes) through', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string | undefined;
      return new Response(JSON.stringify({ ok: true, path: 'last-saved', bytes: 240 }), { status: 200 });
    }) as typeof fetch;
    const file = { format: 'nexus-three-runtime-save', version: 1 };
    const a = await writeSaveToDisk(SAVE_FS_LANE_DISK_SAVE_PATH, file);
    expect(a.ok).toBe(true);
    expect(a.bytes).toBe(240);
    expect(JSON.parse(capturedBody ?? '{}')).toEqual({ action: 'write', path: 'last-saved', file });
  });

  it('POSTs { action: "read", path } and hands the parsed file to the caller', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string | undefined;
      return new Response(JSON.stringify({ ok: true, path: 'last-saved', file: { format: 'x' } }), { status: 200 });
    }) as typeof fetch;
    const a = await readSaveFromDisk('last-saved');
    expect(a.ok).toBe(true);
    expect(a.file).toEqual({ format: 'x' });
    expect(JSON.parse(capturedBody ?? '{}')).toEqual({ action: 'read', path: 'last-saved' });
  });

  it("a refusal (bad name, missing file) arrives as ok:false plus the store's own sentence", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, reason: "saveStore: 'C:/x' is an absolute path; a save is named inside the store's own namespace, never by a location on the host" }), { status: 400 }),
    ) as typeof fetch;
    const a = await writeSaveToDisk('C:/x', {});
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('absolute path');
  });

  it('a non-JSON route body is answered ok:false, not thrown', async () => {
    globalThis.fetch = vi.fn(async () => new Response('<html>nope</html>', { status: 502 })) as typeof fetch;
    const a = await readSaveFromDisk('last-saved');
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('non-JSON body');
  });
});