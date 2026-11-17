import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';
import { getRateLimiter, setRateLimiter } from '../src/server/security/rateLimit';

/**
 * §BIBLE-4 · POST /api/bible/q 契约门（真路由，mock 掉两个外部接缝：ai-service 与 mock 会话）。
 * 不走网络（chatWithCharacter 打到 503/answer mock 上），不连库（requireUser 打成测试会话）。
 * 覆盖：成功直通 · provider 不可用 503 透传 · 400 缺 question · 五分钟 5 次限流。
 */
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => { jar.set(name, value); },
    delete: (name: string) => { jar.delete(name); },
  }),
}));

const chatCalls: unknown[] = [];
let forceUnavailable = false;
vi.mock('../src/server/domain/session', () => ({
  requireUser: async () => ({ id: 'user-test-bible-ask' }),
}));
vi.mock('../src/server/observability', () => ({
  increment: () => {},
  observe: () => {},
}));
vi.mock('../src/server/ai/client', () => ({
  chatWithCharacter: async (req: unknown) => {
    chatCalls.push(req);
    if (forceUnavailable) {
      return {
        ok: false as const,
        status: 503,
        error: { code: 'provider-unavailable', message: 'nope', hint: '', retryable: true },
      };
    }
    return {
      ok: true as const,
      response: {
        requestId: 'bible-ask-test',
        capability: 'real' as const,
        provider: 'openai-compatible',
        model: 'gpt-6.1-terra',
        text: '典籍曰：潮候院的收件人不是人，是潮。',
        usage: { cachedTokens: 4421, cacheReported: true, tokensIn: 4421, tokensOut: 13, provider: 'openai-compatible', model: 'gpt-6.1-terra', modelClass: 'fast', latencyMs: 46 },
      },
    };
  },
}));

import { POST } from '../src/app/api/bible/q/route';

function req(ip: string, body: unknown, csrfMatches = true): Request {
  if (csrfMatches) jar.set('nexus_csrf', 'csrf-token');
  else jar.clear();
  return new Request('http://localhost/api/bible/q', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-token', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  const previous = getRateLimiter();
  setRateLimiter(new MemoryRateLimiter());
  return () => setRateLimiter(previous);
});
afterAll(() => setRateLimiter(undefined));

describe('§BIBLE-4 POST /api/bible/q', () => {
  it('正常一问一答：200 · capability=real · cachedTokens 透传', async () => {
    forceUnavailable = false;
    const res = await POST(req('203.0.113.55', { question: '《收件人》里谁收到了签收单？', locale: 'zh' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { capability: string; cachedTokens: number; answer: string };
    expect(body.capability).toBe('real');
    expect(body.cachedTokens).toBe(4421);
    expect(body.answer).toContain('收件人');
    expect(chatCalls.length).toBeGreaterThan(0);
  });

  it('system 是问典 digest 前缀（KV 复用依赖字节稳定）', async () => {
    chatCalls.length = 0;
    await POST(req('203.0.113.56', { question: '第二章讲谁？', locale: 'zh' }));
    const sent = chatCalls[0] as { system: string; user: string };
    expect(sent.system).toContain('THE WORLD BIBLE — CANON DIGEST');
    expect(sent.user).toContain('第二章讲谁？');
  });

  it('provider 不可用：503 原样 503，错误信息不编造潮汐', async () => {
    forceUnavailable = true;
    const res = await POST(req('203.0.113.57', { question: 'hello?', locale: 'en' }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('provider-unavailable');
    forceUnavailable = false;
  });

  it('缺 question / 空 question → 400', async () => {
    const res = await POST(req('203.0.113.58', {}));
    expect(res.status).toBe(400);
    const res2 = await POST(req('203.0.113.58', { question: '' }));
    expect(res2.status).toBe(400);
  });

  it('CSRF 不匹配 → 403', async () => {
    const res = await POST(req('203.0.113.59', { question: 'hi' }, false));
    expect(res.status).toBe(403);
  });

  it('五分钟五次：第 6 次起 429（不看口令对错）', async () => {
    const ip = '203.0.113.60';
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(req(ip, { question: `问一问 ${i}`, locale: 'zh' }));
      expect(res.status).toBe(200);
    }
    const res = await POST(req(ip, { question: '再问一次', locale: 'zh' }));
    expect(res.status).toBe(429);
  });
});
