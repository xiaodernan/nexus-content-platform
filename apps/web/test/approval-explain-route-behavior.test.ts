import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';
import { getRateLimiter, setRateLimiter } from '../src/server/security/rateLimit';

/** §73-AI · POST /api/ai/tasks/[taskId]/approval-explain 契约门（mock db + provider；真路由）。 */
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
let approvalView: { status: string; approvals: Array<{ action: string; reason: string }> } | null = null;

vi.mock('../src/server/domain/agent-tasks', () => ({
  readApprovalTask: async () => approvalView,
}));
vi.mock('../src/server/domain/session', () => ({
  requireUser: async () => ({ id: 'user-test-explain' }),
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
        requestId: 'explain-test',
        capability: 'real' as const,
        provider: 'openai-compatible',
        model: 'gpt-6.2-sol',
        text: '这几处会删掉画布根节点的三条级联、然后新增两页。未落地的话画布不会被改。',
        usage: { tokensIn: 900, cachedTokens: 700, cacheReported: true, tokensOut: 42, provider: 'openai-compatible', model: 'gpt-6.2-sol', modelClass: 'fast', latencyMs: 1200, demoMode: false, costBasis: 'unknown', toolCalls: 0, costUsd: 0, reasoningTokens: 0 },
      },
    };
  },
}));

import { POST } from '../src/app/api/ai/tasks/[taskId]/approval-explain/route';

function req(ip: string, body: unknown): Request {
  jar.set('nexus_csrf', 'csrf-token-value');
  return new Request('http://localhost/api/ai/tasks/task-0001/approval-explain', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-token-value', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ taskId: 'task-0001' });

beforeAll(() => {
  const previous = getRateLimiter();
  setRateLimiter(new MemoryRateLimiter());
  return () => setRateLimiter(previous);
});
afterAll(() => setRateLimiter(undefined));

describe('§73-AI POST /api/ai/tasks/[taskId]/approval-explain', () => {
  it('等待审批 → 200 · provider 真回 · 文本即模型原话', async () => {
    forceUnavailable = false;
    approvalView = { status: 'awaiting_approval', approvals: [{ action: 'delete', reason: '删掉 3 条级联' }] };
    const res = await POST(req('203.0.113.71', { locale: 'zh' }), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { capability: string; cachedTokens: number; answer: string };
    expect(body.capability).toBe('real');
    expect(body.cachedTokens).toBe(700);
    expect(body.answer).toContain('删掉');
    const sent = chatCalls[0] as { system: string; user: string };
    expect(sent.user).toContain('agentKey');
    expect(sent.user).toContain('delete:1');
  });

  it('任务不存在 / 不属于你 → 404（不区分）', async () => {
    approvalView = null;
    const res = await POST(req('203.0.113.72', { locale: 'zh' }), { params });
    expect(res.status).toBe(404);
  });

  it('不在等待审批 → 409', async () => {
    approvalView = { status: 'succeeded', approvals: [] };
    const res = await POST(req('203.0.113.73', { locale: 'zh' }), { params });
    expect(res.status).toBe(409);
  });

  it('provider 不可用 → 503 · 不伪造审批解释', async () => {
    approvalView = { status: 'awaiting_approval', approvals: [{ action: 'add', reason: 'x' }] };
    forceUnavailable = true;
    const res = await POST(req('203.0.113.74', { locale: 'zh' }), { params });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('provider-unavailable');
    forceUnavailable = false;
  });

  it('digest 不含载荷之外的内容——只有静态结构 + 附带的 120 字 reason 尾巴', async () => {
    const longReason = 'x'.repeat(400);
    approvalView = { status: 'awaiting_approval', approvals: [{ action: 'replace', reason: longReason }] };
    chatCalls.length = 0;
    await POST(req('203.0.113.75', { locale: 'en' }), { params });
    const sent = (chatCalls[0] as { user: string }).user;
    expect(sent).toContain('action=replace');
    expect(sent).toContain('END OF DIGEST');
    // 载荷尾巴从不完整 —— 原 reason 长度绝不允许全量进入 digest：
    expect(sent.length).toBeLessThan(longReason.length + 200);
  });
});
