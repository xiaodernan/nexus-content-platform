import { describe, expect, it } from 'vitest';
import type { Character } from '@nexus/world-model';
import { buildConstellation } from '../src/lib/constellation';

function char(id: string, name: string, relationships: Character['profile']['relationships'] = [], palette: string[] = []): Character {
  return {
    id,
    projectId: 'prj',
    worldId: 'w',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    profile: {
      name,
      appearance: '',
      personality: '',
      backstory: '',
      goals: [],
      fears: [],
      relationships,
      voice: { register: '', pace: '', catchphrases: [], notes: '' },
      visualIdentity: { palette, silhouette: '', motifs: [], referenceAssetId: null },
      identity: '',
      style: '',
      clothing: '',
      traits: [],
    },
  };
}

const WORLD = [
  { id: 'w-苍雪盟约', title: '苍雪盟约' },
  { id: 'w-北境', title: '北境' },
];

describe('buildConstellation（星座图布局）', () => {
  it('相同输入永远摆出同一张图（无随机、无 Date 依赖）', () => {
    const a = [char('1', '守夜人', [{ target: '2', kind: '效忠', note: '' }]), char('2', '盟约主席')];
    const g1 = buildConstellation(a, WORLD);
    const g2 = buildConstellation(a, WORLD);
    expect(g1).toEqual(g2);
  });

  it('双向关系合并成一条边，reverse 带着反向 kind/note', () => {
    const a = [
      char('1', '守夜人', [{ target: '2', kind: '效忠', note: '他是我的王' }]),
      char('2', '盟约主席', [{ target: '1', kind: '统辖', note: '影子的暗线' }]),
    ];
    const g = buildConstellation(a, WORLD);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0]).toMatchObject({
      from: '1',
      to: '2',
      kind: '效忠',
      note: '他是我的王',
      reverse: { kind: '统辖', note: '影子的暗线' },
    });
  });

  it('指向世界条目的关系进 worldAnchors，不画成角色边', () => {
    const a = [char('1', '守夜人', [{ target: 'w-苍雪盟约', kind: '效忠', note: '盟约' }])];
    const g = buildConstellation(a, WORLD);
    expect(g.edges).toHaveLength(0);
    expect(g.worldAnchors).toEqual([{ id: 'w-苍雪盟约', label: '苍雪盟约', angle: expect.any(Number) }]);
    expect(g.worldLinked).toBe(1);
    expect(g.unresolved).toHaveLength(0);
  });

  it('两端都解析不出的关系进 unresolved，不画；总数有报数', () => {
    const a = [char('1', '守夜人', [{ target: '不存在于世的名字', kind: '仇恨', note: '也许他在梦里' }])];
    const g = buildConstellation(a, WORLD);
    expect(g.unresolved).toHaveLength(1);
    expect(g.totalRelationships).toBe(1);
    expect(g.unresolved[0]).toMatchObject({ ownerName: '守夜人', kind: '仇恨', target: '不存在于世的名字' });
  });

  it('度数高者排在中心位（root）；按名字稳定 tie-break', () => {
    const a = [
      char('3', '普通人甲'),
      char('1', '枢轴人物', [{ target: '2', kind: 'x', note: '' }, { target: '3', kind: 'y', note: '' }]),
      char('2', '普通人乙'),
    ];
    const g = buildConstellation(a, WORLD);
    expect(g.nodes[0]?.id).toBe('1');
  });

  it('palette 只保留合法 hex，非法丢弃', () => {
    const a = [char('1', '守夜人', [], ['#fff', 'not-a-color', '#191923', 'rgb(1,2,3)'])];
    const g = buildConstellation(a, WORLD);
    expect(g.nodes[0]?.palette).toEqual(['#fff', '#191923']);
  });

  it('空 relationships / 空 target 不算关系；degree=0，不上边', () => {
    const a = [char('1', '甲'), char('2', '乙', [{ target: '', kind: '', note: '' }])];
    const g = buildConstellation(a, WORLD);
    expect(g.totalRelationships).toBe(0);
    expect(g.nodes.every((n) => n.degree === 0)).toBe(true);
  });
});
