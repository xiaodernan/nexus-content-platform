/**
 * Stage D — 外部 agent：授权条目的客户端类型（预设计，受 ADR 0018 阻塞）。
 *
 * 纯前端，不引入 fetch、localStorage、session、OAuth。AgentGrant 只是一个展示条目：
 * 客户端不生成、不存储、不校验令牌；expiresAt 由服务端下发，客户端按 host-supplied now
 * 做纯展示比较。
 *
 * 与 ADR 0018 §60 一致：无 signedIn 徽章、无会话、无半接线 OAuth。
 */

import type { AccountId } from './community';

/** 外部 agent 对某目标的授权条目，供客户端展示“哪些 agent 可对该项目发布/remix/读取”。 */
export interface AgentGrant {
  id: string;
  agentId: string;
  scope: 'publish' | 'remix' | 'read';
  targetId: string;
  grantedAt: number;
  expiresAt: number | null; // null = 不过期
}

/** 授权剩余时间展示文本。已过期 → "Expired"；不过期 → "Permanent"；否则 "N d left"。 */
export function agentGrantExpiryText(grant: AgentGrant, now: number): string {
  if (grant.expiresAt === null) return 'Permanent';
  if (grant.expiresAt <= now) return 'Expired';
  const daysLeft = Math.ceil((grant.expiresAt - now) / (1000 * 60 * 60 * 24));
  return `${daysLeft} d left`;
}

/** 判断授权在 now 时刻是否有效（未过期或永久），纯判断，不改状态。 */
export function isGrantActive(grant: AgentGrant, now: number): boolean {
  if (grant.expiresAt === null) return true;
  return grant.expiresAt > now;
}

/** 授权 scope 的客户端展示标签，供客户端卡片直接使用。 */
export function grantScopeLabel(scope: AgentGrant['scope']): string {
  switch (scope) {
    case 'publish':
      return '发布权限';
    case 'remix':
      return '混改权限';
    case 'read':
      return '读取权限';
    default:
      return scope;
  }
}

/** 把授权条目按 scope 分组，供客户端按权限分栏展示。不改原数组。 */
export function grantsByScope(
  grants: ReadonlyArray<AgentGrant>,
): Record<AgentGrant['scope'], AgentGrant[]> {
  const out: Record<AgentGrant['scope'], AgentGrant[]> = {
    publish: [],
    remix: [],
    read: [],
  };
  for (const g of grants) out[g.scope].push(g);
  return out;
}

/** 把授权条目按 agentId 分组，供客户端按代理分栏展示。不改原数组。 */
export function grantsByAgentId(grants: ReadonlyArray<AgentGrant>): Record<string, AgentGrant[]> {
  const out: Record<string, AgentGrant[]> = {};
  for (const g of grants) {
    const bucket = out[g.agentId];
    if (bucket) {
      bucket.push(g);
    } else {
      out[g.agentId] = [g];
    }
  }
  return out;
}

/** 判断授权是否即将过期（在 thresholdDays 天内且非永久），供客户端展示提醒。默认阈值 7 天。 */
export function isGrantExpiringSoon(
  grant: AgentGrant,
  now: number,
  thresholdDays: number = 7,
): boolean {
  if (grant.expiresAt === null) return false;
  const msLeft = grant.expiresAt - now;
  return msLeft > 0 && msLeft <= thresholdDays * 24 * 60 * 60 * 1000;
}

/** 授权还剩多少天（整数，向下取整）；永久授权返回 null；已过期返回 0。 */
export function grantRemainingDays(grant: AgentGrant, now: number): number | null {
  if (grant.expiresAt === null) return null;
  const msLeft = grant.expiresAt - now;
  if (msLeft <= 0) return 0;
  return Math.floor(msLeft / (24 * 60 * 60 * 1000));
}

/** 筛选出在 thresholdDays 天内即将过期的授权（非永久、未过期），供客户端批量提醒。 */
export function grantsExpiringWithin(
  grants: ReadonlyArray<AgentGrant>,
  now: number,
  thresholdDays: number,
): AgentGrant[] {
  return grants.filter((g) => isGrantExpiringSoon(g, now, thresholdDays));
}

/** 把授权条目按目标筛选，供客户端在项目页展示“该项目的授权”。不改原数组。 */
export function grantsForTarget(
  grants: ReadonlyArray<AgentGrant>,
  targetId: string,
): AgentGrant[] {
  return grants.filter((g) => g.targetId === targetId);
}

/** 筛选出在 now 时刻当前有效的授权（未过期或永久），供客户端展示可用权限。不改原数组。 */
export function activeGrants(grants: ReadonlyArray<AgentGrant>, now: number): AgentGrant[] {
  return grants.filter((g) => isGrantActive(g, now));
}