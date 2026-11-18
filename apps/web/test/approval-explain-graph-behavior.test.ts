import { describe, expect, it, vi } from 'vitest';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';
import { getRateLimiter, setRateLimiter } from '../src/server/security/rateLimit';
import { beforeAll, afterAll } from 'vitest';

/**
 * §APPROVAL-GRAPH-1 · StateGraph 审批解释·契约门：
 * - verify：含「批准/同意/approve/refuse/reject」 → 机检失败
 * - revision：第一次失败 → 修订一次；修订后通过 verdict = pass
 * - provider 挂 → ok:false · 503（不绕路，不伪造答案）
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
const script: Array<'ok' | 'bad' | 'unavailable'> = [];
vi.mock('../src/server/ai/client', () => ({
  chatWithCharacter: async (req: unknown) => {
    chatCalls.push(req);
    const mode = script.shift() ?? 'ok';
    if (mode === 'unavailable') {
      return { ok: false as const, status: 503, error: { code: 'provider-unavailable', message: 'nope', hint: '', retryable: true } };
    }
    if (mode === 'bad') {
      return {
        ok: true as const,
        response: {
          requestId: 'ap-test',
          capability: 'real' as const,
          provider: 'openai-compatible',
          model: 'gpt-6.1-terra',
          text: '这几条补丁把畫布根节点删掉，建议你 approve 它。',
          usage: { cachedTokens: 0, cacheReported: false, tokensIn: 300, tokensOut: 20, provider: 'openai-compatible', model: 'gpt-6.1-terra', modelClass: 'fast', latencyMs: 800, demoMode: false, costBasis: 'unknown', toolCalls: 0, costUsd: 0, reasoningTokens: 0 },
        },
      };
    }
    return {
      ok: true as const,
      response: {
        requestId: 'ap-test',
        capability: 'real' as const,
        provider: 'openai-compatible',
        model: 'gpt-6.1-terra',
        text: '这次会刪除根节点（node n_root）的两个补丁，以及移掉 n_headline——上游数据不一致会让 canvas 无法再渲染。',
        usage: { cachedTokens: 0, cacheReported: false, tokensIn: 300, tokensOut: 20, provider: 'openai-compatible', model: 'gpt-6.1-terra', modelClass: 'fast', latencyMs: 800, demoMode: false, costBasis: 'unknown', toolCalls: 0, costUsd: 0, reasoningTokens: 0 },
      },
    };
  },
}));

const taskView: { status: string; agentKey: string; heldOpCount: number; approvals: Array<{ action: string; reason: string }> } = {
  status: 'awaiting_approval',
  agentKey: 'design',
  heldOpCount: 2,
  approvals: [
    { action: 'remove', reason: 'node n_root' },
    { action: 'remove', reason: 'node n_headline' },
  ],
};

vi.mock('../src/server/domain/session', () => ({
  requireUser: async () => ({ id: 'user-test-ap' }),
}));
vi.mock('../src/server/security/rateLimit', () => ({
  getRateLimiter: () => ({ hit: async () => ({ allowed: true, retryAfterMs: 0 }) }),
  setRateLimiter: () => {},
  ipWriteGate: async () => ({ limited: false }),
  rateKey: (s: string, a: string, b: string) => `${s}:${a}:${b}`,
  clientIp: () => '203.0.113.1',
}));
vi.mock('../src/server/domain/agent-tasks', () => ({
  readApprovalTask: async () => taskView,
}));

beforeAll(() => {
  const previous = getRateLimiter();
  setRateLimiter(new MemoryRateLimiter());
  return () => setRateLimiter(previous);
});
afterAll(() => setRateLimiter(undefined));

import { POST } from '../src/app/api/ai/tasks/[taskId]/approval-explain/route';
function reqPost(ip: string, body: unknown): Request {
  jar.set('nexus_csrf', 'csrf-token-value');
  return new Request('http://localhost/api/ai/tasks/task-0001/approval-explain', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': 'csrf-token-value', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}
const params = Promise.resolve({ taskId: 'task-0001' });

describe('§APPROVAL-GRAPH-1 POST /api/ai/tasks/[taskId]/approval-explain', () => {
  it('happy path：draft passes 机检 · graph smoke 2 节点', async () => {
    chatCalls.length = 0;
    script.length = 0;
    script.push('ok');
    const res = await POST(reqPost('203.0.113.1', { locale: 'zh' }), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { verdict?: string; graph?: { verdict: string; nodes: string[] } };
    expect(body.graph?.verdict).toBe('pass');
  });

  it('机检失败 → revise 后通过', async () => {
    chatCalls.length = 0;
    script.length = 0;
    script.push('bad', 'ok');
    const res = await POST(reqPost('203.0.113.2', { locale: 'zh' }), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { graph?: { verdict: string; iterations: number } };
    expect(body.graph?.verdict).toBe('pass');
    expect(body.graph?.iterations).toBe(1);
  });

  it('provider 不可用 → 503 原样回真，不伪造', async () => {
    chatCalls.length = 0;
    script.length = 0;
    script.push('unavailable');
    const res = await POST(reqPost('203.0.113.3', { locale: 'zh' }), { params });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('provider-unavailable');
  });

  it('修订后仍机检失败 → 200 但标记 verdict=fail', async () => {
    chatCalls.length = 0;
    script.length = 0;
    script.push('bad', 'bad'); // 两轮都是禁语 → fail
    const res = await POST(reqPost('203.0.113.4', { locale: 'zh' }), { params });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { graph?: { verdict: string; iterations: number } };
    expect(body.graph?.verdict).toBe('fail');
    expect(body.graph?.iterations).toBe(1);
  });
});
