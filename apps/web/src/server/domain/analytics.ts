import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { MAX_FLUSH_MS, clampReportedMs, utcDay, validVisitorKey } from '@/lib/visit-meter';
import { getDb } from '../db/client';
import { follows, likes, projects, publicationVisits, publishedProjects, remixes } from '../db/schema';
import type { Visibility } from './publish';

/**
 * §168 Analytics。这一层只做两件事：**把访客现场按"人 × 天"存下来**，
 * 以及**把六个数按各自真实的口径算出来**。
 *
 * 两条纪律贯穿全文件：
 * - 采不到就报 null，不拿别的数换算一个冒充（play time 为 null 时界面必须写"未采集"）；
 * - 客户端送来的一切数字先截断再入库（规则在 `src/lib/visit-meter.ts`），
 *   被截断过几次也照样存下来——被动过的数据要留得下痕迹。
 */

export interface VisitInput {
  publicationId: string;
  /** 浏览器生成的匿名 key；不合法直接不收 */
  visitorKey: unknown;
  /** 登录访客，匿名传 null。作者的访问因此能在查询里挑出来说明，而不是静默混进数里 */
  userId: string | null;
  /** 这次算一次"页面打开"，还是仅仅一次心跳 */
  open: boolean;
  visibleMs: unknown;
  completionPct: unknown;
  at?: Date;
}

/** 一次访客现场：打开加一、时长累加、完成度取最远。rejected 表示连一行都不该写 */
export async function recordVisit(input: VisitInput): Promise<'recorded' | 'rejected'> {
  const visitorKey = validVisitorKey(input.visitorKey);
  if (!visitorKey) return 'rejected';
  const rawMs = typeof input.visibleMs === 'number' ? input.visibleMs : Number.NaN;
  const visibleMs = clampReportedMs(input.visibleMs);
  const capped = Number.isFinite(rawMs) && rawMs > MAX_FLUSH_MS ? 1 : 0;
  const rawPct = typeof input.completionPct === 'number' ? input.completionPct : Number.NaN;
  const completionPct = Number.isFinite(rawPct) ? Math.max(0, Math.min(100, Math.floor(rawPct))) : 0;
  const day = utcDay(input.at ?? new Date());
  const db = getDb();
  await db
    .insert(publicationVisits)
    .values({
      publicationId: input.publicationId,
      visitorKey,
      day,
      userId: input.userId,
      opens: input.open ? 1 : 0,
      visibleMs,
      completionPct,
      cappedReports: capped,
    })
    .onConflictDoUpdate({
      target: [publicationVisits.publicationId, publicationVisits.visitorKey, publicationVisits.day],
      set: {
        opens: sql`${publicationVisits.opens} + ${input.open ? 1 : 0}`,
        visibleMs: sql`${publicationVisits.visibleMs} + ${visibleMs}`,
        completionPct: sql`GREATEST(${publicationVisits.completionPct}, ${completionPct})`,
        cappedReports: sql`${publicationVisits.cappedReports} + ${capped}`,
        // 同一行里"先匿名后登录"要能补上账号，反过来不覆盖已有归属
        userId: sql`COALESCE(${publicationVisits.userId}, ${input.userId})`,
        updatedAt: sql`now()`,
      },
    });
  return 'recorded';
}

/**
 * 六个数的真实口径。每一项都写着它数的是什么——`followers` 是作者级而不是这一版级，
 * `views` 含作者自己的刷新，这些区别不写出来就会被读成别的意思。
 * null = 这一项没采到，界面必须原样显示"未采集"。
 */
export interface AnalyticsNumbers {
  /** published_projects.views：页面打开次数（含作者与爬虫，历史上就是这个口径） */
  views: number;
  opensToday: number;
  visitors: number;
  visitorsToday: number;
  likes: number;
  remixes: number;
  /** 作者级：关注这个人，不是这一版作品 */
  followers: number;
  /** 平均"最远到达比例"，以及它是几个访客聚合出来的；一个都没有时 null */
  completion: { avgPct: number; over: number } | null;
  /** 累计可见时长；一条心跳都没有时 null，不拿 views 换算 */
  playTimeMs: number | null;
  /** 被上限截断过的心跳条数 */
  cappedReports: number;
  /** 看过的人只有作者自己：这串数字不能当"有人在看"的证据 */
  selfOnly: boolean;
}

export interface PublicationAnalyticsRow {
  publicationId: string;
  projectId: string;
  projectName: string;
  path: string;
  version: number;
  visibility: Visibility;
  publishedAt: Date;
  analytics: AnalyticsNumbers;
}

interface VisitRollup {
  visitors: number;
  visitorsToday: number;
  opensToday: number;
  playTimeMs: number;
  completionAvgPct: number | null;
  completionOver: number;
  cappedReports: number;
  selfOnly: boolean;
}

function int(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 一次分组查询服务整份列表，不按作品循环打库 */
async function rollupVisits(publicationIds: string[], ownerId: string): Promise<Map<string, VisitRollup>> {
  if (!publicationIds.length) return new Map();
  const today = utcDay(new Date());
  const db = getDb();
  const rows = await db
    .select({
      publicationId: publicationVisits.publicationId,
      visitors: sql<string>`count(distinct ${publicationVisits.visitorKey})`,
      visitorsToday: sql<string>`count(distinct case when ${publicationVisits.day} = ${today} then ${publicationVisits.visitorKey} end)`,
      opensToday: sql<string>`coalesce(sum(case when ${publicationVisits.day} = ${today} then ${publicationVisits.opens} else 0 end), 0)`,
      playTimeMs: sql<string>`coalesce(sum(${publicationVisits.visibleMs}), 0)`,
      completionAvgPct: sql<string | null>`avg(${publicationVisits.completionPct}) filter (where ${publicationVisits.completionPct} > 0)`,
      completionOver: sql<string>`count(${publicationVisits.completionPct}) filter (where ${publicationVisits.completionPct} > 0)`,
      cappedReports: sql<string>`coalesce(sum(${publicationVisits.cappedReports}), 0)`,
      // 有行、且每一行都是作者本人：这条作品的"数据"目前只证明作者自己打开过
      selfOnly: sql<boolean>`bool_and(${publicationVisits.userId} is not null and ${publicationVisits.userId} = ${ownerId})`,
    })
    .from(publicationVisits)
    .where(inArray(publicationVisits.publicationId, publicationIds))
    .groupBy(publicationVisits.publicationId);
  return new Map(
    rows.map((row) => [
      row.publicationId,
      {
        visitors: int(row.visitors),
        visitorsToday: int(row.visitorsToday),
        opensToday: int(row.opensToday),
        playTimeMs: int(row.playTimeMs),
        completionAvgPct: row.completionAvgPct === null ? null : Math.round(int(row.completionAvgPct)),
        completionOver: int(row.completionOver),
        cappedReports: int(row.cappedReports),
        selfOnly: row.selfOnly,
      },
    ]),
  );
}

async function countGrouped(
  table: typeof likes | typeof remixes,
  column: typeof likes.projectId | typeof remixes.sourceProjectId,
  ids: string[],
): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const db = getDb();
  const rows = await db
    .select({ key: column, n: sql<string>`count(*)` })
    .from(table)
    .where(inArray(column, ids))
    .groupBy(column);
  return new Map(rows.map((row) => [row.key, int(row.n)]));
}

/** 把"每类各一条分组查询"的结果拼成作品列表；ownerId 用来判定 selfOnly */
function assemble(
  publications: {
    publicationId: string;
    projectId: string;
    projectName: string;
    path: string;
    version: number;
    visibility: Visibility;
    publishedAt: Date;
    views: number;
  }[],
  visits: Map<string, VisitRollup>,
  likeCounts: Map<string, number>,
  remixCounts: Map<string, number>,
  followers: number,
): PublicationAnalyticsRow[] {
  return publications.map((publication) => {
    const rollup = visits.get(publication.publicationId);
    return {
      ...publication,
      analytics: {
        views: publication.views,
        opensToday: rollup?.opensToday ?? 0,
        visitors: rollup?.visitors ?? 0,
        visitorsToday: rollup?.visitorsToday ?? 0,
        likes: likeCounts.get(publication.projectId) ?? 0,
        remixes: remixCounts.get(publication.projectId) ?? 0,
        followers,
        completion:
          rollup && rollup.completionAvgPct !== null
            ? { avgPct: rollup.completionAvgPct, over: rollup.completionOver }
            : null,
        // 有行就报数（哪怕加出来是 0 秒）：只在一条心跳都没有时才 null，
        // 否则"访客来了但没攒够时长"会被显示成"没采到"，那是另一种谎。
        playTimeMs: rollup ? rollup.playTimeMs : null,
        cappedReports: rollup?.cappedReports ?? 0,
        selfOnly: rollup?.selfOnly ?? false,
      },
    };
  });
}

/**
 * 作者名下的发布版本 + 六个数。所有权在 where 里，不在调用方：
 * 传别人的 publicationId 只会拿到空列表，所以"存在但看不到"这种含糊状态没有藏身处。
 */
async function analyticsFor(ownerId: string, onlyPublicationId?: string): Promise<PublicationAnalyticsRow[]> {
  const db = getDb();
  const publications = await db
    .select({
      publicationId: publishedProjects.id,
      projectId: projects.id,
      projectName: projects.name,
      path: publishedProjects.path,
      version: publishedProjects.version,
      visibility: publishedProjects.visibility,
      publishedAt: publishedProjects.publishedAt,
      views: publishedProjects.views,
    })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(
      and(
        eq(projects.ownerId, ownerId),
        isNull(projects.deletedAt),
        ...(onlyPublicationId ? [eq(publishedProjects.id, onlyPublicationId)] : []),
      ),
    )
    .orderBy(sql`${publishedProjects.publishedAt} desc`);
  if (!publications.length) return [];
  const ids = publications.map((row) => row.publicationId);
  const projectIds = publications.map((row) => row.projectId);
  const [visitRows, likeCounts, remixCounts, [followerRow]] = await Promise.all([
    rollupVisits(ids, ownerId),
    countGrouped(likes, likes.projectId, projectIds),
    countGrouped(remixes, remixes.sourceProjectId, projectIds),
    db.select({ n: sql<string>`count(*)` }).from(follows).where(eq(follows.followeeId, ownerId)),
  ]);
  return assemble(publications, visitRows, likeCounts, remixCounts, int(followerRow?.n));
}

/** 创作者侧：我所有发布过的版本，各带六个数 */
export function creatorAnalytics(ownerId: string): Promise<PublicationAnalyticsRow[]> {
  return analyticsFor(ownerId);
}

/** 单个作品的分析；不是自己的（或根本不存在）都返回 null */
export async function publicationAnalytics(
  ownerId: string,
  publicationId: string,
): Promise<PublicationAnalyticsRow | null> {
  const rows = await analyticsFor(ownerId, publicationId);
  return rows[0] ?? null;
}
