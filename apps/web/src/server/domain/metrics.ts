import { gte, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { agentTasks, apiAccessBuckets, auditEvents } from '../db/schema';

/**
 * 观测的另一半：**库里那三本账**。
 *
 * `server/observability.ts` 的计数器活在进程里，重启就清零、多实例各算各的；而"线上过去这一天
 * 发生了什么"必须问数据库，那儿有三本已经有人在写的账：
 * - `audit_events`——决定（§80/§84），放行与拒绝都在里面
 * - `agent_tasks`——一次生成的终态与耗时（§112/§162），时长用 `started_at`/`finished_at` 减出来
 * - `api_access_buckets`——凭据用量（§188 M8），按分钟聚合的次数
 *
 * 这一片不新造事实，只把已有的三本账**读成一个能看的形状**。写它们的路径各自已经有门与测试，
 * 这里再写一份就等于允许两份口径不一致。
 */

export interface LedgerRead {
  windowHours: number;
  since: string;
  audit: Array<{ action: string; allowed: boolean; n: number }>;
  tasks: Array<{ status: string; capability: string | null; n: number; avgMs: number | null }>;
  apiCalls: Array<{ endpoint: string; calls: number }>;
}

/** 窗口上限 30 天：这三张表都会长，把"随手全表扫"挡在读的一侧，而不是等运维来加索引 */
export function clampWindowHours(hours = 24): number {
  if (!Number.isFinite(hours)) return 24;
  return Math.min(Math.max(Math.trunc(hours), 1), 24 * 30);
}

export async function readLedger(hours = 24): Promise<LedgerRead> {
  const windowHours = clampWindowHours(hours);
  const since = new Date(Date.now() - windowHours * 3_600_000);
  const db = getDb();

  const auditRows = await db
    .select({
      action: auditEvents.action,
      allowed: auditEvents.allowed,
      n: sql<string>`count(*)`,
    })
    .from(auditEvents)
    .where(gte(auditEvents.createdAt, since))
    .groupBy(auditEvents.action, auditEvents.allowed);

  const taskRows = await db
    .select({
      status: agentTasks.status,
      capability: agentTasks.capability,
      n: sql<string>`count(*)`,
      /**
       * `avg` 自己会跳过 null，所以"没跑完的行"不会被当成 0 毫秒拉低平均——
       * 那正是把 queued/running 混进时延时最容易撒的谎。
       */
      avgMs: sql<string | null>`avg(extract(epoch from (${agentTasks.finishedAt} - ${agentTasks.startedAt})) * 1000)`,
    })
    .from(agentTasks)
    .where(gte(agentTasks.createdAt, since))
    .groupBy(agentTasks.status, agentTasks.capability);

  const apiRows = await db
    .select({
      endpoint: apiAccessBuckets.endpoint,
      calls: sql<string>`sum(${apiAccessBuckets.calls})`,
    })
    .from(apiAccessBuckets)
    .where(gte(apiAccessBuckets.bucket, since))
    .groupBy(apiAccessBuckets.endpoint);

  const asNumber = (v: string | null) => (v === null ? null : Number(v));
  return {
    windowHours,
    since: since.toISOString(),
    audit: auditRows
      .map((r) => ({ action: r.action, allowed: r.allowed, n: Number(r.n) }))
      .sort((a, b) => b.n - a.n || a.action.localeCompare(b.action)),
    tasks: taskRows
      .map((r) => ({ status: r.status, capability: r.capability, n: Number(r.n), avgMs: asNumber(r.avgMs) }))
      .sort((a, b) => b.n - a.n || a.status.localeCompare(b.status)),
    apiCalls: apiRows
      .map((r) => ({ endpoint: r.endpoint, calls: Number(r.calls) }))
      .sort((a, b) => b.calls - a.calls || a.endpoint.localeCompare(b.endpoint))
      .slice(0, 20),
  };
}
