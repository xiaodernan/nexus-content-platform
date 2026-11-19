import { describe, expect, it } from 'vitest';
import {
  applyDelta,
  deriveClock,
  freshPersisted,
  pushMemory,
  readPersisted,
  seasonOf,
  tideOf,
  toRequestState,
  TIDEWATCH_MAX_MEMORY,
  TIDEWATCH_MAX_SEALS,
} from '../src/lib/tidewatch';

/**
 * §WS-1 潮候步进 · 纯函数门：潮相/节气推导、delta 夹紧、记忆上限、持久化读写。
 * 这些判据不需要浏览器、不需要 provider——它们锁住的是人手能犯的错：
 * 越界出界、单调累积永不落边、坏 localStorage 把页面整个打死。
 */
describe('§WS-1 tidewatch · 时钟推导', () => {
  it('seasonOf：二月-四月春、五月-七月夏、八月-十月秋、否则冬', () => {
    expect(seasonOf(3)).toBe('spring');
    expect(seasonOf(6)).toBe('summer');
    expect(seasonOf(9)).toBe('autumn');
    expect(seasonOf(12)).toBe('winter');
    expect(seasonOf(1)).toBe('winter');
  });

  it('tideOf：夜里落/白天涨/午后平/黄昏退，单调分段且全年一致', () => {
    expect(tideOf(new Date(2026, 9, 19, 3))).toBe('falling');
    expect(tideOf(new Date(2026, 9, 19, 9))).toBe('rising');
    expect(tideOf(new Date(2026, 9, 19, 13))).toBe('high');
    expect(tideOf(new Date(2026, 9, 19, 19))).toBe('low');
  });

  it('deriveClock：zh 与 en 两种语言都给出无夹杂的、同一瞬间一致的 label', () => {
    const d = new Date(2026, 9, 19, 9);
    const zh = deriveClock(d, 'zh');
    const en = deriveClock(d, 'en');
    expect(zh.label).toContain('2026');
    expect(zh.label).toContain('仲秋');
    expect(zh.label).toContain('涨潮');
    expect(en.label).toContain('2026');
    expect(en.label).toContain('autumn');
    expect(en.label).toContain('rising tide');
    expect(zh.label).not.toContain('autumn');
    expect(en.label).not.toContain('仲秋');
  });
});

describe('§WS-1 tidewatch · delta 裁决', () => {
  it('vigor/depth 夹紧到 0..9：出界永远落回边界', () => {
    const state = { ...freshPersisted(), vigor: 8, depth: 1 };
    expect(applyDelta(state, { vigor: 3, depth: -5, seals: [], unlocks: [], risk: 'storm' })).toMatchObject({ vigor: 9, depth: 0 });
  });

  it('seals 去重且最多保留最近 12 枚', () => {
    const state = { ...freshPersisted(), seals: Array.from({ length: 11 }, (_, i) => `印记${i}`) };
    const next = applyDelta(state, { vigor: 0, depth: 0, seals: ['印记1', '潮候印', '潮候印'], unlocks: [], risk: 'calm' });
    expect(next.seals.length).toBeLessThanOrEqual(TIDEWATCH_MAX_SEALS);
    expect(next.seals.at(-1)).toBe('潮候印');
    expect(new Set(next.seals).size).toBe(next.seals.length);
  });

  it('unlocks 只追加真实存在的回响编号（Web 不复核，交给 canon_guard；这里只保证不重复、不丢新条目）', () => {
    const state = { ...freshPersisted(), unlocks: ['E162'] };
    const next = applyDelta(state, { vigor: 0, depth: 0, seals: [], unlocks: ['E162', 'E160'], risk: 'uneasy' });
    expect(next.unlocks).toEqual(['E162', 'E160']);
  });
});

describe('§WS-1 tidewatch · 记忆与持久化', () => {
  it('pushMemory：空白文本不入账；最多保留最近 6 条', () => {
    let state = freshPersisted();
    expect(pushMemory(state, { kind: 'step', text: '   ' })).toBe(state);
    for (let i = 1; i <= TIDEWATCH_MAX_MEMORY + 2; i += 1) {
      state = pushMemory(state, { kind: 'step', text: `第 ${i} 步` });
    }
    expect(state.memory).toHaveLength(TIDEWATCH_MAX_MEMORY);
    expect(state.memory[0]!.text).toContain('3 步');
  });

  it('readPersisted：坏输入（非 JSON / 错字段 / 越界数字）全部落回安全默认，不整页崩', () => {
    expect(readPersisted(null)).toEqual(freshPersisted());
    expect(readPersisted('not json')).toEqual(freshPersisted());
    const garbage = readPersisted(JSON.stringify({ vigor: 99, depth: -4, seals: ['ok', ''], memory: [{ kind: 'step', text: 123 }, null, { kind: 'oracle', text: '潮' }] }));
    expect(garbage.vigor).toBe(9);
    expect(garbage.depth).toBe(0);
    expect(garbage.seals).toEqual(['ok']);
    expect(garbage.memory).toEqual([{ kind: 'oracle', text: '潮' }]);
  });

  it('toRequestState：送给 ai-service 的状态对象字段名与 WorldStepStateSchema 对齐', () => {
    const persisted = { ...freshPersisted(), vigor: 4, depth: 3, seals: ['盐印'], memory: [{ kind: 'oracle' as const, text: '潮说' }] };
    const req = toRequestState(persisted, deriveClock(new Date(2026, 9, 19, 9), 'zh'));
    expect(req.traveler).toEqual({ vigor: 4, depth: 3, seals: ['盐印'] });
    expect(req.memory).toHaveLength(1);
    expect(req.clock.season).toBe('autumn');
  });
});
