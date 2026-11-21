import { describe, expect, it } from 'vitest';
import { buildWorldNetwork } from '../src/lib/worldNetwork';
import type { WorldDocument, WorldKind, WorldLink, WorldNode } from '@nexus/world-model';

const node = (id: string, kind: string, title: string): WorldNode =>
  ({ id, kind: kind as WorldKind, title, body: '', updatedAt: '2026-01-01T00:00:00.000Z' });

const link = (id: string, from: string, to: string, label = '关系'): WorldLink =>
  ({ id, from, to, label });

const world = (nodes: WorldNode[], links: WorldLink[]): WorldDocument => ({
  id: 'w1', projectId: 'p1', name: '测试世界', summary: '', nodes, links, positions: {},
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('§WORLD-NET 万象脉络（图算法纯投影）', () => {
  describe('枢纽榜与守恒', () => {
    it('空世界：零节点、零边、零分量', () => {
      const n = buildWorldNetwork(world([], []));
      expect(n.nodeCount).toBe(0);
      expect(n.linkCount).toBe(0);
      expect(n.hubs).toEqual([]);
      expect(n.bridges).toEqual([]);
      expect(n.weakComponents).toBe(0);
    });

    it('Σ入度 = Σ出度 = 有效边数（守恒律）', () => {
      const n = buildWorldNetwork(world(
        [node('a', 'characters', '甲'), node('b', 'factions', '乙'), node('c', 'items', '丙')],
        [link('l1', 'a', 'b'), link('l2', 'b', 'c'), link('l3', 'a', 'c')],
      ));
      expect(n.linkCount).toBe(3);
      expect(n.hubs.reduce((s, h) => s + h.in, 0)).toBe(3);
      expect(n.hubs.reduce((s, h) => s + h.out, 0)).toBe(3);
    });

    it('枢纽按 in+out 降序，平局时 in 高者先，再按 id 字典序（确定性）', () => {
      const n = buildWorldNetwork(world(
        [node('a', 'characters', '甲'), node('b', 'factions', '乙'), node('c', 'items', '丙')],
        [link('l1', 'b', 'a'), link('l2', 'c', 'a'), link('l3', 'a', 'b')],
      ));
      // a: in2 out1 =3；b: in1 out1 =2；c: in0 out1 =1
      expect(n.hubs.map((h) => h.id)).toEqual(['a', 'b', 'c']);
      expect(n.hubs[0]).toMatchObject({ in: 2, out: 1, kind: 'characters', title: '甲' });
    });

    it('悬空边（端点不在节点表）与自环都不进骨架', () => {
      const n = buildWorldNetwork(world(
        [node('a', 'characters', '甲'), node('b', 'factions', '乙')],
        [link('l1', 'a', 'b'), link('l2', 'a', 'ghost'), link('l3', 'a', 'a')],
      ));
      expect(n.linkCount).toBe(1);
      expect(n.hubs.find((h) => h.id === 'a')!.out).toBe(1);
    });

    it('孤立节点如实列出（字典序）', () => {
      const n = buildWorldNetwork(world(
        [node('z', 'items', '末'), node('a', 'items', '首'), node('b', 'factions', '乙')],
        [link('l1', 'a', 'b')],
      ));
      expect(n.isolated).toEqual(['z']);
      expect(n.weakComponents).toBe(2); // {a,b} 与 {z}
    });
  });

  describe('桥（割边）', () => {
    it('链 a-b-c：两条边都是桥', () => {
      const n = buildWorldNetwork(world(
        [node('a', 'characters', '甲'), node('b', 'factions', '乙'), node('c', 'items', '丙')],
        [link('l1', 'a', 'b', '盟约'), link('l2', 'b', 'c', '债务')],
      ));
      expect(n.bridges).toEqual([
        { from: 'a', to: 'b', label: '盟约' },
        { from: 'b', to: 'c', label: '债务' },
      ]);
      expect(n.weakComponents).toBe(1);
    });

    it('三角环 a→b→c→a：无桥（删任一边仍连通）', () => {
      const n = buildWorldNetwork(world(
        [node('a', 'characters', '甲'), node('b', 'factions', '乙'), node('c', 'items', '丙')],
        [link('l1', 'a', 'b'), link('l2', 'b', 'c'), link('l3', 'c', 'a')],
      ));
      expect(n.bridges).toEqual([]);
      expect(n.weakComponents).toBe(1);
    });

    it('删桥后连通分量真的 +1（用并查集复算，验证桥不是装饰）', () => {
      const nodes = [node('a', 'characters', '甲'), node('b', 'factions', '乙'), node('c', 'items', '丙'), node('d', 'items', '丁')];
      const links = [link('l1', 'a', 'b'), link('l2', 'b', 'c'), link('l3', 'c', 'd')];
      const before = buildWorldNetwork(world(nodes, links));
      expect(before.weakComponents).toBe(1);
      expect(before.bridges.length).toBe(3);
      // 删掉其中一条桥 b-c
      const after = buildWorldNetwork(world(nodes, links.filter((l) => l.id !== 'l2')));
      expect(after.weakComponents).toBe(2); // 真的 +1
    });

    it('环 + 一条尾巴：只有尾巴那条是桥', () => {
      const n = buildWorldNetwork(world(
        [node('a', 'characters', '甲'), node('b', 'factions', '乙'), node('c', 'items', '丙'), node('d', 'items', '丁')],
        [link('l1', 'a', 'b'), link('l2', 'b', 'a'), link('l3', 'b', 'c'), link('l4', 'c', 'd')],
      ));
      // a↔b 是双向（无向成环），b-c-d 是尾巴 → b-c, c-d 是桥，a-b 不是
      expect(n.bridges.map((b) => `${b.from}-${b.to}`)).toEqual(['b-c', 'c-d']);
    });
  });

  describe('强连通分量（势力团）', () => {
    it('a↔b 互达 → 一个 size2 强分量；c 单向指入 → 单独弱分量', () => {
      const n = buildWorldNetwork(world(
        [node('a', 'characters', '甲'), node('b', 'factions', '乙'), node('c', 'items', '丙')],
        [link('l1', 'a', 'b'), link('l2', 'b', 'a'), link('l3', 'c', 'a')],
      ));
      const strong = n.cliques.filter((c) => c.strong);
      expect(strong).toHaveLength(1);
      expect(strong[0]!.members).toEqual(['a', 'b']);
      expect(n.cliques.some((c) => c.members.join() === 'c' && !c.strong)).toBe(true);
      expect(n.cliques[0]!.members.length).toBeGreaterThanOrEqual(n.cliques[n.cliques.length - 1]!.members.length);
    });

    it('全孤立节点：每人一个弱分量，没有强分量', () => {
      const n = buildWorldNetwork(world([node('a', 'characters', '甲'), node('b', 'items', '乙')], []));
      expect(n.cliques).toHaveLength(2);
      expect(n.cliques.every((c) => !c.strong)).toBe(true);
    });
  });

  describe('跨类边聚合', () => {
    it('只聚合不同 kind 的边，按 label 与 (fromKind,toKind) 计数', () => {
      const n = buildWorldNetwork(world(
        [node('a', 'characters', '甲'), node('b', 'factions', '乙'), node('c', 'factions', '丙')],
        [link('l1', 'a', 'b', '效忠'), link('l2', 'a', 'c', '效忠'), link('l3', 'b', 'c', '结盟')],
      ));
      expect(n.crossKind).toHaveLength(1); // 只有效忠是跨类；结盟是 factions→factions 同类不进
      const loyal = n.crossKind.find((e) => e.label === '效忠')!;
      expect(loyal.count).toBe(2);
      expect(loyal.pairs).toEqual([{ fromKind: 'characters', toKind: 'factions', count: 2 }]);
      expect(n.crossKind.some((e) => e.label === '结盟')).toBe(false); // 同类边不进跨类表
    });
  });

  describe('确定性', () => {
    it('双跑深相等；边输入顺序打乱结果不变（次级键 id 兜底）', () => {
      const nodes = [node('a', 'characters', '甲'), node('b', 'factions', '乙'), node('c', 'items', '丙')];
      const links = [link('l1', 'a', 'b'), link('l2', 'b', 'c'), link('l3', 'a', 'c')];
      const one = buildWorldNetwork(world(nodes, links));
      const two = buildWorldNetwork(world(nodes, links));
      expect(one).toEqual(two);
      expect(buildWorldNetwork(world(nodes, links.slice().reverse()))).toEqual(one);
    });

    it('大环 2000 节点不爆栈（迭代 DFS 的 OS 层约束）', () => {
      const nodes = Array.from({ length: 2000 }, (_, i) => node(`n${i}`, 'items', `条目${i}`));
      const links = nodes.slice(1).map((n, i) => link(`l${i}`, `n${i}`, n.id));
      const out = buildWorldNetwork(world(nodes, links));
      expect(out.nodeCount).toBe(2000);
      expect(out.linkCount).toBe(1999);
      expect(out.bridges.length).toBe(1999); // 一条长链，每条都是桥
    });
  });
});
