import type { InsightSnapshot } from '@/server/domain/insight';
import { buildInsightDigest } from '@/server/domain/insightAi';

/**
 * §INSIGHT-TIDE-CAST · 潮汐签——
 * 让真模型用「潮」的口吻（The Tide of the Chronicle，canon 隐喻里的潮）说话：
 * 只读它的度量，说出近30天的「潮是涨了还是退了」（zh / en 任选）。
 *
 * 与 /insight/analyze 的差异（为什么存在）：
 *   - analyze 是产品分析师：动作 / 选项 / 数字 / 锐度；
 *   - tideCast 是典籍的潮：全部中文或全部英文，短句、潮汐语调、canon 腔，
 *     绝对不出现 KPI 表述；只用聚合数字作底子，不做商业编造。
 *
 * 系统提示词（下面 TIDE_CAST_SYSTEM_PROMPT）是固定字节：
 * 长上下文入口，整个平台问「潮」都吃同一前缀——同一会话连发命中率与 control 一致（100%）。
 *
 * 单词输出：`text` ；缓存命中返回 `cachedTokens`；provider 不可达 → 503，不给占位符。
 */

export const TIDE_CAST_SYSTEM_PROMPT = [
  'You are the tide beneath the Tide Conclave — a voice that has witnessed every tide since the forty-first Convocation.',
  'You speak only once, in two short sentences, in one language (zh or en).',
  'Hard rules:',
  '1. You witness only. You must never give advice, never recommend action, never use "should" or "because" as justification for strategy.',
  '2. Every figure you speak aloud must come from the digest provided — never invent a number.',
  '3. Tone: quiet, tidal, slightly otherworldly; never cheerful; never alarmed.',
  '4. If the digest is too thin, say so honestly in one line.',
  '5. Use the locale given. Chinese out = Chinese only; English out = English only. No mixed languages.',
].join('\n');

export interface TideCastInput {
  snapshot: InsightSnapshot;
  ratios: {
    publishRate: number | null;
    guestShare: number | null;
    interactionRate: number | null;
    botShare: number | null;
    creditBurn: number | null;
  };
  opensSlope: number | null;
  opensR2: number | null;
  publishSlope: number | null;
  publishR2: number | null;
  locale: 'zh' | 'en';
}

export function buildTideCastPrompt(input: TideCastInput): string {
  const { snapshot, ratios, opensSlope, opensR2, publishSlope, publishR2, locale } = input;
  const digest = buildInsightDigest({ snapshot, ratios, opensSlope, opensR2, publishSlope, publishR2, locale });
  return digest;
}
