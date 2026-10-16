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