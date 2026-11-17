import { describe, expect, it } from 'vitest';
import type { AiChatRequest } from '@nexus/schemas';
import type { AiChatResult } from '@/server/ai/client';
import { runCharacterChatGraph } from '@/server/ai/characterChatGraph';

/**
 * §47-graph · 角色对话 StateGraph 契约门：
 *   draft → verify → (revise → verify) → finalize。
 * 脚本化 chat 注入 — 不联网、不烧钱。
 */
const PERSONA = '你是守夜人。请完全沉浸在这个角色中，用第一人称回复。';
const TURN = '【相关记忆】\n- 用户问过潮声\n\n【当前对话】\n你好呀？';

type ChatFn = (request: AiChatRequest) => Promise<AiChatResult>;

const script = (replies: readonly AiChatResult[]): { chat: ChatFn; calls: AiChatRequest[] } => {
  const calls: AiChatRequest[] = [];
  let i = 0;
  return {
    calls,
    chat: async (req) => {
      calls.push(req);
      if (i >= replies.length) throw new Error('script exhausted');
      const r = replies[i]!;
      i += 1;
      return r;
    },
  };
};

const okReal = (text: string, cachedTokens = 2400): AiChatResult => ({
  ok: true,
  response: {
    requestId: 'graph-test',
    capability: 'real',
    provider: 'openai-compatible',
    model: 'gpt-6.1-terra',
    text,
    usage: {
      tokensIn: 320,
      tokensOut: 42,
      cachedTokens,
      cacheReported: true,
      provider: 'openai-compatible',
      model: 'gpt-6.1-terra',
      modelClass: 'balanced',
      latencyMs: 800,
      demoMode: false,
      costBasis: 'unknown',
      toolCalls: 0,
      costUsd: 0,
      reasoningTokens: 0,
    },
  },
});
const down503: AiChatResult = {
  ok: false,
  status: 503,
  error: { code: 'provider-unavailable', message: 'nope', hint: '', retryable: true },
};

const passing = '潮声又起了。你怎么又来了？';

describe('§47-graph · runCharacterChatGraph', () => {
  it('机检一次通过：nodesVisited=[draft,verify,finalize] · verdict=pass', async () => {
    const { chat, calls } = script([okReal(passing, 2000)]);
    const result = await runCharacterChatGraph({ persona: PERSONA, turn: TURN, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
    expect(result.iterations).toBe(0);
    expect(result.nodesVisited).toEqual(['draft', 'verify', 'finalize']);
    expect((calls[0] as AiChatRequest).system).toBe(PERSONA);
    expect((calls[0] as AiChatRequest).user).toBe(TURN);
  });

  it('persona 在 draft 与 revise 间逐字节一致（§缓存纪律：system 是 KV 前缀）', async () => {
    const { chat, calls } = script([okReal('我是语言模型哦', 900), okReal(passing, 1800)]);
    const result = await runCharacterChatGraph({ persona: PERSONA, turn: TURN, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
    expect(result.iterations).toBe(1);
    expect(result.nodesVisited).toEqual(['draft', 'verify', 'revise', 'verify', 'finalize']);
    expect((calls[0] as AiChatRequest).system).toBe((calls[1] as AiChatRequest).system);
  });

  it('修订用尽仍不过：verdict=fail 但答复如实返回（不冒充已核验）', async () => {
    const { chat } = script([okReal('【相关记忆】……', 300), okReal('[/system leak', 300)]);
    const result = await runCharacterChatGraph({ persona: PERSONA, turn: TURN, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('fail');
    expect(result.answer.length).toBeGreaterThan(0);
  });

  it('provider 不可用 → ok:false · status 503（不伪造角色回文）', async () => {
    const { chat } = script([down503]);
    const result = await runCharacterChatGraph({ persona: PERSONA, turn: TURN, locale: 'zh' }, chat);
    expect(result).toMatchObject({ ok: false, status: 503, error: 'provider-unavailable' });
  });

  it('capability 如实透传（不硬编码 real）', async () => {
    const demoRun: AiChatResult = {
      ok: true,
      response: {
        requestId: 'graph-test',
        capability: 'demo',
        provider: 'openai-compatible',
        model: 'gpt-6.1-terra',
        text: passing,
        usage: {
          tokensIn: 320,
          tokensOut: 42,
          cachedTokens: 100,
          cacheReported: true,
          provider: 'openai-compatible',
          model: 'gpt-6.1-terra',
          modelClass: 'balanced',
          latencyMs: 800,
          demoMode: true,
          costBasis: 'unknown',
          toolCalls: 0,
          costUsd: 0,
          reasoningTokens: 0,
        },
      },
    };
    const { chat } = script([demoRun]);
    const result = await runCharacterChatGraph({ persona: PERSONA, turn: TURN, locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capability).toBe('demo');
  });

  it('非法输入：persona 或 turn 为空 → ok:false · status 400', async () => {
    const { chat } = script([okReal(passing)]);
    const emptyPersona = await runCharacterChatGraph({ persona: '  ', turn: TURN, locale: 'zh' }, chat);
    expect(emptyPersona).toMatchObject({ ok: false, status: 400 });
    const emptyTurn = await runCharacterChatGraph({ persona: PERSONA, turn: ' ', locale: 'zh' }, chat);
    expect(emptyTurn).toMatchObject({ ok: false, status: 400 });
  });
});
