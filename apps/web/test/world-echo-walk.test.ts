import { describe, expect, it } from 'vitest';
import { createWorld, addWorldNode, updateWorldNode } from '@nexus/world-model';
import { buildEchoWalk, formatEchoStep } from '../src/lib/worldEchoWalk';

function world() {
  let w = createWorld('回声测试', 'p1');
  w = { ...w, nodes: w.nodes.slice(0, 3) };
  w = updateWorldNode(w, w.nodes[0]!.id, { title: '盐道', lore: { era: '灰灯纪', order: 2, memory: '咸味贴着鞋底。' } });
  w = updateWorldNode(w, w.nodes[1]!.id, { title: '石磨', lore: { era: '灰灯纪', order: 1, memory: '磨盘声在雾里传得很远。' } });
  w = updateWorldNode(w, w.nodes[2]!.id, { title: '灯下人', lore: { memory: '灯芯爆了一声。' } });
  return w;
}

describe('worldEchoWalk · 回声步道', () => {
  it('只收有 memory 的条目，按 era/order 稳定排序（同纪元 order 小的先）', () => {
    const walk = buildEchoWalk(world());
    expect(walk.total).toBe(3);
    expect(walk.steps.map(s => s.title)).toEqual(['石磨', '盐道', '灯下人']);
    expect(walk.steps[0]!.index).toBe(1);
    expect(walk.steps[0]!.memory).toBe('磨盘声在雾里传得很远。');
  });

  it('每条都标 sourceId，且不编造记忆（逐字来自 lore.memory）', () => {
    const w = world();
    const walk = buildEchoWalk(w);
    for (const s of walk.steps) {
      const node = w.nodes.find(n => n.id === s.sourceId)!;
      expect(s.memory).toBe(node.lore!.memory!.trim());
    }
  });

  it('limit 生效，hasMore 如实；无记忆时 steps 空', () => {
    const walk = buildEchoWalk(world(), 2);
    expect(walk.steps).toHaveLength(2);
    expect(walk.hasMore).toBe(true);
    const empty = { ...createWorld('空', 'p1'), nodes: [] };
    expect(buildEchoWalk(empty).steps).toEqual([]);
  });

  it('同输入两次逐字相同（确定性、零随机；sourceId 由 createWorld 随机生成，比可读结构）', () => {
    const shape = (w: ReturnType<typeof world>) => buildEchoWalk(w).steps.map(s => ({ index: s.index, title: s.title, memory: s.memory, era: s.era }));
    expect(shape(world())).toEqual(shape(world()));
  });

  it('双语读数各自成句', () => {
    const s = buildEchoWalk(world()).steps[0]!;
    expect(formatEchoStep(s, 'zh')).toContain('第 1 回响 · 石磨');
    expect(formatEchoStep(s, 'zh')).toContain('灰灯纪');
    expect(formatEchoStep(s, 'en')).toContain('Echo 1');
  });
});
