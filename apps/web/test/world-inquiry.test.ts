import { describe, expect, it } from 'vitest';
import type { WorldDocument, WorldNode } from '@nexus/world-model';
import { buildWorldInquiries, completeInquiry, playInquiry } from '@/lib/worldInquiries';

function makeWorld(nodes: WorldNode[], id = 'world-inquiry-1'): WorldDocument {
  return {
    id,
    projectId: null,
    name: '测试世界',
    summary: 's',
    nodes,
    links: [],
    positions: {},
    createdAt: '2026-11-25T00:00:00Z',
    updatedAt: '2026-11-25T00:00:00Z',
  };
}

const node = (id: string, title: string, body = 'x'.repeat(70)): WorldNode => ({
  id,
  kind: 'story',
  title,
  body,
  updatedAt: '2026-11-25T00:00:00Z',
});

describe('worldInquiries（世界线索·确定性）', () => {
  it('同一世界永远同输出：确定性哈希 + LCG，两次调用一字不差', () => {
    const world = makeWorld([node('a', '节点A'), node('b', '节点B'), node('c', '节点C'), node('d', '节点D')]);
    expect(buildWorldInquiries(world)).toEqual(buildWorldInquiries(world));
  });

  it('世界连 2 个节点以上才生产，1 个或空返回 []（不编）', () => {
    expect(buildWorldInquiries(makeWorld([node('a', 'A')]))).toEqual([]);
    expect(buildWorldInquiries(makeWorld([]))).toEqual([]);
    const world = makeWorld([node('a', 'A'), node('b', 'B')]);
    expect(buildWorldInquiries(world).length).toBeGreaterThanOrEqual(1);
  });

  it('线索的每个可指认 label 都来自真节点 title（0 编）', () => {
    const titles = new Set([node('a', '真节点甲').title, node('b', '真节点乙').title, node('c', '真节点丙').title, node('d', '真节点丁').title]);
    for (const inq of buildWorldInquiries(makeWorld([node('a', '真节点甲'), node('b', '真节点乙'), node('c', '真节点丙'), node('d', '真节点丁')]))) {
      for (const c of inq.clues) expect(titles.has(c.label)).toBe(true);
      expect(inq.targetNodeIds.every((id) => ['a', 'b', 'c', 'd'].includes(id))).toBe(true);
    }
  });

  it('completeInquiry：全部线索才 complete，部分线索只给 found/total', () => {
    const inq = buildWorldInquiries(makeWorld([node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')]))[0]!;
    expect(completeInquiry(inq, new Set())).toMatchObject({ found: 0, complete: false });
    const all = inq.clues.map((c) => c.id);
    const half = new Set(all.slice(0, Math.floor(all.length / 2)));
    expect(completeInquiry(inq, half)).toMatchObject({ complete: false });
    expect(completeInquiry(inq, new Set(all)).complete).toBe(true);
  });

  it('id 唯一、结论引用真节点 id', () => {
    const world = makeWorld([node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')]);
    const inqs = buildWorldInquiries(world);
    expect(new Set(inqs.map((i) => i.id)).size).toBe(inqs.length);
    for (const inq of inqs) expect(inq.resolution).toContain(inq.targetNodeIds[0]);
  });

  it('playInquiry 按序取，越界返回 null', () => {
    const world = makeWorld([node('a', 'A'), node('b', 'B'), node('c', 'C'), node('d', 'D')]);
    const n = buildWorldInquiries(world).length;
    expect(playInquiry(world, 0)).not.toBeNull();
    expect(playInquiry(world, n)).toBeNull();
  });
});
