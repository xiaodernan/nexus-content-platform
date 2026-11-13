import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HealthResponse } from '@nexus/schemas';
import { getCachedAiHealth, resetHealthCache, DEFAULT_HEALTH_TTL_MS } from '@/server/ai/health-cache';

/**
 * `fetchAiServiceHealth` 首行 `if (!aiServiceUrl()) return null`——没配 NEXUS_AI_SERVICE_URL
 * 时根本不会调 fetchImpl。被测的是缓存语义，须先让 client 认为地址已配置，桩才会被触达。
 */
const ENV_KEY = 'NEXUS_AI_SERVICE_URL';
const previousUrl = process.env[ENV_KEY];
beforeEach(() => { process.env[ENV_KEY] = 'http://127.0.0.1:3200'; });

/**
 * §CACHE-1 / ADR-0171 · ai-service `/healthz` 短 TTL 缓存的四条不变量。
 *
 * 判据自身另有变异臂（`.git`，不提交）：逐处改坏 `health-cache.ts`（TTL 命中改永不过期、
 * 失败也缓存、去掉并发去重、成功值写错时刻），每一处都必须让这里对应用例转红。
 */
function health(capability: 'real' | 'demo' = 'real'): HealthResponse {
  return {
    service: 'nexus-ai-service',
    version: '0.1.0',
    capability,
    providers: [
      { kind: 'llm', name: 'openai-compatible', status: capability, models: ['gpt-6-sol'], reason: '' },
    ],
    queue: { backend: 'memory', pending: 0, running: 0, capacity: 1, note: 'test' },
    llmCache: null,
    llmLatency: null,
    llmFlight: null,
  };
}

/** 可控单调时钟：每次读返回 current，测试手动推进（可后退以测注入边界）。 */
function clock(start = 0) {
  let current = start;
  return { now: () => current, tick: (ms: number) => (current += ms) };
}

/**
 * fetch 桩：记录调用次数，按队列返回结果或抛错。
 * 注意被测代码路径是 `getCachedAiHealth → fetchAiServiceHealth(fetchImpl)`；
 * `fetchAiServiceHealth` 内部会 catch 抛错并返回 null，所以 Error 走的是"null 不缓存"分支。
 */
function fetcher(...results: (HealthResponse | null | Error)[]) {
  let i = 0;
  const calls = { n: 0 };
  const fetchImpl = (async () => {
    calls.n += 1;
    const r = results[Math.min(i, results.length - 1)]!;
    i += 1;
    if (r instanceof Error) throw r;
    if (r === null) throw new Error('ECONNREFUSED'); // 底层 catch 成 null
    return Response.json(r);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

afterEach(() => {
  resetHealthCache();
  if (previousUrl === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = previousUrl;
});

describe('getCachedAiHealth（§CACHE-1 短 TTL 缓存 + 并发去重）', () => {
  it('TTL 内命中：第二次不再发 HTTP（真省一次跨服务往返）', async () => {
    const c = clock();
    const f = fetcher(health(), health());
    const a = await getCachedAiHealth(f.fetchImpl, c.now, 5_000);
    c.tick(4_999);
    const b = await getCachedAiHealth(f.fetchImpl, c.now, 5_000);
    expect(a?.capability).toBe('real');
    expect(b?.capability).toBe('real');
    expect(f.calls.n).toBe(1); // 关键：只真发一次
  });

  it('TTL 到期重取：推进到边界后拿到新值', async () => {
    const c = clock();
    const f = fetcher(health('real'), health('demo'));
    await getCachedAiHealth(f.fetchImpl, c.now, 5_000);
    c.tick(5_000); // 正好到 TTL 边界 → 视为过期
    const b = await getCachedAiHealth(f.fetchImpl, c.now, 5_000);
    expect(b?.capability).toBe('demo');
    expect(f.calls.n).toBe(2);
  });

  it('失败不缓存：不可达返回 null 后，下一次立即重试（provider 恢复零延迟）', async () => {
    const c = clock();
    const f = fetcher(null, health('real'));
    const a = await getCachedAiHealth(f.fetchImpl, c.now, 5_000);
    expect(a).toBeNull();
    // 时间没推进，但失败不入缓存 → 仍真发第二次并拿到恢复后的 real
    const b = await getCachedAiHealth(f.fetchImpl, c.now, 5_000);
    expect(b?.capability).toBe('real');
    expect(f.calls.n).toBe(2);
  });

  it('抛错也不缓存：底层 catch 成 null，下次能重试成功', async () => {
    const c = clock();
    const f = fetcher(new Error('ECONNREFUSED'), health('real'));
    expect(await getCachedAiHealth(f.fetchImpl, c.now, 5_000)).toBeNull();
    const b = await getCachedAiHealth(f.fetchImpl, c.now, 5_000);
    expect(b?.capability).toBe('real');
    expect(f.calls.n).toBe(2);
  });

  it('并发去重：同 tick 5 个请求只真发一次，全部拿到同一结果', async () => {
    const c = clock();
    let release!: (v: HealthResponse) => void;
    const gate = new Promise<Response>((r) => {
      release = (v: HealthResponse) => r(Response.json(v));
    });
    let n = 0;
    const counted = (async () => {
      n += 1;
      return gate;
    }) as unknown as typeof fetch;
    const pending = Array.from({ length: 5 }, () => getCachedAiHealth(counted, c.now, 5_000));
    expect(n).toBe(1); // 5 个调用都在途时，只触发 1 次底层 fetch
    release(health('real'));
    const results = await Promise.all(pending);
    expect(results.every((h) => h?.capability === 'real')).toBe(true);
    expect(n).toBe(1); // 全部共享那一次结果，没有惊群
  });

  it('并发失败后清空在途：不会把失败钉死，下一次可重试', async () => {
    const c = clock();
    let fail!: () => void;
    const gate = new Promise<Response>((_, rej) => {
      fail = () => rej(new Error('ECONNREFUSED'));
    });
    let n = 0;
    const counted = (async () => {
      n += 1;
      return gate;
    }) as unknown as typeof fetch;
    const pending = Array.from({ length: 3 }, () => getCachedAiHealth(counted, c.now, 5_000));
    expect(n).toBe(1);
    fail();
    const failed = await Promise.all(pending);
    expect(failed.every((h) => h === null)).toBe(true);
    // 失败不写缓存、inFlight 已清 → 下一次立即真发（换一个能成功的桩）
    const ok = fetcher(health('real'));
    const recovered = await getCachedAiHealth(ok.fetchImpl, c.now, 5_000);
    expect(recovered?.capability).toBe('real');
    expect(ok.calls.n).toBe(1);
  });

  it('默认时钟单调（performance.now）且默认 TTL 5s：不依赖可回拨的墙钟', async () => {
    expect(DEFAULT_HEALTH_TTL_MS).toBe(5_000);
    // 生产默认 now = performance.now（单调）；这里只钉常量与默认路径能跑通，
    // 不注入时钟时内部用真实单调时钟，不受 Date.now 回拨影响。
    const f = fetcher(health('real'));
    const h = await getCachedAiHealth(f.fetchImpl);
    expect(h?.capability).toBe('real');
  });

  it('resetHealthCache 清成功缓存：重置后强制重新探测', async () => {
    const c = clock();
    const f = fetcher(health('real'), health('demo'));
    await getCachedAiHealth(f.fetchImpl, c.now, 5_000);
    resetHealthCache();
    const b = await getCachedAiHealth(f.fetchImpl, c.now, 5_000);
    expect(b?.capability).toBe('demo');
    expect(f.calls.n).toBe(2);
  });

  it('resetHealthCache 连在途标记一起清：未决请求后 reset，下一次能立即重发', async () => {
    const c = clock();
    let release!: (v: HealthResponse) => void;
    const gate = new Promise<Response>((r) => {
      release = (v: HealthResponse) => r(Response.json(v));
    });
    let n = 0;
    const slow = (async () => { n += 1; return gate; }) as unknown as typeof fetch;
    const first = getCachedAiHealth(slow, c.now, 5_000); // 制造一个未决在途（n=1）
    expect(n).toBe(1);
    resetHealthCache(); // 测试隔离语义：把在途也清掉，不留污染
    // 换一个能立即返回的桩；若 reset 没清 inFlight，这里会被旧在途短路 → n 仍为 1 → 红
    const ok = fetcher(health('demo'));
    const second = getCachedAiHealth(ok.fetchImpl, c.now, 5_000);
    expect(ok.calls.n).toBe(1); // 关键：立即真发了新请求
    release(health('real'));
    await Promise.all([first, second]);
  });
});
