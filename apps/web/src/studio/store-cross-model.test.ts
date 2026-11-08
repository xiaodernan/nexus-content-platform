import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDocument,
  createNode,
  type DesignDocument,
  type DesignNode,
} from '@nexus/creative-model';
import { createWorld, addWorldNode } from '@nexus/world-model';
import { createGame, addEntity } from '@nexus/game-model';
import { planStoryboard } from '@nexus/video-model';
import { studio } from '@/studio/store';
import { worldStore } from '@/studio/worldStore';
import { gameStore } from '@/studio/gameStore';
import { storyboardStore } from '@/studio/storyboardStore';
import { setStudioReadOnly } from '@/studio/read-only';

/**
 * §16 / §159 · 跨模型「集大成」合成：把 design / world / game / video 四个模型实例
 * 同时灌进 studio 的四个 store（design 走 `studio`、其余走各自 `setLocal`），
 * 钉运行时状态层的组合不变式——模型层有 `project-bundle` eval 钉，这条钉**应用状态层**：
 *   1. 四个 store 各自 bootstrap/setLocal 后，快照都反映自己的模型实例（design 含 hero 节点、
 *      world 含 lore 条目、game 含 enemy 实体、storyboard 含镜头）；
 *   2. 跨模型 id 命名空间无碰撞（平台全局唯一 id 纪律在运行时状态层同样成立）；
 *   3. 四库在同一次测试运行时共存，不因相互覆盖而丢数据。
 *
 * 沿用 store-selection-stress.test.ts 的离线套路：fetch 钉成立刻失败走 catch 分支，
 * 纯内存验证，不碰任何 provider。
 */

function designDoc(): { doc: DesignDocument; heroId: string } {
  const doc = createDocument('合成设计', 'website');
  const page = doc.pages.find((p) => p.id === doc.activePageId)!;
  const hero: DesignNode = createNode({
    type: 'container',
    name: 'Hero',
    parentId: page.rootId,
  });
  page.nodes[hero.id] = hero;
  page.nodes[page.rootId]!.children = [hero.id];
  return { doc, heroId: hero.id };
}

describe('studio 跨模型合成：四库同存（集大成 应用状态层）', () => {
  beforeEach(() => {
    setStudioReadOnly(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    studio.clearSelection();
    worldStore.setLocal(createWorld('reset'));
    gameStore.setLocal(createGame('reset'));
    storyboardStore.setLocal(planStoryboard('reset'));
  });

  it('四库各自 bootstrap/setLocal 后快照都反映自己的模型实例', () => {
    const { doc, heroId } = designDoc();
    const world = addWorldNode(createWorld('合成世界'), {
      kind: 'lore',
      title: '起源',
    });
    const game = addEntity(createGame('合成游戏'), {
      kind: 'enemy',
      name: '守门人',
    });
    const storyboard = planStoryboard('开场。探索。决战。');

    studio.bootstrap(doc);
    worldStore.setLocal(world);
    gameStore.setLocal(game);
    storyboardStore.setLocal(storyboard);

    const dSnap = studio.getSnapshot();
    const wSnap = worldStore.getSnapshot();
    const gSnap = gameStore.getSnapshot();
    const sSnap = storyboardStore.getSnapshot();

    expect(dSnap.page?.nodes[heroId]).toBeDefined();
    expect(wSnap.world?.nodes.some((n) => n.title === '起源')).toBe(true);
    expect(gSnap.game?.entities.some((e) => e.name === '守门人')).toBe(true);
    expect(sSnap.storyboard?.shots.length).toBe(3);
  });

  it('跨模型 id 命名空间无碰撞（design+world+game+video 全唯一）', () => {
    const { doc } = designDoc();
    const world = addWorldNode(createWorld('合成世界'), {
      kind: 'lore',
      title: '起源',
    });
    const game = addEntity(createGame('合成游戏'), {
      kind: 'enemy',
      name: '守门人',
    });
    const storyboard = planStoryboard('开场。探索。决战。');

    studio.bootstrap(doc);
    worldStore.setLocal(world);
    gameStore.setLocal(game);
    storyboardStore.setLocal(storyboard);

    const designPage = studio.getSnapshot().page!;
    const ids: string[] = [
      ...Object.keys(designPage.nodes),
      ...(worldStore.getSnapshot().world?.nodes.map((n) => n.id) ?? []),
      ...(gameStore.getSnapshot().game?.entities.map((e) => e.id) ?? []),
      ...(storyboardStore.getSnapshot().storyboard?.shots.map((s) => s.id) ?? []),
    ];
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('四库在同一运行时共存且互不覆盖', () => {
    const { doc, heroId } = designDoc();
    const world = addWorldNode(createWorld('合成世界'), {
      kind: 'lore',
      title: '起源',
    });
    const game = addEntity(createGame('合成游戏'), {
      kind: 'enemy',
      name: '守门人',
    });
    const storyboard = planStoryboard('开场。探索。决战。');

    studio.bootstrap(doc);
    worldStore.setLocal(world);
    // 中段再动 world，确认不会把 design/game/video 冲掉
    worldStore.setLocal(addWorldNode(world, { kind: 'geography', title: '广场' }));
    gameStore.setLocal(game);
    storyboardStore.setLocal(storyboard);

    // design 仍在
    expect(studio.getSnapshot().page?.nodes[heroId]).toBeDefined();
    // world 含两条（起源 + 广场）
    const wNodes = worldStore.getSnapshot().world?.nodes ?? [];
    expect(wNodes.filter((n) => n.title === '起源').length).toBe(1);
    expect(wNodes.filter((n) => n.title === '广场').length).toBe(1);
    // game / video 未被覆盖
    expect(
      gameStore.getSnapshot().game?.entities.some((e) => e.name === '守门人'),
    ).toBe(true);
    expect(storyboardStore.getSnapshot().storyboard?.shots.length).toBe(3);
  });
});
