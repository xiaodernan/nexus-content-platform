import { describe, expect, it } from 'vitest';
import {
  charBigrams,
  digestAnchorNumbers,
  fallbackTerms,
  parseChineseNumber,
  rankSegments,
  runCanonAnswerGraph,
  splitDigestSegments,
  verifyCanonDraft,
  type CanonChatFn,
} from '../src/server/ai/canonGraph';
import { CANON_DIGEST } from '@/lib/bibleAsk';
// Imported for their side-effect-free module evaluation (generated canon shapes must be
// loadable); the binding names are intentionally unused in this test.
import { BIBLE_CHAPTERS as _BIBLE_CHAPTERS, BIBLE_ECHOES as _BIBLE_ECHOES } from '@/world-bible/generated';
void _BIBLE_CHAPTERS; void _BIBLE_ECHOES;
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

  // 2026-11-22 并轨 origin/master：正典 13 章 → 14 章、212 回响 → 217 回响
  // 2026-11-22 E218 → E219 → E220《照着点走一遍》：218 → 219 → 220；2026-11-25 E221 → 221。
  it('digest 段落切分出 14 章 + 221 回响', () => {
    const segments = splitDigestSegments(CANON_DIGEST);
    const chapters = segments.filter((s) => s.startsWith('## Chapter'));
    const echoes = segments.filter((s) => s.startsWith('### Echo'));
    expect(chapters).toHaveLength(14);
    expect(echoes).toHaveLength(221);
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

  it('机检：真实存在的章回号一律放行（第六章/第七章/回响 37 都是真的）', () => {
    // 2026-11-22 之前这里断言的是**相反**的行为：旧实现是一张硬编码错号黑名单，
    // 写它的时候正典只有 5 章 / 36 回响，所以「第六章」「Echo 37」当时确实是发明。
    // 正典长到 13 章 / 210 回响之后，那张表没跟着更新——它开始把**真**的引用判成发明，
    // 逼着答对的模型走一轮无意义的 revise。真实引用必须放行。
    expect(verifyCanonDraft('第六章里写道……', CANON_DIGEST)).toHaveLength(0);
    expect(verifyCanonDraft('Echo 37 says ...', CANON_DIGEST)).toHaveLength(0);
    expect(verifyCanonDraft('E37 里说……', CANON_DIGEST)).toHaveLength(0);
    expect(verifyCanonDraft('据回响二百一十：……', CANON_DIGEST)).toHaveLength(0);
  });

  it('机检：发明章回号按种类各自命中（中文数字、阿拉伯、英文写法都认）', () => {
    expect(verifyCanonDraft('第三百回里提到……', CANON_DIGEST)).toContain('invented-echo-300');
    expect(verifyCanonDraft('Echo 999 says ...', CANON_DIGEST)).toContain('invented-echo-999');
    expect(verifyCanonDraft('第两千零一章：……', CANON_DIGEST)).toContain('invented-chapter-2001');
    expect(verifyCanonDraft('Chapter 99 ...', CANON_DIGEST)).toContain('invented-chapter-99');
  });

  it('机检：书名号引用的标题必须在 digest 里真实存在', () => {
    // 2026-11-22 实测那一例：编号 21 是真的，但标题把 E209 的「潮候院」写成「值更院」，
    // 整句短语在 digest 里根本不存在——内容答对了，出处是编的。
    expect(verifyCanonDraft('浅痕变成了半枚潮印。依据回响二十一章《值更院抄本院那本册子翻过第七十二页之后》的锚句。', CANON_DIGEST)).toContain('invented-title');
    // 真标题（不带书名号存在于 digest 头部）与正文里的书名号概念名都要放行
    expect(verifyCanonDraft('据《里巷子码头的七盏号灯》：七盏号灯还亮着。', CANON_DIGEST)).toHaveLength(0);
    expect(verifyCanonDraft('据典籍第五章《收件人》：收件人不是人，是潮。[1]', CANON_DIGEST)).toHaveLength(0);
    expect(verifyCanonDraft('《潮沙盘》上写着潮位。', CANON_DIGEST)).toHaveLength(0);
  });

  it('机检：「第 N 次」不是章号引用（第四十一次大会是真事件）', () => {
    // 后缀写死成 章/回响/回/篇：大会、会议、测验这些"第 N 次"绝不误报
    expect(verifyCanonDraft('第四十一次大会之后，灯还亮着。', CANON_DIGEST)).toHaveLength(0);
    expect(verifyCanonDraft('第四十四次大会散会之后——秋潮月第八十八日。', CANON_DIGEST)).toHaveLength(0);
    expect(verifyCanonDraft('潮汐挑战答对一百三十一题。', CANON_DIGEST)).toHaveLength(0);
  });

  it('机检：逐位写法（二〇八 / 二一〇）按位读，不按位值加', () => {
    // 逐位相加会把 208 读成 8、210 读成 0——后者会把正确引用误报成"发明了第 0 回"
    expect(parseChineseNumber('二〇八')).toBe(208);
    expect(parseChineseNumber('二一〇')).toBe(210);
    expect(parseChineseNumber('二零一')).toBe(201);
    // 带量级的仍按位值
    expect(parseChineseNumber('二百一十')).toBe(210);
    expect(parseChineseNumber('两千零一')).toBe(2001);
    expect(parseChineseNumber('二十一')).toBe(21);
    expect(parseChineseNumber('两')).toBe(2);
    expect(parseChineseNumber('第')).toBeNull();
    expect(parseChineseNumber('俩')).toBeNull();
  });

  it('机检：模型真写过的「（回响二〇八、二〇九）」放行', () => {
    expect(verifyCanonDraft('最年长的抄本师说，字不是抄本师们写的。（回响二〇八、二〇九）', CANON_DIGEST)).toHaveLength(0);
  });

  it('机检：引用解析不出来的数不猜（宁漏不错）', () => {
    // "第两章"这种非规范写法解析不出 ⇒ 不报 invented，也不当作通过
    expect(verifyCanonDraft('第两章里写道……', CANON_DIGEST)).toHaveLength(0);
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
      reply('第三百回里写道：收件人是潮。'), // 发明回响 → verify 拦截
      reply('据典籍第五章《收件人》：收件人不是人，是潮。[1]'),
    ]);
    const result = await runCanonAnswerGraph({ question: '收件人是谁？', locale: 'zh' }, chat);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.verdict).toBe('pass');
    expect(result.iterations).toBe(1);
    expect(result.nodesVisited).toEqual(['analyze', 'retrieve', 'draft', 'verify', 'revise', 'verify', 'finalize']);
    expect(calls).toHaveLength(3);
    expect(calls[2]!.user).toContain('invented-echo-300'); // 修订意见回喂给模型
  });

  it('修订用尽仍不合格：verdict=fail，如实标注而不是冒充已校验', async () => {
    const { chat } = scriptedChat([
      reply('TERMS: 收件人'),
      reply('第三百回里写道……'),
      reply('Echo 999 里写道……'),
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
