import { describe, expect, it } from 'vitest';
import type { AiCacheReadout, AppCacheStats, AiCacheTransport } from '@/server/ai/cache-stats';
import {
  appCacheDetail,
  appCacheHeadline,
  capacityNote,
  dashOr,
  footNote,
  pct,
  prefixHeadline,
  prefixNote,
  providerNote,
  providerSplit,
  requestSplit,
  share,
  verdictOf,
  verdictText,
  nonStreamCaveat,
} from '@/app/admin/ai-cache/cache-view';

/**
 * §CACHE-2 `/admin/ai-cache` 的**展示判据**——纯函数那一寸。
 *
 * 这一片最容易出的错不是崩，而是**写出一个看起来有意义的假数**：
 * 把"还没有样本"画成 `0.0%`、把"缓存没启用"画成 `0 命中 / 0 未命中`、
 * 把"provider 没报账"画成"命中 0"。这三句话各自都是一个具体的谎。
 *
 * 判据分四组：
 *  1. `null` 必须渲染成 `—` / "没有样本"，而 `0` 必须照实渲染成 0；
 *  2. 分段比例：分母为 0 时给 `null`（不画条），有样本时两段加起来 100；
 *  3. 三格文案各自把"这个数是什么、不是什么"写在明面上；
 *  4. 判定阈值是闭区间边界（0.8 是 good，0.4 是 warm），且每档都有话说。
 */
function readout(overrides: Partial<AiCacheReadout> = {}): AiCacheReadout {
  return {
    measuredAt: '2026-11-13T16:00:00.000Z',
    prefix: { requests: 2, reused: 1, uniquePrefixes: 1, capacity: 512, evictions: 0, reuseRate: 0.5 },
    appCache: {
      enabled: true,
      backend: 'redis',
      hits: 1,
      misses: 1,
      stores: 1,
      storesFailed: 0,
      evictions: 0,
      hitRate: 0.5,
      shared: true,
      degraded: false,
      namespace: 'nexus:llmc',
    },
    provider: { reported: 2, missing: 0, cachedTokensTotal: 43362, promptTokensTotal: 45692, reportedHitRate: 0.949 },
    transport: { stream: true },
    ...overrides,
  };
}

describe('§CACHE-2 cache-view · 空值口径', () => {
  it('dashOr：null 给破折号，0 照实给 0', () => {
    expect(dashOr(null)).toBe('—');
    expect(dashOr(undefined)).toBe('—');
    expect(dashOr(0)).toBe('0');
    expect(dashOr(12)).toBe('12');
  });

  it('pct：null 给破折号而不是 0.0%（一行具体的谎）', () => {
    expect(pct(null)).toBe('—');
    expect(pct(undefined)).toBe('—');
    expect(pct(0)).toBe('0.0%');
    expect(pct(0.949)).toBe('94.9%');
    expect(pct(1)).toBe('100.0%');
  });

  it('share：分母为 0 给 null，并夹在 0–100 之间', () => {
    expect(share(1, 0)).toBeNull();
    expect(share(1, 4)).toBe(25);
    expect(share(9, 4)).toBe(100);
    expect(share(-1, 4)).toBe(0);
  });
});

describe('§CACHE-2 cache-view · 分段比例', () => {
  it('requestSplit：没有任何请求时不画条（两段都是 null）', () => {
    expect(requestSplit({ requests: 0, reused: 0, uniquePrefixes: 0, capacity: 512, evictions: 0, reuseRate: null }))
      .toEqual({ first: null, second: null });
  });

  it('requestSplit：两段加起来正好 100', () => {
    const split = requestSplit({ requests: 8, reused: 3, uniquePrefixes: 5, capacity: 512, evictions: 0, reuseRate: 0.375 });
    expect(split.first).toBeCloseTo(37.5, 5);
    expect(split.first! + split.second!).toBeCloseTo(100, 5);
  });

  it('providerSplit：全报账 → 第二段 0；一次都没报 → 第一段 0；都没有 → null', () => {
    expect(providerSplit({ reported: 2, missing: 0, cachedTokensTotal: 1, promptTokensTotal: 2, reportedHitRate: 0.5 }))
      .toEqual({ first: 100, second: 0 });
    expect(providerSplit({ reported: 0, missing: 3, cachedTokensTotal: 0, promptTokensTotal: 0, reportedHitRate: null }))
      .toEqual({ first: 0, second: 100 });
    expect(providerSplit({ reported: 0, missing: 0, cachedTokensTotal: 0, promptTokensTotal: 0, reportedHitRate: null }))
      .toEqual({ first: null, second: null });
  });
});

describe('§CACHE-2 cache-view · 三格文案', () => {
  it('前缀大字说的是「请求份额」，零请求时说"还没有请求"而不是 0%', () => {
    expect(prefixHeadline({ requests: 0, reused: 0, uniquePrefixes: 0, capacity: 512, evictions: 0, reuseRate: null }))
      .toBe('还没有请求');
    expect(prefixHeadline(readout().prefix)).toBe('1 / 2 次建立在已见过的前缀上');
  });

  it('前缀脚注必须同时说「与网关无关」和「数的是请求不是字节」', () => {
    const note = prefixNote(readout().prefix);
    expect(note).toContain('网关');
    expect(note).toContain('字节份额');
    expect(prefixNote({ requests: 0, reused: 0, uniquePrefixes: 0, capacity: 512, evictions: 0, reuseRate: null }))
      .toContain('不是 0%');
  });

  it('容量脚注：顶到上界时说这是容量信号不是故障；否则给水位', () => {
    expect(capacityNote({ requests: 9, reused: 4, uniquePrefixes: 512, capacity: 512, evictions: 7, reuseRate: 0.44 }))
      .toContain('容量信号，不是故障');
    expect(capacityNote({ requests: 9, reused: 4, uniquePrefixes: 3, capacity: 512, evictions: 0, reuseRate: 0.44 }))
      .toContain('3/512');
  });

  it('应用缓存：未启用单独一档，绝不说 0 命中', () => {
    expect(appCacheHeadline(null)).toBe('未启用');
    const detail = appCacheDetail(null);
    expect(detail).toContain('没开');
    expect(detail).toContain('不是"0 命中"');
  });

  it('应用缓存：降级有自己的说法（fail-open，不是坏账）', () => {
    const degraded: AppCacheStats = {
      enabled: true,
      backend: 'redis',
      hits: 0,
      misses: 2,
      stores: 0,
      storesFailed: 2,
      evictions: 0,
      hitRate: 0,
      shared: null,
      degraded: true,
      namespace: null,
    };
    expect(appCacheDetail(degraded)).toContain('降级');
    expect(appCacheDetail(degraded)).toContain('fail-open');
  });

  it('应用缓存：正常时把后端、共享性、命名空间与三个计数都写出来', () => {
    const detail = appCacheDetail(readout().appCache);
    expect(detail).toContain('redis');
    expect(detail).toContain('跨实例共享');
    expect(detail).toContain('nexus:llmc');
    expect(detail).toContain('写失败 0 次');
  });

  it('provider：一次都没报账时说「不等于命中 0」，并点名冷前缀', () => {
    const note = providerNote({ reported: 0, missing: 3, cachedTokensTotal: 0, promptTokensTotal: 0, reportedHitRate: null });
    expect(note).toContain('一次都没报');
    expect(note).toContain('不等于「命中 0」');
    expect(note).toContain('冷前缀');
  });

  it('provider：有报账样本时分母只算报过账那几次，并声明不用于对外承诺', () => {
    const note = providerNote(readout().provider);
    expect(note).toContain('只算报过账的 2 次');
    expect(note).toContain('45692 prompt tokens');
    expect(note).toContain('不拿这个数做对外承诺');
  });

  it('页脚声明"只是这一台进程"', () => {
    expect(footNote(true, 4000, readout().measuredAt)).toContain('这一台 ai-service 进程');
  });
});

describe('§CACHE-2 cache-view · 判定阈值', () => {
  it('零请求 / 无复用率 → unmeasured（不是 cold）', () => {
    expect(
      verdictOf(readout({ prefix: { requests: 0, reused: 0, uniquePrefixes: 0, capacity: 512, evictions: 0, reuseRate: null } })),
    ).toBe('unmeasured');
    expect(
      verdictOf(readout({ prefix: { requests: 5, reused: 0, uniquePrefixes: 5, capacity: 512, evictions: 0, reuseRate: null } })),
    ).toBe('unmeasured');
  });

  it('边界是闭区间：0.8 → good，0.4 → warm，0.39 → cold', () => {
    const at = (rate: number): AiCacheReadout =>
      readout({ prefix: { requests: 10, reused: Math.round(rate * 10), uniquePrefixes: 2, capacity: 512, evictions: 0, reuseRate: rate } });
    expect(verdictOf(at(0.8))).toBe('good');
    expect(verdictOf(at(0.79))).toBe('warm');
    expect(verdictOf(at(0.4))).toBe('warm');
    expect(verdictOf(at(0.39))).toBe('cold');
  });

  it('每一档都有话说（headline 与 detail 都非空，且互不相同）', () => {
    const seen = new Set<string>();
    for (const readoutCase of [
      readout({ prefix: { requests: 0, reused: 0, uniquePrefixes: 0, capacity: 512, evictions: 0, reuseRate: null } }),
      readout({ prefix: { requests: 10, reused: 9, uniquePrefixes: 1, capacity: 512, evictions: 0, reuseRate: 0.9 } }),
      readout({ prefix: { requests: 10, reused: 5, uniquePrefixes: 2, capacity: 512, evictions: 0, reuseRate: 0.5 } }),
      readout({ prefix: { requests: 10, reused: 1, uniquePrefixes: 9, capacity: 512, evictions: 0, reuseRate: 0.1 } }),
    ]) {
      const text = verdictText(readoutCase);
      expect(text.headline.length).toBeGreaterThan(0);
      expect(text.detail.length).toBeGreaterThan(0);
      seen.add(text.headline);
    }
    expect(seen.size).toBe(4);
  });
});


describe('§CACHE-4-AB nonStreamCaveat', () => {
  it('transport.stream===false → 判读 detail 必含「退回非流」警示', () => {
    const bad = readout({
      transport: { stream: false },
      prefix: { requests: 10, reused: 1, uniquePrefixes: 9, capacity: 512, evictions: 0, reuseRate: 0.1 },
    });
    const good = readout({ transport: { stream: true } });
    expect(verdictOf(bad)).toBe('cold');
    const text = verdictText(bad);
    expect(text.detail).toContain('非流');
    expect(text.detail).toContain('NEXUS_LLM_STREAM=0');
    const fine = verdictText(good);
    expect(fine.detail).not.toContain('NEXUS_LLM_STREAM=0');
    expect(nonStreamCaveat(good)).toBe('');
    expect(nonStreamCaveat(bad)).toContain('非流');
  });

  it('transport 缺失（上游未报）→ caveat 为空字符串，不误报', () => {
    const quiet = readout({ transport: null });
    expect(nonStreamCaveat(quiet)).toBe('');
    const absent = readout({ transport: undefined as unknown as AiCacheTransport });
    expect(nonStreamCaveat(absent)).toBe('');
  });
});
