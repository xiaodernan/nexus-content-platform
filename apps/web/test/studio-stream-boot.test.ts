import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@nexus/design-model';
import { StudioStore } from '../src/studio/store';

/**
 * §147 流式首屏 × §124 的选择竞态。
 *
 * StudioShell 同时干两件事：`DocumentStream` 用服务端随 HTML 下来的文档 `bootstrap`，
 * 另一个 effect 调 `load()` 再取一次权威文档。两者谁先完成都行——但如果 `bootstrap`
 * 先到、用户在 `load()` 的 GET 还在飞的时候点了元素或改了属性，那份迟到的响应
 * 一旦 `reset` 就会把选择与这几百毫秒里的编辑一起清掉（§124 e2e 里表现为
 * 多选按钮"闪一下就没了"）。这里钉住：同一份文档后到的响应不许夺走会话状态；
 * 同时反向钉住守卫没放宽——换了项目该装的文档照旧装、该清的选照旧清。
 */

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload };
}

function refreshStubs(url: string) {
  if (url.includes('/snapshots')) return ok({ snapshots: [], branches: [] });
  if (url.includes('/publication')) return ok({ publication: null });
  if (url.includes('/annotations')) return ok({ annotations: [] });
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('§147 流式首屏与 load() 的先后', () => {
  it('bootstrap 之后迟到的同一份文档不重置会话：选择与编辑都保留', async () => {
    const document = createDocument('首屏竞态', 'website');
    // 响应用的是"发请求那一刻"的文档快照：bootstrap 之后的编辑不该出现在它里面
    const payload = JSON.parse(JSON.stringify(document)) as unknown;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: { method?: string }) => {
        const method = init?.method ?? 'GET';
        if (method === 'PATCH' || method === 'PUT') return ok({ ok: true, savedAt: '2026-10-25T00:00:00.000Z' });
        const url = String(input);
        const refreshed = refreshStubs(url);
        if (refreshed) return refreshed;
        await gate;
        return ok({ document: payload });
      }),
    );

    const studio = new StudioStore();
    const loading = studio.load(document.id);
    // 服务端那份先到，用户马上开始工作
    studio.bootstrap(document);
    const cta = Object.values(studio.getSnapshot().page!.nodes).find((n) => n.name === 'Primary CTA');
    expect(cta).toBeTruthy();
    studio.select([cta!.id]);
    studio.setProps([cta!.id], 'states.hover', { opacity: 0.5 });

    release();
    await loading;

    const after = studio.getSnapshot();
    expect(after.selection).toEqual([cta!.id]);
    expect(after.page!.nodes[cta!.id]!.states?.hover).toEqual({ opacity: 0.5 });
    expect(after.dirty).toBe(true);
  });

  it('换项目时照旧换成新文档：守卫只针对同一份已装上的文档', async () => {
    const first = createDocument('第一个项目', 'website');
    const second = createDocument('第二个项目', 'website');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: { method?: string }) => {
        const method = init?.method ?? 'GET';
        if (method === 'PATCH' || method === 'PUT') return ok({ ok: true, savedAt: '2026-10-25T00:00:00.000Z' });
        const url = String(input);
        const refreshed = refreshStubs(url);
        if (refreshed) return refreshed;
        return ok({ document: url.includes(second.id) ? second : first });
      }),
    );

    const studio = new StudioStore();
    await studio.load(first.id);
    const firstNode = Object.values(studio.getSnapshot().page!.nodes)[0]!;
    studio.select([firstNode.id]);
    expect(studio.getSnapshot().selection).toEqual([firstNode.id]);

    await studio.load(second.id);

    const after = studio.getSnapshot();
    expect(after.document?.id).toBe(second.id);
    expect(after.selection).toEqual([]);
    expect(after.page!.nodes[firstNode.id]).toBeUndefined();
  });
});
