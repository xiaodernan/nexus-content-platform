import { afterEach, describe, expect, it, vi } from 'vitest';

import { SAVE_FS_LANE_DISK_SAVE_PATH, deleteSaveOnDisk, probeSaveFs, readSaveFromDisk, renameSaveOnDisk, writeSaveToDisk } from './saveFsLane';

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

describe('saveFsLane delete/rename (v186)', () => {
  it('POSTs { action: "delete", path } and passes the store’s boolean through (deleted: true/false)', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string | undefined;
      return new Response(JSON.stringify({ ok: true, path: 'last-saved', deleted: true }), { status: 200 });
    }) as typeof fetch;
    const a = await deleteSaveOnDisk(SAVE_FS_LANE_DISK_SAVE_PATH);
    expect(a.ok).toBe(true);
    expect(a.deleted).toBe(true);
    expect(JSON.parse(capturedBody ?? '{}')).toEqual({ action: 'delete', path: 'last-saved' });
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, path: 'last-saved', deleted: false }), { status: 200 }),
    ) as typeof fetch;
    const b = await deleteSaveOnDisk(SAVE_FS_LANE_DISK_SAVE_PATH);
    expect(b.ok).toBe(true);
    expect(b.deleted).toBe(false);
  });

  it('POSTs { action: "rename", from, to } and hands the caller the store’s resolution of the new name', async () => {
    let capturedBody: string | undefined;
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = init?.body as string | undefined;
      return new Response(JSON.stringify({ ok: true, from: 'last-saved', to: 'renamed-save' }), { status: 200 });
    }) as typeof fetch;
    const a = await renameSaveOnDisk('last-saved', 'renamed-save');
    expect(a.ok).toBe(true);
    expect(a.to).toBe('renamed-save');
    expect(JSON.parse(capturedBody ?? '{}')).toEqual({ action: 'rename', from: 'last-saved', to: 'renamed-save' });
  });

  it('a refused verb (bad name, missing old name) arrives as ok:false plus the store’s own sentence', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, reason: 'saveStore: "nowhere" does not exist' }), { status: 400 }),
    ) as typeof fetch;
    const a = await renameSaveOnDisk('nowhere', 'somewhere');
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('does not exist');
    const b = await deleteSaveOnDisk('C:/x');
    expect(b.ok).toBe(false);
    expect(b.reason).toContain('does not exist');
  });

  it('an unreachable server is answered honestly for both verbs, not thrown', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const a = await deleteSaveOnDisk('last-saved');
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('studio server unreachable');
    const b = await renameSaveOnDisk('a', 'b');
    expect(b.ok).toBe(false);
    expect(b.reason).toContain('studio server unreachable');
  });
});