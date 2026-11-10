import { describe, expect, it } from 'vitest';
import {
  busTag,
  dashOr,
  footNote,
  generationNote,
  hitRate,
  isKnownReadout,
  keepPreviousOnError,
  pollAllowed,
} from '../src/app/admin/discover-cache/discover-view';
import type { DiscoverCacheReadout } from '../src/server/domain/discover-cache';

/**
 * §SC-43 展示判据：纯函数、零 React / DOM / 网络，逐支验电。
 * 与 `gateway-view.test.ts` 同范式——守的是"读反了界面就说谎、测试却还绿"的那几句话。
 */

const knownReadout = (): DiscoverCacheReadout => ({
  measuredAt: '2026-11-11T05:00:00.000Z',
  busAttached: false,
  busUrlConfigured: false,
  stats: {
    hits: 10,
    misses: 5,
    evictions: 1,
    loads: 5,
    inFlight: 0,
    size: 12,
    globalGen: 7,
    viewerGenerations: 3,
    config: { ttlMs: 15_000, maxEntries: 2048, maxViewers: 512 },
    bus: null,
  },
});

describe('命中率（分母为 0 不说 0%）', () => {
  it('有读时按 hits/(hits+misses) 给出整数百分比', () => {
    expect(hitRate(10, 5)).toBe('67%');
    expect(hitRate(1, 0)).toBe('100%');
    expect(hitRate(0, 1)).toBe('0%'); // 有读且全未命中，0% 是诚实的
  });
  it('分母为 0 说"还没有读"，绝不画 0%（那会把"没人读"说成"读了都没命中"）', () => {
    expect(hitRate(0, 0)).toBe('—（还没有读）');
    expect(hitRate(0, 0)).not.toContain('0%');
  });
});

describe('总线状态（null≠0，本片最重要的一句）', () => {
  it('bus=null 单独一档中性说法，不画 published/received/errors/applied 四个 0', () => {
    const tag = busTag(null);
    expect(tag.connected).toBe(false);
    expect(tag.headline).toContain('未接');
    expect(tag.detail).not.toMatch(/ published \d/); // 没有"发出 N"这种把 null 当 0 的账
    expect(tag.dot).toBe('gw-dotUnmeasured'); // 中性色，不是成功/告警
  });
  it('bus 已接且无错 = success 档，四账照实报', () => {
    const tag = busTag({ published: 3, received: 2, errors: 0, applied: 2 });
    expect(tag.connected).toBe(true);
    expect(tag.dot).toBe('gw-dotUp');
    expect(tag.headline).toContain('正常');
    expect(tag.detail).toContain('发出 3');
    expect(tag.detail).toContain('收到 2');
    expect(tag.detail).toContain('最终一致'); // 已接也绝不承诺瞬时强一致
  });
  it('bus 有错 = warn 档，且把"丢帧退回 TTL"讲出来（不说线路正常）', () => {
    const tag = busTag({ published: 3, received: 1, errors: 2, applied: 1 });
    expect(tag.connected).toBe(true);
    expect(tag.dot).toBe('gw-dotUnknown');
    expect(tag.headline).toContain('错误');
    expect(tag.detail).toContain('TTL');
    expect(tag.detail).not.toContain('线路正常');
  });
});

describe('null / 失败 / 后台的诚实', () => {
  it('dashOr(null) 画"—（未测）"不画 0；有值照实', () => {
    expect(dashOr(null)).toBe('—（未测）');
    expect(dashOr(0)).toBe('0');
    expect(dashOr(null, '—（未接）')).toBe('—（未接）');
  });
  it('后台标签不轮询；只有 visible 发（不在没人看时制造流量）', () => {
    expect(pollAllowed('visible')).toBe(true);
    expect(pollAllowed('hidden')).toBe(false);
    expect(pollAllowed('prerender')).toBe(false);
  });
  it('拉取失败保留上一帧：有旧账就还渲染它，不清空', () => {
    expect(keepPreviousOnError(true)).toBe(true);
    expect(keepPreviousOnError(false)).toBe(false);
  });
});

describe('回执形状门（坏 JSON / 残缺 bus / 残缺 config 不许画成真读数）', () => {
  it('完整读数通过', () => {
    expect(isKnownReadout(knownReadout())).toBe(true);
  });
  it('非对象 / 缺 measuredAt / 缺计数字段都挡掉', () => {
    expect(isKnownReadout(null)).toBe(false);
    expect(isKnownReadout('oops')).toBe(false);
    expect(isKnownReadout({ ...knownReadout(), measuredAt: undefined })).toBe(false);
    const broken = knownReadout();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, hits: '10' } })).toBe(false);
  });
  it('bus 是残缺对象（缺四账之一）也挡掉——否则会被画成"线路正常"', () => {
    const broken = knownReadout();
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, bus: { published: 1, received: 1 } } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, bus: { published: 1, received: 1, errors: 0, applied: 1 } } })).toBe(true);
  });
  it('bus=null（单机）是合法读数，不被形状门误杀', () => {
    expect(isKnownReadout({ ...knownReadout(), stats: { ...knownReadout().stats, bus: null } })).toBe(true);
  });
  it('config 是面板分母（size/maxEntries）与秒数（ttlMs/1000）的来源，缺一个/类型错都挡掉', () => {
    const broken = knownReadout();
    for (const key of ['ttlMs', 'maxEntries', 'maxViewers']) {
      expect(isKnownReadout({
        ...broken,
        stats: { ...broken.stats, config: { ...broken.stats.config, [key]: undefined } },
      })).toBe(false);
      expect(isKnownReadout({
        ...broken,
        stats: { ...broken.stats, config: { ...broken.stats.config, [key]: 'x' } },
      })).toBe(false);
    }
    // 整个 config 缺失 / 非对象也挡掉
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, config: undefined } })).toBe(false);
    expect(isKnownReadout({ ...broken, stats: { ...broken.stats, config: 'oops' } })).toBe(false);
  });
});

describe('旁注与页脚（把方法论结论与最终一致边界放到运维眼前）', () => {
  it('水位线旁注讲清"淘汰只多查库、不复活旧隐私"', () => {
    const note = generationNote(7, 3, 512);
    expect(note).toContain('7');
    expect(note).toContain('3/512');
    expect(note).toContain('不会');
  });
  it('单机未设 env：页脚说跨实例未启用、本机即时生效', () => {
    const foot = footNote(false, false, 4000);
    expect(foot).toContain('未启用');
    expect(foot).toContain('即时生效');
  });
  it('设了 env 但还没接上：页脚说"异步稍后可能接上"，不谎称部署错了', () => {
    expect(footNote(false, true, 4000)).toContain('稍后可能接上');
  });
  it('接了总线：页脚必讲"最终一致 + 丢帧退回 TTL"，不含糊成强一致', () => {
    const foot = footNote(true, true, 4000);
    expect(foot).toContain('最终一致');
    expect(foot).toContain('TTL');
    expect(foot).not.toContain('瞬时强一致生效');
  });
  it('轮询秒数跟 pollMs 走、只在 scope 出现一次（改 POLL_MS 时 scope 不说谎、不重复）', () => {
    const foot = footNote(true, true, 8000);
    expect(foot).toContain('每 8 秒');
    expect(foot).not.toContain('每 4 秒');
    expect(foot.match(/每 \d+ 秒/g)).toHaveLength(1); // 早先 scope 硬编码 4、末尾又拼一次，会在这里红
  });
});
