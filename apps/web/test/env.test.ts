import { describe, expect, it, vi } from 'vitest';
import type { HealthResponse } from '@nexus/schemas';
import { getAiCapabilities, isDemoMode } from '../src/lib/env';

function health(over: Partial<HealthResponse> = {}): HealthResponse {
  return {
    service: 'nexus-ai-service',
    version: '0.1.0',
    capability: 'demo',
    providers: [],
    // §162：health 里的 queue 现在带后端与容量，0 也要说明 0 是怎么来的
    queue: { backend: 'none', pending: 0, running: 0, capacity: 0, note: '作业队列未启动' },
    llmCache: null,
    llmLatency: null,
    llmFlight: null,
    ...over,
  };
}

/** §160 的判定真值：web 只信 ai-service /healthz，不再看自己进程有没有 key */
describe('getAiCapabilities（由 /healthz 推导）', () => {
  it('health 汇总为 real → text/live real', async () => {
    const caps = await getAiCapabilities(health({ capability: 'real' }));
    expect(caps).toMatchObject({ text: 'real', image: 'demo', video: 'demo', live: true });
  });

  it('llmLatency 如实透传（进程内分位）', async () => {
    const caps = await getAiCapabilities(
      health({
        capability: 'real',
        llmLatency: { calls: 12, errors: 1, window: 12, avg_ms: 4100.5, p50_ms: 3900.2, p95_ms: 8100.1, max_ms: 12000.7 },
      }),
    );
    expect(caps.latency).toMatchObject({ calls: 12, errors: 1, p50_ms: 3900.2, p95_ms: 8100.1 });
  });

  it('v698 / ADR 0130：llmFlight 如实透传（两层分别计账，不合并）', async () => {
    const caps = await getAiCapabilities(
      health({
        capability: 'real',
        llmFlight: {
          enabled: true,
          mode: 'local+redis',
          local: { leaders: 3, joined: 7, coalesced: 7, failures: 0, timeouts: 0, real_calls: 3 },
          distributed: {
            leaders: 3, joined: 1, coalesced: 1, timeouts: 0, self_served: 0,
            lock_failures: 0, marker_failures: 0, peek_misses: 0, real_calls: 3,
          },
          provider_calls: 3,
          note: 'process-local counters',
        },
      }),
    );
    expect(caps.flight).toMatchObject({ mode: 'local+redis', provider_calls: 3 });
    expect(caps.flight?.local?.coalesced).toBe(7);
    expect(caps.flight?.distributed?.coalesced).toBe(1);
  });

  it('prefetched 为 null（探测过但不可达）→ 回落 demo，绝不编造', async () => {
    const caps = await getAiCapabilities(null);
    expect(caps).toMatchObject({ text: 'demo', live: false });
  });

  it('图像 / 视频 provider 单独出现 real 时升级对应档位', async () => {
    const caps = await getAiCapabilities(
      health({
        capability: 'real',
        providers: [
          { kind: 'image', name: 'x', status: 'real', models: [] },
          { kind: 'video', name: 'y', status: 'demo', models: [] },
        ],
      }),
    );
    expect(caps.image).toBe('real');
    expect(caps.video).toBe('demo');
  });

  it('未探测（undefined）时会去拉 /healthz', async () => {
    const spy = vi.spyOn(await import('../src/server/ai/client'), 'fetchAiServiceHealth').mockResolvedValue(
      health({ capability: 'real' }),
    );
    const caps = await getAiCapabilities();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(caps.live).toBe(true);
    spy.mockRestore();
  });
});

describe('isDemoMode', () => {
  it('ai-service 不可达时为 true', async () => {
    const spy = vi.spyOn(await import('../src/server/ai/client'), 'fetchAiServiceHealth').mockResolvedValue(null);
    expect(await isDemoMode()).toBe(true);
    spy.mockRestore();
  });
});
