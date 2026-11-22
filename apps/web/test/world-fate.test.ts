import { describe, expect, it } from 'vitest';
import { rollFate, type FateNode } from '../src/lib/worldFate';

const nodes: FateNode[] = [
  { id: 'a', kind: 'geography', title: '盐道', body: '路面泛白，石缝积盐。', lore: { memory: '咸味贴着鞋底。' } },
  { id: 'b', kind: 'factions', title: '潮候院', body: '以老石磨记时。' },
  { id: 'c', kind: 'items', title: '空盒', body: '   ' },
];

describe('worldFate · 命运骰（确定性重组，零编造）', () => {
  it('同一个 seed + 同一个世界 ⇒ 同一张卡', () => {
    const a = rollFate(nodes, 7);
    const b = rollFate(nodes, 7);
    expect(a).toEqual(b);
  });
  it('换 seed 会换组合/句式，但只引用已有条目', () => {
    const cards = new Set([1, 2, 3, 4, 5, 6].map((s) => JSON.stringify(rollFate(nodes, s))));
    expect(cards.size).toBeGreaterThan(1);
    for (const s of [1, 2, 3, 4, 5, 6]) {
      const card = rollFate(nodes, s)!;
      for (const id of card.sourceIds) expect(nodes.some((n) => n.id === id)).toBe(true);
      expect(card.body).toContain(card.title.split(' × ')[0]);
    }
  });
  it('跳过空壳；不足两条有正文的条目返回 null', () => {
    expect(rollFate(nodes, 1)?.sourceIds).not.toContain('c');
    expect(rollFate([nodes[0]!, nodes[2]!], 1)).toBeNull();
  });
  it('优先用条目的记忆回声作感官细节', () => {
    const card = rollFate(nodes, 1)!;
    // 抽到盐道作 a 时必带记忆；抽到别的条目时 body 来自该条目本身，仍不含编造占位
    expect(card.body).not.toContain('undefined');
    expect(card.body.length).toBeGreaterThan(20);
  });
});
