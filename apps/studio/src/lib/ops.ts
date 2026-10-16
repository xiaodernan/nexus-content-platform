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

/** 审计条目：由服务端写入并下发，客户端只做只读展示。 */
export interface AuditEntry {
  id: string;
  action:
    | 'publish'
    | 'unpublish'
    | 'remix'
    | 'follow'
    | 'like'
    | 'comment'
    | 'tip';
  actorId: AccountId;
  targetId: string;
  createdAt: number;
  assurance: Assurance;
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