import { describe, expect, it } from 'vitest';
import { createWorld, linkWorldNodes, updateWorldNode } from '@nexus/world-model';
import { formatWorldCohesion, worldCohesion } from '../src/lib/worldCohesion';

function two() {
  let w = createWorld('c', 'p1');
  w = { ...w, nodes: w.nodes.slice(0, 2) };
  w = updateWorldNode(w, w.nodes[0]!.id, { title: 'A', body: '甲' });
  w = updateWorldNode(w, w.nodes[1]!.id, { title: 'B', body: '乙' });
  return w;
}

describe('worldCohesion · 世界连通度', () => {
  it('无关系时两条都算孤岛，连通块=2，touched=0', () => {
    const c = worldCohesion(two());
    expect(c.nodes).toBe(2);
    expect(c.links).toBe(0);
    expect(c.isolated).toBe(2);
    expect(c.components).toBe(2);
    expect(c.touched).toBe(0);
  });

  it('连一条后无孤岛、连通块=1、touched=1', () => {
    const w = two();
    const linked = linkWorldNodes(w, w.nodes[0]!.id, w.nodes[1]!.id, '同纪元').document;
    const c = worldCohesion(linked);
    expect(c.links).toBe(1);
    expect(c.isolated).toBe(0);
    expect(c.components).toBe(1);
    expect(c.touched).toBe(1);
  });

  it('没有条目时 touched=null，不画 0%', () => {
    const c = worldCohesion({ ...createWorld('空', 'p1'), nodes: [] });
    expect(c.touched).toBeNull();
    expect(formatWorldCohesion(c, 'zh')).toContain('还没有条目');
    expect(formatWorldCohesion(c, 'en')).toContain('no entries yet');
  });

  it('中英各自成句，孤岛时给可执行下一步', () => {
    const c = worldCohesion(two());
    const zh = formatWorldCohesion(c, 'zh');
    const en = formatWorldCohesion(c, 'en');
    expect(zh).toContain('连通度');
    expect(zh).toContain('串联建议');
    expect(en).toContain('Cohesion');
    expect(en).toContain('weave-all');
    expect(en).not.toContain('连通度');
  });
});
