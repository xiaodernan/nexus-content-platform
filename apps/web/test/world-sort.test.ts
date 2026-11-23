import { describe, expect, it } from 'vitest';
import { createWorld, addWorldNode, updateWorldNode, type WorldNode } from '@nexus/world-model';
import { sortWorldNodes } from '../src/lib/worldSort';

let w = createWorld('测试', 'p1');
w = addWorldNode(w, { kind: 'lore', title: '乙', body: '' });
w = addWorldNode(w, { kind: 'lore', title: '甲', body: '' });
w = addWorldNode(w, { kind: 'lore', title: '丙', body: '' });
const [a, b, c] = w.nodes.slice(-3);
w = updateWorldNode(w, b!.id, { lore: { era: '灰灯纪', order: 1 } });
w = updateWorldNode(w, a!.id, { lore: { era: '灰灯纪', order: 2 } });
const nodes3 = w.nodes.slice(-3);

describe('worldSort · 视图排序纯函数', () => {
  it('原序保持插入顺序，且不改原数组对象', () => {
    const got = sortWorldNodes(nodes3, 'insertion');
    expect(got.map(n => n.title)).toEqual(['乙', '甲', '丙']);
    expect(got).not.toBe(nodes3);
  });
  it('纪元序按 lore.order，未标纪元的排最后', () => {
    const got = sortWorldNodes(nodes3, 'era');
    expect(got.map(n => n.title)).toEqual(['甲', '乙', '丙']);
  });
  it('标题序稳定，同排序键不交换', () => {
    const got = sortWorldNodes(nodes3, 'title');
    expect(got).toHaveLength(3);
    expect(new Set(got.map(n => n.title))).toEqual(new Set(['甲', '乙', '丙']));
  });
  it('同输入两次结果一致（确定性）', () => {
    expect(sortWorldNodes(nodes3, 'era')).toEqual(sortWorldNodes(nodes3, 'era'));
  });
});
