import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
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

/**
 * §168 的第二片：**按天曲线**与**跨作品总览**。
 *
 * 上面那一份是"每个发布版本 × 六个累计数"，回答"到目前为止一共多少"。
 * 这一片回答的是另一个问题："最近这段时间，到底有没有人在来"——
 * 而累计数对这个问题是瞎的：昨天刚爆过的作品与半年前爆过、之后再没人来的作品，
 * 累计数看起来可以一模一样。
 *
 * 四条纪律：
 * 1. **哪一天是"今天"由调用方说**（`utcDay(now)`），这一层不读时钟——
 *    读时钟的函数没法测"窗口边界"这种情形。
 * 2. **访客在窗口内去重，不是把每天的人数相加**：库里按 (人 × 天) 分行是为了画曲线，
 *    同一个人连着来三天，在"窗口内访客"里仍然是一个人。
 * 3. **缺的那天是 0，不是跳过**：曲线跳掉没有数据的日子，会把"停更了一周"画成连续有人来。
 *    但"这一天一条心跳都没有"的时长仍然是 null（与六个数里的 `playTimeMs` 同一口径）——
 *    0 秒是"来过但没攒够时长"，两者不能混。
 * 4. **窗口外的行不进曲线**：`day` 是 UTC 日字符串，两端都闭；只按日期过滤，不碰 `created_at`。
 */

/** 一个闭区间窗口，两端都是 `YYYY-MM-DD`（UTC 日） */
export interface DayWindow {
  from: string;
  to: string;
}

/** 曲线上的一个点。日期密集、升序——`days` 的长度就是窗口的天数 */
export interface DailyPoint {
  day: string;
  /** 这一天累计的打开次数（含作者自己与爬虫，与六个数里那个 `views` 同口径） */
  opens: number;
  /** 这一天来过几个不同的访客 key（同一人同一天只算一个） */
  visitors: number;
  /** 这一天累计的可见时长；这一天一条心跳都没有时是 null */
  playTimeMs: number | null;
  /** 这一天各访客"最远到达比例"的平均值；这一天没人上报过完成度时 null */
  completionPct: number | null;
}

/** 窗口内的汇总。**与六个数的累计口径不是一回事**，界面上必须分开说 */
export interface VisitTotals {
  opens: number;
  /** 窗口内出现过的人（跨天去重），不是把每天的人数相加 */
  visitors: number;
  /** 窗口内累计可见时长；整个窗口一条心跳都没有时 null */
  playTimeMs: number | null;
  /** 窗口内有完成度上报的那些行的平均值 */
  completionPct: number | null;
  /** 上面那个平均是几行算出来的 */
  completionOver: number;
  /** 窗口内有访客活动的天数（那天至少有一行心跳） */
  activeDays: number;
}

interface VisitDayRow {
  day: string;
  visitorKey: string;
  opens: number;
  visibleMs: number;
  completionPct: number;
}

/** `YYYY-MM-DD` → UTC 当日零点的毫秒。库里 `day` 列就是这种字符串，两边同一套换算 */
function dayToMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function msToDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * 从"今天"往前数 `days` 天的闭区间。`days` 夹在 1..365：
 * 一页图不该把库里几年的行一次拉出来，而"0 天"这种窗口画出来是个空壳。
 */
export function dayWindow(today: string, days: number): DayWindow {
  const span = Math.min(Math.max(Math.floor(days), 1), 365);
  return { from: msToDay(dayToMs(today) - (span - 1) * 86_400_000), to: today };
}

/** 窗口内的访客行。只取算这四样要用的列——"是不是作者自己看的"是累计那一片的事 */
async function visitDayRows(publicationIds: string[], window: DayWindow): Promise<VisitDayRow[]> {
  if (!publicationIds.length) return [];
  const db = getDb();
  const rows = await db
    .select({
      day: publicationVisits.day,
      visitorKey: publicationVisits.visitorKey,
      opens: publicationVisits.opens,
      visibleMs: publicationVisits.visibleMs,
      completionPct: publicationVisits.completionPct,
    })
    .from(publicationVisits)
    .where(
      and(
        inArray(publicationVisits.publicationId, publicationIds),
        gte(publicationVisits.day, window.from),
        lte(publicationVisits.day, window.to),
      ),
    );
  return rows.map((row) => ({
    day: row.day,
    visitorKey: row.visitorKey,
    opens: int(row.opens),
    visibleMs: int(row.visibleMs),
    completionPct: int(row.completionPct),
  }));
}

/** 一行都没采到时每一项都是 0 / null：`playTimeMs` 与 `completionPct` 是 null，不是 0 */
function emptyTotals(): VisitTotals {
  return { opens: 0, visitors: 0, playTimeMs: null, completionPct: null, completionOver: 0, activeDays: 0 };
}

function totalsOf(rows: readonly VisitDayRow[]): VisitTotals {
  if (!rows.length) return emptyTotals();
  // 跨天去重必须在窗口这一层做：交给 SQL 的 count(*) 会把同一个人数成三天
  const visitors = new Set(rows.map((row) => row.visitorKey)).size;
  const activeDays = new Set(rows.map((row) => row.day)).size;
  const completed = rows.filter((row) => row.completionPct > 0);
  return {
    opens: rows.reduce((sum, row) => sum + row.opens, 0),
    visitors,
    // 有行就报数（哪怕加出来是 0 秒）；一条心跳都没有时才 null
    playTimeMs: rows.reduce((sum, row) => sum + row.visibleMs, 0),
    completionPct: completed.length
      ? Math.round(completed.reduce((sum, row) => sum + row.completionPct, 0) / completed.length)
      : null,
    completionOver: completed.length,
    activeDays,
  };
}

/** 把窗口里缺的那些天补成 0，得到日期密集的一条曲线 */
function dailySeries(rows: readonly VisitDayRow[], window: DayWindow): DailyPoint[] {
  const byDay = new Map<string, VisitDayRow[]>();
  for (const row of rows) {
    const bucket = byDay.get(row.day);
    if (bucket) bucket.push(row);
    else byDay.set(row.day, [row]);
  }
  const points: DailyPoint[] = [];
  const last = dayToMs(window.to);
  for (let at = dayToMs(window.from); at <= last; at += 86_400_000) {
    const day = msToDay(at);
    const bucket = byDay.get(day) ?? [];
    const completed = bucket.filter((row) => row.completionPct > 0);
    points.push({
      day,
      opens: bucket.reduce((sum, row) => sum + row.opens, 0),
      visitors: new Set(bucket.map((row) => row.visitorKey)).size,
      playTimeMs: bucket.length ? bucket.reduce((sum, row) => sum + row.visibleMs, 0) : null,
      completionPct: completed.length
        ? Math.round(completed.reduce((sum, row) => sum + row.completionPct, 0) / completed.length)
        : null,
    });
  }
  return points;
}

/**
 * 窗口末尾连续有活动的天数。0 = 最后一天一个人都没来。
 * 判"有活动"看的是那天有没有心跳行，不是看打开次数——只看打开的话，
 * 一个反复刷新但每次都瞬间关掉的人会被算成"没人来过"。
 */
function streakEndingAt(days: readonly DailyPoint[]): number {
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const point = days[i]!;
    if (point.visitors === 0 && point.opens === 0) break;
    streak += 1;
  }
  return streak;
}

/** 一个作品在窗口里的曲线与窗口汇总 */
export interface PublicationTrend {
  publicationId: string;
  window: DayWindow;
  days: DailyPoint[];
  totals: VisitTotals;
  /** 窗口末尾连续有活动的天数 */
  streakDays: number;
}

/**
 * 单个作品的按天曲线。所有权判定与 `publicationAnalytics` 共用 `analyticsFor`：
 * 不是自己的（或根本不存在）都返回 null，两种情形在调用方那里就是同一种"读不到"。
 */
export async function publicationTrend(
  ownerId: string,
  publicationId: string,
  window: DayWindow,
): Promise<PublicationTrend | null> {
  const owned = await analyticsFor(ownerId, publicationId);
  if (!owned.length) return null;
  const rows = await visitDayRows([publicationId], window);
  const days = dailySeries(rows, window);
  return { publicationId, window, days, totals: totalsOf(rows), streakDays: streakEndingAt(days) };
}

/** 跨作品总览：窗口内每天的曲线 + 窗口内的汇总 */
export interface CreatorOverview {
  window: DayWindow;
  /** 名下的发布版本数（与列表同一套归属与软删谓词） */
  publications: number;
  totals: VisitTotals;
  streakDays: number;
  /** 日期密集、升序；长度 = 窗口天数 */
  days: DailyPoint[];
}

/**
 * 创作者总览。**一次查完所有作品**（与 `analyticsFor` 同一条纪律：不按作品循环打库），
 * 因此曲线是"名下所有作品加在一起"的一条——要按作品分开看，走 `publicationTrend`。
 */
export async function creatorOverview(ownerId: string, window: DayWindow): Promise<CreatorOverview> {
  const db = getDb();
  const publications = await db
    .select({ publicationId: publishedProjects.id })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(and(eq(projects.ownerId, ownerId), isNull(projects.deletedAt)));
  const rows = await visitDayRows(
    publications.map((row) => row.publicationId),
    window,
  );
  const days = dailySeries(rows, window);
  return {
    window,
    publications: publications.length,
    totals: totalsOf(rows),
    streakDays: streakEndingAt(days),
    days,
  };
}
