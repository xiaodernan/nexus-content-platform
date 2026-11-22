/**
 * §CANON-REVIEW 路由行为门（2026-11-22）。
 *
 * 静态门只能证明「代码长这样」；这里跑真 route：鉴权三态、超长拒绝、限流、
 * 以及成功路径把 system/user/modelClass/cacheLane 正确交给 provider。
 * 不启服务器、不连库、不打网络——mock 三个接缝（session / provider / rate limiter）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const jar = vi.hoisted(() => new Map<string, string>([['nexus_csrf', 'test-csrf-token']]));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => { jar.set(name, value); },
    delete: (name: string) => { jar.delete(name); },
  }),
}));

import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';
import { getRateLimiter, setRateLimiter } from '../src/server/security/rateLimit';

type ChatReq = { requestId: string; system: string; user: string; modelClass: string; cacheLane?: string };
const chatCalls: ChatReq[] = [];
let providerDown = false;

vi.mock('../src/server/ai/client', () => ({
  chatWithCharacter: async (req: ChatReq) => {
    chatCalls.push(req);
    if (providerDown) {
      return {
        ok: false as const,
        status: 503,
        error: { code: 'provider-unavailable', message: 'gateway down', hint: '', retryable: true },
      };
    }
    return {
      ok: true as const,
      response: {
        requestId: req.requestId,
        capability: 'real' as const,
        provider: 'openai-compatible',
        model: 'gpt-6.2-sol',
        text: 'A. 无\nB. 无\nC. 无\nD. 可按现状通过。',
        usage: {
          tokensIn: 24348, cachedTokens: 0, cacheReported: true, tokensOut: 361,
          provider: 'openai-compatible', model: 'gpt-6.2-sol', modelClass: 'reasoning',
          latencyMs: 4200, demoMode: false, costBasis: 'unknown', toolCalls: 0, costUsd: 0, reasoningTokens: 0,
        },
      },
    };
  },
}));

let currentUser: { id: string; role: string; displayName: string } | null = null;
vi.mock('../src/server/domain/session', () => ({
  currentUserOrNull: async () => currentUser,
}));

import { POST } from '../src/app/api/admin/canon/review/route';

const CANDIDATE = '**锚句**：' + '潮'.repeat(60);

function req(body: unknown, ip = '203.0.113.7'): Request {
  return new Request('http://localhost/api/admin/canon/review', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

describe('§CANON-REVIEW 路由行为', () => {
  beforeEach(() => {
    chatCalls.length = 0;
    providerDown = false;
    currentUser = null;
    setRateLimiter(new MemoryRateLimiter());
  });
  afterEach(() => setRateLimiter(undefined));

  it('未登录 → 401，且不调用 provider', async () => {
    const res = await POST(req({ text: CANDIDATE, kind: 'echo' }));
    expect(res.status).toBe(401);
    expect(chatCalls).toHaveLength(0);
  });

  it('非 admin → 403，且不调用 provider（评审不是普通用户功能）', async () => {
    currentUser = { id: 'u1', role: 'creator', displayName: 'Creator' };
    const res = await POST(req({ text: CANDIDATE, kind: 'echo' }));
    expect(res.status).toBe(403);
    expect(chatCalls).toHaveLength(0);
  });

  it('admin + 合法候选 → 200，system/user/modelClass/cacheLane 全部正确透传', async () => {
    currentUser = { id: 'admin1', role: 'admin', displayName: 'Admin' };
    const res = await POST(req({ text: CANDIDATE, kind: 'echo' }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { review: string; model: string; usage: { tokensIn: number } };
    expect(body.review).toContain('可按现状通过');
    expect(body.model).toBe('gpt-6.2-sol');
    expect(body.usage.tokensIn).toBe(24348);

    expect(chatCalls).toHaveLength(1);
    const call = chatCalls[0]!;
    expect(call.modelClass).toBe('reasoning');
    expect(call.cacheLane).toBe('canon-review');
    expect(call.system).toContain('疑似');
    expect(call.user).toContain(CANDIDATE);
    expect(call.user).toContain('既有锚句全文');
    // 候选正文只在 user 里，不进 system（前缀稳定才能命中缓存）
    expect(call.system).not.toContain(CANDIDATE);
  });

  it('太短 → 400（不足 40 字），不烧 provider', async () => {
    currentUser = { id: 'admin1', role: 'admin', displayName: 'Admin' };
    const res = await POST(req({ text: '太短', kind: 'echo' }));
    expect(res.status).toBe(400);
    expect(chatCalls).toHaveLength(0);
  });

  it('超上限 → 400（整卷粘贴被挡在门外）', async () => {
    currentUser = { id: 'admin1', role: 'admin', displayName: 'Admin' };
    const res = await POST(req({ text: '潮'.repeat(24_001), kind: 'echo' }));
    expect(res.status).toBe(400);
    expect(chatCalls).toHaveLength(0);
  });

  it('kind 只接受 echo/chapter', async () => {
    currentUser = { id: 'admin1', role: 'admin', displayName: 'Admin' };
    const res = await POST(req({ text: CANDIDATE, kind: 'novel' }));
    expect(res.status).toBe(400);
    expect(chatCalls).toHaveLength(0);
  });

  it('provider 不可用 → 503 如实回，不伪造评审', async () => {
    currentUser = { id: 'admin1', role: 'admin', displayName: 'Admin' };
    providerDown = true;
    const res = await POST(req({ text: CANDIDATE, kind: 'echo' }));
    expect(res.status).toBe(503);
    // jsonError returns a FLAT body: { error: '<machine-code>', message, ... }
    const body = (await res.json()) as { error?: string; message?: string };
    expect(body.error).toBe('provider-unavailable');
  });

  it('第 11 次 → 429（每次带全部锚句，必须设闸）', async () => {
    currentUser = { id: 'admin1', role: 'admin', displayName: 'Admin' };
    for (let i = 0; i < 10; i += 1) {
      const ok = await POST(req({ text: CANDIDATE, kind: 'echo' }, '198.51.100.9'));
      expect(ok.status).toBe(200);
    }
    const blocked = await POST(req({ text: CANDIDATE, kind: 'echo' }, '198.51.100.9'));
    expect(blocked.status).toBe(429);
    expect(chatCalls).toHaveLength(10);
  });
});
