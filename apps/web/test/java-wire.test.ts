import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJavaWireStats, isJavaWireStats } from '@/server/realtime/java-wire';

/**
 * §SC-58 — Java 生产者门面（`/api/admin/realtime` 把它并进同一份回执）。
 *
 * 判分面：
 * 1. 形状门：计数必须有限非负、`wireChannel` 非空、`maxFrameBytes` 正数——少一格就是 null，
 *    不拿半截数据渲染一张"看起来正常"的表盘；
 * 2. 传输层：`!res.ok` / 回执形状不认识 / fetch 抛错（超时、断网）→ 一律 `null`，
 *    "没拿到"与"接了但全是 0"在这页不是同一个词；
 * 3. 端点来自 `NEXUS_JAVA_WIRE_STATS_URL`，默认 `127.0.0.1:8082`（与 domain-service 默认一致）。
 */

const validPayload = {
  wireChannel: 'nexus:realtime:v1',
  maxFrameBytes: 65_536,
  publishedTotal: 7,
  tooLargeDropped: 2,
  redisFailures: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isJavaWireStats', () => {
  it('认识的完整回执通过', () => {
    expect(isJavaWireStats(validPayload)).toBe(true);
  });

  it('计数为 NaN / 负数 / 非数字一律 null', () => {
    expect(isJavaWireStats({ ...validPayload, publishedTotal: Number.NaN })).toBe(false);
    expect(isJavaWireStats({ ...validPayload, tooLargeDropped: -1 })).toBe(false);
    expect(isJavaWireStats({ ...validPayload, redisFailures: '1' as unknown as number })).toBe(false);
  });

  it('wireChannel 空串 / maxFrameBytes 为 0 都不给画', () => {
    expect(isJavaWireStats({ ...validPayload, wireChannel: '   ' })).toBe(false);
    expect(isJavaWireStats({ ...validPayload, wireChannel: 42 as unknown as string })).toBe(false);
    expect(isJavaWireStats({ ...validPayload, maxFrameBytes: 0 })).toBe(false);
  });

  it('多出的字段保留、不判形状（向后兼容）', () => {
    expect(isJavaWireStats({ ...validPayload, extra: 'fine' })).toBe(true);
  });
});

describe('fetchJavaWireStats', () => {
  it('正常回执原样取出五个字段', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(validPayload),
      }),
    );
    const stats = await fetchJavaWireStats();
    expect(stats).toEqual(validPayload);
  });

  it('HTTP 非 2xx → null（不是 0 也不是把状态码塞进回执）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect(await fetchJavaWireStats()).toBeNull();
  });

  it('回执形状不认识 → null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ wireChannel: 'nexus:realtime:v1', maxFrameBytes: 65_536 }),
      }),
    );
    expect(await fetchJavaWireStats()).toBeNull();
  });

  it('fetch 抛错（断网/超时）→ null，不抛给调用方', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await fetchJavaWireStats()).toBeNull();
  });

  it('请求带了 timeout 且不跑网关缓存', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validPayload),
    });
    vi.stubGlobal('fetch', spy);
    await fetchJavaWireStats();
    const [, init] = spy.mock.calls[0]! as [string, RequestInit];
    expect(init.cache).toBe('no-store');
    expect(init.signal).toBeTruthy();
  });
});
