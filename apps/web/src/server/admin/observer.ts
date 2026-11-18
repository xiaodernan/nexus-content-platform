/**
 * 观察站 · 数据层（2026-11-17 / §ADMIN-13）
 *
 * 为什么单独成文：`/admin/observe` 是一个**只读**栅（口令 123，任何人都能进，口令公开）。
 * 它承诺的每一句话都必须来自实库——所以读数集中在这一处，页面只渲染不计算。
 *
 * 纪律：
 * - 只 SELECT，没有任何 INSERT/UPDATE/DELETE。
 * - 数字缺失时显示的是「0 / 还没有」，不是编造的占位。
 * - 一条都不碰 demo 数据：所有口径都是「真实行 × 现在」。
 * - `suspectedBot = true` 的 publication_visits 不进趋势与完成度（真机器人噪声不冒充人效）。
 */
import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';

export interface ObserverDailyPoint {
  day: string;
  opens: number;
}

export interface ObserverTopWork {
  path: string;
  name: string;
  views: number;
  likes: number;
}

export interface ObserverMetrics {
  usersTotal: number;
  usersGuests: number;
  usersNew7d: number;
  usersNew30d: number;
  projectsTotal: number;
  publishesPublicApproved: number;
  publishesTotal: number;
  viewsTotal: number;
  likesTotal: number;
  commentsTotal: number;
  savesTotal: number;
  followsTotal: number;
  opens7d: number;
  opens30d: number;
  visibleMs7d: number;
  completionPctAvg30d: number | null;
  completionsGame: number;
  completionsWork: number;
  suspectedBots7d: number;
  tasks: {
    queued: number;
    running: number;
    awaitingApproval: number;
    succeeded: number;
    failed: number;
  };
  plans: { plan: string; count: number }[];
  topWorks: ObserverTopWork[];
  daily: ObserverDailyPoint[];
}

const n = (rows: unknown[]): { n: number } => (rows as unknown as { n: number }[])[0]!;
const f = (rows: unknown[]): { pct: number | null; ms: number | null } =>
  (rows as unknown as { pct: number | null; ms: number | null }[])[0]!;

export async function readObserverMetrics(): Promise<ObserverMetrics> {
  const db = getDb();

  const usersTotal = n(await db.execute(sql`select count(*)::int as n from users where deleted_at is null and guest = false`)).n;
  const usersGuests = n(await db.execute(sql`select count(*)::int as n from users where deleted_at is null and guest = true`)).n;
  const usersNew7d = n(await db.execute(sql`select count(*)::int as n from users where deleted_at is null and created_at >= now() - interval '7 days'`)).n;
  const usersNew30d = n(await db.execute(sql`select count(*)::int as n from users where deleted_at is null and created_at >= now() - interval '30 days'`)).n;
  const projectsTotal = n(await db.execute(sql`select count(*)::int as n from projects where deleted_at is null`)).n;
  const publishesTotal = n(await db.execute(sql`select count(*)::int as n from published_projects`)).n;
  const publishesPublicApproved = n(await db.execute(sql`select count(*)::int as n from published_projects where visibility = 'public' and moderation = 'approved'`)).n;
  const viewsTotal = n(await db.execute(sql`select coalesce(sum(views), 0)::bigint as n from published_projects`)).n;
  const likesTotal = n(await db.execute(sql`select count(*)::int as n from likes`)).n;
  const commentsTotal = n(await db.execute(sql`select count(*)::int as n from comments`)).n;
  const savesTotal = n(await db.execute(sql`select count(*)::int as n from saves`)).n;
  const followsTotal = n(await db.execute(sql`select count(*)::int as n from follows`)).n;

  const opens7d = n(await db.execute(sql`select coalesce(sum(opens), 0)::int as n from publication_visits where day >= (now() - interval '6 days')::date and suspected_bot = false`)).n;
  const opens30d = n(await db.execute(sql`select coalesce(sum(opens), 0)::int as n from publication_visits where day >= (now() - interval '29 days')::date and suspected_bot = false`)).n;
  const visibleAgg = f(await db.execute(sql`select coalesce(avg(completion_pct), null)::float as pct, sum(visible_ms)::bigint as ms from publication_visits where day >= (now() - interval '29 days')::date and suspected_bot = false`));
  const visibleMs7d = n(await db.execute(sql`select coalesce(sum(visible_ms), 0)::bigint as n from publication_visits where day >= (now() - interval '6 days')::date and suspected_bot = false`)).n;
  const suspectedBots7d = n(await db.execute(sql`select coalesce(sum(opens), 0)::int as n from publication_visits where day >= (now() - interval '6 days')::date and suspected_bot = true`)).n;

  const completionsGame = n(await db.execute(sql`select count(*)::int as n from game_completions where suspected_bot = false`)).n;
  const completionsWork = n(await db.execute(sql`select count(*)::int as n from work_completions where suspected_bot = false`)).n;

  // 任务按状态聚合；queued = 真的在排队（不是 awaiting_approval）
  const taskRows = (await db.execute(sql`select status, count(*)::int as n from agent_tasks group by status`)) as unknown as { status: string; n: number }[];
  const tasks = { queued: 0, running: 0, awaitingApproval: 0, succeeded: 0, failed: 0 };
  for (const row of taskRows) {
    if (row.status === 'queued' || row.status === 'planning') tasks.queued += row.n;
    else if (row.status === 'running') tasks.running += row.n;
    else if (row.status === 'awaiting_approval') tasks.awaitingApproval += row.n;
    else if (row.status === 'succeeded') tasks.succeeded += row.n;
    else if (row.status === 'failed') tasks.failed += row.n;
  }

  const planRows = (await db.execute(sql`select plan, count(*)::int as n from users where deleted_at is null group by plan order by n desc, plan asc`)) as unknown as { plan: string; n: number }[];
  const plans = planRows.map((r) => ({ plan: r.plan, count: r.n }));

  const topRows = (await db.execute(sql`
    select pp.path as path, p.name as name, pp.views::bigint as views,
           (select count(*)::int from likes l where l.project_id = pp.project_id) as likes
    from published_projects pp
    join projects p on p.id = pp.project_id
    where pp.visibility = 'public' and pp.moderation = 'approved'
    order by pp.views desc, pp.published_at desc
    limit 5
  `)) as unknown as { path: string; name: string; views: number; likes: number }[];
  const topWorks = topRows.map((r) => ({ path: r.path, name: r.name, views: Number(r.views), likes: r.likes }));

  const dailyRows = (await db.execute(sql`
    select day::text as day, coalesce(sum(opens), 0)::int as opens
    from publication_visits
    where day >= (now() - interval '6 days')::date and suspected_bot = false
    group by day
    order by day
  `)) as unknown as ObserverDailyPoint[];
  // 补齐近 7 天没有行的日期——图要连成线，缺口必须是 0 而不是凭空断线
  const byDay = new Map(dailyRows.map((r) => [r.day, r.opens]));
  const daily: ObserverDailyPoint[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    daily.push({ day: key, opens: byDay.get(key) ?? 0 });
  }

  return {
    usersTotal,
    usersGuests,
    usersNew7d,
    usersNew30d,
    projectsTotal,
    publishesPublicApproved,
    publishesTotal,
    viewsTotal: Number(viewsTotal),
    likesTotal,
    commentsTotal,
    savesTotal,
    followsTotal,
    opens7d,
    opens30d,
    visibleMs7d: Number(visibleMs7d),
    completionPctAvg30d: visibleAgg?.pct ?? null,
    completionsGame,
    completionsWork,
    suspectedBots7d,
    tasks,
    plans,
    topWorks,
    daily,
  };
}

export type ObserverAdviceSeverity = 'good' | 'warn' | 'bad';

export interface ObserverAdvice {
  severity: ObserverAdviceSeverity;
  textZh: string;
  textEn: string;
}

/**
 * 规则引擎 · 非 AI。
 *
 * 为什么不是 AI：这一栏给的是「照实测数字给出下一步」——每一条都带阈值，
 * 判断条件写在代码里，任何人可以复核；编造自由度为零。AI 建议如果以后要接，
 * 会挂在另一颗按钮上，并明示「模型生成、仅供参考」，不冒充测量。
 */
export function buildObserverAdvice(m: ObserverMetrics): ObserverAdvice[] {
  const advice: ObserverAdvice[] = [];
  const openRate = m.viewsTotal > 0 ? (m.opens30d / Math.max(1, m.opens30d + m.opens7d)) : 0;

  if (m.opens7d === 0) {
    advice.push({
      severity: 'warn',
      textZh: '过去 7 天没有一次有效打开——先让三个朋友打开一次并真的看完，把第一份数据跑出来，再谈推广。',
      textEn: 'No effective opens in the last 7 days — have three friends open and finish a piece first; get a first real data point before promoting anything.',
    });
  }
  if (m.viewsTotal >= 50 && m.likesTotal / Math.max(1, m.viewsTotal) < 0.01) {
    advice.push({
      severity: 'warn',
      textZh: '总浏览量不低但点赞率低于 1%——打开了的人没按喜欢，先改标题、封面和前三行。',
      textEn: 'Views are decent but likes are under 1% — people open but don’t like; fix the title, cover and first three lines first.',
    });
  }
  if (m.completionsGame + m.completionsWork === 0 && (m.opens30d ?? 0) > 0) {
    advice.push({
      severity: 'warn',
      textZh: '没有人走到过终点——检查作品的首屏门槛：目标太多或第一步太难都会让人流失。',
      textEn: 'Nobody has reached the end — check the first screen of each piece: too many goals or a too-hard first step both leak visitors.',
    });
  }
  if (m.usersNew7d === 0) {
    advice.push({
      severity: 'warn',
      textZh: '近 7 天没有新注册——先让身边的人真实注册一次，把漏斗顶端补上，否则所有分母都是 1。',
      textEn: 'No new signups in 7 days — have people sign up for real first; otherwise every denominator stays at 1.',
    });
  }
  if (m.tasks.awaitingApproval > 0) {
    advice.push({
      severity: 'warn',
      textZh: `有 ${m.tasks.awaitingApproval} 个 AI 任务挂着等你批准——批一次它就往前走一格。`,
      textEn: `${m.tasks.awaitingApproval} AI task(s) are parked awaiting approval — approve once and each moves a step forward.`,
    });
  }
  if (m.tasks.failed > m.tasks.succeeded) {
    advice.push({
      severity: 'bad',
      textZh: '失败的任务多于成功的——先看 /admin/health 的 provider 状态和额度，别急着加功能。',
      textEn: 'Failed tasks outnumber succeeded ones — check the health panel and provider quota before adding features.',
    });
  }
  if (m.suspectedBots7d > m.opens7d && m.opens7d > 0) {
    advice.push({
      severity: 'warn',
      textZh: '疑似机器人流量超过人流——推送前先清洗 suspectedBots 的来源，不然所有转化率都是假的。',
      textEn: 'Suspected-bot traffic exceeds human opens — clean those sources before trusting conversion numbers.',
    });
  }
  if (advice.length === 0) {
    advice.push({
      severity: 'good',
      textZh: '数据链是通的：有人打开、有人走完、有人注册。下一步是让 AI 建议挂进这一页——但不冒充测量。',
      textEn: 'The data chain is alive: people open, finish, sign up. Next step is wiring an AI suggestion panel onto this page — never disguised as measurement.',
    });
  }
  void openRate;
  return advice;
}
