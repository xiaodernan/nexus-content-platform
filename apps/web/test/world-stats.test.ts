import { describe, expect, it } from 'vitest';
import { createWorld, addWorldNode, updateWorldNode } from '@nexus/world-model';
import { formatWorldStats, worldStats } from '../src/lib/worldStats';

function sample() {
  let w = createWorld('测试世界', 'p1');
  w = addWorldNode(w, { kind: 'lore', title: '传说', body: '有正文' });
  w = addWorldNode(w, { kind: 'history', title: '历史', body: '  ' });
  const id = w.nodes[w.nodes.length - 1]!.id;
  w = updateWorldNode(w, id, { lore: { era: '灰灯纪', memory: '盐味' } });
  return w;
}

describe('worldStats · 世界规模读数', () => {
  it('只数有正文的条目，纪元/回声按真实字段数', () => {
    const s = worldStats(sample());
    expect(s.kinds).toBe(9);
    expect(s.entries).toBeGreaterThanOrEqual(2);
    expect(s.filledEntries).toBe(1);
    expect(s.filledKinds).toBe(1);
    expect(s.eras).toBe(1);
    expect(s.echoes).toBe(1);
    expect(s.fillRate).not.toBeNull();
  });

  it('没有条目时 fillRate=null，措辞说"还没有条目"而不是 0%', () => {
    const w = { ...createWorld('空世界', 'p1'), nodes: [] };
    const s = worldStats(w);
    expect(s.fillRate).toBeNull();
    expect(formatWorldStats(s, 'zh')).toContain('还没有条目');
    expect(formatWorldStats(s, 'en')).toContain('no entries yet');
  });

  it('中英读数各自成句，不夹另一种语言', () => {
    const zh = formatWorldStats(worldStats(sample()), 'zh');
    const en = formatWorldStats(worldStats(sample()), 'en');
    expect(zh).toContain('类有正文');
    expect(en).toContain('sections with content');
    expect(en).not.toContain('类有正文');
  });
});
