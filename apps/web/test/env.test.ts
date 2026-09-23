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
    ...over,
  };
}

/** §160 的判定真值：web 只信 ai-service /healthz，不再看自己进程有没有 key */
describe('getAiCapabilities（由 /healthz 推导）', () => {
  it('health 汇总为 real → text/live real', async () => {
    const caps = await getAiCapabilities(health({ capability: 'real' }));
    expect(caps).toMatchObject({ text: 'real', image: 'demo', video: 'demo', live: true });
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
