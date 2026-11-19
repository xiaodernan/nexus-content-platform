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

/** v702.2：按用户聚合（owner 维度）。口径同上；owner 行缺失的行不计入（显示真位置，不猜归属）。 */
export interface SavingsAdminUserRow {
  ownerId: string;
  ownerEmail: string | null;
  /** 该用户名下有 usage 的项目数 */
  projects: number;
  turns: number;
  realTurns: number;
  tokensIn: number;
  cachedTokens: number;
}

export async function readTopSavingsUsers(limit = 25): Promise<SavingsAdminUserRow[]> {
  const take = Math.max(1, Math.min(200, Math.trunc(limit) || 25));
  const rows = await getDb()
    .select({
      ownerId: users.id,
      ownerEmail: users.email,
      projects: sql<string>`count(distinct ${agentTasks.projectId})::text`,
      turns: sql<string>`count(*)::text`,
      realTurns: sql<string>`count(*) filter (where ${agentTasks.capability} = 'real')::text`,
      tokensIn: sql<string>`coalesce(sum((${agentTasks.usage} ->> 'tokensIn')::float8), 0)::text`,
      cachedTokens: sql<string>`coalesce(sum((${agentTasks.usage} ->> 'cachedTokens')::float8), 0)::text`,
    })
    .from(agentTasks)
    .innerJoin(projects, eq(projects.id, agentTasks.projectId))
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(isNotNull(agentTasks.usage))
    .groupBy(users.id, users.email)
    .orderBy(desc(sql`coalesce(sum((${agentTasks.usage} ->> 'cachedTokens')::float8), 0)`), desc(sql`count(*)`))
    .limit(take);

  return rows.map((row) => ({
    ownerId: row.ownerId,
    ownerEmail: row.ownerEmail ?? null,
    projects: num0(row.projects),
    turns: num0(row.turns),
    realTurns: num0(row.realTurns),
    tokensIn: num0(row.tokensIn),
    cachedTokens: num0(row.cachedTokens),
  }));
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

/**
 * video.render 行的渲染账（§40/ADR-0086）：
 *  shots = 镜头数合计 · cardCount = 色卡占位占比（没有可看的来源）· sourceReferenceCount = 整片那张图补进了多少镜 ·
 *  characterPortraitCount = character-to-scene 进像素多少镜（2026-11 起记）。
 *
 * 老行（cont.401 前）没有 characterPortraitCount：`(input->>'characterPortraitCount')::float8` 是 NULL，
 * `sum(NULL)` 折进 0——用 "没有" 表达"没记账"，绝不伪造（§3/§159）。失败一律抛错，admin 页面照实说"读不到"。
 */
export interface RenderCountTotals {
  /** video.render 任务行数（每一行 = 一次渲染） */
  renders: number;
  shots: number;
  cardCount: number;
  sourceReferenceCount: number;
  characterPortraitCount: number;
}

export async function readRenderCountTotals(): Promise<RenderCountTotals> {
  const db = getDb();
  const [row] = await db
    .select({
      renders: sql<string>`count(*)::text`,
      shots: sql<string>`coalesce(sum(case when jsonb_typeof(${agentTasks.input}->'shots') = 'number' then (${agentTasks.input}->>'shots')::float8 else 0 end), 0)::text`,
      cardCount: sql<string>`coalesce(sum(case when jsonb_typeof(${agentTasks.input}->'cardCount') = 'number' then (${agentTasks.input}->>'cardCount')::float8 else 0 end), 0)::text`,
      sourceReferenceCount: sql<string>`coalesce(sum(case when jsonb_typeof(${agentTasks.input}->'sourceReferenceCount') = 'number' then (${agentTasks.input}->>'sourceReferenceCount')::float8 else 0 end), 0)::text`,
      characterPortraitCount: sql<string>`coalesce(sum(case when jsonb_typeof(${agentTasks.input}->'characterPortraitCount') = 'number' then (${agentTasks.input}->>'characterPortraitCount')::float8 else 0 end), 0)::text`,
    })
    .from(agentTasks)
    .where(eq(agentTasks.agentKey, 'video.render'));
  return {
    renders: num0(row?.renders),
    shots: num0(row?.shots),
    cardCount: num0(row?.cardCount),
    sourceReferenceCount: num0(row?.sourceReferenceCount),
    characterPortraitCount: num0(row?.characterPortraitCount),
  };
}
