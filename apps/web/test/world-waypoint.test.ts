import { describe, expect, it } from 'vitest';
import type { WorldDocument, WorldNode } from '@nexus/world-model';
import { buildWorldWaypoints, routeBetween } from '@/lib/worldWaypoints';

function makeWorld(nodes: WorldNode[], id = 'world-waypoint-1'): WorldDocument {
  return { id, projectId: null, name: '测试世界', summary: 's', nodes, links: [], positions: {}, createdAt: '2026-11-25T00:00:00Z', updatedAt: '2026-11-25T00:00:00Z' };
}

const node = (id: string, title: string): WorldNode => ({ id, kind: 'story', title, body: 'body', updatedAt: '2026-11-25T00:00:00Z' });

describe('worldWaypoints（世界远行路径·确定性）', () => {
  const world = makeWorld([node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D'), node('e', 'E')]);

  it('同一世界永远同输出', () => {
    expect(buildWorldWaypoints(world)).toEqual(buildWorldWaypoints(world));
  });

  it('端点必须是真 node id，且 != 起点', () => {
    const ids = new Set(world.nodes.map((n) => n.id));
    for (const w of buildWorldWaypoints(world)) {
      expect(ids.has(w.fromNodeId)).toBe(true);
      expect(ids.has(w.toNodeId)).toBe(true);
      expect(w.fromNodeId).not.toBe(w.toNodeId);
    }
  });

  it('至少 2 个节点时每个节点有 >= 1 条出行；节点 < 2 返回 []', () => {
    expect(buildWorldWaypoints(makeWorld([node('a', 'A')]))).toEqual([]);
    const routes = buildWorldWaypoints(world, 2);
    const byFrom = new Map<string, number>();
    for (const r of routes) byFrom.set(r.fromNodeId, (byFrom.get(r.fromNodeId) ?? 0) + 1);
    for (const n of world.nodes) expect((byFrom.get(n.id) ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it('risk ∈ {low, normal, high}，distance 在 5–55 之间（真定义域）', () => {
    for (const w of buildWorldWaypoints(world)) {
      expect(['low', 'normal', 'high']).toContain(w.risk);
      expect(w.distance).toBeGreaterThanOrEqual(5);
      expect(w.distance).toBeLessThanOrEqual(54.9);
    }
  });

  it('routeBetween 按端点找，找不到返回 null', () => {
    const ws = buildWorldWaypoints(world);
    const w = ws[0]!;
    expect(routeBetween(world, w.fromNodeId, w.toNodeId)?.id).toBe(w.id);
    expect(routeBetween(world, 'no-such-id', w.toNodeId)).toBeNull();
  });
});
