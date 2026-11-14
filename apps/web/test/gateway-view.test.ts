import { describe, expect, it } from 'vitest';
import {
  CLASS_LABEL,
  healthView,
  isDatedSnapshot,
  keepPreviousOnError,
  numberOrDash,
  pollAllowed,
  sharedHealthView,
  shouldShowNonAtomicNote,
  STATE_LABEL,
} from '../src/app/admin/gateway/gateway-view';
import { joinSnapshot } from '../src/server/gateway/snapshot';
import type { Readout } from '../src/server/gateway/types';

/**
 * §SC-40 面板展示判据（与 `reclaim-state.test.ts` 同一范式：判纯函数，不渲染）。
 * 每一条守一句"写反就上屏说谎"的话，尤其 null≠0、UNKNOWN≠DOWN、后台不发请求。
 */

const worst = (value: unknown): Readout<never> => ({
  state: 'fresh', value: value as never, measuredAt: 't', fetchedAt: 't', ageMs: 0, note: '',
});

describe('null 不画成 0（最后一道闸）', () => {
  it('没测到显示破折号，0 照常显示「0」，两者不能混', () => {
    expect(numberOrDash(null)).toBe('—（未测）');
    expect(numberOrDash(0)).toBe('0');
    expect(numberOrDash(7)).toBe('7');
  });

  it('验电：破折号串里确实带「未测」二字，不是空串或 0 伪装', () => {
    expect(numberOrDash(null)).toContain('未测');
    expect(numberOrDash(null)).not.toMatch(/^\d+$/);
  });
});

describe('健康态映射：UNKNOWN 绝不当 DOWN', () => {
  it('五种态各有自己的词与圆点，UNKNOWN/没测到都不用红色圆点', () => {
    expect(healthView('UP')).toEqual({ dot: 'gw-dotUp', text: '正常' });
    expect(healthView('DOWN')).toEqual({ dot: 'gw-dotDown', text: '中断' });
    const unknown = healthView('UNKNOWN');
    expect(unknown.text).toBe('没答上');
    expect(unknown.dot).not.toBe('gw-dotDown'); // 没答上 ≠ 中断
    expect(unknown.dot).toBe('gw-dotUnknown');
    expect(healthView('NOT_PROBED').text).toBe('无实例');
    expect(healthView('NOT_MEASURED').text).toBe('未测');
    expect(healthView('NOT_MEASURED').dot).not.toBe('gw-dotDown');
  });

  it('验电：DOWN 是唯一用红色圆点的态', () => {
    const all = (['UP', 'DOWN', 'UNKNOWN', 'NOT_PROBED', 'NOT_MEASURED'] as const).map(healthView);
    expect(all.filter((b) => b.dot === 'gw-dotDown')).toHaveLength(1);
  });
});

describe('归类与状态文案：五个分类、四个状态都覆盖，没有漏译', () => {
  it('每种 classification 都有中文名', () => {
    const keys = ['routed-healthy', 'routed-degraded', 'routed-down', 'unrouted', 'dangling'] as const;
    for (const k of keys) expect(CLASS_LABEL[k], `分类 ${k} 没有文案`).toBeTruthy();
    expect(new Set(Object.values(CLASS_LABEL)).size).toBe(keys.length); // 没有两个分类共用一句会读混
  });
  it('每种 readout state 都有中文名', () => {
    const keys = ['fresh', 'cached', 'stale', 'unavailable'] as const;
    for (const k of keys) expect(STATE_LABEL[k]).toBeTruthy();
    expect(new Set(Object.values(STATE_LABEL)).size).toBe(keys.length);
  });
});

describe('轮询与降级的诚实', () => {
  it('只有前台标签轮询；hidden / prerender 都不发', () => {
    expect(pollAllowed('visible')).toBe(true);
    expect(pollAllowed('hidden')).toBe(false);
    expect(pollAllowed('prerender')).toBe(false);
  });

  it('拉取失败保留上一帧（有旧图才留，没旧图不凭空造）', () => {
    expect(keepPreviousOnError(true)).toBe(true);
    expect(keepPreviousOnError(false)).toBe(false);
  });

  it('只有 cached/stale 打「带日期的旧事实」标；fresh / unavailable 不打', () => {
    expect(isDatedSnapshot('cached')).toBe(true);
    expect(isDatedSnapshot('stale')).toBe(true);
    expect(isDatedSnapshot('fresh')).toBe(false);
    expect(isDatedSnapshot('unavailable')).toBe(false);
  });
});

describe('共享缓存诚实读数（§SC-50 / ADR-0125：配了 ≠ 连着）', () => {
  it('driver=redis 只说「已配置」，绝不声称「此刻连接健康」', () => {
    const v = sharedHealthView({ driver: 'redis', fallbacks: 0, lastError: null });
    expect(v.label).toContain('已配置');
    expect(v.label).not.toMatch(/健康|已连接|正常/);
    expect(v.active).toBe(false); // 没接上过，不亮"生效"灯
  });

  it('driver=in-process 明说单实例进程内，不提 Redis', () => {
    const v = sharedHealthView({ driver: 'in-process', fallbacks: 0, lastError: null });
    expect(v.label).toContain('进程内');
    expect(v.label).not.toContain('Redis');
    expect(v.active).toBe(false);
  });

  it('fallbacks>0 时摆出实况：回退次数 + 最近错误，且 label 明说正在回退', () => {
    const v = sharedHealthView({ driver: 'redis', fallbacks: 3, lastError: 'ECONNREFUSED' });
    expect(v.label).toContain('回退');
    expect(v.detail).toContain('3');
    expect(v.detail).toContain('ECONNREFUSED');
    expect(v.active).toBe(true); // 确实在 fail-open，这一个可见
  });

  it('配了 redis 但只有 lastError 没有回退计数（例：订阅/握手失败）：也如实点出错误', () => {
    const v = sharedHealthView({ driver: 'redis', fallbacks: 0, lastError: 'handshake timeout' });
    expect(v.detail).toContain('handshake timeout');
    expect(v.label).not.toMatch(/健康|已连接/);
  });

  it('坏回执（driver 不是两种已知值 / fallbacks 非数 / lastError 非串）不崩、不画 undefined', () => {
    const bad = sharedHealthView({ driver: 'mystery' as never, fallbacks: 'x' as never, lastError: 42 as never });
    expect(JSON.stringify(bad)).not.toContain('undefined');
    expect(JSON.stringify(bad)).not.toContain('NaN');
    expect(typeof bad.label).toBe('string');
  });
});

describe('非原子快照提示：三列时刻不全同或有一列没测到就出现', () => {
  const snap = (times: [string | null, string | null, string | null]) =>
    joinSnapshot({
      generatedAt: 'g',
      routes: { ...worst(null), state: times[0] ? 'fresh' : 'unavailable', measuredAt: times[0] },
      services: { ...worst(null), state: times[1] ? 'fresh' : 'unavailable', measuredAt: times[1] },
      health: { ...worst(null), state: times[2] ? 'fresh' : 'unavailable', measuredAt: times[2] },
    });

  it('三列时刻相同且有值 → 不需要提示', () => {
    expect(shouldShowNonAtomicNote(snap(['t', 't', 't']))).toBe(false);
  });
  it('三列时刻不同 → 提示（这正是常态：health 要逐个探，不会与路由同毫秒）', () => {
    expect(shouldShowNonAtomicNote(snap(['t1', 't2', 't3']))).toBe(true);
  });
  it('任一列没测到（measuredAt=null）→ 提示', () => {
    expect(shouldShowNonAtomicNote(snap(['t', null, 't']))).toBe(true);
  });
});
