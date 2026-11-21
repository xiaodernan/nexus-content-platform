/**
 * §GRAPH-1 · 正典问答的 StateGraph 编排（LangGraph 语义的本地 StateGraph，ADR-0270/0275）。
 * 为什么不是一次 chatWithCharacter：单次调用里模型同时要「理解问题 + 选择典籍 + 组织答案 +
 * 自检不编造」，失败时没有反馈环，也没法知道它错在哪里。这里把流程显式画出来：
 *
 *   analyze（LLM，短提示，不含 digest）
 *     → retrieve（确定性算法：字符二元组 Jaccard + 锚句覆盖打分，top-3 段落）
 *     → draft（LLM，system = CANON_DIGEST 字节级稳定前缀，与 /bible/ask 同源的 KV 命中）
 *     → verify（确定性机检：空答案 / 发明章回 / 不存在的 [n] 锚句引用）
 *          ├─ 通过 → finalize
 *          └─ 有问题且未超修订上限 → revise（LLM，system 不变，user 带机检意见）→ verify
 *
 * 两个 LLM 节点共用同一个 system（CANON_DIGEST，字节级稳定），
 * 所以整条管线打中的前缀缓存与 /bible/ask 走的是同一条 cache line（§CACHE-4）。
 * 边界纪律：ai-service 不写业务库，web 持有业务（本文件是 web 侧）。机检结论是「review/fail」不是「安全」——典籍里没有依据的问题，回答如实说不知道（§159）。 */
import { StateGraph, START, END } from '@nexus/agent-runtime';
import { SYSTEM_PROMPT, CANON_DIGEST } from '@/lib/bibleAsk';
import { chatWithCharacter, type AiChatResult } from '@/server/ai/client';
import type { AiChatRequest } from '@nexus/schemas';

export type CanonChatFn = (request: AiChatRequest) => Promise<AiChatResult>;

export interface CanonGraphState extends Record<string, unknown> {
  question: string;
  locale: 'zh' | 'en';
  /** analyze 节点抽取的检索词（LLM 失败时退回问题本身的二元组，绝不空手而回）。 */
  terms: string[];
  /** retrieve 节点产出的引用段落（top-3，供 draft 聚焦）。 */
  brief: string[];
  /** 最近一次 draft/revise 的答案原文。 */
  draft: string;
  /** verify 节点本轮发现的问题（空数组 = 通过）。 */
  issues: string[];
  /** revise 已执行次数（上限 1） */
  iterations: number;
  answer: string;
  verdict: 'pending' | 'revise' | 'pass' | 'fail';
  nodesVisited: string[];
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  cacheReported: boolean;
  provider: string;
  model: string;
}

export type CanonGraphResult =
  | {
      ok: true;
      answer: string;
      /** pass = 机检全过；fail = 修订用尽仍带机检意见（答案如实返回并标注，不冒充「已校验」） */
      verdict: 'pass' | 'fail';
      iterations: number;
      retrieved: readonly string[];
      provider: string;
      model: string;
      usage: { tokensIn: number; tokensOut: number; cachedTokens: number; cacheReported: boolean };
      nodesVisited: readonly string[];
    }
  | { ok: false; status: number | null; error: string };

const MAX_REVISES = 1;
const ANALYZE_TIMEOUT_TERMS = 6;
const BRIEF_MAX_CHARS = 1_600;
const SNIPPET_MAX_CHARS = 480;

/** 与 digest 同源的段落切分：`## Chapter` / `### Echo` 起头的行是边界（不会被正文里的任何 "#" 切散）。 */
const SEGMENT_BOUNDARY = /\n(?=## Chapter |### Echo )/;
const HEADER_LINE = /^(## Chapter \d{3}|### Echo \d{2})/;
const ANCHOR_LINE = /^- \[(\d{1,3})\]/;

export function splitDigestSegments(digest: string): string[] {
  const withHead = `\n${digest}`;
  return withHead
    .split(SEGMENT_BOUNDARY)
    .map((s) => s.trim())
    .filter((s) => HEADER_LINE.test(s));
}

/** 字符二元组集合（中文/英文通吃；bigram 比分词更稳，不引入分词器依赖）。 */
export function charBigrams(text: string): Set<string> {
  const grams = new Set<string>();
  const flat = text.replace(/\s+/g, ' ').trim().toLowerCase();
  for (let i = 0; i < flat.length - 1; i += 1) grams.add(flat.slice(i, i + 2));
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * 确定性检索：question+terms 对每段打分，取 top-3。不调 LLM（检索不许把钱花在「找段落」上），失败模式全部显式返回空。 */
export function rankSegments(digest: string, question: string, terms: readonly string[], topK = 3): string[] {
  const needle = charBigrams([question, ...terms].join(' '));
  const scored = splitDigestSegments(digest).map((segment) => {
    const header = segment.split('\n', 1)[0] ?? '';
    const anchorHits = segment
      .split('\n')
      .filter((line) => ANCHOR_LINE.test(line))
      .slice(0, 4);
    const snippet = [header, ...anchorHits].join('\n').slice(0, SNIPPET_MAX_CHARS);
    const anchorBoost = anchorHits.some((line) => charBigrams(line).size > 0 && [...charBigrams(line)].some((g) => needle.has(g))) ? 0.05 : 0;
    return { score: jaccard(charBigrams(segment), needle) + anchorBoost, snippet, header };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored
    .filter((s) => s.score > 0)
    .slice(0, topK)
    .map((s) => s.snippet);
}

/** digest 任一节（章/回响）锚句编号的最大值——机检「引用了超界 [n]」用（每节独立从 1 编号）。 */
export function digestAnchorNumbers(digest: string): Set<number> {
  const found = new Set<number>();
  for (const line of digest.split('\n')) {
    const match = ANCHOR_LINE.exec(line.trim());
    if (match?.[1]) found.add(Number(match[1]));
  }
  return found;
}

/** 机检（确定性）：空答案 / 发明不存在的章回 / 引用不存在的锚句编号。返回问题清单（空 = 通过）。 */
export function verifyCanonDraft(draft: string, digest: string): string[] {
  const issues: string[] = [];
  const text = draft.trim();
  if (!text) {
    issues.push('empty-draft');
    return issues;
  }
  if (/第六章|第七章|第四十二|第四十三|chapter\s*(6|7|42|43)\b|echo\s*0?(37|38)\b|E\s?-?\s?3[789]\b|第三十七回响/i.test(text)) {
    issues.push('invented-chapter-or-echo');
  }
  const anchors = digestAnchorNumbers(digest);
  for (const match of text.matchAll(/\[(\d{1,3})\]/g)) {
    const n = Number(match[1]);
    if (!anchors.has(n)) issues.push(`unknown-anchor-${n}`);
  }
  return [...new Set(issues)];
}

let requestCounter = 0;
const nextRequestId = (prefix: string): string => {
  requestCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${requestCounter}`;
};

const ANALYZE_SYSTEM = [
  "You triage questions about the world 低语诸王 / The Whispers' Kings.",
  'Reply with exactly one line: TERMS: t1, t2, t3 (at most 6, concrete nouns from the question, no punctuation except commas).',
  'Do not answer the question. Do not explain.',
].join('\n');

function parseTerms(reply: string): string[] {
  const line = reply.split('\n').map((l) => l.trim()).find((l) => /^TERMS:/i.test(l));
  if (!line) return [];
  return line
    .replace(/^TERMS:/i, '')
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, ANALYZE_TIMEOUT_TERMS);
}

/** terms 解析失败/不可用时的确定性兜底：问题本身的高频二元组。 */
export function fallbackTerms(question: string): string[] {
  const words = question.split(/[\s，。！？、；：.,!?;:]+/).filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, ANALYZE_TIMEOUT_TERMS);
}

function usageOf(result: AiChatResult): { tokensIn: number; tokensOut: number; cachedTokens: number; cacheReported: boolean } {
  if (!result.ok) return { tokensIn: 0, tokensOut: 0, cachedTokens: 0, cacheReported: false };
  const u = result.response.usage;
  return { tokensIn: u.tokensIn, tokensOut: u.tokensOut, cachedTokens: u.cachedTokens, cacheReported: u.cacheReported };
}

export async function runCanonAnswerGraph(
  input: { question: string; locale: 'zh' | 'en' },
  chat: CanonChatFn = chatWithCharacter,
): Promise<CanonGraphResult> {
  const question = input.question.trim();
  const locale = input.locale;
  if (!question) return { ok: false, status: 400, error: 'validation-failed: question must not be empty' };

  const state: CanonGraphState = {
    question,
    locale,
    terms: [],
    brief: [],
    draft: '',
    issues: [],
    iterations: 0,
    answer: '',
    verdict: 'pending',
    nodesVisited: [],
    tokensIn: 0,
    tokensOut: 0,
    cachedTokens: 0,
    cacheReported: true,
    provider: '',
    model: '',
  };

  /**
   * 用量累计：tokensIn/Out 全部计入；cachedTokens / cacheReported 只统计绑定 digest 前缀的调用
   * （draft/revise）——analyze 是短提示，不参与 KV 前缀复用；把它的 0 计进来会把
   * 「这一次问典命中了多少缓存」的读数谎报成两倍或零（§CACHE-3/§CACHE-4 同一纪律）。 */
  // StateGraph 传入的 state 是冻结的 —— 不能原地 mutate，只能返回新累加值（ADR-0270）。
  const nextUsage = (s: CanonGraphState, result: AiChatResult, digestBound: boolean) => {
    const u = usageOf(result);
    return {
      tokensIn: s.tokensIn + u.tokensIn,
      tokensOut: s.tokensOut + u.tokensOut,
      cachedTokens: digestBound ? s.cachedTokens + u.cachedTokens : s.cachedTokens,
      cacheReported: digestBound ? s.cacheReported && u.cacheReported : s.cacheReported,
    };
  };

  const graph = new StateGraph<CanonGraphState>()
    .addNode('analyze', async (s) => {
      const id = nextRequestId('canon-analyze');
      let terms: string[];
      try {
        const result = await chat({ requestId: id, system: ANALYZE_SYSTEM, user: `Question language: ${locale}\nQuestion: ${question}`, modelClass: 'fast' });
        const u = nextUsage(s, result, false);
        terms = result.ok ? parseTerms(result.response.text) : fallbackTerms(question);
        if (terms.length === 0) terms = fallbackTerms(question);
        return { terms, nodesVisited: [...s.nodesVisited, 'analyze'], ...u };
      } catch {
        terms = fallbackTerms(question);
        return { terms, nodesVisited: [...s.nodesVisited, 'analyze'] };
      }
    })
    .addNode('retrieve', (s) => {
      const picked = rankSegments(CANON_DIGEST, s.question, s.terms, 3);
      const brief: string[] = [];
      let total = 0;
      for (const snippet of picked) {
        if (total + snippet.length > BRIEF_MAX_CHARS) break;
        brief.push(snippet);
        total += snippet.length;
      }
      return { brief, nodesVisited: [...s.nodesVisited, 'retrieve'] };
    })
    .addNode('draft', async (s) => {
      const id = nextRequestId('canon-draft');
      const brief = s.brief.length ? `Retrieval brief (anchors the answer, not the source of truth):\n${s.brief.join('\n')}` : 'Retrieval brief: (nothing matched; answer only if the digest itself supports it)';
      const user = `Question language: ${locale}\nQuestion: ${s.question}\n${brief}`;
      const result = await chat({ requestId: id, system: SYSTEM_PROMPT, user, modelClass: 'fast' });
      const u = nextUsage(s, result, true);
      if (!result.ok) {
        return { draft: '', nodesVisited: [...s.nodesVisited, 'draft'], issues: ['provider-unavailable'], ...u };
      }
      return {
        draft: result.response.text.trim(),
        provider: result.response.provider,
        model: result.response.model,
        nodesVisited: [...s.nodesVisited, 'draft'],
        ...u,
      };
    })
    .addNode('verify', (s) => {
      // 机检每轮都对【当前】draft 重算；除了 provider-unavailable 标记外，不把上一轮的旧意见
      // 带进来——否则修订出的合格答案会被上一轮的影子判成 fail（测试抓到的真 bug）。
      const providerFlag = s.issues.includes('provider-unavailable');
      const found = verifyCanonDraft(s.draft, CANON_DIGEST);
      if (providerFlag) {
        return { issues: ['provider-unavailable', ...found], verdict: 'fail' as const, nodesVisited: [...s.nodesVisited, 'verify'] };
      }
      if (found.length === 0) {
        return { issues: [], verdict: 'pass' as const, nodesVisited: [...s.nodesVisited, 'verify'] };
      }
      const next = s.iterations + 1 <= MAX_REVISES ? ('revise' as const) : ('fail' as const);
      return { issues: found, verdict: next, nodesVisited: [...s.nodesVisited, 'verify'] };
    })
    .addNode('revise', async (s) => {
      const id = nextRequestId('canon-revise');
      const user = [
        `Question language: ${locale}`,
        `Question: ${s.question}`,
        `Your previous answer had mechanical issues: ${s.issues.join(', ')}.`,
        'Rewrite the answer. Keep it strictly grounded in the digest; if the digest does not support an answer, say so. Do not mention chapters or echoes that are not in the digest. Do not cite [n] unless [n] exists in the digest.',
        `Previous answer:\n${s.draft}`,
      ].join('\n');
      const result = await chat({ requestId: id, system: SYSTEM_PROMPT, user, modelClass: 'fast' });
      const u = nextUsage(s, result, true);
      if (!result.ok) {
        return { draft: s.draft, iterations: s.iterations + 1, nodesVisited: [...s.nodesVisited, 'revise'], ...u };
      }
      return {
        draft: result.response.text.trim(),
        iterations: s.iterations + 1,
        provider: result.response.provider,
        model: result.response.model,
        nodesVisited: [...s.nodesVisited, 'revise'],
        ...u,
      };
    })
    .addNode('finalize', (s) => ({ answer: s.draft, nodesVisited: [...s.nodesVisited, 'finalize'] }))
    .addEdge(START, 'analyze')
    .addEdge('analyze', 'retrieve')
    .addEdge('retrieve', 'draft')
    .addEdge('draft', 'verify')
    .addConditionalEdges('verify', (s) => (s.verdict === 'revise' ? 'revise' : 'finalize'))
    .addEdge('revise', 'verify')
    .addEdge('finalize', END)
    .compile({ recursionLimit: 12 });

  let final: CanonGraphState;
  try {
    final = await graph.invoke(state);
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message : String(error) };
  }

  if (final.issues.includes('provider-unavailable')) {
    return { ok: false, status: 503, error: 'provider-unavailable' };
  }
  const verdict = final.verdict === 'pass' ? 'pass' : 'fail';
  return {
    ok: true,
    answer: final.answer.trim(),
    verdict,
    iterations: final.iterations,
    retrieved: final.brief,
    provider: final.provider,
    model: final.model,
    usage: {
      tokensIn: final.tokensIn,
      tokensOut: final.tokensOut,
      cachedTokens: final.cachedTokens,
      cacheReported: final.cacheReported,
    },
    nodesVisited: final.nodesVisited,
  };
}
