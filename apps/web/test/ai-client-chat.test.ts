import { afterEach, describe, expect, it } from 'vitest';
import type { AiChatRequest, AiChatResponse } from '@nexus/schemas';
import { chatWithCharacter } from '@/server/ai/client';

/**
 * §47 web → ai-service `/v1/ai/chat` 的边界：拿不到真实回复时明确报不可用，
 * 绝不在这里拼一句模板回复冒充角色说话（§159）。
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

const request: AiChatRequest = {
  requestId: 'chat_1',
  system: '你是守夜人。请完全沉浸在这个角色中，用第一人称回复。',
  user: '今晚的山口安静吗？',
  modelClass: 'balanced',
};

function response(overrides: Partial<AiChatResponse> = {}): AiChatResponse {
  return {
    requestId: 'chat_1',
    capability: 'real',
    provider: 'openai-compatible',
    model: 'gpt-x',
    text: '山口安静，风里没有马蹄声。',
    usage: {
      provider: 'openai-compatible',
      model: 'gpt-x',
      modelClass: 'balanced',
      tokensIn: 20,
      tokensOut: 12,
      latencyMs: 300,
      costUsd: 0,
      toolCalls: 1,
      demoMode: false,
    },
    ...overrides,
  };
}

function stubFetch(init: (input: RequestInfo | URL, options?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; options?: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, options?: RequestInit) => {
    if (typeof input !== 'string') throw new Error(`测试桩只处理字符串 URL，收到 ${typeof input}`);
    calls.push({ url: input, options });
    return init(input, options);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

afterEach(() => {
  if (previous === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = previous;
});

describe('chatWithCharacter', () => {
  it('200 时返回模型原话，并把人设与用户消息发过去', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(response()));
    await withUrl('http://ai-service:3200', async () => {
      const result = await chatWithCharacter(request, impl);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.response.text).toBe('山口安静，风里没有马蹄声。');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe('http://ai-service:3200/v1/ai/chat');
      const rawBody = calls[0]!.options?.body;
      expect(typeof rawBody).toBe('string');
      const sent = JSON.parse(rawBody as string) as Record<string, unknown>;
      expect(sent.system).toContain('守夜人');
      expect(sent.user).toBe('今晚的山口安静吗？');
    });
  });

  it('没配服务地址就不发请求，直接报不可用', async () => {
    const { impl, calls } = stubFetch(() => jsonResponse(response()));
    await withUrl(undefined, async () => {
      const result = await chatWithCharacter(request, impl);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('provider-unavailable');
      expect(calls).toHaveLength(0);
    });
  });

  it('服务不可达时报不可用（可重试），不编回复', async () => {
    const { impl } = stubFetch(() => {
      throw new Error('fetch failed');
    });
    await withUrl('http://ai-service:3200', async () => {
      const result = await chatWithCharacter(request, impl);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('provider-unavailable');
      expect(result.error.retryable).toBe(true);
    });
  });

  it('ai-service 的 503 原样透传（provider-unavailable）', async () => {
    const { impl } = stubFetch(() =>
      jsonResponse({ code: 'provider-unavailable', message: '没有可用的文本 provider', retryable: false }, 503),
    );
    await withUrl('http://ai-service:3200', async () => {
      const result = await chatWithCharacter(request, impl);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.status).toBe(503);
      expect(result.error.code).toBe('provider-unavailable');
    });
  });

  it('200 但报文不合契约时报 internal，不把坏形状交出去', async () => {
    const { impl } = stubFetch(() => jsonResponse({ ...response(), text: undefined }));
    await withUrl('http://ai-service:3200', async () => {
      const result = await chatWithCharacter(request, impl);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('internal');
    });
  });
});
