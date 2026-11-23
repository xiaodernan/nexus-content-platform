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
  /** §COST-2：本轮问典花了多少钱（各轮相加，analyze 也花钱）。 */
  costUsd: number;
  /** 每一轮都算得出价才成立；有一轮 `unknown` 总额就不是一个数（与 ai-service execution 同一规则）。 */
  allRoundsPriced: boolean;
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
      usage: {
        tokensIn: number;
        tokensOut: number;
        cachedTokens: number;
        cacheReported: boolean;
        costUsd: number;
        costBasis: 'unknown' | 'configured';
      };
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

/** digest 的节标题：章 `## Chapter NNN ·`、回响 `### Echo NN ·`。 */
const CHAPTER_HEAD = /^## Chapter (\d{1,3})\b/;
const ECHO_HEAD = /^### Echo (\d{1,3})\b/;

/**
 * 引用里可能出现的数字字符。**与 `CN_DIGITS` 必须是同一批**——曾经两处各写一份，
 * 解析器认「两」而正则字符类不认，于是「第两千零一章」静默漏检。
 */
const CN_NUMERAL = '0-9一二三四五六七八九十百千零〇两';

const CN_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  // 「两」在正典里就是 2（"两盏号灯""两千零一年"）；只在带单位后缀的引用模式里出现，
  // 所以不会把"两天"误读成章号。
  两: 2,
};

/**
 * 中文数字 → 阿拉伯数字。只处理正典里会用到的量级（十/百/千）。
 * 「两」算 2：它在正典里就是数字（"两盏号灯""两千零一年"）。
 */
export function parseChineseNumber(raw: string): number | null {
  const s = raw.replace(/\s/g, '');
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s);
  // **逐位写法优先**：「二〇八」「二一〇」是 208 / 210，不是"二+〇+八"相加（那会得 8 / 0）。
  // 判据是串里有没有量级字（十/百/千）：没有就是逐位，有才按位值相加。
  // 2026-11-22 实测：模型写「（回响二〇八、二〇九）」——按位值加会把 208 读成 8，
  // 而「二一〇」会读成 0，于是正确的引用被误报成"发明了第 0 回"。
  if (!/[十百千]/.test(s)) {
    let out = '';
    for (const ch of s) {
      if (!(ch in CN_DIGITS)) return null;
      out += String(CN_DIGITS[ch]!);
    }
    return out ? Number(out) : null;
  }
  let total = 0;
  let section = 0;
  let seenAny = false;
  for (const ch of s) {
    if (ch in CN_DIGITS) {
      section = CN_DIGITS[ch]!;
      seenAny = true;
      continue;
    }
    if (ch === '十') { total += section === 0 ? 10 : section * 10; section = 0; seenAny = true; continue; }
    if (ch === '百') { total += section === 0 ? 100 : section * 100; section = 0; seenAny = true; continue; }
    if (ch === '千') { total += section === 0 ? 1000 : section * 1000; section = 0; seenAny = true; continue; }
    return null; // 出现任何不认识的字符 ⇒ 放弃，不猜
  }
  if (!seenAny) return null;
  return total + section;
}

/** digest 里真实存在的章号与回响号。机检"引用了不存在的章回"用——从 digest 现取，不硬编码。 */
export function digestSectionNumbers(digest: string): { chapters: Set<number>; echoes: Set<number> } {
  const chapters = new Set<number>();
  const echoes = new Set<number>();
  for (const line of digest.split('\n')) {
    const t = line.trim();
    const c = CHAPTER_HEAD.exec(t);
    if (c) { chapters.add(Number(c[1])); continue; }
    const e = ECHO_HEAD.exec(t);
    if (e) echoes.add(Number(e[1]));
  }
  return { chapters, echoes };
}

/**
 * 回答里出现的"章 / 回响"引用。三种写法都认：
 *   - 中文：第 N 章 / 第 N 回响 / 第 N 回 / 第 N 篇 / 回响（其 N）/ 回响 N
 *   - 英文：Chapter N / Echo N
 *   - 缩写：E N / E-N / EN
 * **不认"第 N 次"**（第四十一次大会是真事件，不是章号）——后缀写死，宁可漏不错。
 */
const CITATION_PATTERNS: { re: RegExp; kind: 'chapter' | 'echo' }[] = [
  { re: new RegExp(`第\\s*([${CN_NUMERAL}]+)\\s*章`, 'gu'), kind: 'chapter' },
  { re: new RegExp(`第\\s*([${CN_NUMERAL}]+)\\s*(?:回响|回|篇)`, 'gu'), kind: 'echo' },
  // 「回响二十一章」这种：回响在前、序号与单位在后。**单位后缀是必需的**——
  // 少了它，"回响三日"（Echo 03 的标题《退潮三日》）会被当成引用，误报。
  { re: new RegExp(`回响\\s*([${CN_NUMERAL}]+)\\s*(?:章|回|篇)`, 'gu'), kind: 'echo' },
  { re: new RegExp(`回响\\s*[（(]\\s*其\\s*([${CN_NUMERAL}]+)\\s*[）)]`, 'gu'), kind: 'echo' },
  { re: /回响\s*([0-9]{1,3})\s*(?:[，。、）)]|$)/gu, kind: 'echo' },
  { re: /\b(?:Chapter|chapter)\s*0*(\d{1,3})\b/gu, kind: 'chapter' },
  { re: /\b(?:Echo|echo)\s*0*(\d{1,3})\b/gu, kind: 'echo' },
  { re: /\bE\s*-?\s*(\d{1,3})\b/gu, kind: 'echo' },
];

/** 抽出一段回答里所有"章 / 回响"引用，附它写的那个数（解析不出就丢着，不猜）。 */
export function extractSectionCitations(text: string): { kind: 'chapter' | 'echo'; n: number; raw: string }[] {
  const out: { kind: 'chapter' | 'echo'; n: number; raw: string }[] = [];
  for (const { re, kind } of CITATION_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const n = parseChineseNumber(m[1]!);
      if (n === null) continue;
      out.push({ kind, n, raw: m[0].trim() });
    }
  }
  return out;
}

/**
 * digest 里**出现过**的「《…》」短语，外加所有节标题（中英）。
 *
 * 为什么两条都要：正典标题在 digest 里是 `### Echo 21 · 里巷子码头的七盏号灯 / …`——
 * **不带书名号**。只收书名号短语会把正确引用《里巷子码头的七盏号灯》判成发明；
 * 只收标题又会漏掉《收件人》《潮沙盘》这类在正文里被书名号引用的概念名。
 */
export function digestQuotedPhrases(digest: string): Set<string> {
  const out = new Set<string>();
  for (const m of digest.matchAll(/《([^》]{1,80})》/g)) out.add(m[1]!.trim());
  for (const line of digest.split('\n')) {
    const t = line.trim();
    const head = /^(?:## Chapter|### Echo) \d+ · (.+)$/.exec(t);
    if (!head) continue;
    const body = head[1]!;
    // 标题形如「中文名 / English Name · 纪元：…」；英文名可能含 " · " 之后的纪元行
    const zh = body.split(' / ')[0]?.split(' · ')[0];
    if (zh) out.add(zh.trim());
    const afterSlash = body.split(' / ')[1];
    if (afterSlash) out.add(afterSlash.split(' · ')[0]!.trim());
  }
  return out;
}

/** 回答里引用的书名号短语。 */
export function extractQuotedTitles(text: string): string[] {
  return [...text.matchAll(/《([^》]{1,80})》/g)].map((m) => m[1]!.trim());
}

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
  // 章回引用逐个查表。旧实现是一张**硬编码的错号黑名单**（只认第四十二/四十三/第三十七那三个），
  // 模型引"回响二十一章"或"第三百回"时它安静放行——2026-11-22 实测就是这样漏的
  // （答对了内容，把编号写成"二十一章"）。现在从 digest 现取真实章号/回响号，逐条对。
  const sections = digestSectionNumbers(digest);
  for (const cite of extractSectionCitations(text)) {
    const real = cite.kind === 'chapter' ? sections.chapters : sections.echoes;
    if (!real.has(cite.n)) issues.push(`invented-${cite.kind}-${cite.n}`);
  }
  // 书名号引用的标题也查表。2026-11-22 实测：模型答"浅痕后来变成了半枚潮印"（内容对），
  // 但写成"依据回响二十一章《值更院抄本院那本册子翻过第七十二页之后》"——编号 21 是真的，
  // 标题却把 E209 的「潮候院」写成了「值更院」，整句书名号短语在 digest 里根本不存在。
  const phrases = digestQuotedPhrases(digest);
  for (const title of extractQuotedTitles(text)) {
    if (!phrases.has(title)) issues.push('invented-title');
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

function usageOf(result: AiChatResult): {
  tokensIn: number;
  tokensOut: number;
  cachedTokens: number;
  cacheReported: boolean;
  costUsd: number;
  costBasis: 'unknown' | 'configured';
} {
  if (!result.ok) {
    return { tokensIn: 0, tokensOut: 0, cachedTokens: 0, cacheReported: false, costUsd: 0, costBasis: 'unknown' };
  }
  const u = result.response.usage;
  const amount = Number.isFinite(u.costUsd) && u.costUsd > 0 ? u.costUsd : 0;
  // 只有明确报了 `configured` **且金额算得出来**才算 configured；缺失/别的一律归 unknown。
  // 为什么不用 `u.costBasis` 原样透出：这一路进来的对象未必经过 zod 的 default 补齐
  // （测试替身、旧调用点都会给个缺字段的 usage），原样透出会把 undefined 写进
  // 一个契约要求 enum 的字段——那不是「未知」，那是没有读数。
  // 为什么金额也参与判定：与 ai-service 的回归钉同一条（test_pricing.py 不许
  // `configured` 配 `costUsd=0`，那是"价目表其实没工作"的假绿）。
  return {
    tokensIn: u.tokensIn,
    tokensOut: u.tokensOut,
    cachedTokens: u.cachedTokens,
    cacheReported: u.cacheReported,
    costUsd: amount,
    costBasis: u.costBasis === 'configured' && amount > 0 ? 'configured' : 'unknown',
  };
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
    costUsd: 0,
    allRoundsPriced: true,
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
      // 钱与缓存不同：analyze 那一轮不复用 KV 前缀，但它照样花钱，所以金额**无条件相加**。
      // 圆整到 1e-8 与 ai-service 的 `_cost_of` 同一口径，免得浮点尾巴把报文写成 0.30000000000000004。
      costUsd: Math.round((s.costUsd + u.costUsd) * 1e8) / 1e8,
      allRoundsPriced: s.allRoundsPriced && u.costBasis === 'configured',
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
      costUsd: final.costUsd,
      // 有一轮算不出价，总额就不成立——报 unknown，而不是报一个偏低的数（§COST-1 同一纪律）
      costBasis: final.allRoundsPriced ? 'configured' : 'unknown',
    },
    nodesVisited: final.nodesVisited,
  };
}
