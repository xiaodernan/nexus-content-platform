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

describe('saveFsLane — answer-shape edges (v184/v186)', () => {
  it('a WRITE whose route answers a non-JSON body gets ok:false with the status', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 502 })) as typeof fetch;
    const a = await writeSaveToDisk('last-saved', { format: 'x' });
    expect(a.ok).toBe(false);
    expect(a.reason).toContain('non-JSON body');
    expect(a.reason).toContain('502');
  });

  it('an unreachable server is ok:false for write and read, not a throw', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const w = await writeSaveToDisk('last-saved', {});
    expect(w.ok).toBe(false);
    expect(w.reason).toContain('studio server unreachable');
    const r = await readSaveFromDisk('last-saved');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('studio server unreachable');
  });

  it('probe treats an unreadable 200 body as unreachable, not as a pass-through', async () => {
    globalThis.fetch = vi.fn(async () => new Response('not-json', { status: 200 })) as typeof fetch;
    const p = await probeSaveFs();
    expect(p.available).toBe(false);
    expect(p.reason).toContain('studio server unreachable');
  });
});

describe('saveFsLane — the Studio-route lane finally carries a budget (v484)', () => {
  // This lane calls the global fetch directly — it predates the injected-fetch lanes, and the signal
  // sweep that counts fetchImpl( call sites never saw it, so a route that never answered hung the panel
  // forever with no reason to show. v484 gives it the budget every other door has had since v294 — and
  // the same lateness sentence the publish lane carries.

  const OK_BODY = { available: true, serverVersion: 'studio-save-fs-v1', root: '.nexus/scene-saves', kind: 'fs', saves: ['last-saved'], count: 1 };
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
    await probeSaveFs();
    await writeSaveToDisk(SAVE_FS_LANE_DISK_SAVE_PATH, { format: 'x' });
    await readSaveFromDisk(SAVE_FS_LANE_DISK_SAVE_PATH);
    await deleteSaveOnDisk(SAVE_FS_LANE_DISK_SAVE_PATH);
    await renameSaveOnDisk(SAVE_FS_LANE_DISK_SAVE_PATH, 'other');
    for (const init of seen) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect((init?.signal as AbortSignal).aborted).toBe(false);
    }
    expect(seen).toHaveLength(5);
    expect(seen[0]?.signal).not.toBe(seen[1]?.signal);
  });


  it('the budget is the pinned 45 seconds — spy-witnessed on AbortSignal.timeout', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    try {
      globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(OK_BODY), { status: 200 })) as typeof fetch;
      await probeSaveFs();
      await writeSaveToDisk(SAVE_FS_LANE_DISK_SAVE_PATH, { format: 'x' });
      await readSaveFromDisk(SAVE_FS_LANE_DISK_SAVE_PATH);
      await deleteSaveOnDisk(SAVE_FS_LANE_DISK_SAVE_PATH);
      await renameSaveOnDisk(SAVE_FS_LANE_DISK_SAVE_PATH, 'other');
      expect(timeoutSpy).toHaveBeenCalledWith(45_000);
      expect(timeoutSpy).toHaveBeenCalledTimes(5);
    } finally {
      timeoutSpy.mockRestore();
    }
  });


  it('a fired budget says the Studio was LATE — not "unreachable", and not the platform’s string', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw late();
    }) as typeof fetch;
    const a0 = await probeSaveFs();
    const a1 = await writeSaveToDisk(SAVE_FS_LANE_DISK_SAVE_PATH, { format: 'x' });
    const a2 = await readSaveFromDisk(SAVE_FS_LANE_DISK_SAVE_PATH);
    const a3 = await deleteSaveOnDisk(SAVE_FS_LANE_DISK_SAVE_PATH);
    const a4 = await renameSaveOnDisk(SAVE_FS_LANE_DISK_SAVE_PATH, 'other');
    expect(a0.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a1.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a2.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a3.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a4.reason).toBe('the Studio did not answer within 45 seconds');
    expect(a0.reason).not.toContain('aborted');
  });


  it('a Studio that is GONE keeps the unreachable sentence with its own message', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('connection refused');
    }) as typeof fetch;
    const probe = await probeSaveFs();
    expect(probe.reason).toBe('studio server unreachable: connection refused');
    expect(probe.reason).not.toContain('45 seconds');
  });
});
