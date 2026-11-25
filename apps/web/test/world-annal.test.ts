import { describe, expect, it } from 'vitest';
import type { WorldDocument, WorldNode } from '@nexus/world-model';
import { UNDATED_ERA, annalsInEra, buildWorldAnnals } from '@/lib/worldAnnals';

const node = (id: string, title: string, era?: string, order?: number): WorldNode => ({
  id, kind: 'story', title, body: 'b', updatedAt: '2026-11-25T00:00:00Z',
  ...(era !== undefined || order !== undefined ? { lore: { ...(era !== undefined ? { era } : {}), ...(order !== undefined ? { order } : {}) } } : {}),
});
const world: WorldDocument = {
  id: 'world-annal-1', projectId: null, name: '测试世界', summary: 's',
  nodes: [node('a', '甲', '后纪元', 2), node('b', '乙', '前纪元', 1), node('c', '丙')],
  links: [], positions: {}, createdAt: '2026-11-25T00:00:00Z', updatedAt: '2026-11-25T00:00:00Z',
};

describe('worldAnnals（世界编年·确定性）', () => {
  it('同输入同输出；按纪元升序排列，缺纪元归「未标纪元」', () => {
    const a = buildWorldAnnals(world);
    expect(a).toEqual(buildWorldAnnals(world));
    expect(a.map((x) => x.nodeId)).toEqual(['b', 'a', 'c']);
    expect(a[2]!.era).toBe(UNDATED_ERA);
  });

  it('每条大事的 title/nodeId 来自真节点，不编年份', () => {
    const titles = new Map(world.nodes.map((n) => [n.id, n.title]));
    for (const a of buildWorldAnnals(world)) expect(a.title).toBe(titles.get(a.nodeId));
  });

  it('annalsInEra 只给该纪元；未知纪元返回 []', () => {
    expect(annalsInEra(world, '前纪元').map((a) => a.nodeId)).toEqual(['b']);
    expect(annalsInEra(world, '不存在的纪元')).toEqual([]);
  });

  it('空世界返回 []', () => {
    expect(buildWorldAnnals({ ...world, nodes: [] })).toEqual([]);
  });
});
