import { describe, expect, it } from 'vitest';
import {
  charBigrams,
  digestAnchorNumbers,
  fallbackTerms,
  rankSegments,
  runCanonAnswerGraph,
  splitDigestSegments,
  verifyCanonDraft,
  type CanonChatFn,
} from '../src/server/ai/canonGraph';
import { CANON_DIGEST } from '@/lib/bibleAsk';
import type { AiChatRequest, AiChatResponse } from '@nexus/schemas';

/**
 * §GRAPH-1 · StateGraph 正典问答管线的契约门。
 * 全部走注入的假 chat（不打网络）；真 provider 的实测见 docs/evidence §PROVED-19。
 */

const usage = (cachedTokens = 22_700, tokensIn = 24_100, tokensOut = 20) => ({
  cachedTokens,
  cacheReported: true,
  tokensIn,
  tokensOut,
  provider: 'fake',
  model: 'fake-model',
  modelClass: 'fast' as const,
  latencyMs: 5,
  costUsd: 0,
  costBasis: 'configured' as const,
  toolCalls: 1,
  demoMode: false,
  reasoningTokens: 0,
});

const reply = (text: string, cached = 22_700): { ok: true; response: AiChatResponse } => ({
  ok: true,
  response: {
    requestId: 'test',
    capability: 'real',
    provider: 'fake',
    model: 'fake-model',
    text,
    usage: usage(cached),
  },
});

const unavailable: { ok: false; status: number; error: { code: string; message: string; hint: string; retryable: boolean } } = {
  ok: false,
  status: 503,
  error: { code: 'provider-unavailable', message: 'nope', hint: '', retryable: true },
};

/** 按调用顺序返回脚本化答复；chatCalls 记录每次请求以便审计 system 前缀。 */
function scriptedChat(replies: Array<{ ok: true; response: AiChatResponse } | typeof unavailable>): { chat: CanonChatFn; calls: AiChatRequest[] } {
  const calls: AiChatRequest[] = [];
  let cursor = 0;
  const chat: CanonChatFn = async (req) => {
    calls.push(req);
    const next = replies[Math.min(cursor, replies.length - 1)]!;
    cursor += 1;
    return next as never;
  };
  return { chat, calls };
}

describe('§GRAPH-1 检索与机检（确定性，不烧 token）', () => {
  it('bigram 分词对中英混排都稳定', () => {
    expect(charBigrams('潮候院').size).toBeGreaterThanOrEqual(2);
    expect(charBigrams('').size).toBe(0);
  });

  it('digest 段落切分出 13 章 + 153 回响 = 166 段', () => {
    const segments = splitDigestSegments(CANON_DIGEST);
    const chapters = segments.filter((s) => s.startsWith('## Chapter'));
    const echoes = segments.filter((s) => s.startsWith('### Echo'));
    expect(chapters).toHaveLength(13);
    expect(echoes).toHaveLength(153);
  });

  it('「米缸」问句命中米缸回响 Echo 36（而不是随机段落）', () => {
    const hits = rankSegments(CANON_DIGEST, '米缸里那粒从不沉下去的是什么', [], 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.join('\n')).toContain('Echo 36');
  });

  it('digest 锚句编号集合非空（机检 unknown-anchor 的依据）', () => {
    const anchors = digestAnchorNumbers(CANON_DIGEST);
    // 每节（章/回响）独立从 1 编号，集合是全典锚句编号的上界，通常就是个位数
    expect(anchors.size).toBeGreaterThanOrEqual(5);
    expect(anchors.has(1)).toBe(true);
  });

  it('机检：发明「第六章」/「Echo 37」/「E37」一律命中', () => {
    expect(verifyCanonDraft('第六章里写道……', CANON_DIGEST)).toContain('invented-chapter-or-echo');
    expect(verifyCanonDraft('Echo 37 says ...', CANON_DIGEST)).toContain('invented-chapter-or-echo');
    expect(verifyCanonDraft('E37 里说……', CANON_DIGEST)).toContain('invented-chapter-or-echo');
  });

  it('机检：引用 digest 里不存在的 [999] 命中；引用真实锚句通过', () => {
    expect(verifyCanonDraft('据典籍 [999]……', CANON_DIGEST)).toContain('unknown-anchor-999');
    expect(verifyCanonDraft('据典籍 [1]……', CANON_DIGEST)).toHaveLength(0);
  });

  it('机检：空答案命中 empty-draft', () => {
    expect(verifyCanonDraft('   ', CANON_DIGEST)).toContain('empty-draft');
  });

  it('fallbackTerms 在 analyze 不可用时仍给出检索词', () => {
    expect(fallbackTerms('潮候院的收件人是谁？').length).toBeGreaterThan(0);
  });
});

describe('§GRAPH-1 端到端（假 chat，节点顺序与分支）', () => {
  it('顺利路径：analyze → retrieve → draft → verify → finalize，verdict=pass', async () => {
    const { chat, calls } = scriptedChat([
      reply('TERMS: 收件人, 签收单'),
      reply('典籍曰：收件人不是人，是潮。[1]'),
    ]);
    const result = await runCanonAnswerGraph({ question: '《收件人》里谁收到了签收单？', locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
    expect(result.nodesVisited).toEqual(['analyze', 'retrieve', 'draft', 'verify', 'finalize']);
    expect(result.iterations).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.system).toContain('TERMS'); // analyze 不带 digest
    expect(calls[1]!.system).toContain('THE WORLD BIBLE — CANON DIGEST'); // draft 带 digest
    expect(result.usage.cachedTokens).toBe(22_700); // 只算 digest 绑定调用（draft），analyze 不计入
    expect(result.retrieved.length).toBeGreaterThan(0);
  });

  it('机检不通过 → revise 一轮 → 再机检通过，iterations=1', async () => {
    const { chat, calls } = scriptedChat([
      reply('TERMS: 收件人'),
      reply('第六章里写道：收件人是潮。'), // 发明章节 → verify 拦截
      reply('据典籍第五章《收件人》：收件人不是人，是潮。[1]'),
    ]);
    const result = await runCanonAnswerGraph({ question: '收件人是谁？', locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
    expect(result.iterations).toBe(1);
    expect(result.nodesVisited).toEqual(['analyze', 'retrieve', 'draft', 'verify', 'revise', 'verify', 'finalize']);
    expect(calls).toHaveLength(3);
    expect(calls[2]!.user).toContain('invented-chapter-or-echo'); // 修订意见回喂给模型
  });

  it('修订用尽仍不合格：verdict=fail，如实标注而不是冒充已校验', async () => {
    const { chat } = scriptedChat([
      reply('TERMS: 收件人'),
      reply('第六章里写道……'),
      reply('Echo 37 里写道……'),
    ]);
    const result = await runCanonAnswerGraph({ question: '收件人是谁？', locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('fail');
    expect(result.iterations).toBe(1);
    expect(result.nodesVisited[result.nodesVisited.length - 1]).toBe('finalize');
  });

  it('draft 直接 provider 不可用 → ok:false · 503（不编造答案，§159）', async () => {
    const { chat } = scriptedChat([unavailable]);
    // analyze 也不可用（同一脚本）→ 走 fallbackTerms，继续到 draft，draft 也不可用
    const result = await runCanonAnswerGraph({ question: 'anything', locale: 'en' }, chat);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
  });

  it('analyze 不可用但 draft 正常：管线不断，检索退回确定性二元组', async () => {
    const { chat } = scriptedChat([unavailable, reply('典籍曰：……[1]')]);
    const result = await runCanonAnswerGraph({ question: '收件人是谁？', locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
  });
});
