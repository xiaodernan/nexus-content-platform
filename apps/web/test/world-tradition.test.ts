import { describe, expect, it } from 'vitest';
import type { WorldDocument, WorldNode } from '@nexus/world-model';
import { buildWorldTraditions, traditionsOnDay } from '@/lib/worldTraditions';

const node = (id: string, title: string): WorldNode => ({ id, kind: 'story', title, body: 'b', updatedAt: '2026-11-25T00:00:00Z' });
const world: WorldDocument = {
  id: 'world-trad-1', projectId: null, name: '测试世界', summary: 's',
  nodes: [node('a', '晨钟'), node('b', '盐路'), node('c', '夜渡')],
  links: [], positions: {}, createdAt: '2026-11-25T00:00:00Z', updatedAt: '2026-11-25T00:00:00Z',
};

describe('worldTraditions（世界传统·确定性）', () => {
  it('同一世界同输出；节庆名来自真节点标题', () => {
    const ts = buildWorldTraditions(world);
    expect(ts).toEqual(buildWorldTraditions(world));
    const titles = new Map(world.nodes.map((n) => [n.id, n.title]));
    for (const t of ts) expect(t.name).toBe(`${titles.get(t.originNodeId)}之节`);
  });

  it('空世界返回 []', () => {
    expect(buildWorldTraditions({ ...world, nodes: [] })).toEqual([]);
  });

  it('weekday 0-6；非法日返回 []；traditionsOnDay 只给当天', () => {
    const ts = buildWorldTraditions(world);
    for (const t of ts) {
      expect(t.weekday).toBeGreaterThanOrEqual(0);
      expect(t.weekday).toBeLessThanOrEqual(6);
    }
    expect(traditionsOnDay(world, -1)).toEqual([]);
    expect(traditionsOnDay(world, 7)).toEqual([]);
    expect(traditionsOnDay(world, ts[0]!.weekday)).toEqual(ts.filter((t) => t.weekday === ts[0]!.weekday));
  });
});
