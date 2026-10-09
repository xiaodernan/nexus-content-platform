import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@nexus/design-model';
import { StudioStore } from '../src/studio/store';

/**
 * #62② 的客户端一半：自动保存优先发 §150 的 Command 补丁，而不是整份文档。
 * 要钉住的是"什么时候发哪条路、失败之后补丁去哪了"——都不是页面上看得出来的，
 * 所以与 studio-flush.test.ts 同一条纪律：stub fetch 做单测，e2e 只当回归。
 * 变异探针（各红一处、都已还原）：把 execute 里的 pendingPatches.push 去掉 → 第 1 条红
 * （永远退回全量 PUT，补丁路径形同虚设）；把 409 兜底那段删掉 → 第 4 条红（用户卡在 error）。
 */

type StubMode = 'ok' | 'patch-fails-409' | 'patch-network-error';

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

interface Stub {
  calls: { method: string; url: string; body?: unknown }[];
  mode: StubMode;
  /** 挂起 PATCH 的完成时机（第 6 条用）：非 null 时 PATCH 停在这道闸上 */
  patchDeferred: Deferred | null;
}

function installFetch(stub: Stub): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? (JSON.parse(init.body) as unknown) : undefined;
      stub.calls.push({ method, url, body });
      const json = (payload: unknown, ok = true, status = 200) => ({
        ok,
        status,
        json: async () => payload,
      });
      if (method === 'PATCH' && url.endsWith('/design')) {
        if (stub.mode === 'patch-network-error') throw new Error('network down');
        if (stub.mode === 'patch-fails-409') {
          return json({ ok: false, error: 'ops_skipped', message: '有补丁没有落到目标上' }, false, 409);
        }
        if (stub.patchDeferred) await stub.patchDeferred.promise;
        return json({ ok: true, savedAt: '2026-10-09T00:00:00.000Z' });
      }
      if (method === 'PUT') return json({ ok: true, savedAt: '2026-10-09T00:00:00.000Z' });
      if (url.includes('/snapshots')) return json({ snapshots: [], branches: [] });
      if (url.includes('/publication')) return json({ publication: null });
      return json({ document: createDocument('Patch Save Site', 'website') });
    }),
  );
}

async function readyStudio(): Promise<StudioStore> {
  const studio = new StudioStore();
  await studio.load('p1');
  return studio;
}

function firstLeafId(studio: StudioStore): string {
  const document = studio.getSnapshot().document!;
  const page = document.pages[0]!;
  return Object.keys(page.nodes).find((id) => id !== page.rootId)!;
}

function patchCalls(stub: Stub) {
  return stub.calls.filter((c) => c.method === 'PATCH' && c.url === '/api/projects/p1/design');
}

function putCalls(stub: Stub) {
  return stub.calls.filter((c) => c.method === 'PUT' && c.url === '/api/projects/p1');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('自动保存的补丁路径（#62②）', () => {
  it('手工命令攒下的补丁：save 发 PATCH …/design 只带 ops，不发整份 PUT', async () => {
    const stub: Stub = { calls: [], mode: 'ok', patchDeferred: null };
    installFetch(stub);
    const studio = await readyStudio();
    const nodeId = firstLeafId(studio);

    studio.execute('改文字', [{ op: 'set', nodeId, path: 'text', value: 'hello' }]);
    await studio.save();

    const patches = patchCalls(stub);
    expect(patches).toHaveLength(1);
    expect(putCalls(stub)).toHaveLength(0);
    const sent = patches[0]!.body as { patches: { ops: { op: string; nodeId: string; value: unknown }[] }[] };
    expect(sent.patches).toHaveLength(1);
    expect(sent.patches[0]!.ops[0]).toMatchObject({ op: 'set', nodeId, value: 'hello' });
    expect(studio.getSnapshot().saveState).toBe('saved');
    expect(studio.getSnapshot().dirty).toBe(false);
  });

  it('撤销发的是逆补丁（把旧值 set 回去），不是旧文档', async () => {
    const stub: Stub = { calls: [], mode: 'ok', patchDeferred: null };
    installFetch(stub);
    const studio = await readyStudio();
    const nodeId = firstLeafId(studio);
    const before = (studio.getSnapshot().document!.pages[0]!.nodes[nodeId] as { text?: unknown }).text;

    studio.execute('改文字', [{ op: 'set', nodeId, path: 'text', value: 'after' }]);
    await studio.save();
    studio.undo();
    await studio.save();

    const patches = patchCalls(stub);
    expect(patches).toHaveLength(2);
    const undoOps = (patches[1]!.body as { patches: { ops: { value: unknown }[] }[] }).patches[0]!.ops;
    expect(undoOps[0]!.value).toBe(before);
  });

  it('setMode 这类补丁词汇表表达不了的改动：强制整份 PUT', async () => {
    const stub: Stub = { calls: [], mode: 'ok', patchDeferred: null };
    installFetch(stub);
    const studio = await readyStudio();
    const nodeId = firstLeafId(studio);

    studio.execute('改文字', [{ op: 'set', nodeId, path: 'text', value: 'hello' }]);
    studio.setMode('dark');
    await studio.save();

    expect(patchCalls(stub)).toHaveLength(0);
    expect(putCalls(stub)).toHaveLength(1);
    expect(studio.getSnapshot().dirty).toBe(false);
  });

  it('补丁被门挡下（409 ops_skipped）：当场换全量 PUT 兜底，不把用户卡在 error', async () => {
    const stub: Stub = { calls: [], mode: 'patch-fails-409', patchDeferred: null };
    installFetch(stub);
    const studio = await readyStudio();
    const nodeId = firstLeafId(studio);

    studio.execute('改文字', [{ op: 'set', nodeId, path: 'text', value: 'hello' }]);
    await studio.save();

    expect(patchCalls(stub)).toHaveLength(1);
    expect(putCalls(stub)).toHaveLength(1);
    expect(studio.getSnapshot().saveState).toBe('saved');
    expect(studio.getSnapshot().dirty).toBe(false);
  });

  it('补丁请求网络失败：补丁放回队头，下一轮保存还带着它', async () => {
    const stub: Stub = { calls: [], mode: 'patch-network-error', patchDeferred: null };
    installFetch(stub);
    const studio = await readyStudio();
    const nodeId = firstLeafId(studio);

    studio.execute('改文字', [{ op: 'set', nodeId, path: 'text', value: 'hello' }]);
    await studio.save();

    expect(studio.getSnapshot().saveState).toBe('error');
    expect(studio.getSnapshot().dirty).toBe(true);

    stub.mode = 'ok';
    await studio.save();
    const patches = patchCalls(stub);
    expect(patches).toHaveLength(2);
    const resent = (patches[1]!.body as { patches: { ops: { value: unknown }[] }[] }).patches[0]!.ops;
    expect(resent[0]!.value).toBe('hello');
    expect(studio.getSnapshot().dirty).toBe(false);
  });

  it('保存在途期间又有编辑：成功也不能清 dirty（那一轮没送出去的是新编辑）', async () => {
    const gate = deferred();
    const stub: Stub = { calls: [], mode: 'ok', patchDeferred: gate };
    installFetch(stub);
    const studio = await readyStudio();
    const nodeId = firstLeafId(studio);

    studio.execute('改文字', [{ op: 'set', nodeId, path: 'text', value: 'round1' }]);
    const saving = studio.save();
    // PATCH 真的到闸口了（而不是还在路上），再放第二次编辑进来
    await vi.waitFor(() => {
      expect(patchCalls(stub)).toHaveLength(1);
    });
    studio.execute('再改一次', [{ op: 'set', nodeId, path: 'text', value: 'round2' }]);
    stub.patchDeferred = null;
    gate.resolve();
    await saving;

    expect(studio.getSnapshot().saveState).toBe('saved');
    // round2 没送出去：dirty 留着，下一轮补丁带着它
    expect(studio.getSnapshot().dirty).toBe(true);
    await studio.save();
    const last = patchCalls(stub).at(-1)!;
    const ops = (last.body as { patches: { ops: { value: unknown }[] }[] }).patches[0]!.ops;
    expect(ops[0]!.value).toBe('round2');
    expect(studio.getSnapshot().dirty).toBe(false);
  });
});
