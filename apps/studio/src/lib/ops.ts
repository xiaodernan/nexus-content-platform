/**
 * Stage D — ops：审计条目与举报的客户端类型（预设计，受 ADR 0018 阻塞）。
 *
 * 纯前端，不引入 fetch、localStorage、session。所有字段均由服务端下发，客户端只读、只展示，
 * 不自行判定状态，不生成审计记录。
 *
 * 与 ADR 0018 §60 一致：无 signedIn 徽章、无会话、无 cookie；消费者按 `assurance`
 * 自行判定数据价值，不凭客户端注释信任。
 */

import type { AccountId } from './community';
import type { Assurance } from './assurance';

/**
 * What a verb can be.
 *
 * The KNOWN verbs are the union the product designs for; the `string & Record<never, never>` arm says the wire
 * may carry a verb this build has never heard of, and keeps the editor's completion for the known ones. That is
 * not speculation: the service is a SEPARATE deployable, so a verb can be added there before this client is
 * rebuilt, and a client that rejected the answer would show a gap instead of the event (v271's finding
 * that only `publish` and `unpublish` exist server-side today — the other five are design, not fact).
 */
export type AuditAction =
  | 'publish'
  | 'unpublish'
  | 'remix'
  | 'follow'
  | 'like'
  | 'comment'
  | 'tip'
  // 一个**这个版本还不认识的**动词。`Record<never, never>` 与 `string` 相交，编辑器仍然为上面七个
  // 已知动词给出补全，但类型上不排斥别的字符串。
  | (string & Record<never, never>);

/** 审计条目：由服务端写入并下发，客户端只做只读展示。 */
export interface AuditEntry {
  id: string;
  action: AuditAction;
  /**
   * 谁做的。**可空**：匿名发布没有人名，服务端如实记录"没有人"而不是编一个（v271）。
   *
   * 这个类型以前写的是 `AccountId`（非空），那是客户端的愿望而不是线格式的事实——服务端不会为了
   * 迎合一个类型而伪造 actor，所以该改的是类型（v273）。
   */
  actorId: AccountId | null;
  targetId: string;
  createdAt: number;
  /**
   * 这一条值多少。**可空**，理由同 `actorId`：没有 actor 就没有 claim，也就没有 assurance 可说。
   */
  assurance: Assurance | null;
}

/** 举报：reporterId/targetId/createdAt 由客户端填写并发给服务端；status 由服务端更新下发。 */
export interface Report {
  id: string;
  reporterId: AccountId;
  targetId: string;
  reason: 'spam' | 'harassment' | 'illegal' | 'other';
  detail: string;
  status: 'open' | 'reviewed' | 'resolved' | 'rejected';
  createdAt: number;
}

/** 举报状态展示文本，供客户端卡片/详情页直接使用。 */
export function reportStatusText(status: Report['status']): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'reviewed':
      return 'Reviewed';
    case 'resolved':
      return 'Resolved';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Unknown';
  }
}

/** 判断举报是否已终结（resolved/rejected），纯判断，供客户端决定是否显示“再举报”入口。 */
export function isReportClosed(report: Report): boolean {
  return report.status === 'resolved' || report.status === 'rejected';
}

/** 把审计条目按目标过滤，并按 createdAt 降序（新→旧）返回。不改原数组。 */
export function auditEntriesForTarget(
  entries: ReadonlyArray<AuditEntry>,
  targetId: string,
): AuditEntry[] {
  return entries
    .filter((e) => e.targetId === targetId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 把审计条目按 since（epoch ms）过滤，只保留 createdAt >= since 的，按 createdAt 降序返回。不改原数组。 */
export function auditEntriesSince(
  entries: ReadonlyArray<AuditEntry>,
  since: number,
): AuditEntry[] {
  return entries
    .filter((e) => e.createdAt >= since)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 按状态统计举报，例如 "Open: 2, Resolved: 1, Rejected: 1"，供客户端摘要栏展示。 */
export function reportStatsText(reports: ReadonlyArray<Report>): string {
  const counts: Record<Report['status'], number> = {
    open: 0,
    reviewed: 0,
    resolved: 0,
    rejected: 0,
  };
  for (const r of reports) counts[r.status] += 1;
  const parts = Object.entries(counts)
    .filter(([, c]) => c > 0)
    .map(([s, c]) => `${s}: ${c}`);
  return parts.length ? parts.join(', ') : 'No reports';
}

/** 未处理举报数量（open/reviewed），供客户端摘要栏展示。 */
export function reportOpenCount(reports: ReadonlyArray<Report>): number {
  return reports.filter((r) => r.status === 'open' || r.status === 'reviewed').length;
}

/** 已处理举报数量（resolved/rejected），供客户端摘要栏展示。 */
export function reportResolvedCount(reports: ReadonlyArray<Report>): number {
  return reports.filter((r) => r.status === 'resolved' || r.status === 'rejected').length;
}

/** 把审计动作映射为中文展示标签，供客户端卡片/列表直接使用。 */
export function auditEntryLabel(action: AuditEntry['action']): string {
  switch (action) {
    case 'publish':
      return '发布';
    case 'unpublish':
      return '下架';
    case 'remix':
      return '混改';
    case 'follow':
      return '关注';
    case 'like':
      return '点赞';
    case 'comment':
      return '评论';
    case 'tip':
      return '打赏';
    default:
      return action;
  }
}

/** 判断审计条目是否由给定账号产生，供客户端决定是否显示“撤销/申诉”入口。 */
export function isAuditEntryOwnedBy(entry: AuditEntry, actorId: AccountId | null): boolean {
  if (!actorId) return false;
  // v273 — 一条**匿名**条目没有 actor，所以它不属于任何人。把它算成“属于”某个账号会凭空造出一个
  // 主人，而审计轨迹的价值恰恰在于它不编造（v271）。
  if (entry.actorId === null) return false;
  return entry.actorId === actorId;
}

/**
 * 匿名条目的分桶键：一个**保留键**，不可能与真实账号 id 相同。
 *
 * 账号 id 由 `createAccountId` 生成，形如 `acct-<base36>`，永远不以 `__` 开头，所以这个键不可能撞上
 * 一个真人（v273）。
 */
export const ANONYMOUS_ACTOR = '__anonymous__';

/** 把审计条目按发起人分组，供客户端按代理/用户分栏展示。不改原数组。 */
export function auditEntriesByActor(entries: ReadonlyArray<AuditEntry>): Record<string, AuditEntry[]> {
  const out: Record<string, AuditEntry[]> = {};
  for (const e of entries) {
    // v273 — 匿名条目单独成桶。丢掉它们等于丢掉“有人做了事但没留名”这一事实；把它们塞进某个具名
    // 账号的桶里则是伪造归属。
    const key = e.actorId ?? ANONYMOUS_ACTOR;
    const bucket = out[key];
    if (bucket) {
      bucket.push(e);
    } else {
      out[key] = [e];
    }
  }
  return out;
}

/** 把审计条目按动作类型筛选，并按 createdAt 降序（新→旧）返回。不改原数组。 */
export function auditEntriesByAction(
  entries: ReadonlyArray<AuditEntry>,
  action: AuditEntry['action'],
): AuditEntry[] {
  return entries
    .filter((e) => e.action === action)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 把举报按原因分组，供客户端按原因分栏展示。不改原数组。 */
export function reportsByReason(reports: ReadonlyArray<Report>): Record<Report['reason'], Report[]> {
  const out: Record<Report['reason'], Report[]> = {
    spam: [],
    harassment: [],
    illegal: [],
    other: [],
  };
  for (const r of reports) out[r.reason].push(r);
  return out;
}

/** 把举报按状态分组，供客户端按状态分栏展示（与 reportsByReason 对称）。不改原数组。 */
export function reportsByStatus(reports: ReadonlyArray<Report>): Record<Report['status'], Report[]> {
  const out: Record<Report['status'], Report[]> = {
    open: [],
    reviewed: [],
    resolved: [],
    rejected: [],
  };
  for (const r of reports) out[r.status].push(r);
  return out;
}