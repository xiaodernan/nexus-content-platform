import { describe, expect, it } from 'vitest';
import { isPortraitRow, latestPortraitByCharacter, type PortraitRow } from '../src/server/domain/character-portraits';

/**
 * §39 × §40 × ADR-0086：角色肖像"最新那张"选择逻辑的钉子。
 *
 * 为什么这一层必须纯函数可测：web 层查库之后选"哪一张进像素"，
 * 错一张（老照片冒充肖像、场景截图冒充肖像、别角色的肖像串号）ffmpeg 照样渲出成片，
 * 只有在这里才能拦住——真库集成测试只证得出"渲成了"，证不出"选对了"。
 */

const row = (over: Partial<PortraitRow>): PortraitRow => ({
  characterId: 'c-1',
  assetId: 'a-1',
  createdAt: new Date('2026-11-01T00:00:00Z'),
  genMeta: { characterPortrait: true },
  ...over,
});

describe('isPortraitRow —— 只有 genMeta.characterPortrait === true 才是肖像', () => {
  it('不认 undefined / 0 / "true"（字符串） / null', () => {
    expect(isPortraitRow(row({ genMeta: undefined }))).toBe(false);
    expect(isPortraitRow(row({ genMeta: null }))).toBe(false);
    expect(isPortraitRow(row({ genMeta: { characterPortrait: 1 } }))).toBe(false);
    expect(isPortraitRow(row({ genMeta: { characterPortrait: 'true' } }))).toBe(false);
    expect(isPortraitRow(row({ genMeta: { characterPortrait: true } }))).toBe(true);
  });
});

describe('latestPortraitByCharacter —— 同一角色取最新那张', () => {
  it('同一角色两张肖像：createdAt 新的那张赢，与行顺序无关', () => {
    const old = row({ assetId: 'old', createdAt: new Date('2026-01-01T00:00:00Z') });
    const fresh = row({ assetId: 'fresh', createdAt: new Date('2026-11-19T00:00:00Z') });
    expect(latestPortraitByCharacter([old, fresh])).toEqual({ 'c-1': 'fresh' });
    // 反序也一样
    expect(latestPortraitByCharacter([fresh, old])).toEqual({ 'c-1': 'fresh' });
  });

  it('多位角色互不串号：每位各选各的', () => {
    const rows = [
      row({ characterId: 'c-1', assetId: 'p1' }),
      row({ characterId: 'c-2', assetId: 'p2' }),
      row({ characterId: 'c-1', assetId: 'p1-old', createdAt: new Date('2025-01-01T00:00:00Z') }),
    ];
    expect(latestPortraitByCharacter(rows)).toEqual({ 'c-1': 'p1', 'c-2': 'p2' });
  });

  it('gen_meta 不带肖像标的行（场景截图/参考图）不进像素', () => {
    const rows = [
      row({ assetId: 'scene-shot', genMeta: { kind: 'scene' } }),
      row({ assetId: 'real', genMeta: { characterPortrait: true } }),
    ];
    expect(latestPortraitByCharacter(rows)).toEqual({ 'c-1': 'real' });
  });

  it('characterId 为 NULL 的行：没有角色可归属，跳过', () => {
    expect(latestPortraitByCharacter([row({ characterId: null, assetId: 'x' })])).toEqual({});
  });

  it('空输入：空字典——渲染退回色卡并把限度说出来，不是崩', () => {
    expect(latestPortraitByCharacter([])).toEqual({});
  });
});
