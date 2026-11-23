/**
 * §BIBLE-WHISPER 答问者缓存车道 + 零记忆门（2026-11-21）。
 *
 * 用户第八/四十条：并行会话不要互冲缓存；答问者承诺「零记忆」不落用户态。
 * 这两条要靠 (卷,语言) 派生的稳定 cacheLane 同时满足。本门用真 route + mock provider。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRateLimiter } from '../src/server/security/rateLimitMemory';
import { setRateLimiter } from '../src/server/security/rateLimit';
import { buildPersonaSystemPrompt, files, getFile, whisperCacheLane } from '../src/server/domain/whisperCanon';

const chatCalls: Array<{ requestId: string; system: string; user: string; modelClass: string; cacheLane?: string }> = [];

vi.mock('../src/server/ai/client', () => ({
  chatWithCharacter: async (req: {
    requestId: string; system: string; user: string; modelClass: string; cacheLane?: string;
  }) => {
    chatCalls.push(req);
    return {
      ok: true as const,
      response: {
        requestId: req.requestId,
        capability: 'real' as const,
        provider: 'openai-compatible',
        model: 'gpt-6.2-sol',
        text: '典籍里写了。',
        usage: {
          tokensIn: 100, cachedTokens: 0, cacheReported: false, tokensOut: 10,
          provider: 'openai-compatible', model: 'gpt-6.2-sol', modelClass: 'balanced',
          latencyMs: 100, demoMode: false, costBasis: 'unknown', toolCalls: 0, costUsd: 0, reasoningTokens: 0,
        },
      },
    };
  },
}));

vi.mock('../src/lib/env', () => ({
  getAiCapabilities: async () => ({ text: 'real' }),
}));

import { POST } from '../src/app/api/bible/whisper/route';

function req(slug: string, question: string, locale: 'zh' | 'en'): Request {
  return new Request('http://localhost/api/bible/whisper', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug, question, locale }),
  });
}

describe('§BIBLE-WHISPER 缓存车道', () => {
  it('同一 (卷,语言) 派生同一条车道；不同卷/语言分车道', () => {
    const first = files[0]!.slug;
    const second = files[1]!.slug;
    expect(whisperCacheLane(first, 'zh')).toBe(whisperCacheLane(first, 'zh'));
    expect(whisperCacheLane(first, 'zh')).not.toBe(whisperCacheLane(first, 'en'));
    expect(whisperCacheLane(first, 'zh')).not.toBe(whisperCacheLane(second, 'zh'));
  });

  it('车道不进入 system：同卷同语言两轮 system 逐字节一致（KV 前缀可复用）', () => {
    const file = getFile(files[0]!.slug)!;
    const a = buildPersonaSystemPrompt(file, 'zh');
    const b = buildPersonaSystemPrompt(file, 'zh');
    expect(a).toBe(b);
    expect(a).toContain('不编造');
    expect(whisperCacheLane(file.slug, 'zh')).not.toContain(a.slice(0, 20));
  });
});

describe('§BIBLE-WHISPER 真 route：透传车道 + 零记忆', () => {
  let limiter: MemoryRateLimiter;
  beforeEach(() => {
    chatCalls.length = 0;
    limiter = new MemoryRateLimiter();
    setRateLimiter(limiter);
  });
  afterEach(() => setRateLimiter(undefined));

  it('正常问答 → 200，cacheLane 正确透传，问题只在 user 里', async () => {
    const file = files[3]!;
    const res = await POST(req(file.slug, '第八盏灯为什么不熄？', 'zh'));
    expect(res.status).toBe(200);
    expect(chatCalls).toHaveLength(1);
    const call = chatCalls[0]!;
    expect(call.cacheLane).toBe(whisperCacheLane(file.slug, 'zh'));
    expect(call.user).toBe('第八盏灯为什么不熄？');
    expect(call.system).not.toContain('第八盏灯为什么不熄？');
    expect(call.modelClass).toBe('balanced');
  });

  it('零记忆：同一问题连问两次，除 requestId/cachedLane 外 system 与 user 相同', async () => {
    const file = files[2]!;
    await POST(req(file.slug, '灯是谁照看的？', 'zh'));
    await POST(req(file.slug, '灯是谁照看的？', 'zh'));
    expect(chatCalls).toHaveLength(2);
    expect(chatCalls[0]!.system).toBe(chatCalls[1]!.system);
    expect(chatCalls[0]!.user).toBe(chatCalls[1]!.user);
    expect(chatCalls[0]!.cacheLane).toBe(chatCalls[1]!.cacheLane);
    expect(chatCalls[0]!.requestId).not.toBe(chatCalls[1]!.requestId);
  });
});
