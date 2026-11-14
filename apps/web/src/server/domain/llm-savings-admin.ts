import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { agentTasks, projects, users } from '../db/schema';

/**
 * v702 「AI 节省总账」admin 读侧：全部项目的 prompt 缓存复用汇总。
 *
 * 只给 role=admin 的页面消费（页面自身判一道）。SQL 聚合：usage 缺失的行不计；
 * cachedTokens 缺失（v692 前写入）按 0；失败一律抛错——admin 页显示 "读不到" 而不是
 * 编造数字（§3 纪律在管理台同样成立）。
 */
export interface SavingsAdminRow {
  projectId: string;
  projectName: string;
  /** owner 的邮箱；owner 行缺失（删号）时为 null，界面照实写 "—" */
  ownerEmail: string | null;
  /** 全部任务行数 */
  turns: number;
  /** capability = 'real' 的行数 */
  realTurns: number;
  /** SUM(usage->>'tokensIn') */
  tokensIn: number;
  /** SUM(usage->>'cachedTokens')（缺字段按 0） */
  cachedTokens: number;
}

export async function readTopSavingsProjects(limit = 50): Promise<SavingsAdminRow[]> {
  const take = Math.max(1, Math.min(200, Math.trunc(limit) || 50));
  const rows = await getDb()
    .select({
      projectId: projects.id,
      projectName: projects.name,
      ownerEmail: users.email,
      turns: sql<string>`count(*)::text`,
      realTurns: sql<string>`count(*) filter (where ${agentTasks.capability} = 'real')::text`,
      tokensIn: sql<string>`coalesce(sum((${agentTasks.usage} ->> 'tokensIn')::float8), 0)::text`,
      cachedTokens: sql<string>`coalesce(sum((${agentTasks.usage} ->> 'cachedTokens')::float8), 0)::text`,
    })
    .from(agentTasks)
    .innerJoin(projects, eq(projects.id, agentTasks.projectId))
    .leftJoin(users, eq(users.id, projects.ownerId))
    .where(isNotNull(agentTasks.usage))
    .groupBy(projects.id, projects.name, users.email)
    .orderBy(desc(sql`coalesce(sum((${agentTasks.usage} ->> 'cachedTokens')::float8), 0)`), desc(sql`count(*)`))
    .limit(take);

  return rows.map((row) => ({
    projectId: row.projectId,
    projectName: row.projectName,
    ownerEmail: row.ownerEmail ?? null,
    turns: num0(row.turns),
    realTurns: num0(row.realTurns),
    tokensIn: num0(row.tokensIn),
    cachedTokens: num0(row.cachedTokens),
  }));
}

function num0(value: string | null | undefined): number {
  const n = Number(value ?? '0');
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
