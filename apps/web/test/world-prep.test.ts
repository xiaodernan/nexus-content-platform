import { describe, expect, it } from 'vitest';
import type { WorldDocument, WorldNode } from '@nexus/world-model';
import { buildPlaythrough } from '@/lib/worldPrep';

const node = (id: string, title: string): WorldNode => ({ id, kind: 'story', title, body: 'b', updatedAt: '2026-11-25T00:00:00Z' });
const world: WorldDocument = {
  id: 'world-prep-1', projectId: null, name: '测试世界', summary: 's',
  nodes: [node('a', 'A'), node('b', 'B'), node('c', 'C')],
  links: [], positions: {}, createdAt: '2026-11-25T00:00:00Z', updatedAt: '2026-11-25T00:00:00Z',
};

describe('worldPrep（新手预演·确定性）', () => {
  it('同一世界永远同输出，step id 唯一', () => {
    const s = buildPlaythrough(world);
    expect(s).toEqual(buildPlaythrough(world));
    expect(new Set(s.map((x) => x.id)).size).toBe(s.length);
    expect(s.length).toBeGreaterThanOrEqual(1);
  });

  it('节点 < 2 时只给进入/兜底步骤', () => {
    const one = { ...world, nodes: [node('a', 'A')] };
    expect(buildPlaythrough(one)).toHaveLength(1);
  });

  it('step 里 tool 指向这个模块族里真函数', () => {
    const tools = buildPlaythrough(world).map((s) => s.tool).filter(Boolean);
    for (const t of tools) expect(['worldInquiries.buildWorldInquiries', 'worldWaypoints.buildWorldWaypoints', 'worldSeasons.seasonAtDay', 'worldEchoWalk.buildEchoWalk']).toContain(t);
  });
});
