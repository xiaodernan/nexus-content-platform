import { describe, expect, it } from 'vitest';
import { createWorld, addWorldNode, updateWorldNode } from '@nexus/world-model';
import { filterWorldNodes } from '../src/lib/worldFilter';

let w = createWorld('测试', 'p1');
w = addWorldNode(w, { kind: 'geography', title: '盐道', body: '路面泛白，石缝积盐。' });
const salt = w.nodes[w.nodes.length - 1]!.id;
w = updateWorldNode(w, salt, { lore: { era: '灰灯纪', memory: '咸味贴着鞋底。' } });
w = addWorldNode(w, { kind: 'factions', title: '潮候院', body: '以老石磨记时。' });
w = addWorldNode(w, { kind: 'items', title: 'SaltJar', body: 'a jar of salt' });

describe('worldFilter · 条目筛选纯函数', () => {
  it('空查询返回全部（新数组，不改原数组）', () => {
    const got = filterWorldNodes(w.nodes, '   ');
    expect(got).toHaveLength(w.nodes.length);
    expect(got).not.toBe(w.nodes);
  });
  it('按标题/正文/纪元/记忆命中', () => {
    expect(filterWorldNodes(w.nodes, '盐道').map(n => n.title)).toContain('盐道');
    expect(filterWorldNodes(w.nodes, '石缝').map(n => n.title)).toContain('盐道');
    expect(filterWorldNodes(w.nodes, '灰灯纪').map(n => n.title)).toContain('盐道');
    expect(filterWorldNodes(w.nodes, '鞋底').map(n => n.title)).toContain('盐道');
  });
  it('大小写不敏感、无命中给空', () => {
    expect(filterWorldNodes(w.nodes, 'SALT').map(n => n.title)).toContain('SaltJar');
    expect(filterWorldNodes(w.nodes, '不存在的词')).toEqual([]);
  });
});
