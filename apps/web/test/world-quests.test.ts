import { describe, expect, it } from 'vitest';
import { buildQuestBoard, questDayKey, fnv1a32 } from '../src/lib/worldQuests';
import type { Character } from '@nexus/world-model';
import type { WorldDocument, WorldKind, WorldLink, WorldNode } from '@nexus/world-model';

const T = '2026-01-01T00:00:00.000Z';

const node = (id: string, kind: string, title: string, body = '', lore?: { era?: string; order?: number }): WorldNode =>
  ({ id, kind: kind as WorldKind, title, body, updatedAt: T, ...(lore ? { lore } : {}) });

const link = (id: string, from: string, to: string): WorldLink => ({ id, from, to, label: '关系' });

const world = (nodes: WorldNode[], links: WorldLink[] = []): WorldDocument => ({
  id: 'w1', projectId: 'p1', name: '测试世界', summary: '', nodes, links, positions: {},
  createdAt: T, updatedAt: T,
});

const character = (
  id: string,
  name: string,
  palette: string[] = [],
  relationships: { target: string; kind: string; note: string }[] = [],
): Character => ({
  id,
  projectId: 'p1',
  worldId: 'w1',
  profile: {
    name,
    appearance: '',
    personality: '',
    backstory: '',
    goals: [],
    fears: [],
    relationships,
    voice: { register: '', pace: '', catchphrases: [], notes: '' },
    visualIdentity: { palette, silhouette: '', motifs: [], referenceAssetId: null },
    identity: '',
    style: '',
    clothing: '',
    traits: [],
  },
  createdAt: T,
  updatedAt: T,
});

const at = (iso: string) => new Date(iso);

describe('§WORLD-QUEST 世界委托（真值投影 + 日期轮转）', () => {
  it('空世界：不报「8 项已完成」，全部落到 notStarted，emptyWorld 为真', () => {
    const board = buildQuestBoard({ projectId: 'p1', document: world([]), characters: [], now: at('2026-11-22T10:00:00Z') });
    expect(board.emptyWorld).toBe(true);
    expect(board.open).toEqual([]);
    expect(board.focus).toEqual([]);
    expect(board.rest).toEqual([]);
    expect(board.closed).toEqual([]);
    expect(board.notStarted.map((entry) => entry.kind)).toHaveLength(8);
  });

  it('空页 / 薄节点 / 未标纪元：三个数字与 /integrity 同口径', () => {
    const board = buildQuestBoard({
      projectId: 'p1',
      document: world([
        node('a', 'lore', '空页'),
        node('b', 'lore', '薄注', '短短一句'),
        node('c', 'lore', '厚文', '字'.repeat(120)),
        node('d', 'story', '有纪元的故事', '字'.repeat(120), { era: '灰灯纪', order: 0 }),
        node('e', 'story', '没纪元的故事', '字'.repeat(120), { order: 1 }),
      ]),
      characters: [],
      now: at('2026-11-22T10:00:00Z'),
    });
    const byKind = new Map(board.open.map((entry) => [entry.kind, entry]));
    expect(byKind.get('skeleton')?.count).toBe(1);
    expect(byKind.get('skeleton')?.samples[0]?.label).toBe('空页');
    expect(byKind.get('thin')?.count).toBe(1);
    expect(byKind.get('thin')?.samples[0]?.label).toBe('薄注');
    expect(byKind.get('untagged')?.count).toBe(1);
    expect(byKind.get('untagged')?.samples[0]?.label).toBe('没纪元的故事');
  });

  it('order 撞号：同一纪元同一序号的多余行才计数，样例只列多出来的那条', () => {
    const board = buildQuestBoard({
      projectId: 'p1',
      document: world([
        node('a', 'story', '第一行', '正文', { era: '灰灯纪', order: 3 }),
        node('b', 'story', '第二行', '正文', { era: '灰灯纪', order: 3 }),
        node('c', 'history', '别纪的一行', '正文', { era: '铁月纪', order: 3 }),
        node('d', 'lore', '无关条目', '正文', { era: '灰灯纪', order: 3 }),
      ]),
      characters: [],
      now: at('2026-11-22T10:00:00Z'),
    });
    const clash = board.open.find((entry) => entry.kind === 'order-clash');
    expect(clash?.count).toBe(1);
    expect(clash?.samples).toHaveLength(1);
    expect(['第一行', '第二行']).toContain(clash!.samples[0]!.label);
  });

  it('未解析关系：标签是「谁 → 谁」，不是编出来的 id', () => {
    const board = buildQuestBoard({
      projectId: 'p1',
      document: world([node('a', 'lore', '条目', '正文')]),
      characters: [character('c1', '甲', [], [{ target: '幽灵', kind: '效忠', note: '' }])],
      now: at('2026-11-22T10:00:00Z'),
    });
    const unresolved = board.open.find((entry) => entry.kind === 'unresolved');
    expect(unresolved?.count).toBe(1);
    expect(unresolved?.samples[0]?.label).toBe('甲 → 幽灵');
  });

  it('孤岛与关节来自真图算法（不是页面自己数）', () => {
    const chain = buildQuestBoard({
      projectId: 'p1',
      document: world(
        [node('a', 'lore', '甲', '正文'), node('b', 'lore', '乙', '正文'), node('c', 'lore', '丙', '正文')],
        [link('l1', 'a', 'b'), link('l2', 'b', 'c')],
      ),
      characters: [],
      now: at('2026-11-22T10:00:00Z'),
    });
    expect(chain.open.find((entry) => entry.kind === 'cut-vertex')?.count).toBe(1);
    expect(chain.open.find((entry) => entry.kind === 'cut-vertex')?.samples[0]?.label).toBe('乙');

    const island = buildQuestBoard({
      projectId: 'p1',
      document: world(
        [node('a', 'lore', '甲', '正文'), node('b', 'lore', '乙', '正文'), node('z', 'lore', '孤岛', '正文')],
        [link('l1', 'a', 'b')],
      ),
      characters: [],
      now: at('2026-11-22T10:00:00Z'),
    });
    expect(island.open.find((entry) => entry.kind === 'isolated')?.count).toBe(1);
    expect(island.open.find((entry) => entry.kind === 'isolated')?.samples[0]?.label).toBe('孤岛');
  });

  it('人物色板：有颜色就了结，没人物就不算完成', () => {
    const withPalette = buildQuestBoard({
      projectId: 'p1',
      document: world([node('a', 'lore', '条目', '正文')]),
      characters: [character('c1', '甲', ['#8b5cf6'])],
      now: at('2026-11-22T10:00:00Z'),
    });
    expect(withPalette.closed.some((entry) => entry.kind === 'empty-palette')).toBe(true);

    const noCast = buildQuestBoard({
      projectId: 'p1',
      document: world([node('a', 'lore', '条目', '正文')]),
      characters: [],
      now: at('2026-11-22T10:00:00Z'),
    });
    expect(noCast.notStarted.some((entry) => entry.kind === 'empty-palette')).toBe(true);
    expect(noCast.closed.some((entry) => entry.kind === 'empty-palette')).toBe(false);
  });

  it('今日委托 = open 按日期轮转取前 3；focus + rest 恰好等于 open 的全集', () => {
    const board = buildQuestBoard({
      projectId: 'p1',
      document: world([
        node('a', 'lore', '空页'),
        node('b', 'lore', '薄注', '短'),
        node('c', 'story', '无纪', '正文', { order: 0 }),
        node('d', 'story', '撞一', '正文', { era: '灰', order: 1 }),
        node('e', 'story', '撞二', '正文', { era: '灰', order: 1 }),
        node('z', 'lore', '孤岛', '正文'),
      ]),
      characters: [character('c1', '甲')],
      now: at('2026-11-22T10:00:00Z'),
    });
    expect(board.focus).toHaveLength(3);
    expect(board.focus.length + board.rest.length).toBe(board.open.length);
    const joined = [...board.focus, ...board.rest].map((entry) => entry.kind);
    expect(new Set(joined)).toEqual(new Set(board.open.map((entry) => entry.kind)));
  });

  it('同一天同一世界 = 同一组委托；跨天会轮转（无 Math.random）', () => {
    const document = world([
      node('a', 'lore', '空页'),
      node('b', 'lore', '薄注', '短'),
      node('c', 'story', '无纪', '正文', { order: 0 }),
      node('d', 'story', '撞一', '正文', { era: '灰', order: 1 }),
      node('e', 'story', '撞二', '正文', { era: '灰', order: 1 }),
      node('z', 'lore', '孤岛', '正文'),
    ]);
    const once = buildQuestBoard({ projectId: 'p1', document, characters: [], now: at('2026-11-22T10:00:00Z') });
    const twice = buildQuestBoard({ projectId: 'p1', document, characters: [], now: at('2026-11-22T11:00:00Z') });
    expect(twice.focus).toEqual(once.focus);

    const starts = new Set<string>();
    for (let day = 22; day <= 29; day++) {
      const board = buildQuestBoard({
        projectId: 'p1',
        document,
        characters: [],
        now: at(`2026-11-${String(day).padStart(2, '0')}T10:00:00Z`),
      });
      starts.add(board.focus[0]?.kind ?? 'none');
    }
    expect(starts.size).toBeGreaterThan(1);
  });

  it('委托日固定 UTC+8：20:00Z 已经是第二天', () => {
    expect(questDayKey(at('2026-11-22T10:00:00Z'))).toBe('2026-11-22');
    expect(questDayKey(at('2026-11-22T20:00:00Z'))).toBe('2026-11-23');
  });

  it('FNV-1a 稳定且分布不为常数', () => {
    expect(fnv1a32('p1|2026-11-22')).toBe(fnv1a32('p1|2026-11-22'));
    expect(fnv1a32('p1|2026-11-22')).not.toBe(fnv1a32('p1|2026-11-23'));
  });
});
