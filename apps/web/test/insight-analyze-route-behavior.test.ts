import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';
import { getRateLimiter, setRateLimiter } from '../src/server/security/rateLimit';

/**
 * §INSIGHT-3 · POST /api/insight/analyze 契约门：真路由，mock 三个接缝（DB 快照、provider、observability）。
 * 覆盖：cookie 缺失 403 → 成功 → provider-503 → 连续 10+1 次限流。
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
        requestId: 'insight-ai-test',
        capability: 'real' as const,
        provider: 'openai-compatible',
        model: 'gpt-6.1-terra',
        text: '① 现象：用户太少，目录页打开后离开率高。② 证据：opens=0 是 30 天真数。③ 动作：今天把 /bible/ask 推到播音首位。',
        usage: { tokensIn: 1500, cachedTokens: 1200, cacheReported: true, tokensOut: 60, provider: 'openai-compatible', model: 'gpt-6.1-terra', modelClass: 'fast', latencyMs: 2500, demoMode: false, costBasis: 'unknown', toolCalls: 0, costUsd: 0, reasoningTokens: 0 },
      },
    };
  },
}));

vi.mock('../src/server/domain/insight', () => ({
  collectInsightSnapshot: async () => ({
    totals: { users: 0, guests: 2, projects: 1, published: 0, likes: 0, comments: 0, follows: 0, viewsAllTime: 0, gameCompletions: 0, workCompletions: 0, usageCalls30d: 0 },
    series30d: {
      days: Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0')),
      signups: [],
      publishes: [],
      opens: [],
    },
    credits30d: { granted: 100, consumed: 10 },
    ai30d: { realCalls: 3, demoCalls: 0, tokensIn: 9000, cachedTokens: 4500, costEstimateUsd: 0.01, avgLatencyMs: 800 },
    botOpens30d: 0,
    opens30d: 0,
    likes30d: 0,
    comments30d: 0,
    topWorks: [],
    metrics: {},
  }),
}));

vi.mock('../src/server/observability', () => ({
  increment: () => {},
  observe: () => {},
}));

import { POST } from '../src/app/api/insight/analyze/route';

function req(ip: string, body: unknown, withCookie = true): Request {
  jar.set('nexus_csrf', 'csrf-token-value');
  if (withCookie) jar.set('nexus-insight', '1');
  else jar.delete('nexus-insight');
  return new Request('http://localhost/api/insight/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-token-value', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  const previous = getRateLimiter();
  setRateLimiter(new MemoryRateLimiter());
  return () => setRateLimiter(previous);
});
afterAll(() => setRateLimiter(undefined));

describe('§INSIGHT-3 POST /api/insight/analyze', () => {
  it('cookie 缺失 → 403（留住了口令门）', async () => {
    const res = await POST(req('203.0.113.81', { locale: 'zh' }, false));
    expect(res.status).toBe(403);
  });

  it('cookie 在 → 200 · capability=real · cachedTokens 透传', async () => {
    forceUnavailable = false;
    const res = await POST(req('203.0.113.82', { locale: 'zh' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { capability: string; cachedTokens: number; answer: string };
    expect(body.capability).toBe('real');
    expect(body.cachedTokens).toBe(1200);
    expect(body.answer).toContain('opens=0');
    expect(chatCalls.length).toBeGreaterThan(0);
    const sent = chatCalls[0] as { system: string; user: string };
    expect(sent.system).toContain('product analyst');
    expect(sent.user).toContain('locale: zh');
    expect(sent.user).toContain('tokensIn=9000');
  });

  it('provider 不可用 → 503（honest 503 — 绝不编造分析）', async () => {
    forceUnavailable = true;
    const res = await POST(req('203.0.113.83', { locale: 'zh' }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('provider-unavailable');
    forceUnavailable = false;
  });

  it('digest 里没有任何个人标识字段（只看聚合整数）', async () => {
    chatCalls.length = 0;
    await POST(req('203.0.113.84', { locale: 'en' }));
    const sent = (chatCalls[0] as { user: string }).user;
    expect(sent).toContain('TOTALS');
    expect(sent).toContain('END DIGEST');
    expect(sent).not.toContain('x-forwarded-for');
    expect(sent).not.toContain('203.0.113');
  });
});
