import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';
import { getRateLimiter, setRateLimiter } from '../src/server/security/rateLimit';

/**
 * §169-AI · POST /api/analytics/agent-narrate 契约门：真路由，mock 三个接缝（DB 事实、provider、observability）。
 * 覆盖：项目不存在 → 404 provider 不可用 → 503 正常命中 → 200 + digest 纯聚合口径。
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
let fact: unknown = null;
vi.mock('../src/server/domain/session', () => ({
  requireUser: async () => ({ id: 'creator-test-1' }),
}));
vi.mock('../src/server/domain/analytics-agent', async () => {
  const actual = await vi.importActual<typeof import('../src/server/domain/analytics-agent')>('../src/server/domain/analytics-agent');
  return {
    ...actual,
    buildCreatorFact: async () => fact,
  };
});
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
        requestId: 'analytics-ai-test',
        capability: 'real' as const,
        provider: 'openai-compatible',
        model: 'gpt-6.1-terra',
        text: '① 事实：这一版访客 780，38% 来自 bot。② 数字说：这一版的标题嵌了"夹具"不具体。③ 单个动作：先把标题改短。',
        usage: { tokensIn: 3000, cachedTokens: 1800, cacheReported: true, tokensOut: 80, provider: 'openai-compatible', model: 'gpt-6.1-terra', modelClass: 'fast', latencyMs: 2500, demoMode: false, costBasis: 'unknown', toolCalls: 0, costUsd: 0, reasoningTokens: 0 },
      },
    };
  },
}));

import { POST } from '../src/app/api/analytics/agent-narrate/route';

function req(ip: string, body: unknown): Request {
  jar.set('nexus_csrf', 'csrf-token-value');
  return new Request('http://localhost/api/analytics/agent-narrate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-token-value', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

const projectFixture = {
  projectName: 'Demo World',
  description: 'walk it',
  hasCoverImage: true,
  visibility: 'public',
  moderation: 'clear',
  publishedAt: '2026-10-20T00:00:00.000Z',
  daysSincePublish: 28,
  hasGame: false,
  numbers: {
    views: 4212, opensToday: 3, visitors: 780, visitorsToday: 2,
    likes: 33, remixes: 2, followers: 12,
    completion: { avgPct: 58.4, over: 210 },
    playTimeMs: 1_800_000, cappedReports: 0,
    selfOnly: false, botOpens: 300, botVisitors: 100,
    completedVisitors: 21, botCompletions: 4,
    selfCompleted: false,
  },
};

beforeAll(() => {
  const previous = getRateLimiter();
  setRateLimiter(new MemoryRateLimiter());
  return () => setRateLimiter(previous);
});
afterAll(() => setRateLimiter(undefined));

describe('§169-AI POST /api/analytics/agent-narrate', () => {
  it('我的项目被接受（200），模型看到完整 suite 数字', async () => {
    forceUnavailable = false;
    fact = projectFixture;
    const res = await POST(req('203.0.113.91', { projectId: 'project-uuid-1', locale: 'zh' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { capability: string; cachedTokens: number; answer: string };
    expect(body.capability).toBe('real');
    expect(body.cachedTokens).toBe(1800);
    expect(body.answer).toContain('夹具');
    const sent = chatCalls[0] as { system: string; user: string };
    expect(sent.user).toContain('project="Demo World"');
    expect(sent.user).toContain('visitors=780');
    expect(sent.user).toContain('RULE FINDINGS');
  });

  it('item 不存在 → 404（不暴露它在库里有没有）', async () => {
    fact = null;
    const res = await POST(req('203.0.113.92', { projectId: 'no-such-project' }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('not_found');
  });

  it('provider 不可用 → 503，答案不被伪造', async () => {
    fact = projectFixture;
    forceUnavailable = true;
    const res = await POST(req('203.0.113.93', { projectId: 'project-uuid-1', locale: 'en' }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('provider-unavailable');
    forceUnavailable = false;
  });

  it('digest 也不含 @/user_id/uid 等个人标识', async () => {
    fact = projectFixture;
    chatCalls.length = 0;
    await POST(req('203.0.113.94', { projectId: 'project-uuid-1', locale: 'zh' }));
    const sent = (chatCalls[0] as { user: string }).user;
    expect(sent).not.toContain('203.0.113.94');
    expect(sent).not.toContain('userId');
    expect(sent).toContain('END OF FACT DIGEST');
  });
});
