import { describe, expect, it } from 'vitest';
import { buildEraTies, type EraTieCharacter, type EraTieEra } from '../src/lib/era-ties';

const era = (name: string, entryIds: string[]): EraTieEra => ({
  era: name,
  entries: entryIds.map((id) => ({ id })),
});

const char = (id: string, name: string | null, targets: (string | null | undefined)[]): EraTieCharacter => ({
  id,
  profile: {
    name,
    relationships: targets.map((target) => ({ target })),
  },
});

describe('buildEraTies（星图⇄编年 双向联动）', () => {
  it('空输入 → 空输出', () => {
    expect(buildEraTies([], [])).toEqual([]);
    expect(buildEraTies([era('灰灯纪', ['s1', 'h1'])], [])).toEqual([
      { era: '灰灯纪', viaEntryCount: 2, linkedCharacters: [] },
    ]);
  });

  it('人物指向本卷故事条目 → 活跃于此卷', () => {
    const out = buildEraTies(
      [era('灰灯纪', ['s1', 'h1'])],
      [char('c1', '洛蘅', ['s1'])],
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.linkedCharacters).toEqual([{ id: 'c1', name: '洛蘅', viaEntryIds: ['s1'] }]);
  });

  it('只认一跳：非条目 id 的 target 不计入', () => {
    const out = buildEraTies(
      [era('灰灯纪', ['s1'])],
      [char('c1', '洛蘅', ['geography-north', 'not-an-entry', ''])],
    );
    expect(out[0]!.linkedCharacters).toEqual([]);
  });

  it('一人跨两卷 / 多条命中同卷 → viaEntryIds 去重且按编年顺序', () => {
    const out = buildEraTies(
      [era('灰灯纪', ['s1', 'h1', 's2']), era('霜燃纪', ['s9'])],
      [char('c1', '洛蘅', ['h1', 's1', 's1', 's9'])],
    );
    expect(out[0]!.linkedCharacters).toEqual([{ id: 'c1', name: '洛蘅', viaEntryIds: ['s1', 'h1'] }]);
    expect(out[1]!.linkedCharacters).toEqual([{ id: 'c1', name: '洛蘅', viaEntryIds: ['s9'] }]);
  });

  it('多人同卷：按名字升序，次级 id 升序；空名回退 id', () => {
    const out = buildEraTies(
      [era('灰灯纪', ['s1'])],
      [
        char('c2', 'bravo', ['s1']),
        char('c1', 'alpha', ['s1']),
        char('c3', null, ['s1']), // 回退 id 'c3'
        char('c4', '   ', ['s1']), // trim 后为空 → 回退 id 'c4'
      ],
    );
    const names = out[0]!.linkedCharacters.map((f) => f.name);
    expect(names).toEqual(['alpha', 'bravo', 'c3', 'c4']);
    const alpha = out[0]!.linkedCharacters.find((f) => f.name === 'alpha')!;
    expect(alpha.id).toBe('c1');
    expect(out[0]!.linkedCharacters.find((f) => f.name === 'c3')!.viaEntryIds).toEqual(['s1']);
  });

  it('确定性：同输入两次输出深相等（键序无关）', () => {
    const eras = [era('灰灯纪', ['s1', 'h1']), era('霜燃纪', ['s9'])];
    const chars = [char('c1', '洛蘅', ['s1', 's9']), char('c2', '安石', ['h1'])];
    const a = buildEraTies(eras, chars);
    const b = buildEraTies(eras, chars);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('人物 relationships 缺失 / null / 非字符串 target → 安全跳过', () => {
    const characters: EraTieCharacter[] = [
      { id: 'c1', profile: {} },
      { id: 'c2', profile: { name: '无关', relationships: null } },
      { id: 'c3', profile: { name: '健壮', relationships: [{ target: 42 as unknown as string }] } },
    ];
    const out = buildEraTies([era('灰灯纪', ['s1'])], characters);
    expect(out[0]!.linkedCharacters).toEqual([]);
  });

  it('未标纶元（UNLABELED 语义之外的卷）照常计算，不特判', () => {
    const out = buildEraTies(
      [era('未标纶元', ['s1'])],
      [char('c1', '洛蘅', ['s1'])],
    );
    expect(out[0]!.era).toBe('未标纶元');
    expect(out[0]!.linkedCharacters).toHaveLength(1);
  });

  it('viaEntryCount 报的是本卷去重后的条目数', () => {
    const out = buildEraTies(
      [{ era: 'x', entries: [{ id: 's1' }, { id: 's1' }, { id: '' }, { id: 'h1' }] }],
      [],
    );
    expect(out[0]!.viaEntryCount).toBe(2);
  });
});
