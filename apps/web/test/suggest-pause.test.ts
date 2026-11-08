import { describe, expect, it } from 'vitest';
import {
  SUGGEST_PAUSE_FALLBACK_MS,
  SUGGEST_PAUSE_MAX_MS,
  pauseMsFromResponse,
  remainingSeconds,
} from '@/app/search/suggest-pause';

/**
 * §165 搜索建议的 429（ADR-0075）：服务端说"打字太快"时，界面必须**看得见**地停一下。
 * 这里钉两个纯函数：怎么读 retryAfterMs、还剩几秒。夹上界是防守——窗口配得再长，
 * 建议也不该在整段时间里彻底消失（结果页照常能用）。
 */

describe('pauseMsFromResponse', () => {
  it('不是 429 一律返回 null，交给原来的错误路径', () => {
    expect(pauseMsFromResponse(200, { retryAfterMs: 5000 })).toBeNull();
    expect(pauseMsFromResponse(500, null)).toBeNull();
  });

  it('429 读到正整数就用它', () => {
    expect(pauseMsFromResponse(429, { retryAfterMs: 1500 })).toBe(1500);
  });

  it('429 但 body 缺失/不是数/非正数，退回 30 秒兜底', () => {
    expect(pauseMsFromResponse(429, null)).toBe(SUGGEST_PAUSE_FALLBACK_MS);
    expect(pauseMsFromResponse(429, {})).toBe(SUGGEST_PAUSE_FALLBACK_MS);
    expect(pauseMsFromResponse(429, { retryAfterMs: 'soon' })).toBe(SUGGEST_PAUSE_FALLBACK_MS);
    expect(pauseMsFromResponse(429, { retryAfterMs: 0 })).toBe(SUGGEST_PAUSE_FALLBACK_MS);
    expect(pauseMsFromResponse(429, { retryAfterMs: Number.NaN })).toBe(SUGGEST_PAUSE_FALLBACK_MS);
  });

  it('超过两分钟的上界夹到两分钟——不让建议长期消失', () => {
    expect(pauseMsFromResponse(429, { retryAfterMs: 600_000 })).toBe(SUGGEST_PAUSE_MAX_MS);
    expect(pauseMsFromResponse(429, { retryAfterMs: 1201 })).toBe(1201);
  });
});

describe('remainingSeconds', () => {
  it('向上取整，过期后是 0 而不是负数', () => {
    expect(remainingSeconds(10_000, 0)).toBe(10);
    expect(remainingSeconds(10_000, 9_001)).toBe(1);
    expect(remainingSeconds(10_000, 10_000)).toBe(0);
    expect(remainingSeconds(10_000, 12_000)).toBe(0);
  });
});
