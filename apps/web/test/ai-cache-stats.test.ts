import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAiCacheStats, isKnownReadout } from '@/server/ai/cache-stats';

/**
 * §CACHE-2 `server/ai/cache-stats.ts`：跨进程取读数那一寸。
 *
 * 这一段是全片最该有判据的地方——它做的事是**把另一个进程的报文变成页面上的数字**。
 * 一旦它偷懒（`await res.json() as X`），字段缺失那天 `undefined` 会一路传进渲染，
 * 面板上出现 `NaN%` 或 `undefined 次`。那不是"读数不对"，那是**编了一个读数**。
 *
 * 判据分三组：
 *  1. 形状校验：缺一段、多一层、类型不对，一律判不认识（宁可说"没测到"，不给半份读数）；
 *  2. 归一化：snake_case → camelCase（`hit_rate` / `stores_failed` 这两处最容易漏）；
 *  3. 失败面三种分开说：没配地址 / 连不上 / 形状不认识——三者对运维的含义完全不同。
 *
 * 全程用注入的假 fetch，不打网络。
 */

const LIVE_BODY = {
  prefix: { requests: 2, reused: 1, uniquePrefixes: 1, capacity: 512, evictions: 0, reuseRate: 0.5 },
  appCache: {
    enabled: true,
    backend: 'redis',
    hits: 1,
    misses: 1,
    stores: 1,
    stores_failed: 0,
    evictions: 0,
    hit_rate: 0.5,
    shared: true,
    degraded: false,
    namespace: 'nexus:llmc',
  },
  provider: { reported: 2, missing: 0, cachedTokensTotal: 43362, promptTokensTotal: 45692, reportedHitRate: 0.949 },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let savedUrl: string | undefined;

beforeEach(() => {
  savedUrl = process.env.NEXUS_AI_SERVICE_URL;
  process.env.NEXUS_AI_SERVICE_URL = 'http://ai.test';
});

afterEach(() => {
  if (savedUrl === undefined) delete process.env.NEXUS_AI_SERVICE_URL;
  else process.env.NEXUS_AI_SERVICE_URL = savedUrl;
  vi.restoreAllMocks();
});

describe('§CACHE-2 isKnownReadout', () => {
  it('线上报文（含 snake_case 字段）判认识', () => {
    expect(isKnownReadout({ ...LIVE_BODY, measuredAt: '2026-11-13T00:00:00.000Z' })).toBe(true);
  });

  it('appCache 为 null 也判认识——"没启用"是合法状态，不是坏报文', () => {
    expect(isKnownReadout({ ...LIVE_BODY, appCache: null, measuredAt: '2026-11-13T00:00:00.000Z' })).toBe(true);
  });

  it('缺段 / 段不是对象 / 关键字段不是数字 → 一律不认识', () => {
    const at = { measuredAt: '2026-11-13T00:00:00.000Z' };
    expect(isKnownReadout({ ...at, prefix: LIVE_BODY.prefix })).toBe(false);
    expect(isKnownReadout({ ...LIVE_BODY, prefix: null, ...at })).toBe(false);
    expect(isKnownReadout({ ...LIVE_BODY, prefix: [], ...at })).toBe(false);
    expect(isKnownReadout({ ...LIVE_BODY, prefix: { ...LIVE_BODY.prefix, requests: '2' }, ...at })).toBe(false);
    expect(isKnownReadout({ ...LIVE_BODY, provider: { ...LIVE_BODY.provider, missing: null }, ...at })).toBe(false);
  });

  it('没有 measuredAt 判不认识（web 侧自己打的时间戳，缺了就没法说"这是什么时候的账"）', () => {
    expect(isKnownReadout({ ...LIVE_BODY })).toBe(false);
    expect(isKnownReadout({ ...LIVE_BODY, measuredAt: 123 })).toBe(false);
  });

  it('非对象一律不认识（null / 数组 / 字符串 / 数字）', () => {
    for (const value of [null, undefined, [], 'x', 1, true]) {
      expect(isKnownReadout(value)).toBe(false);
    }
  });
});

describe('§CACHE-2 fetchAiCacheStats 成功路径', () => {
  it('归一化 snake_case：hit_rate → hitRate、stores_failed → storesFailed', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(LIVE_BODY)) as unknown as typeof fetch;
    const result = await fetchAiCacheStats(fetchImpl);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.readout.prefix.reuseRate).toBe(0.5);
    expect(result.readout.appCache).not.toBeNull();
    expect(result.readout.appCache!.hitRate).toBe(0.5);
    expect(result.readout.appCache!.storesFailed).toBe(0);
    expect(result.readout.appCache!.namespace).toBe('nexus:llmc');
    expect(result.readout.provider.reportedHitRate).toBe(0.949);
    // web 侧自己打的时间戳：可解析、且是"刚刚"
    expect(Number.isNaN(Date.parse(result.readout.measuredAt))).toBe(false);
  });

  it('请求打在 /v1/ai/cache-stats，带 no-store，且不缓存响应', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse(LIVE_BODY);
    }) as unknown as typeof fetch;
    await fetchAiCacheStats(fetchImpl);
    expect(calls[0]!.url).toBe('http://ai.test/v1/ai/cache-stats');
    expect(calls[0]!.init?.cache).toBe('no-store');
  });

  it('appCache:null 原样传成 null，不补一个假对象', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ...LIVE_BODY, appCache: null })) as unknown as typeof fetch;
    const result = await fetchAiCacheStats(fetchImpl);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.readout.appCache).toBeNull();
  });

  it('比例字段缺失时给 null（不是 0）', async () => {
    const body = {
      ...LIVE_BODY,
      prefix: { requests: 0, reused: 0, uniquePrefixes: 0, capacity: 512, evictions: 0 },
      provider: { reported: 0, missing: 0, cachedTokensTotal: 0, promptTokensTotal: 0 },
    };
    const fetchImpl = vi.fn(async () => jsonResponse(body)) as unknown as typeof fetch;
    const result = await fetchAiCacheStats(fetchImpl);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.readout.prefix.reuseRate).toBeNull();
    expect(result.readout.provider.reportedHitRate).toBeNull();
  });
});

describe('§CACHE-2 fetchAiCacheStats 三种失败分开说', () => {
  it('没配地址 → 说到 NEXUS_AI_SERVICE_URL（不是"读取失败"）', async () => {
    delete process.env.NEXUS_AI_SERVICE_URL;
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const result = await fetchAiCacheStats(fetchImpl);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('NEXUS_AI_SERVICE_URL');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('连不上 → 说到"连不上"并带上底层原因', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const result = await fetchAiCacheStats(fetchImpl);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('连不上');
    expect(result.error).toContain('ECONNREFUSED');
  });

  it('HTTP 非 2xx → 把状态码说出来', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 502 })) as unknown as typeof fetch;
    const result = await fetchAiCacheStats(fetchImpl);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('502');
  });

  it('响应不是 JSON → 说"不是 JSON"', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>oops</html>', { status: 200 })) as unknown as typeof fetch;
    const result = await fetchAiCacheStats(fetchImpl);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('不是 JSON');
  });

  it('形状不认识 → 说"版本可能不匹配"，不把半份读数端出去', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ prefix: { requests: 1 } })) as unknown as typeof fetch;
    const result = await fetchAiCacheStats(fetchImpl);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('形状不认识');
  });
});
