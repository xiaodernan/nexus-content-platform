import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';
import { getRateLimiter, setRateLimiter } from '../src/server/security/rateLimit';

/**
 * §PULSE-1 · POST /api/admin/pulse/unlock 契约门（真路由，mock 限流器与 narrate 的外部接缝）。
 * 不连库、不打网络：unlock 只判口令发 cookie；narrate 用 mock chatWithCharacter。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => { jar.set(name, value); },
    delete: (name: string) => { jar.delete(name); },
  }),
}));

vi.mock('../src/server/observability', () => ({
  increment: () => {},
  observe: () => {},
}));

vi.mock('../src/server/domain/pulse', () => ({
  readPulseMetrics: async () => ({
    capturedAt: '2026-11-17T00:00:00.000Z',
    usersTotal: 1,
    guestsTotal: 0,
    claimedTotal: 1,
    registrationsByDay: [{ day: '2026-11-17', count: 1 }],
    sessionsActive: 1,
    projectsPublic: 1,
    projectsUnlisted: 0,
    projectsPrivate: 0,
    tasks: [],
    audit: [],
    apiCalls: [],
    trend: { slopePerDay: 0, intercept: 1, r2: 0, projectedNext7d: 7, points: 1 },
  }),
  buildPulseDigest: () => 'users_total: 1\n',
}));

const narrateCalls: unknown[] = [];
const forceUnavailable = { current: false };
vi.mock('../src/server/ai/client', () => ({
  chatWithCharacter: async (req: unknown) => {
    narrateCalls.push(req);
    if (forceUnavailable.current) {
      return {
        ok: false as const,
        status: 503,
        error: { code: 'provider-unavailable', message: 'nope', hint: '', retryable: true },
      };
    }
    return {
      ok: true as const,
      response: {
        requestId: 'pulse-test',
        capability: 'real' as const,
        provider: 'openai-compatible',
        model: 'gpt-6.1-terra',
        text: '1. 先看 r2；2. 补 guest 认领；3. 盯住 7 天外推。',
        usage: { cachedTokens: 0, cacheReported: false, tokensIn: 210, tokensOut: 48, provider: 'openai-compatible', model: 'gpt-6.1-terra', modelClass: 'fast', latencyMs: 700 },
      },
    };
  },
}));

import { POST as unlockPOST } from '../src/app/api/admin/pulse/unlock/route';
import { POST as narratePOST } from '../src/app/api/admin/pulse/narrate/route';

function formRequest(ip: string, password: string): Request {
  const body = new URLSearchParams();
  body.set('password', password);
  return new Request('http://localhost/api/admin/pulse/unlock', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-for': ip },
    body,
  });
}

function jsonRequest(ip: string, password: string): Request {
  return new Request('http://localhost/api/admin/pulse/unlock', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ password }),
  });
}

beforeAll(() => {
  const previous = getRateLimiter();
  setRateLimiter(new MemoryRateLimiter());
  return () => setRateLimiter(previous);
});
afterAll(() => setRateLimiter(undefined));

describe('§PULSE-1 口令闸', () => {
  it('表单正确口令：303 回 /admin/pulse + 种下 nexus_pulse cookie', async () => {
    const res = await unlockPOST(formRequest('203.0.113.70', '123'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/admin/pulse');
    expect(res.headers.get('set-cookie')).toContain('nexus_pulse=1');
  });

  it('表单错误口令：303 回 /admin/pulse?e=1，不种 cookie', async () => {
    const res = await unlockPOST(formRequest('203.0.113.71', '456'));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/admin/pulse?e=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('JSON 正确口令：200 ok + cookie', async () => {
    const res = await unlockPOST(jsonRequest('203.0.113.72', '123'));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('nexus_pulse=1');
  });

  it('JSON 错误口令：403 wrong-password', async () => {
    const res = await unlockPOST(jsonRequest('203.0.113.73', '456'));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('wrong-password');
  });
});

describe('§PULSE-2 narrate', () => {
  it('没有 pulse cookie：403 pulse-locked，模型不被调用', async () => {
    narrateCalls.length = 0;
    jar.clear();
    const req = new Request('http://localhost/api/admin/pulse/narrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.74' },
      body: JSON.stringify({ locale: 'zh' }),
    });
    const res = await narratePOST(req);
    expect(res.status).toBe(403);
    expect(narrateCalls).toHaveLength(0);
  });

  it('有 pulse cookie：200 · 模型现场生成', async () => {
    narrateCalls.length = 0;
    forceUnavailable.current = false;
    jar.set('nexus_pulse', '1');
    const req = new Request('http://localhost/api/admin/pulse/narrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.75' },
      body: JSON.stringify({ locale: 'zh' }),
    });
    const res = await narratePOST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { answer: string; model: string };
    expect(body.answer).toContain('1.');
    expect(body.model).toBe('gpt-6.1-terra');
    expect(narrateCalls.length).toBeGreaterThan(0);
    jar.clear();
  });

  it('provider 不可用：503 provider-unavailable（不假装给分析）', async () => {
    forceUnavailable.current = true;
    jar.set('nexus_pulse', '1');
    const req = new Request('http://localhost/api/admin/pulse/narrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.76' },
      body: JSON.stringify({ locale: 'zh' }),
    });
    const res = await narratePOST(req);
    expect(res.status).toBe(503);
    forceUnavailable.current = false;
    jar.clear();
  });
});
