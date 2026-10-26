import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@nexus/design-model';
import { StudioStore } from '../src/studio/store';
import { setStudioReadOnly } from '../src/studio/read-only';
import { worldStore } from '../src/studio/worldStore';
import { gameStore } from '../src/studio/gameStore';
import { storyboardStore } from '../src/studio/storyboardStore';

/**
 * §133/#206 只读闸的客户端一半：viewer 的编辑在**本地**就按下。
 *
 * 服务端的写门（403 read_only_role）已经是最后一道，但只靠它，用户会先把界面改掉、
 * 再看着同一次改动被 403 打回来——界面等于先撒了一次谎（§159）。这里钉住四件事：
 * ① 设计文档的编辑/撤销/保存入口全部不生效，且不发一个写请求；
 * ② "看别的页面/模式"这类视图偏好仍然本地生效，但不标脏、不排队保存；
 * ③ 闸关上之后同一套入口立刻恢复（不是把能力永久砍掉）；
 * ④ world / game / storyboard 三个子文档 store 的本地写入也在同一个闸上。
 *
 * 只读开关是模块级的（四个 store 共用一份），所以每个用例显式设一次；
 * 文件结束留在"只读"上，让残余的自动保存定时器落到闸后面去。
 */

interface Call {
  method: string;
  url: string;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

function installFetch(calls: Call[], doc = createDocument('Read Only', 'website')): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, url });
      const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
      if (method !== 'GET') {
        const sent = init?.body ? (JSON.parse(init.body) as { document?: unknown }) : {};
        if (url.endsWith('/world')) return json({ ok: true, world: sent.document });
        if (url.endsWith('/game')) return json({ ok: true, game: sent.document });
        if (url.endsWith('/storyboard')) {
          return json({ ok: true, storyboard: sent.document, updatedAt: '2026-10-26T00:00:00.000Z' });
        }
        return json({ ok: true, savedAt: '2026-10-26T00:00:00.000Z' });
      }
      if (url.includes('/snapshots')) return json({ snapshots: [], branches: [] });
      if (url.endsWith('/world')) return json({ ok: true, world: null });
      if (url.endsWith('/game')) return json({ ok: true, game: null });
      if (url.endsWith('/storyboard')) return json({ ok: true, storyboard: null, updatedAt: null });
      return json({ document: doc });
    }),
  );
}

async function readyStudio(): Promise<StudioStore> {
  const studio = new StudioStore();
  await studio.load('p1');
  return studio;
}

const writes = (calls: Call[]) => calls.filter((c) => c.method !== 'GET');

afterEach(() => {
  // 残余定时器（1.8s 后的自动保存）落在闸后面：不会再打真 fetch
  setStudioReadOnly(true);
  vi.unstubAllGlobals();
});

describe('StudioStore 只读闸（§133/#206 viewer）', () => {
  it('只读时编辑在本地就按下：不改文档、不进撤销栈、不发写请求', async () => {
    const calls: Call[] = [];
    installFetch(calls);
    setStudioReadOnly(true);
    const studio = await readyStudio();
    const before = studio.currentDocument();
    const rootId = studio.getSnapshot().page!.rootId;
    calls.length = 0;

    studio.execute('改根节点名', [{ op: 'set', nodeId: rootId, path: 'name', value: '不该发生' }]);
    studio.addNode('frame');
    studio.renameDocument('只读改名');
    studio.deleteSelection();
    studio.undo();
    studio.redo();
    await studio.save();
    studio.flushSave();

    expect(studio.currentDocument()).toEqual(before);
    expect(studio.getSnapshot().canUndo).toBe(false);
    expect(studio.getSnapshot().canRedo).toBe(false);
    expect(studio.getSnapshot().history).toHaveLength(0);
    expect(studio.getSnapshot().dirty).toBe(false);
    expect(studio.getSnapshot().saveState).toBe('idle');
    expect(writes(calls)).toHaveLength(0);
  });

  it('只读时切模式仍然能看：本地生效，但不标脏、不排队保存', async () => {
    const calls: Call[] = [];
    installFetch(calls);
    setStudioReadOnly(true);
    const studio = await readyStudio();
    calls.length = 0;

    studio.setMode('dark');
    expect(studio.getSnapshot().activeMode).toBe('dark');
    // 视图偏好不是"未保存的编辑"：标脏只会让顶栏等一次不会发生的写
    expect(studio.getSnapshot().dirty).toBe(false);
    expect(studio.getSnapshot().saveState).toBe('idle');

    studio.markDirty();
    expect(studio.getSnapshot().dirty).toBe(false);

    await studio.save();
    expect(writes(calls)).toHaveLength(0);
  });

  it('关上闸后同一套入口恢复：编辑生效、补丁保存落库、撤销能回', async () => {
    const calls: Call[] = [];
    installFetch(calls);
    setStudioReadOnly(false);
    const studio = await readyStudio();
    const page = studio.getSnapshot().page!;
    const rootId = page.rootId;
    const originalName = page.nodes[rootId]!.name;
    calls.length = 0;

    studio.execute('改根节点名', [{ op: 'set', nodeId: rootId, path: 'name', value: '改过了' }]);
    expect(studio.getSnapshot().page!.nodes[rootId]!.name).toBe('改过了');
    expect(studio.getSnapshot().canUndo).toBe(true);
    expect(studio.getSnapshot().dirty).toBe(true);

    await studio.save();
    // 有命令补丁时走 PATCH …/design（#62②）：写的是 ops，不是整份文档
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
    expect(calls.find((c) => c.method === 'PATCH')!.url).toBe('/api/projects/p1/design');
    expect(studio.getSnapshot().saveState).toBe('saved');
    expect(studio.getSnapshot().dirty).toBe(false);

    studio.undo();
    expect(studio.getSnapshot().page!.nodes[rootId]!.name).toBe(originalName);
    expect(studio.getSnapshot().canUndo).toBe(false);
    expect(studio.getSnapshot().canRedo).toBe(true);
  });
});

describe('world / game / storyboard 的本地写入也在同一个闸上', () => {
  it('worldStore：只读下建骨架不换本地、不发 PUT；关闸后两条都发生', async () => {
    const calls: Call[] = [];
    installFetch(calls);
    setStudioReadOnly(true);
    worldStore.ensure('p-world-ro');
    await tick();

    await worldStore.createSkeleton('低语诸王');
    expect(worldStore.getSnapshot().world).toBeNull();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);

    setStudioReadOnly(false);
    await worldStore.createSkeleton('低语诸王');
    expect(worldStore.getSnapshot().world).not.toBeNull();
    expect(calls.filter((c) => c.method === 'PUT' && c.url.endsWith('/world'))).toHaveLength(1);
    expect(worldStore.getSnapshot().saveState).toBe('saved');
  });

  it('gameStore：只读下建骨架不换本地、不发 PUT；关闸后两条都发生', async () => {
    const calls: Call[] = [];
    installFetch(calls);
    setStudioReadOnly(true);
    gameStore.ensure('p-game-ro');
    await tick();

    await gameStore.createSkeleton('小游戏');
    expect(gameStore.getSnapshot().game).toBeNull();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);

    setStudioReadOnly(false);
    await gameStore.createSkeleton('小游戏');
    expect(gameStore.getSnapshot().game).not.toBeNull();
    expect(calls.filter((c) => c.method === 'PUT' && c.url.endsWith('/game'))).toHaveLength(1);
    expect(gameStore.getSnapshot().saveState).toBe('saved');
  });

  it('storyboardStore：切分镜、补丁事务、撤销都按闸走', async () => {
    const calls: Call[] = [];
    installFetch(calls);
    setStudioReadOnly(true);
    storyboardStore.ensure('p-sb-ro');
    await tick();

    await storyboardStore.planFrom('第一屏：标题。第二屏：按钮。');
    expect(storyboardStore.getSnapshot().storyboard).toBeNull();
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);

    setStudioReadOnly(false);
    await storyboardStore.planFrom('第一屏：标题。第二屏：按钮。');
    const planned = storyboardStore.getSnapshot().storyboard!;
    expect(planned.shots.length).toBeGreaterThan(1);
    expect(storyboardStore.getSnapshot().canUndo).toBe(false);

    // 只读下的补丁事务：既不改文档，也不往撤销栈里塞一条——栈里留一条撤不动的编辑比没有更糟
    setStudioReadOnly(true);
    storyboardStore.applyOps([{ op: 'moveShot', from: 0, to: 1 }]);
    expect(storyboardStore.getSnapshot().storyboard).toBe(planned);
    expect(storyboardStore.getSnapshot().canUndo).toBe(false);

    setStudioReadOnly(false);
    storyboardStore.applyOps([{ op: 'moveShot', from: 0, to: 1 }]);
    expect(storyboardStore.getSnapshot().canUndo).toBe(true);
    const edited = storyboardStore.getSnapshot().storyboard!;
    expect(edited.shots[0]!.id).not.toBe(planned.shots[0]!.id);
    expect(calls.filter((c) => c.method === 'PUT' && c.url.endsWith('/storyboard')).length).toBe(2);

    // 只读下再切一次分镜：文档不变，撤销栈也不能被 pushTxn 清空（清了就再也撤不回刚才那一刀）
    setStudioReadOnly(true);
    await storyboardStore.planFrom('第三屏：结尾。');
    expect(storyboardStore.getSnapshot().storyboard).toBe(edited);
    expect(storyboardStore.getSnapshot().canUndo).toBe(true);

    storyboardStore.undo();
    expect(storyboardStore.getSnapshot().storyboard).toBe(edited);
    expect(storyboardStore.getSnapshot().canUndo).toBe(true);
    expect(calls.filter((c) => c.method === 'PUT' && c.url.endsWith('/storyboard')).length).toBe(2);
  });
});
