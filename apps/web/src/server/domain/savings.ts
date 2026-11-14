import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { agentTasks, projects } from '../db/schema';
import { isUuid } from './ids';
import { savingsFromAggregates, type SavingsAggregates, type SavingsSummary } from '@/lib/savings';

/**
 * 「节省账单」服务端读侧：本项目 `agent_tasks.usage` 的累计。
 *
 * 纪律：
 * - **不报没量过的数**：usage 缺失的行只计 rowsWithUsage 不进 tokensIn；cachedTokens 缺失的行（v692 前）不当 0；
 * - 聚合在库里做（SQL SUM/COUNT），不把整份 usage jsonb 拉进内存；
 * - 只给项目 owner 看——与 listProjectTasks 同一道门（形状不对的 id = 不存在）；
 * - 失败返回 null（§3：读不到要说读不到），页面该位置渲染空，不编造、不 500。
 */
export async function projectSavings(
  projectId: string,
  actorId: string,
): Promise<SavingsSummary | null> {
  if (!isUuid(projectId)) return null;
  try {
    const db = getDb();
    const [owned] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.ownerId, actorId), isNull(projects.deletedAt)))
      .limit(1);
    if (!owned) return null;

    const rows = await db
      .select({
        turns: sql<string>`count(*)::text`,
        realTurns: sql<string>`count(*) filter (where ${agentTasks.capability} = 'real')::text`,
        demoTurns: sql<string>`count(*) filter (where ${agentTasks.capability} = 'demo')::text`,
        rowsWithUsage: sql<string>`count(*) filter (where ${agentTasks.usage} is not null)::text`,
        rowsWithCacheField: sql<string>`count(*) filter (where ${agentTasks.usage} ? 'cachedTokens')::text`,
        tokensIn: sql<string>`coalesce(sum((${agentTasks.usage} ->> 'tokensIn')::float8), 0)::text`,
        cachedTokens: sql<string>`coalesce(sum((${agentTasks.usage} ->> 'cachedTokens')::float8), 0)::text`,
      })
      .from(agentTasks)
      .where(eq(agentTasks.projectId, projectId));

    const r = rows[0];
    if (!r) return savingsFromAggregates(emptyAggregates(0));
    const aggregates: SavingsAggregates = {
      turns: int(r.turns),
      realTurns: int(r.realTurns),
      demoTurns: int(r.demoTurns),
      rowsWithUsage: int(r.rowsWithUsage),
      rowsWithCacheField: int(r.rowsWithCacheField),
      tokensIn: num(r.tokensIn),
      cachedTokens: num(r.cachedTokens),
    };
    return savingsFromAggregates(aggregates);
  } catch {
    // 坏 jsonb（手写的脏数据）也让这里吞掉：账本永远不能因为一行坏数据整页 500
    return null;
  }
}

function emptyAggregates(turns: number): SavingsAggregates {
  return { turns, realTurns: 0, demoTurns: 0, rowsWithUsage: 0, rowsWithCacheField: 0, tokensIn: 0, cachedTokens: 0 };
}

function int(value: string | null | undefined): number {
  const n = Number(value ?? '0');
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

function num(value: string | null | undefined): number {
  const n = Number(value ?? '0');
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
