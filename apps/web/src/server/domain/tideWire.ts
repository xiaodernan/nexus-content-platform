/**
 * §TIDE-WIRE · 今日潮声——平台公开 aggregate 的「潮说一句」。
 *   纪律：公开页只读 anonymous aggregate；不展示个人、不识别项目、不渲染任何作品正文；
 *   数字由服务器自算，模型只负责把潮的口吻说两句——特定于这一刻的潮，但不预言、不承诺、不编造。
 */
import type { ObserverMetrics } from '@/server/admin/observer';

export interface TideWireStats {
  opens7d: number;
  opens30d: number;
  publishesPublicApproved: number;
  completionPctAvg30d: number | null;
  completionsGame: number;
  completionsWork: number;
}

export function compactTideStats(m: ObserverMetrics): TideWireStats {
  return {
    opens7d: m.opens7d,
    opens30d: m.opens30d,
    publishesPublicApproved: m.publishesPublicApproved,
    completionPctAvg30d: m.completionPctAvg30d,
    completionsGame: m.completionsGame,
    completionsWork: m.completionsWork,
  };
}

/** 公开 aggregate 都是零 → 未到潮声时候；此时不调用模型、不冒充（§159）。 */
export function tideWireIsEmpty(s: TideWireStats): boolean {
  return s.opens7d === 0 && s.opens30d === 0 && s.publishesPublicApproved === 0;
}

/** 稳定、短小的系统前缀：今日版本同 locale 逐字节一致 → provider 侧 KV 命中（§CACHE-4）。 */
export const TIDE_WIRE_SYSTEM_PROMPT = [
  'You are the Tide. The reader is everyone who looks at this public page.',
  'You say two sentences at most — in the tide’s voice: quiet, tidal, factual.',
  'The numbers below are the platform’s real aggregate counts for the last 7 and 30 days.',
  'Hard rules (non-negotiable):',
  '1. Speak ONLY from these numbers. Never invent works, names, users, or events.',
  '2. You may interpret direction (rising / retreating / still), citing the figures you have. But no predictions, no promises, no marketing.',
  '3. Never identify or single out any specific work, author, or user. This is a tide report, not a ledger.',
  '4. ONE language only: zh column asks Chinese; en asks English. Never mix.',
  '5. If the numbers are zero or trivially small, say exactly one line that says the tide is quiet right now — nothing else.',
].join('\n');

export function buildTideWireUserMessage(s: TideWireStats, locale: 'zh' | 'en', dayStamp: string): string {
  const metrics = JSON.stringify(s);
  return locale === 'zh'
    ? `日期：${dayStamp}\n实测聚合（JSON，全部匿名）：${metrics}\n潮说两句：`
    : `Date: ${dayStamp}\nMeasured aggregate (JSON, all anonymous): ${metrics}\nSay two sentences as the tide:`;
}
