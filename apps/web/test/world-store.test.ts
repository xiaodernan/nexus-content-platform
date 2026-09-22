import { afterEach, describe, expect, it, vi } from 'vitest';
import { worldStore } from '@/studio/worldStore';
import { WORLD_KINDS, createWorld } from '@nexus/world-model';

/**
 * 世界文档 store 的两条真值纪律。这两条都是被 e2e 逼出来的：
 * StrictMode 把 effect 跑两遍 → 同一个项目发两次 GET；
 * 迟到的那次 GET 返回 null，会把用户刚点出来的骨架从界面上擦掉。
 * 这里用假 fetch 把时序钉住，不靠浏览器运气。
 */

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('worldStore', () => {
  it('同一个项目的并发载入只发一次请求', async () => {
    const gets: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') return json({ ok: true, world: null });
        gets.push(String(input));
        return json({ ok: true, world: null });
      }),
    );
    worldStore.ensure('proj-once');
    worldStore.ensure('proj-once');
    await wait(30);
    expect(gets).toHaveLength(1);
  });

  it('迟到的读结果不擦掉本地已建的世界', async () => {
    const gate = deferred<Response>();
    const puts: { document: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          const body = JSON.parse(String(init.body)) as { document: Record<string, unknown> };
          puts.push(body);
          return json({ ok: true, world: body.document });
        }
        return gate.promise;
      }),
    );

    worldStore.ensure('proj-race');
    await wait(10);
    await worldStore.createSkeleton('低语诸王');
    expect(worldStore.getSnapshot().world?.nodes).toHaveLength(WORLD_KINDS.length);
    expect(puts).toHaveLength(1);

    gate.resolve(json({ ok: true, world: null }));
    await wait(30);

    const snapshot = worldStore.getSnapshot();
    expect(snapshot.world).not.toBeNull();
    expect(snapshot.missing).toBe(false);
    expect(snapshot.world?.nodes).toHaveLength(WORLD_KINDS.length);
    expect(snapshot.saveState).toBe('saved');
  });

  it('契约外的文档不发请求，原因直接摆在状态里', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true, world: null }));
    vi.stubGlobal('fetch', fetchMock);
    worldStore.ensure('proj-invalid');
    await wait(20);
    fetchMock.mockClear();
    worldStore.setLocal({ ...createWorld('要发出去的世界', 'proj-invalid'), name: '   ' });
    await worldStore.commit();
    const snapshot = worldStore.getSnapshot();
    expect(snapshot.saveState).toBe('error');
    expect(snapshot.error).toContain('没有名字');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
