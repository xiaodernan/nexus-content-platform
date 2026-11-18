import type { InsightSnapshot } from '@/server/domain/insight';
import { CANON_DIGEST } from '@/lib/bibleAsk';

/**
 * §INSIGHT-3 · INSIGHT 大模型解读的 digest：**全部聚合整数，不落个人字段**，
 * 系统提示词要求「只答聚合数据本身、不推断个人、不编造数字」。
 * digest 是模型唯一的数据源——模型看不到浏览器、IP、请求头。
 */
export interface InsightDigestInput {
  snapshot: InsightSnapshot;
  /** 从 metrics 衍生的比值（publishRate/guestShare/interactionRate/botShare/creditBurn）——与页面 s3 一致 */
  ratios: {
    publishRate: number | null;
    guestShare: number | null;
    interactionRate: number | null;
    botShare: number | null;
    creditBurn: number | null;
  };
  /** leastSquares(日开) 斜率；服务端已经算过，传进来避免 LLM 手算错 */
  opensSlope: number | null;
  /** leastSquares(日开) R² */
  opensR2: number | null;
  publishSlope: number | null;
  publishR2: number | null;
  locale: 'zh' | 'en';
}

/**
 * §INSIGHT-CACHE-FRONT · 把 world bible 的 digest （byte-stable) 嵌入 system 前缀，
 *  - 与问典 /bible/ask 共用同一条 30k-token 稳定 KV 前缀；
 *  - daily-aggregate digest 仍放在 user 侧（user 经常变化 ≠ prefix 丢失）；
 *  - 用户想看的「很深的世界信息」（"电话里 somebody told the analyst …"）这个字节稳定层就是答案；
 *  - 在世界诗拼接前面是为了 prefix probe 先找得到（跟 CANON_DIGEST 边缘精确定义）。
 * vocabulary note: the words below are part of the prompt; never change them without a §INSIGHT-CACHE-FRONT chapter rollover.
 */
export const INSIGHT_AI_SYSTEM_PROMPT = [
  'You are a product analyst for the NEXUS content platform.',
  'You will be given an aggregate digest of the last 30 days: totals, per-day series, and ratios computed server-side.',
  'You never see personal data, cookies, IPs or messages — only integers.',
  'Hard rules:',
  '1. Never invent numbers. If the digest does not support a claim, write "数据不足 / Not enough data yet".',
  '2. Quote digest numbers exactly (same units). Do not recompute ratios — use the ones provided.',
  '3. Identify THE ONE bottleneck that most plausibly throttles growth RIGHT NOW, with the supporting figure.',
  '4. Name ONE concrete next action on THIS site. No slogans. No "improve UX". Concrete data point + concrete fix + a success signal to watch.',
  '5. Keep the whole analysis under 130 words per language. Use the canonical three-part order: (①) 现象/Symptom, (②) 证据/Evidence, (③) 动作/Action. Use whichever form fits the locale you were given.',
  '6. Answer in the locale you are told (`zh` → Chinese only; `en` → English only). No mixed languages.',
  '7. This product charges credits for AI usage. If the digest shows cache hit rate is low (<50%), the correct advice may be a cache/prompt-structure fix.',
  '8. Use the canon context below only as world-aware analogues — never to borrow a number from it. If an example of rhythm/anchor helps, name the chapter or echo it came from.',
  '',
  'CANON CONTEXT (world bible digest — for analogy only, never for digits):',
  CANON_DIGEST,
].join('\n');

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`);

export function buildInsightDigest(input: InsightDigestInput): string {
  const { snapshot, ratios, opensSlope, opensR2, publishSlope, publishR2, locale } = input;
  const t = snapshot.totals;
  const ai = snapshot.ai30d;
  const cr = snapshot.credits30d;
  const seriesSignups = snapshot.series30d.signups.join(',');
  const seriesPublishes = snapshot.series30d.publishes.join(',');
  const seriesOpens = snapshot.series30d.opens.join(',');
  const topWorksBlock = snapshot.topWorks.length > 0
    ? snapshot.topWorks.slice(0, 3).map((w, i) => `top#${i + 1}="${w.projectName}" path=${w.path} views=${w.views}${typeof w.humanOpens === 'number' ? ` humanOpens30d=${w.humanOpens}` : ''}`).join('\n')
    : 'n/a';

  return [
    `locale: ${locale}`,
    `=== TOTALS (all-time) ===`,
    `users=${t.users} guests=${t.guests} projects=${t.projects} published=${t.published} likes=${t.likes} comments=${t.comments} follows=${t.follows} opens(all-time)=${t.viewsAllTime} gameCompletions=${t.gameCompletions} workCompletions=${t.workCompletions} aiCalls30d=${t.usageCalls30d}`,
    `=== LAST 30 DAYS ===`,
    `opens=${snapshot.opens30d} botOpens=${snapshot.botOpens30d} likes=${snapshot.likes30d} comments=${snapshot.comments30d}`,
    `credits(granted)=${cr.granted} credits(consumed)=${cr.consumed}`,
    `aiRealCalls=${ai.realCalls} aiDemoCalls=${ai.demoCalls} tokensIn=${Math.trunc(ai.tokensIn)} cachedTokens=${Math.trunc(ai.cachedTokens)} avgLatencyMs=${ai.avgLatencyMs ?? 'n/a'} costEstimateUsd=${ai.costEstimateUsd.toFixed(4)}`,
    `=== DERIVED RATIOS (already computed server-side, use as-is) ===`,
    `publishRate=${pct(ratios.publishRate)} guestShare=${pct(ratios.guestShare)} interactionRate=${pct(ratios.interactionRate)} botShare=${pct(ratios.botShare)} creditBurn=${pct(ratios.creditBurn)}`,
    `=== TREND FITS (least-squares; null = too few days) ===`,
    `opensSlope/day=${opensSlope?.toFixed(2) ?? 'n/a'} r2=${opensR2?.toFixed(2) ?? 'n/a'} publishesSlope/day=${publishSlope?.toFixed(2) ?? 'n/a'} publishesR2=${publishR2?.toFixed(2) ?? 'n/a'}`,
    `=== SERIES (last 30 days, oldest→newest, comma-separated) ===`,
    `signups=${seriesSignups}`,
    `publishes=${seriesPublishes}`,
    `opens=${seriesOpens}`,
    `=== TOP PUBLISHED WORKS (views desc, max 3) ===`,
    topWorksBlock,
    `=== END DIGEST ===`,
  ].join('\n');
}
