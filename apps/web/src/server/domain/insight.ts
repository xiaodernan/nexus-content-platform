import { and, gte, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import {
  agentTasks,
  comments,
  creditLedger,
  follows,
  gameCompletions,
  likes,
  projects,
  publicationVisits,
  publishedProjects,
  users,
  workCompletions,
} from '../db/schema';
import type { InsightMetrics } from '@/lib/insight-rules';

/**
 * 洞察台（/insight）的聚合读数——口令 123 打开的那个页面上呈现的全部数字。
 *
 * 三条硬约束（写在这一层，UI 没有权利绕开）：
 * 1. **只出聚合**：不返回邮箱、不返回 token、不返回任何单个用户的明细。
 *    热门作品列（top works）里的 name/handle 本来就是公开页上公开展示的内容。
 * 2. **诚实分母**：全程 `count(*)::int` / `coalesce(sum(...), 0)`；除法一律在纯函数里做，
 *    库里没有行就让下游显示「—」而不是画一个 0%（§159）。
 * 3. **30 天窗口**统一按 now() - 30*24h；日序列按库时区日期分组，缺天补 0 是展示层的事，不是伪造数据。
 */

export interface InsightTopWork {
  path: string;
  projectName: string;
  handle: string | null;
  /** 累计原始浏览（含爬虫），展示口径不变 */
  views: number;
  /** §INSIGHT-BOTS：近 30 天真人打开（suspectedBot=false）；缺席时 digest 不报该格 */
  humanOpens?: number;
}

export interface InsightSnapshot {
  totals: {
    users: number;
    guests: number;
    projects: number;
    published: number;
    likes: number;
    comments: number;
    follows: number;
    viewsAllTime: number;
    gameCompletions: number;
    workCompletions: number;
    usageCalls30d: number;
  };
  /** 近 30 天（含今天）日序列，长度 30；口令页面用来画 sparkline 与趋势外推 */
  series30d: {
    days: string[];
    signups: number[];
    publishes: number[];
    opens: number[];
  };
  credits30d: {
    granted: number;
    consumed: number;
  };
  ai30d: {
    realCalls: number;
    demoCalls: number;
    tokensIn: number;
    cachedTokens: number;
    costEstimateUsd: number;
    avgLatencyMs: number | null;
  };
  botOpens30d: number;
  opens30d: number;
  likes30d: number;
  comments30d: number;
  topWorks: InsightTopWork[];
  /** 给纯函数规则引擎用的同形副本（同一份查询结果，不双算） */
  metrics: InsightMetrics;
}

const DAY_MS = 86_400_000;

function dayKeysUTC(now: Date, len: number): string[] {
  const out: string[] = [];
  for (let i = len - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY_MS);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const toInt = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function collectInsightSnapshot(now = new Date()): Promise<InsightSnapshot> {
  const db = getDb();
  const dayKeys = dayKeysUTC(now, 30);
  const dayStart = new Date(`${dayKeys[0]!}T00:00:00.000Z`);

  const [
    usersRow,
    guestsRow,
    projectsRow,
    publishedRow,
    likesRow,
    commentsRow,
    followsRow,
    viewsRow,
    gameRow,
    workRow,
    opensRow,
    botOpensRow,
    likes30Row,
    comments30Row,
    creditRow,
    aiRow,
    signupsByDay,
    publishesByDay,
    opensByDay,
    topWorksRows,
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(isNull(users.deletedAt), sql`${users.guest} = false`)),
    db.select({ n: sql<number>`count(*)::int` }).from(users).where(and(isNull(users.deletedAt), sql`${users.guest} = true`)),
    db.select({ n: sql<number>`count(*)::int` }).from(projects).where(isNull(projects.deletedAt)),
    db.select({ n: sql<number>`count(*)::int` }).from(publishedProjects).where(sql`${publishedProjects.visibility} = 'public'`),
    db.select({ n: sql<number>`count(*)::int` }).from(likes),
    db.select({ n: sql<number>`count(*)::int` }).from(comments),
    db.select({ n: sql<number>`count(*)::int` }).from(follows),
    db.select({ n: sql<number>`coalesce(sum(${publishedProjects.views}), 0)::bigint` }).from(publishedProjects).where(sql`${publishedProjects.visibility} = 'public'`),
    db.select({ n: sql<number>`count(*)::int` }).from(gameCompletions),
    db.select({ n: sql<number>`count(*)::int` }).from(workCompletions),
    db.select({ n: sql<number>`coalesce(sum(${publicationVisits.opens}), 0)::bigint` }).from(publicationVisits).where(gte(publicationVisits.day, dayKeys[0]!)),
    db.select({ n: sql<number>`coalesce(sum(${publicationVisits.opens}), 0)::bigint` }).from(publicationVisits).where(and(gte(publicationVisits.day, dayKeys[0]!), sql`${publicationVisits.suspectedBot} = true`)),
    db.select({ n: sql<number>`count(*)::int` }).from(likes).where(gte(likes.createdAt, dayStart)),
    db.select({ n: sql<number>`count(*)::int` }).from(comments).where(gte(comments.createdAt, dayStart)),
    db.select({
      granted: sql<number>`coalesce(sum(${creditLedger.delta}) filter (where ${creditLedger.delta} > 0), 0)::bigint`,
      consumed: sql<number>`coalesce(-sum(${creditLedger.delta}) filter (where ${creditLedger.delta} < 0), 0)::bigint`,
    }).from(creditLedger).where(gte(creditLedger.createdAt, dayStart)),
    db.select({
      realCalls: sql<number>`count(*) filter (where (${agentTasks.usage}->>'demoMode')::boolean = false)::int`,
      demoCalls: sql<number>`count(*) filter (where (${agentTasks.usage}->>'demoMode')::boolean is distinct from false)::int`,
      tokensIn: sql<number>`coalesce(sum((${agentTasks.usage}->>'tokensIn')::bigint), 0)::double precision`,
      cachedTokens: sql<number>`coalesce(sum((${agentTasks.usage}->>'cachedTokens')::bigint), 0)::double precision`,
      costEstimateUsd: sql<number>`coalesce(sum((${agentTasks.usage}->>'costEstimate')::double precision), 0)`,
      avgLatencyMs: sql<number | null>`avg((${agentTasks.usage}->>'latencyMs')::double precision)`,
    }).from(agentTasks).where(gte(agentTasks.createdAt, dayStart)),
    db.select({ d: sql<string>`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(users).where(gte(users.createdAt, dayStart)).groupBy(sql`date_trunc('day', ${users.createdAt})`),
    db.select({ d: sql<string>`to_char(date_trunc('day', ${publishedProjects.publishedAt}), 'YYYY-MM-DD')`, n: sql<number>`count(*)::int` })
      .from(publishedProjects).where(gte(publishedProjects.publishedAt, dayStart)).groupBy(sql`date_trunc('day', ${publishedProjects.publishedAt})`),
    db.select({ d: sql<string>`${publicationVisits.day}::text`, n: sql<number>`coalesce(sum(${publicationVisits.opens}), 0)::bigint` })
      .from(publicationVisits).where(gte(publicationVisits.day, dayKeys[0]!)).groupBy(publicationVisits.day),
    db.select({
      path: publishedProjects.path,
      projectName: projects.name,
      handle: users.handle,
      views: sql<number>`${publishedProjects.views}::bigint`,
      humanOpens: sql<number>`coalesce((select sum(opens)::bigint from publication_visits where publication_visits.publication_id = ${publishedProjects.id} and publication_visits.suspected_bot = false and publication_visits.day >= (current_date - interval '30 days')::date), 0)`,
    }).from(publishedProjects)
      .innerJoin(projects, sql`${projects.id} = ${publishedProjects.projectId}`)
      .innerJoin(users, sql`${users.id} = ${projects.ownerId}`)
      .where(sql`${publishedProjects.visibility} = 'public'`)
      .orderBy(sql`(select coalesce(sum(opens), 0)::bigint from publication_visits where publication_visits.publication_id = ${publishedProjects.id} and publication_visits.suspected_bot = false and publication_visits.day >= (current_date - interval '30 days')::date) desc`)
      .limit(5),
  ]);

  const byDay = (rows: { d: string; n: number }[]): Map<string, number> =>
    new Map(rows.map((r) => [r.d, toInt(r.n)]));

  const signupMap = byDay(signupsByDay);
  const publishMap = byDay(publishesByDay);
  const openMap = byDay(opensByDay);

  const signups = dayKeys.map((d) => signupMap.get(d) ?? 0);
  const publishes = dayKeys.map((d) => publishMap.get(d) ?? 0);
  const opens = dayKeys.map((d) => openMap.get(d) ?? 0);

  const opens30d = toInt(opensRow[0]!.n);
  const botOpens30d = toInt(botOpensRow[0]!.n);
  const creditsGranted30d = toInt(creditRow[0]!.granted);
  const creditsConsumed30d = toInt(creditRow[0]!.consumed);
  const realCalls30d = toInt(aiRow[0]!.realCalls);
  const demoCalls30d = toInt(aiRow[0]!.demoCalls);

  const metrics: InsightMetrics = {
    usersTotal: toInt(usersRow[0]!.n),
    guestsTotal: toInt(guestsRow[0]!.n),
    projectsTotal: toInt(projectsRow[0]!.n),
    publishedTotal: toInt(publishedRow[0]!.n),
    opens30d,
    botOpens30d,
    likes30d: toInt(likes30Row[0]!.n),
    comments30d: toInt(comments30Row[0]!.n),
    creditGranted30d: creditsGranted30d,
    creditConsumed30d: creditsConsumed30d,
    realCalls30d,
    demoCalls30d,
    tokensIn30d: toNum(aiRow[0]!.tokensIn),
    tokensCached30d: toNum(aiRow[0]!.cachedTokens),
    dailySignups: signups,
    dailyPublishes: publishes,
    dailyOpens: opens,
  };

  return {
    totals: {
      users: metrics.usersTotal,
      guests: metrics.guestsTotal,
      projects: metrics.projectsTotal,
      published: metrics.publishedTotal,
      likes: toInt(likesRow[0]!.n),
      comments: toInt(commentsRow[0]!.n),
      follows: toInt(followsRow[0]!.n),
      viewsAllTime: toInt(viewsRow[0]!.n),
      gameCompletions: toInt(gameRow[0]!.n),
      workCompletions: toInt(workRow[0]!.n),
      usageCalls30d: realCalls30d + demoCalls30d,
    },
    series30d: { days: dayKeys, signups, publishes, opens },
    credits30d: { granted: creditsGranted30d, consumed: creditsConsumed30d },
    ai30d: {
      realCalls: realCalls30d,
      demoCalls: demoCalls30d,
      tokensIn: toNum(aiRow[0]!.tokensIn),
      cachedTokens: toNum(aiRow[0]!.cachedTokens),
      costEstimateUsd: toNum(aiRow[0]!.costEstimateUsd),
      avgLatencyMs: aiRow[0]!.avgLatencyMs == null ? null : Math.round(toNum(aiRow[0]!.avgLatencyMs)),
    },
    botOpens30d,
    opens30d,
    likes30d: metrics.likes30d,
    comments30d: metrics.comments30d,
    topWorks: topWorksRows.map((r) => ({
      path: r.path,
      projectName: r.projectName,
      handle: r.handle,
      views: toInt(r.views),
      humanOpens: toInt(r.humanOpens),
    })),
    metrics,
  };
}
