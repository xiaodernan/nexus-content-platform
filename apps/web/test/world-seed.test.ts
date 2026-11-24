import { describe, expect, it } from 'vitest';
import { WORLD_KINDS, createWorld } from '@nexus/world-model';
import { generateSeedChapter } from '../src/lib/worldSeed';
import { mergeImportedWorld } from '../src/lib/worldExport';

describe('worldSeed · 种子世界纯生成', () => {
  it('同一 seed 逐字相同（确定性，零随机）', () => {
    expect(generateSeedChapter('潮候院')).toEqual(generateSeedChapter('潮候院'));
  });

  it('九类齐全，全部有正文，纪元/回声都在', () => {
    const s = generateSeedChapter('潮候院');
    expect(s.entries.map((e) => e.kind).sort()).toEqual([...WORLD_KINDS].sort());
    for (const e of s.entries) {
      expect(e.body.length).toBeGreaterThan(10);
      expect(e.era).toBeTruthy();
      expect(e.memory).toBeTruthy();
    }
  });

  it('关键名词在多条正文里反复出现（连贯，不是九段互不相干的模板）', () => {
    const s = generateSeedChapter('潮候院');
    const joined = s.entries.map((e) => e.body).join('');
    // 地理/势力/角色/生物/物品是同一次抽取的五个名词，每条都该出现在 2 条以上正文里
    for (const i of [2, 3, 4, 5, 6]) {
      const noun = s.entries[i]!.title;
      const hits = s.entries.filter((e) => e.body.includes(noun)).length;
      expect(hits, `「${noun}」只出现在 ${hits} 条正文里`).toBeGreaterThanOrEqual(2);
    }
    expect(joined).toContain(s.entries[8]!.title);
    expect(s.summary).toContain('程序生成的骨架');
  });

  it('不同 seed 长出不同的组合', () => {
    const a = generateSeedChapter('甲之地').entries.map((e) => e.title).join('|');
    const b = generateSeedChapter('乙之地').entries.map((e) => e.title).join('|');
    expect(a).not.toBe(b);
  });

  it('并入现有世界：只追加九条、不覆盖原有条目', () => {
    const s = generateSeedChapter('潮候院');
    const before = createWorld('我的世界', 'p1');
    const { document, added, skipped } = mergeImportedWorld(before, s);
    expect(skipped).toBe(0);
    expect(added).toBe(9);
    expect(document.nodes).toHaveLength(before.nodes.length + 9);
    expect(document.nodes.some((n) => n.title === '原有')).toBe(false);
  });

  it('空 seed 也有确定结果，不抛错', () => {
    expect(generateSeedChapter('   ').name).toContain('无名之地');
    expect(generateSeedChapter('')).toEqual(generateSeedChapter('   '));
  });
});
