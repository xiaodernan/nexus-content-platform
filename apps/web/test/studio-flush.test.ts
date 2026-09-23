import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@nexus/design-model';
import { StudioStore } from '../src/studio/store';

/**
 * §68 的客户端一半：AI 请求的上下文由服务端从**库里那份**装配，所以编辑器里的脏改动
 * 必须先落库才能发请求。要钉住的是"顺序"和"存不上就停下"两件事 —— 都不是页面上看得出来的，
 * 所以做成单测：自动保存的 1.8s 防抖在 e2e 里本来就不确定，拿它当被测对象只会测到计时器。
 */

interface Stub {
  calls: { method: string; url: string }[];
  putFails: boolean;
}

function installFetch(stub: Stub): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      stub.calls.push({ method, url });
      const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => body });
      if (method === 'PUT') {
        return stub.putFails
          ? json({ ok: false, issues: ['nodes.hero.width: 必须是有限数'] }, false)
          : json({ ok: true, savedAt: '2026-09-24T00:00:00.000Z' });
      }
      if (url.includes('/snapshots')) return json({ snapshots: [], branches: [] });
      if (url.includes('/publication')) return json({ publication: null });
      return json({ document: createDocument('Flush Site', 'website') });
    }),
  );
}

async function readyStudio(): Promise<StudioStore> {
  const studio = new StudioStore();
  await studio.load('p1');
  return studio;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('StudioStore.flushBeforeAi（§68）', () => {
  it('有脏改动时：先 PUT 落库，再放行 AI 请求', async () => {
    const stub: Stub = { calls: [], putFails: false };
    installFetch(stub);
    const studio = await readyStudio();
    studio.markDirty();

    await expect(studio.flushBeforeAi()).resolves.toEqual({ ok: true });
    const puts = stub.calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]!.url).toBe('/api/projects/p1');
    expect(studio.getSnapshot().saveState).toBe('saved');
  });

  it('存不上时：不放行，并且把失败原因原样交给调用方（不静默按旧版本生成）', async () => {
    const stub: Stub = { calls: [], putFails: true };
    installFetch(stub);
    const studio = await readyStudio();
    studio.markDirty();

    const result = await studio.flushBeforeAi();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('nodes.hero.width');
    // 仍然脏：脏着就是没存上，下一轮还得再试
    expect(studio.getSnapshot().dirty).toBe(true);
  });

  it('已经保存过：不再多打一次 PUT（干净状态不发无意义的写）', async () => {
    const stub: Stub = { calls: [], putFails: false };
    installFetch(stub);
    const studio = await readyStudio();

    await expect(studio.flushBeforeAi()).resolves.toEqual({ ok: true });
    expect(stub.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
  });
});
