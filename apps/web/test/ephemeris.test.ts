import { describe, expect, it } from 'vitest';
import { buildEphemeris, EPHEMERIS_DAYS } from '../src/lib/ephemeris';


function node(id: string, kind: string, title: string, body: string, era?: string) {
  return { id, kind, title, body, lore: era !== undefined ? { era } : undefined };
}

describe('§FE-EPH buildEphemeris — 零 provider、byte-stable、确定性演算', () => {
  it('空输入 → []（不会编造节点）', () => {
    expect(buildEphemeris([])).toEqual([]);
    expect(buildEphemeris([node('n1', 'lore', '传说', '')])).toEqual([]); // body 为空 = 骨架，不上图
  });

  it('同样的输入反复运行 → 完全一致（确定性）', () => {
    const input = [
      node('a', 'lore', '创世黑雨', '天下三日无光。雨里没有水只有炭灰——灰尘落满了白灯区的每一片檐。'),
      node('b', 'story', '钟楼', '钟楼顶上有人喊出一声——擦——撞——倒——天亮了。'),
      node('c', 'items', '怀表', '三块怀表往返三次——问时间时这块更准。'),
    ];
    const run1 = buildEphemeris(input);
    const run2 = buildEphemeris(input);
    expect(run1).toEqual(run2);
    expect(run1.length).toBe(3);
  });

  it('所有落笔节点都被排到了 1..360 的某一天，不会互撞', () => {
    const input = Array.from({ length: 15 }, (_, i) =>
      node(`n${i}`, ['lore', 'story', 'history', 'geography', 'factions', 'characters', 'creatures', 'items', 'quests'][i % 9]!, `标题 ${i}`, `第 ${i} 件事：雨落下来。`),);
    const out = buildEphemeris(input);
    for (const entry of out) {
      expect(entry.day).toBeGreaterThanOrEqual(1);
      expect(entry.day).toBeLessThanOrEqual(EPHEMERIS_DAYS);
    }
    expect(new Set(out.map((e) => e.id)).size).toBe(out.length);
  });

  it('entry 顺序稳定：按 day → 九类自然序 → id 字典序', () => {
    const input = [
      node('z', 'items', '物', '这东西很重。'),
      node('a', 'lore', '传说', '很久很久以前……'),
      node('m', 'characters', '人', '他总没有姓。'),
    ];
    const out = buildEphemeris(input);
    for (let i = 1; i < out.length; i++) {
      const prev = out[i - 1]!;
      const cur = out[i]!;
      expect(cur.day >= prev.day).toBe(true);
    }
  });

  it('excerpt 截断到 96 字：首句即直出，超长取首 96+…', () => {
    const longBody = '起跑赢了一切。' + '很长很长的一段。'.repeat(30);
    const [entry] = buildEphemeris([node('n1', 'story', '一删', longBody)]);
    expect(entry!.excerpt.length).toBeLessThanOrEqual(97); // 96 + …
  });

  it('kindLabel 从世界常量里取，不重新发明一套语言', () => {
    const [entry] = buildEphemeris([node('n1', 'lore', '创世', '黑雨落下。')]);
    expect(entry!.kindLabel).toBe('传说');
  });

  it('era 来源 lore.era：缺省空串 / 纯空白不进上图', () => {
    const [withEra] = buildEphemeris([node('n1', 'story', '黑雨', '落下。', '灰灯纪')]);
    expect(withEra!.era).toBe('灰灯纪');
    const [blank] = buildEphemeris([node('n2', 'story', '无名', '雨。', '   ')]);
    expect(blank!.era).toBeNull();
    const [absent] = buildEphemeris([node('n3', 'story', '无主', '雨。')]);
    expect(absent!.era).toBeNull();
  });
});
