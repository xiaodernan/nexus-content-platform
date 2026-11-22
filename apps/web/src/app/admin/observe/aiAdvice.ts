import { chatWithCharacter } from '@/server/ai/client';
import type { Locale } from '@/lib/i18n';
import type { ObserverMetrics } from '@/server/admin/observer';
import { auditNumbers } from './aiAdviceAudit';

export interface AiAdviceItem {
  priority: string;
  basis: string;
  impact: string;
  action: string;
  /** basis/impact 里不在快照原文中的数字（可能是模型推算）——不删，只当面标注 */
  unverifiedNumbers: string[];
}

export interface AiAdvice {
  model: string;
  items: AiAdviceItem[];
}

/** 喂给真模型的可序列化数据快照（ObserverMetrics 与之兼容，结构相同）。 */
export type ObserverMetricsInput = ObserverMetrics;

// ── 从实库聚合数据出带数字的数据，喂给真模型。服务器按 locale 产出，模型语言跟随。
export function observerMetricsBrief(m: ObserverMetricsInput, locale: Locale): string {
  const q = (a: string[]) => a.join(' / ') || '——';
  return locale === 'zh' ? `你是只读观察站（Observer）分析师。以下是本实例数据库的最新实测聚合（2026-11-20 采样）：
- 注册用户（非游客）：${m.usersTotal}，游客：${m.usersGuests}，7 天新注册：${m.usersNew7d}，30 天新注册：${m.usersNew30d}
- 作品/发布：总发布 ${m.publishesTotal}，公开已过审 ${m.publishesPublicApproved}，总浏览 ${m.viewsTotal}，点赞 ${m.likesTotal}，评论 ${m.commentsTotal}，收藏 ${m.savesTotal}，关注 ${m.followsTotal}
- 有效打开（近 7 天）：${m.opens7d}，近 30 天：${m.opens30d}；近 7 天可见平均分钟数：${Math.round(m.visibleMs7d / 60000)}；完成度（30 天均值）：${m.completionPctAvg30d === null ? '没有数据' : m.completionPctAvg30d.toFixed(1) + '%'}
- 任务状态：排队 ${m.tasks.queued}，执行中 ${m.tasks.running}，等审批 ${m.tasks.awaitingApproval}，已完成 ${m.tasks.succeeded}，失败 ${m.tasks.failed}
- 套餐分布：${q(m.plans.map((p) => `${p.plan}=${p.count}`))}
- 疑似机器人打开（近 7 天）：${m.suspectedBots7d}
- 最热作品：${m.topWorks.slice(0, 3).map((w) => `${w.name}(views=${w.views},likes=${w.likes})`).join('，') || '——'}
- 近 7 天每日有效打开：${m.daily.map((d) => `${d.day.slice(5)}=${d.opens}`).join('，') || '——'}

请根据这些实测数字，给出 3–5 条「深度优化建议」，每条有优先级（HIGH/MEDIUM/LOW）、触发依据（含具体数字）、预计影响（含数字）、下一步动作（含具体建议）。数字必须来自上述聚合值，不得编造；没有数据支撑的点请直接说「数据不足」，不要给假的建议。输出为合法 JSON 数组，形状为 [{priority, basis, impact, action}]，不要夹杂 markdown。` : `You are the Read-only Observer analyst. Here are the latest aggregated metrics from this instance's database:
- Users: ${m.usersTotal} (non-guest), guests: ${m.usersGuests}, new in 7d: ${m.usersNew7d}, new in 30d: ${m.usersNew30d}
- Works / publishes: total ${m.publishesTotal}, public-approved ${m.publishesPublicApproved}, views ${m.viewsTotal}, likes ${m.likesTotal}, comments ${m.commentsTotal}, saves ${m.savesTotal}, follows ${m.followsTotal}
- Effective opens (last 7d): ${m.opens7d}, last 30d: ${m.opens30d}; visible time avg (7d, minutes): ${Math.round(m.visibleMs7d / 60000)}; avg completion (30d): ${m.completionPctAvg30d === null ? 'no data' : m.completionPctAvg30d.toFixed(1) + '%'}
- Task states: queued ${m.tasks.queued}, running ${m.tasks.running}, awaiting approval ${m.tasks.awaitingApproval}, succeeded ${m.tasks.succeeded}, failed ${m.tasks.failed}
- Plan distribution: ${q(m.plans.map((p) => `${p.plan}=${p.count}`))}
- Suspected bots (7d): ${m.suspectedBots7d}
- Hottest works: ${m.topWorks.slice(0, 3).map((w) => `${w.name}(views=${w.views},likes=${w.likes})`).join(', ') || '——'}
- Daily effective opens: ${m.daily.map((d) => `${d.day.slice(5)}=${d.opens}`).join(', ') || '——'}

From these measured numbers, give 3–5 deep optimization suggestions; each with priority (HIGH/MEDIUM/LOW), trigger basis (with concrete numbers), predicted impact (with numbers), and next step (concrete). Numbers must come from the aggregates above — never invent; for points without data say "data insufficient", not a made-up suggestion. Output a legal JSON array of [{priority, basis, impact, action}] without markdown.`;
}

function parseSuggestions(text: string, cap = 5): AiAdviceItem[] {
  const raw = text.trim();
  const jsonText = raw.startsWith('```') ? raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '') : raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const items: AiAdviceItem[] = [];
  for (const entry of parsed as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Partial<AiAdviceItem>;
    const pick = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 400) : null);
    const basis = pick(row.basis);
    const impact = pick(row.impact);
    const action = pick(row.action);
    if (!basis || !impact || !action) continue;
    const priority = pick(row.priority) ?? 'MEDIUM';
    items.push({ priority: priority.toUpperCase(), basis, impact, action, unverifiedNumbers: [] });
    if (items.length >= cap) break;
  }
  return items;
}

/** 服务器动作：真 provider 真调用。调用方负责决定何时触发（按钮/定时/缓存）。 */
export async function generateAiAdvice(m: ObserverMetricsInput, locale: Locale): Promise<AiAdvice> {
  const brief = observerMetricsBrief(m, locale);
  const result = await chatWithCharacter({
    requestId: `observer-advice-${Date.now().toString(36)}`,
    system: locale === 'zh' ? '你是只读观察站（Observer）分析师，按要求用中文回答。' : 'You are the read-only Observer analyst; answer with the requested JSON array only, in English.',
    user: brief,
    modelClass: 'balanced',
  });
  if (!result.ok) {
    throw new Error(result.error?.message ?? 'ai-service 不可用：无法取得真模型建议');
  }
  const items = parseSuggestions(result.response.text);
  if (items.length === 0) {
    throw new Error('ai-service 返回建议为空——如实展示');
  }
  const audited = items.map((item) => ({
    ...item,
    unverifiedNumbers: auditNumbers(`${item.basis} ${item.impact}`, brief).unverified,
  }));
  return { model: result.response.model, items: audited };
}
