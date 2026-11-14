import { describe, expect, it } from 'vitest';
import { buildChronicle, UNLABELED_ERA, eraProgress, type ChronicleNodeInput } from '../src/lib/chronicle';

function node(id: string, kind: string, title: string, era?: string, order?: number, updatedAt = '2026-01-01T00:00:00.000Z'): ChronicleNodeInput {
  return { id, kind, title, updatedAt, lore: era === undefined && order === undefined ? undefined : { era, order } };
}

describe('buildChronicle（世界编年）', () => {
  it('按纪元分组并排升序；未标纪元殿后', () => {
    const out = buildChronicle([
      node('4', 'history', '灰烬纪开篇', '灰烬纪', 0),
      node('1', 'history', '灰灯纪开灯', '灰灯纪', 0),
      node('2', 'story', '雪崩那年', '灰灯纪', 1),
      node('3', 'story', '没有纪元的一条'),
    ]);
    expect(out.map((e) => e.era)).toEqual(['灰灯纪', '灰烬纪', UNLABELED_ERA]);
    expect(out[0]!.entries.map((e) => e.id)).toEqual(['1', '2']);
  });

  it('只有 story / history 进编年；geography / factions 不上图', () => {
    const out = buildChronicle([node('1', 'history', '历史'), node('2', 'geography', '北境'), node('3', 'factions', '盟约')]);
    expect(out).toHaveLength(1);
    expect(out[0]!.entries.map((e) => e.id)).toEqual(['1']);
  });

  it('同纪元内 order 升序；缺省 order 排在已标序号之后', () => {
    const out = buildChronicle([
      node('2', 'story', '没有序号的', '纪'),
      node('1', 'story', '第0盏灯', '纪', 0),
      node('3', 'story', '第1盏灯', '纪', 1),
    ]);
    expect(out[0]!.entries.map((e) => e.id)).toEqual(['1', '3', '2']);
  });

  it('era 空串/空白按未标纪元；updatedAt 非法直接丢弃', () => {
    const out = buildChronicle([
      node('1', 'story', '空白 era', '   '),
      node('2', 'story', '时间坏行', '灰灯纪', 0, 'not-a-date'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.era).toBe(UNLABELED_ERA);
    expect(out[0]!.entries.map((e) => e.id)).toEqual(['1']);
  });

  it('重复 id / 空标题 / 非法 kind 丢弃；自环无关', () => {
    const out = buildChronicle([
      node('1', 'story', '甲'),
      node('1', 'story', '甲(复制)'),
      node('2', 'story', '   '),
      node('3', 'lore', '不是纪年类'),
    ]);
    expect(out.flatMap((e) => e.entries).map((e) => e.id)).toEqual(['1']);
  });

  it('空输入 → 空纪元；eraProgress 第几盏灯排行', () => {
    expect(buildChronicle([])).toEqual([]);
    const eras = buildChronicle([node('a', 'history', '一', '纪', 0), node('b', 'history', '二', '纪', 1)]);
    expect(eraProgress(eras, 0, 0)).toEqual({ current: 1, total: 2 });
    expect(eraProgress(eras, 0, 5)).toBeNull();
  });
});
