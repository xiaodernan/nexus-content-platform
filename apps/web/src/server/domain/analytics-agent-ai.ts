import type { CreatorFact } from '@/server/domain/analytics-agent';
import type { Finding } from '@/server/domain/analytics-agent';
import { CANON_DIGEST } from '@/lib/bibleAsk';

/**
 * §169-AI · 创作者数据大模型解读 —— Creator Agent 的「narrated」模式。
 *
 * 纪律：
 * - 模型只问 digest（CreatorFact + rule findings 自己生成的两类证据）：没有任何用户字段、没有其他作者数据；
 * - 数字逐字原样：模型被禁止重算——每个数字都直接照抄 digest，不涉及解释学立场；
 * - 规则发现照实列出，允许模型说「这里是作者自己，不是观众」（selfOnly / selfCompleted）；
 * - 结果中带模型/cached_tokens 徽标，像 bible/ask 一样让读者肉眼可见这是真大模型不是模板。
 */

/** 诚实摘要：把一切交给 provider 之前的结构化快照。 */
export interface AgentDigest {
  text: string;
  charBudget: number;
}

export const AGENT_NARRATE_SYSTEM_PROMPT = [
  'You are an honest product analyst reviewing a single creator\'s public project stats.',
  'You only see numbers below — there is no narrative you can invent.',
  'Hard rules:',
  '1. Never invent data. If the digest does not contain it, say "没有这个数据 / not collected".',
  '2. Distinguish author-only numbers (selfOnly=true / selfCompleted) from real visitor numbers. Call them out as "只有作者自己" evidence.',
  '3. Your job: decide THE #1 highest-impact action this creator can do INSIDE the platform today (title / cover / visibility / publish-port / share). One action only. No ads, no outside platforms.',
  '4. Answer at most 180 words as exactly three numbered parts. zh: "① 事实：… ② 原因：… ③ 动作：…". en: "① Fact: … ② Why: … ③ Action: …". The third part MUST begin with "动作："（zh）or "Action:"（en）. No markdown numbering ("1." "2.").',
  '5. Answer in the asked locale. zh → Chinese only, en → English only. No mixed languages.',
  '6. Quote the numbers you used with their own units (points / visitors / hours / views).',
  '7. Use the canon context below only as world-aware analogues — never for digits. If it fits, name the chapter or echo.',
  '',
  'CANON CONTEXT (world bible digest — for analogy only, never for digits):',
  CANON_DIGEST,
].join('\n');

export function buildCreatorDigest(fact: CreatorFact, findings: readonly Finding[]): string {
  const n = fact.numbers;
  const lines = [
    'CREATOR FACT DIGEST',
    `project="${fact.projectName}" visibility=${fact.visibility} moderation=${fact.moderation}`,
    `description=${fact.description ?? 'EMPTY'}`,
    `hasCoverImage=${fact.hasCoverImage} hasGame=${fact.hasGame} daysSincePublish=${fact.daysSincePublish}`,
    `views=${n.views} opensToday=${n.opensToday} visitors=${n.visitors} visitorsToday=${n.visitorsToday}`,
    `likes=${n.likes} remixes=${n.remixes} followers=${n.followers}`,
    `completionAvgPct=${n.completion ? n.completion.avgPct.toFixed(1) + '%' : 'null'} completionOver=${n.completion ? n.completion.over : 0}`,
    `playTimeMs=${n.playTimeMs === null ? 'null' : n.playTimeMs} cappedReports=${n.cappedReports}`,
    `completedVisitors=${n.completedVisitors} botCompletions=${n.botCompletions} botOpens=${n.botOpens} botVisitors=${n.botVisitors}`,
    `selfOnly=${n.selfOnly} selfCompleted=${n.selfCompleted}`,
    `TITLE_LIMIT=60 chars allowed: ${fact.projectName.length} used`,
    `RULE FINDINGS (${findings.length} items):`,
    ...findings.map((f, i) => `finding#${i + 1} area=${f.area} evidence="${f.evidence}" conclusion="${f.conclusion}" action="${f.action}"`),
    'END OF FACT DIGEST',
  ];
  return lines.join('\n');
}
