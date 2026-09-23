import { afterEach, describe, expect, it } from 'vitest';
import type { AiRequest, AiResponse } from '@nexus/schemas';
import { aiServiceUrl, fetchAiServiceHealth, runAiService } from '@/server/ai/client';

/**
 * web → ai-service 的边界：拿不到真实结果时必须明确报不可用，
 * 绝不在这里悄悄回落到 Mock（那会让 DEMO 结果冒充真实 provider，§159）。
 */
const ENV_KEY = 'NEXUS_AI_SERVICE_URL';
const previous = process.env[ENV_KEY];

function withUrl(url: string | undefined, run: () => Promise<void>): Promise<void> {
  if (url === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = url;
  return run().finally(() => {
    if (previous === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previous;
  });
}

const request: AiRequest = {
  requestId: 'req_1',
  intent: 'design-edit',
  prompt: '把标题放大',
  modelClass: 'balanced',
  variants: 1,
  context: {
    projectId: 'prj_1',
    pageId: 'pg_1',
    selection: [],
    designSystemDigest: { tokens: [], components: [] },
    recentChanges: [],
  },
  references: [],
  approvalPolicy: [],
  dryRun: false,
};

function response(overrides: Partial<AiResponse> = {}): AiResponse {
  return {
    requestId: 'req_1',
    capability: 'real',
    provider: 'openai-compatible',
    model: 'gpt-x',
    plans: [],
    patches: [],
    labels: [],
    activities: [],
    explanation: '已放大',
    usage: {
      provider: 'openai-compatible',
      model: 'gpt-x',
      modelClass: 'balanced',
      tokensIn: 10,
      tokensOut: 5,
      latencyMs: 100,
      costUsd: 0,
      toolCalls: 1,
      demoMode: false,
    },
    approvals: [],
    ...overrides,
  };
}

function stubFetch(init: (input: RequestInfo | URL, options?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; options?: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, options?: RequestInit) => {
    calls.push({ url: String(input), options });
    return init(input, options);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

afterEach(() => {
  if (previous === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = previous;
});

describe('runAiService', () => {
  it('未配置地址时直接报 provider-unavailable', async () => {
    await withUrl(undefined, async () => {
      expect(aiServiceUrl()).toBeNull();
      const { impl } = stubFetch(() => new Response('{}'));
      const result = await runAiService(request, impl);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBeNull();
        expect(result.error.code).toBe('provider-unavailable');
      }
    });
  });

  it('服务不可达时报可重试的不可用，不回落到 Mock', async () => {
    await withUrl('http://127.0.0.1:3200/', async () => {
      expect(aiServiceUrl()).toBe('http://127.0.0.1:3200');
      const failing = (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;
      const result = await runAiService(request, failing);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('provider-unavailable');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  it('透传服务的错误码与状态', async () => {
    await withUrl('http://127.0.0.1:3200', async () => {
      const { impl, calls } = stubFetch(
        () => new Response(JSON.stringify({ code: 'approval-required', message: '需要审批', retryable: false }), { status: 409 }),
      );
      const result = await runAiService(request, impl);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(409);
        expect(result.error.code).toBe('approval-required');
      }
      expect(calls[0]!.url).toBe('http://127.0.0.1:3200/v1/ai/run');
    });
  });

  it('非 JSON 错误体也能给出可读信息且不抛异常', async () => {
    await withUrl('http://127.0.0.1:3200', async () => {
      const { impl } = stubFetch(() => new Response('boom', { status: 500 }));
      const result = await runAiService(request, impl);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain('boom');
    });
  });

  it('返回通过契约校验的响应', async () => {
    await withUrl('http://127.0.0.1:3200', async () => {
      const { impl } = stubFetch(() => Response.json(response({ patches: [{ ops: [{ op: 'set', nodeId: 'n1', path: 'size.width', value: 10 }] }] })));
      const result = await runAiService(request, impl);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.response.patches[0]!.ops).toHaveLength(1);
    });
  });

  it('服务响应不符合契约时报 internal', async () => {
    await withUrl('http://127.0.0.1:3200', async () => {
      const { impl } = stubFetch(() => Response.json({ requestId: 'req_1' }));
      const result = await runAiService(request, impl);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('internal');
    });
  });
});

describe('fetchAiServiceHealth', () => {
  it('未配置返回 null', async () => {
    await withUrl(undefined, async () => {
      const { impl } = stubFetch(() => new Response('{}'));
      expect(await fetchAiServiceHealth(impl)).toBeNull();
    });
  });

  it('解析健康响应；坏数据一律当作不可用', async () => {
    await withUrl('http://127.0.0.1:3200', async () => {
      const good = stubFetch(() =>
        Response.json({ service: 'nexus-ai-service', version: '0.1.0', capability: 'real', providers: [{ kind: 'llm', name: 'openai-compatible', status: 'real', models: ['gpt-x'], reason: '' }], queue: { pending: 0, running: 1 } }),
      );
      const health = await fetchAiServiceHealth(good.impl);
      expect(health?.providers[0]?.models).toEqual(['gpt-x']);
      expect(health?.queue.running).toBe(1);

      const bad = stubFetch(() => Response.json({ nope: true }));
      expect(await fetchAiServiceHealth(bad.impl)).toBeNull();

      const down = (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch;
      expect(await fetchAiServiceHealth(down)).toBeNull();
    });
  });
});
