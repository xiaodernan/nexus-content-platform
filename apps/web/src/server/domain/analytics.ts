import { isUuid } from './ids';
import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { MAX_FLUSH_MS, clampReportedMs, utcDay, validVisitorKey } from '@/lib/visit-meter';
import { getDb } from '../db/client';
import { follows, gameCompletions, likes, projects, publicationVisits, publishedProjects, remixes } from '../db/schema';
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
  /** §168 第三片：疑似爬虫/自动化（判定在 classifyVisit；缺省当真人——老调用方不带这一栏） */
  suspectedBot?: boolean;
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
  const suspectedBot = input.suspectedBot === true;
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
      suspectedBot,
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
        // §168 第三片：判定是**粘**的——同一个 key 当天有过一次像爬虫的现场，整行按爬虫读。
        // 反过来（先爬后人）不洗白：拿 UA 名单当开关刷回真人的数，正是这一栏要挡的事
        suspectedBot: sql`${publicationVisits.suspectedBot} or ${suspectedBot}`,
        updatedAt: sql`now()`,
      },
    });
  return 'recorded';
}

export interface GameCompletionInput {
  publicationId: string;
  /** 与访客现场**同一把**匿名 key ⇒ "谁通关了"与"谁看过"指的是同一个人 */
  visitorKey: unknown;
  /** 登录访客，匿名传 null */
  userId: string | null;
  /** 疑似爬虫/自动化（判定在 classifyVisit；缺省当真人） */
  suspectedBot?: boolean;
  at?: Date;
}

/**
 * §168：记一次"通关了"（玩家玩到了结局）。
 *
 * 三条边界：
 * 1. **一个访客在一个发布版本上只记一次**（唯一索引）⇒ 重复上报返回 `duplicate`，
 *    不加一 ⇒ 于是计数是"**通关过多少人**"，不是"通关了几次"。
 * 2. **爬虫照收但另计**：可疑的行照样入库（"被爬过"要有迹可查），
 *    但聚合时不算进真人那格。
 * 3. key 不合法**连一行都不写**（与访客现场同一条纪律）。
 */
export async function recordGameCompletion(
  input: GameCompletionInput,
): Promise<'recorded' | 'duplicate' | 'rejected'> {
  const visitorKey = validVisitorKey(input.visitorKey);
  if (!visitorKey) return 'rejected';
  const db = getDb();
  const inserted = await db
    .insert(gameCompletions)
    .values({
      publicationId: input.publicationId,
      visitorKey,
      userId: input.userId,
      suspectedBot: input.suspectedBot === true,
      completedAt: input.at ?? new Date(),
    })
    .onConflictDoNothing({ target: [gameCompletions.publicationId, gameCompletions.visitorKey] })
    .returning({ id: gameCompletions.id });
  return inserted.length ? 'recorded' : 'duplicate';
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
  /** §168 第三片：疑似爬虫/自动化的打开次数——另计，不进上面任何一格 */
  botOpens: number;
  /** 疑似爬虫/自动化的访客数（按 key 去重） */
  botVisitors: number;
  /**
   * §168：**通关过多少人**（真人，按 key 去重）。
   *
   * 与上面的 `completion`（滚动比例）是**两个口径**：那个说"这一页滚到哪儿"，
   * 这个说"玩到了结局"⇒ 混着说就谁也不说了（§159）。
   * 一个都没有时是 0（"还没有人通关"是确定的事实，不是"没采到"）——
   * 因为它是一个事件计数：没人通关就是 0，不需要 null。
   */
  completedVisitors: number;
  /** 疑似爬虫/自动化的通关数——另计，不进上面那一格 */
  botCompletions: number;
  /**
   * 通关的人**只有作者自己**。
   *
   * 与 `selfOnly`（看过的人只有作者自己）同一条纪律：这一格数的是"多少人玩通了"，
   * 而如果那些"人"就是作者自己，这串数就不能当"有人玩得下去"的证据
   * ⇒ 页面上要像"只有你自己看过"那样明写出来（§159）。
   */
  selfCompleted: boolean;
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
  selfOnly: boolean | null;
  botOpens: number;
  botVisitors: number;
  humanRows: number;
}

/** 通关那一格：真人通关过多少人 + 爬虫通关多少次（两个数分开记） */
interface CompletionRollup {
  completedVisitors: number;
  botCompletions: number;
  selfCompleted: boolean | null;
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
      // §168 第三片：真人的数逐格 filter（where not suspected_bot），爬虫的另起两格——
      // 混在一起数，"访客 1 人"就可能是刚爬过去的那一下
      visitors: sql<string>`count(distinct ${publicationVisits.visitorKey}) filter (where not ${publicationVisits.suspectedBot})`,
      visitorsToday: sql<string>`count(distinct case when ${publicationVisits.day} = ${today} and not ${publicationVisits.suspectedBot} then ${publicationVisits.visitorKey} end)`,
      opensToday: sql<string>`coalesce(sum(case when ${publicationVisits.day} = ${today} and not ${publicationVisits.suspectedBot} then ${publicationVisits.opens} else 0 end), 0)`,
      playTimeMs: sql<string>`coalesce(sum(${publicationVisits.visibleMs}) filter (where not ${publicationVisits.suspectedBot}), 0)`,
      completionAvgPct: sql<string | null>`avg(${publicationVisits.completionPct}) filter (where not ${publicationVisits.suspectedBot} and ${publicationVisits.completionPct} > 0)`,
      completionOver: sql<string>`count(${publicationVisits.completionPct}) filter (where not ${publicationVisits.suspectedBot} and ${publicationVisits.completionPct} > 0)`,
      cappedReports: sql<string>`coalesce(sum(${publicationVisits.cappedReports}) filter (where not ${publicationVisits.suspectedBot}), 0)`,
      // 有行、且每一行都是作者本人：这条作品的"数据"目前只证明作者自己打开过。
      // 爬虫行不参与——"只有你自己看过"说的是人，机器人不是"你自己"也不是"别人"
      selfOnly: sql<boolean | null>`bool_and(${publicationVisits.userId} is not null and ${publicationVisits.userId} = ${ownerId}) filter (where not ${publicationVisits.suspectedBot})`,
      botOpens: sql<string>`coalesce(sum(${publicationVisits.opens}) filter (where ${publicationVisits.suspectedBot}), 0)`,
      botVisitors: sql<string>`count(distinct ${publicationVisits.visitorKey}) filter (where ${publicationVisits.suspectedBot})`,
      humanRows: sql<string>`count(*) filter (where not ${publicationVisits.suspectedBot})`,
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
        // filter 掉爬虫后一行都没有时 bool_and 是 NULL——那不是"全是作者"，是"一个人（真人）都没有"
        selfOnly: row.selfOnly,
        botOpens: int(row.botOpens),
        botVisitors: int(row.botVisitors),
        humanRows: int(row.humanRows),
      },
    ]),
  );
}

/** 通关那一格的聚合：真人按 key 去重，爬虫另计（与访客现场同一条纪律） */
async function rollupCompletions(
  publicationIds: string[],
  ownerId: string,
): Promise<Map<string, CompletionRollup>> {
  if (!publicationIds.length) return new Map();
  const db = getDb();
  const rows = await db
    .select({
      publicationId: gameCompletions.publicationId,
      completedVisitors: sql<string>`count(distinct ${gameCompletions.visitorKey}) filter (where not ${gameCompletions.suspectedBot})`,
      botCompletions: sql<string>`count(distinct ${gameCompletions.visitorKey}) filter (where ${gameCompletions.suspectedBot})`,
      // 通关的人只有作者自己 ⇒ 这串数不能当"有人玩得下去"的证据
      // （与访客现场的 selfOnly 同一句纪律，判定也是同一种）
      selfCompleted: sql<boolean | null>`bool_and(${gameCompletions.userId} is not null and ${gameCompletions.userId} = ${ownerId}) filter (where not ${gameCompletions.suspectedBot})`,
    })
    .from(gameCompletions)
    .where(inArray(gameCompletions.publicationId, publicationIds))
    .groupBy(gameCompletions.publicationId);
  return new Map(
    rows.map((row) => [
      row.publicationId,
      {
        completedVisitors: int(row.completedVisitors),
        botCompletions: int(row.botCompletions),
        selfCompleted: row.selfCompleted,
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
  completions: Map<string, CompletionRollup>,
  likeCounts: Map<string, number>,
  remixCounts: Map<string, number>,
  followers: number,
): PublicationAnalyticsRow[] {
  return publications.map((publication) => {
    const rollup = visits.get(publication.publicationId);
    const done = completions.get(publication.publicationId);
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
        // 有**真人**的行就报数（哪怕加出来是 0 秒）：只在一条真人心跳都没有时才 null，
        // 否则"访客来了但没攒够时长"会被显示成"没采到"，那是另一种谎。
        // 只有爬虫来过 = 没采到真人时长 = null（爬虫的时长另计，不拿来顶）
        playTimeMs: rollup && rollup.humanRows > 0 ? rollup.playTimeMs : null,
        cappedReports: rollup?.cappedReports ?? 0,
        // filter 掉爬虫后没有真人行时 selfOnly 是 NULL：那不是"只有你自己"，是"没有真人来过"
        selfOnly: rollup?.selfOnly ?? false,
        botOpens: rollup?.botOpens ?? 0,
        botVisitors: rollup?.botVisitors ?? 0,
        completedVisitors: done?.completedVisitors ?? 0,
        botCompletions: done?.botCompletions ?? 0,
        // 没有真人通关过时是 NULL（不是"全是作者"）⇒ 不该出"只有你自己通关过"那句
        selfCompleted: done?.selfCompleted ?? false,
      },
    };
  });
}

/**
 * 作者名下的发布版本 + 六个数。所有权在 where 里，不在调用方：
 * 传别人的 publicationId 只会拿到空列表，所以"存在但看不到"这种含糊状态没有藏身处。
 */
async function analyticsFor(ownerId: string, onlyPublicationId?: string): Promise<PublicationAnalyticsRow[]> {
  // 与 buildCreatorFact 同一道门禁：非法 UUID 直接是空结果，不是 500（"读不到"与"不存在"同答）
  if (onlyPublicationId !== undefined && !isUuid(onlyPublicationId)) return [];
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
  const [visitRows, completionRows, likeCounts, remixCounts, [followerRow]] = await Promise.all([
    rollupVisits(ids, ownerId),
    rollupCompletions(ids, ownerId),
    countGrouped(likes, likes.projectId, projectIds),
    countGrouped(remixes, remixes.sourceProjectId, projectIds),
    db.select({ n: sql<string>`count(*)` }).from(follows).where(eq(follows.followeeId, ownerId)),
  ]);
  return assemble(publications, visitRows, completionRows, likeCounts, remixCounts, int(followerRow?.n));
}

/** 创作者侧：我所有发布过的版本，各带六个数 */
export function creatorAnalytics(ownerId: string): Promise<PublicationAnalyticsRow[]> {
  return analyticsFor(ownerId);
}

/**
 * §168：**导出**这些数字（CSV）。
 *
 * 为什么放在**领域层**而不是路由里拼：导出与页面读的是**同一个** `creatorAnalytics`
 * ⇒ 两处的数字**不可能漂**（页面写"3 个访客"而导出写"4"这种不一致不会发生，§159）。
 *
 * 三条纪律：
 * 1. **没采到就是空**，不是 0（`completion` 与 `playTimeMs` 为 null 时写空单元格）
 *    ⇒ "未采集"与"采到 0"在导出里也分得开（页面那一侧已经这么写了）。
 * 2. **转义按 RFC 4180**：含逗号 / 引号 / 换行的值加引号，里面的引号写成两个
 *    ⇒ 一个带逗号的项目名不会把整张表挪位。
 * 3. **列名与页面那一侧说的是同一件事**（这里的中文表头是给表格软件看的那一份）。
 */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 导出的表头：列名 + 取值（取值那一份只在这里写 ⇒ 页面与导出不可能各写一套） */
const EXPORT_COLUMNS: readonly { label: string; pick: (row: PublicationAnalyticsRow) => string }[] = [
  { label: '路径', pick: (row) => row.path },
  { label: '项目', pick: (row) => row.projectName },
  { label: '版本', pick: (row) => String(row.version) },
  { label: '可见性', pick: (row) => row.visibility },
  { label: '发布时间', pick: (row) => row.publishedAt.toISOString() },
  { label: '打开次数', pick: (row) => String(row.analytics.views) },
  { label: '今日打开', pick: (row) => String(row.analytics.opensToday) },
  { label: '访客', pick: (row) => String(row.analytics.visitors) },
  { label: '今日访客', pick: (row) => String(row.analytics.visitorsToday) },
  { label: '点赞', pick: (row) => String(row.analytics.likes) },
  { label: '改编', pick: (row) => String(row.analytics.remixes) },
  { label: '关注作者', pick: (row) => String(row.analytics.followers) },
  { label: '平均完成度%', pick: (row) => (row.analytics.completion ? String(row.analytics.completion.avgPct) : '') },
  { label: '达标的访客', pick: (row) => (row.analytics.completion ? String(row.analytics.completion.over) : '') },
  { label: '通关过人数', pick: (row) => String(row.analytics.completedVisitors) },
  { label: '疑似爬虫通关', pick: (row) => String(row.analytics.botCompletions) },
  { label: '累计可见时长毫秒', pick: (row) => (row.analytics.playTimeMs === null ? '' : String(row.analytics.playTimeMs)) },
  { label: '被截断的心跳', pick: (row) => String(row.analytics.cappedReports) },
  { label: '只有自己看过', pick: (row) => (row.analytics.selfOnly ? '是' : '否') },
  { label: '只有自己通关', pick: (row) => (row.analytics.selfCompleted ? '是' : '否') },
  { label: '疑似爬虫打开', pick: (row) => String(row.analytics.botOpens) },
  { label: '疑似爬虫访客', pick: (row) => String(row.analytics.botVisitors) },
];

/**
 * 把创作者侧的那一份数字导成 CSV。
 *
 * 空行不是数据行：没有任何发布版本时只有表头那一行（不是"一行 0"）。
 */
export function analyticsCsv(rows: readonly PublicationAnalyticsRow[]): string {
  const header = EXPORT_COLUMNS.map((column) => csvCell(column.label)).join(',');
  const body = rows.map((row) => EXPORT_COLUMNS.map((column) => csvCell(column.pick(row))).join(','));
  return [header, ...body].join('\r\n') + '\r\n';
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
  /** 这一天累计的打开次数（真人那部分；爬虫的另计在 totals.botOpens，不画进曲线） */
  opens: number;
  /** 这一天来过几个不同的真人访客 key（同一人同一天只算一个；爬虫不数） */
  visitors: number;
  /** 这一天累计的可见时长；这一天一条真人心跳都没有时是 null */
  playTimeMs: number | null;
  /** 这一天各真人访客"最远到达比例"的平均值；这一天没人上报过完成度时 null */
  completionPct: number | null;
}

/** 窗口内的汇总。**与六个数的累计口径不是一回事**，界面上必须分开说 */
export interface VisitTotals {
  opens: number;
  /** 窗口内出现过的人（跨天去重），不是把每天的人数相加 */
  visitors: number;
  /** 窗口内累计可见时长；整个窗口一条真人心跳都没有时 null */
  playTimeMs: number | null;
  /** 窗口内有完成度上报的那些行的平均值 */
  completionPct: number | null;
  /** 上面那个平均是几行算出来的 */
  completionOver: number;
  /** 窗口内有访客活动的天数（那天至少有一条真人心跳） */
  activeDays: number;
  /** §168 第三片：窗口内疑似爬虫/自动化的打开次数——不进上面任何一格，也不画进曲线 */
  botOpens: number;
}

interface VisitDayRow {
  day: string;
  visitorKey: string;
  opens: number;
  visibleMs: number;
  completionPct: number;
  suspectedBot: boolean;
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
      suspectedBot: publicationVisits.suspectedBot,
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
    suspectedBot: row.suspectedBot,
  }));
}

/** 一行都没采到时每一项都是 0 / null：`playTimeMs` 与 `completionPct` 是 null，不是 0 */
function emptyTotals(): VisitTotals {
  return {
    opens: 0,
    visitors: 0,
    playTimeMs: null,
    completionPct: null,
    completionOver: 0,
    activeDays: 0,
    botOpens: 0,
  };
}

/**
 * §168 第三片：窗口的数按真人/爬虫分开算——曲线与汇总只数真人，
 * 爬虫的打开次数单独给一格（totals.botOpens），不混进"有没有人在来"这个问题的答案里。
 */
function totalsOf(rows: readonly VisitDayRow[]): VisitTotals {
  const humans = rows.filter((row) => !row.suspectedBot);
  const botOpens = rows.reduce((sum, row) => (row.suspectedBot ? sum + row.opens : sum), 0);
  if (!humans.length) return { ...emptyTotals(), botOpens };
  // 跨天去重必须在窗口这一层做：交给 SQL 的 count(*) 会把同一个人数成三天
  const visitors = new Set(humans.map((row) => row.visitorKey)).size;
  const activeDays = new Set(humans.map((row) => row.day)).size;
  const completed = humans.filter((row) => row.completionPct > 0);
  return {
    opens: humans.reduce((sum, row) => sum + row.opens, 0),
    visitors,
    // 有行就报数（哪怕加出来是 0 秒）；一条真人心跳都没有时才 null
    playTimeMs: humans.reduce((sum, row) => sum + row.visibleMs, 0),
    completionPct: completed.length
      ? Math.round(completed.reduce((sum, row) => sum + row.completionPct, 0) / completed.length)
      : null,
    completionOver: completed.length,
    activeDays,
    botOpens,
  };
}

/** 把窗口里缺的那些天补成 0，得到日期密集的一条曲线（只数真人，爬虫不画） */
function dailySeries(rows: readonly VisitDayRow[], window: DayWindow): DailyPoint[] {
  const byDay = new Map<string, VisitDayRow[]>();
  for (const row of rows) {
    if (row.suspectedBot) continue; // 曲线回答"有没有人在来"，爬虫不是"人来"
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
