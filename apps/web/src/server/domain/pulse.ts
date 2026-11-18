import { and, eq, isNull, gte, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { getDb } from '../db/client';
import {
  comments,
  follows,
  gameCompletions,
  likes,
  projects,
  publishedProjects,
  publicationVisits,
  remixes,
  users,
  workCompletions,
} from '../db/schema';

/**
 * §PULSE · 平台级**聚合**读数（`/pulse` 用）
 *
 * 两条纪律贯穿全文件：
 * 1. 这个视图是公开的（密码 123 是公开的）——只允许出现**聚合**数字，不允许出现
 *    任何可定位到个人的数（无邮箱、无名称、无 ID = 这页本身没有 PII 可爆破）。
 * 2. 读不到就让整次调用失败，不拿别的数换算一个冒充（§159 同族纪律）。
 *    500 是一句诚实的"这里坏了"，不是一个拿别处换算的"看起来还行"。
 */
export interface PulseNumbers {
  /** 全站账号数（含管理员） */
  users: number;
  admins: number;
  /** 公开可见的发布版本数（visibility = public） */
  publishedVersions: number;
  /** 全站打开次数（含疑似爬虫）—— 位置与口径与 /analytics 一致（views 计数器） */
  opens: number;
  /** 全站爬虫打开数（suspectedBot=true）——用于咨询/评估入口黏性而非宣称真人热度 */
  opensBot: number;
  opensToday: number;
  /** 全站访客（去重 visitorKey，all-time） */
  visitors: number;
  visitorsToday: number;
  /** 人·天行数：全站按「人 × 天」计的访问行（不叫"人数"） */
  visitorDays: number;
  /** 可见时长（ms） */
  visibleMs: number;
  /** 通关/完成（游戏 + 互动稿，真人） */
  gameClears: number;
  workCompletions: number;
  likes: number;
  comments: number;
  remixes: number;
  follows: number;
}

export interface PulseDayPoint {
  day: string;
  opens: number;
  visitorDays: number;
}

export interface PulseTrend {
  days: number;
  points: PulseDayPoint[];
  /** 与前一个等长窗口相比的口径（不足两个窗口写 null，不写成 0） */
  opensDelta: number | null;
  visitorDaysDelta: number | null;
}

export interface PulseRecommendation {
  zh: string;
  en: string;
  /** 触发这个建议的那条读数，显示在卡片上 */
  basis: string;
}

export interface PulseHotItem {
  publicationId: string;
  projectName: string;
  path: string;
  opensCurr: number;
  opensPrev: number;
  velocityPct: number;
}

export interface PulseWarning {
  kind: 'churn-risk' | 'thin-traffic' | 'bot-pressure';
  zh: string;
  en: string;
  basis: string;
}

function int(raw: string | number | bigint | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  const n = typeof raw === 'bigint' ? Number(raw) : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function iso(day: Date): string {
  return day.toISOString().slice(0, 10);
}

export function trendPoints(
  rows: ReadonlyArray<{ day: string; opens: number; visitorDays: number }>,
  today: string,
  days: number,
): PulseDayPoint[] {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const cursor = new Date(`${today}T00:00:00.000Z`);
  const out: PulseDayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(cursor);
    d.setUTCDate(cursor.getUTCDate() - i);
    const isoDay = iso(d);
    const hit = byDay.get(isoDay);
    out.push({ day: isoDay, opens: hit?.opens ?? 0, visitorDays: hit?.visitorDays ?? 0 });
  }
  return out;
}

export function deltaPct(points: PulseDayPoint[], field: 'opens' | 'visitorDays'): number | null {
  const mid = Math.floor(points.length / 2);
  const older = points.slice(0, mid).reduce((acc, p) => acc + p[field], 0);
  const newer = points.slice(mid).reduce((acc, p) => acc + p[field], 0);
  if (points.length < 2 || older === 0) return null;
  return Math.round(((newer - older) / older) * 100);
}

/** 趋势 → 启发式建议。规则写死在这：每一条都注明触发依据，够明确，不装盒子里还有"AI" */
export function buildRecommendations(
  numbers: PulseNumbers,
  trend: PulseTrend,
): PulseRecommendation[] {
  const out: PulseRecommendation[] = [];
  if (trend.opensDelta === null) {
    out.push({
      zh: '流量历史太短，先把打开数稳定采集起来：每次访问都过 /api/visit 心跳（含滚动百分比），别再靠 views 计数器推测。',
      en: 'Traffic history is too short — wire every visit through the /api/visit heartbeat (scroll % included) instead of inferring from the views counter.',
      basis: `days=${trend.days}`,
    });
  } else if (trend.opensDelta < 0) {
    out.push({
      zh: `打开数在最近半窗口里环比下滑 ${Math.abs(trend.opensDelta)}%：把发布节奏对齐到高峰时段；优先修最近点开即走率最高的作品（先看 /discover）。`,
      en: `Opens dropped ${Math.abs(trend.opensDelta)}% half-window-over-half-window: align publish timings to peak hours; audit the highest immediate-exit works first (see /discover).`,
      basis: `opensDelta=${trend.opensDelta}%`,
    });
  } else if (trend.opensDelta >= 0) {
    out.push({
      zh: `打开数环比上升 ${trend.opensDelta}%：趁热度把清民游戏与编辑精选绑定（/guide 已说明耸立卡片是编辑入口），把访客留在"继续逛"而不是关闭。`,
      en: `Opens rose ${trend.opensDelta}% half-over-half: bind the current hit to featured slots so visitors keep wandering instead of leaving.`,
      basis: `opensDelta=+${trend.opensDelta}%`,
    });
  }

  out.push({
    zh: numbers.gameClears + numbers.workCompletions > 0
      ? `完成率侧有真人走到结尾（游戏通关 ${numbers.gameClears} + 互动稿 ${numbers.workCompletions}）：把奖励集成到完成页签（/bible/well 式奖励节拍），把完成者转成关注者。`
      : '通关/完成还没有真人行——先别急着做"流失挽回"：先在一个 demo 作品里把结局埋点从"打开即算"改成"读满 80% 才算"，让这个口径先有真数。',
    en: numbers.gameClears + numbers.workCompletions > 0
      ? `Real humans do finish (game clears ${numbers.gameClears} + interactive ${numbers.workCompletions}): reward the finish page, and convert finishers into followers.`
      : 'No real finished runs yet — postpone win-back flows; first instrument a demo with an 80% completion bar so the metric gets real signal.',
    basis: `completions=${numbers.gameClears + numbers.workCompletions}`,
  });

  out.push({
    zh: numbers.remixes > 0
      ? `已有 ${numbers.remixes} 次改编（remix）：remix 是最值的流量转化——每次 remix 完成后立即给改编者一张"你的作品就是入口"的转发卡，让它带来下一层的人。`
      : 'remix 一直没有动静——作品共享页（/play）缺一个"一键改编"的按钮提示；教程里也只教了怎么通关，没有教怎么接着改。',
    en: numbers.remixes > 0
      ? `${numbers.remixes} remixes so far: remix is the most valuable traffic converter — after each remix, hand the remixer a “your work is the doorway” share card.`
      : 'Remixes stay at zero — the play page lacks a prominent “remix this” affordance; the tutorial teaches finishing, not inheriting.',
    basis: `remixes=${numbers.remixes}`,
  });

  return out;
}

const pct = (n: number): string => `${n >= 0 ? '+' : ''}${Math.round(n)}%`;

/** 近 14 天的『谁变热了、谁变冷了、谁在逼近危险』 */
export function buildWarnings(numbers: PulseNumbers, trend: PulseTrend): PulseWarning[] {
  const out: PulseWarning[] = [];
  // 流失风险：visitorDays 最近半窗口 vs 前半窗口 -20%
  const halfPoints = trend.points.slice(0, Math.max(1, Math.floor(trend.points.length / 2)));
  const secondHalf = trend.points.slice(halfPoints.length);
  const olderSum = halfPoints.reduce((acc, p) => acc + p.visitorDays, 0);
  const newerSum = secondHalf.reduce((acc, p) => acc + p.visitorDays, 0);
  if (olderSum >= 5) {
    const delta = ((newerSum - olderSum) / olderSum) * 100;
    if (delta <= -20) {
      out.push({
        kind: 'churn-risk',
        zh: `人·天行数最近半窗口下滑 ${Math.abs(Math.round(delta))}%：长时间没有新鲜内容或入口黏性弱——建议本周至少引入一次显眼活动（周 challenge、新剧本），并把"返回"按钮挪到收件箱顶部。`,
        en: `Person-day rows dropped ${Math.abs(Math.round(delta))}% in the newer half-window: either freshness is thin or return loops are weak — ship one visible late event (weekly challenge / new quest) and pin the inbox link high.`,
        basis: `visitorDaysHalfDelta=${pct(delta)}`,
      });
    }
  }
  // 总流量太薄：进不了"为优化而优化"的阈值
  const total7 = trend.points.slice(-7).reduce((acc, p) => acc + p.opens, 0);
  if (total7 < 20) {
    out.push({
      kind: 'thin-traffic',
      zh: `最近 7 天只有 ${total7} 次打开——先别急着做流失挽回：让自己把作品分享给 5 个真实朋友试试玩，得到第一批真人心跳再谈优化。`,
      en: `Only ${total7} opens in the last 7 days — postpone retention work: put the link in front of five real people first, get real heartbeats, then iterate.`,
      basis: `opens_7d=${total7}`,
    });
  }
  // 爬虫压力：疑似自动化占比过 30%
  const humanOpens = Math.max(0, numbers.opens - numbers.opensBot);
  const botShare = numbers.opens > 0 ? numbers.opensBot / numbers.opens : 0;
  if (numbers.opens >= 50 && botShare > 0.30) {
    out.push({
      kind: 'bot-pressure',
      zh: `疑似自动化占总打开 ${Math.round(botShare * 100)}%：若再不给 public 入口加真实性校验（蜜罐 / ua+fingerprint 分类），流量数据会被定时爬虫稀释。真人参考：${humanOpens} 次打开。`,
      en: `Suspected automation is ${Math.round(botShare * 100)}% of opens: without a realness gate (honey token + UA/fingerprint scoring), scheduled scrapers will swamp the readouts. Humans account for ${humanOpens} opens.`,
      basis: `botShare=${Math.round(botShare * 100)}%`,
    });
  }
  return out;
}

export interface VelocityRow {
  publicationId: string;
  projectName: string;
  path: string;
  opensCurr: number;
  opensPrev: number;
}

export function buildHotItems(rows: VelocityRow[]): PulseHotItem[] {
  return rows
    .filter((row) => row.opensCurr + row.opensPrev > 0)
    .map((row) => ({
      ...row,
      velocityPct: row.opensPrev > 0 ? ((row.opensCurr - row.opensPrev) / row.opensPrev) * 100 : row.opensCurr > 0 ? 100 : 0,
    }))
    .sort((a, b) => b.velocityPct - a.velocityPct)
    .slice(0, 3);
}

export interface PlatformPulse extends Omit<PulseNumbers, 'opens'> {
  opens: number;
  trend: PulseTrend;
  recommendations: PulseRecommendation[];
  hot: PulseHotItem[];
  warnings: PulseWarning[];
  generatedAt: string;
}

/**
 * 30 秒内的请求复用同一份聚合（/pulse 是公开读仪表盘，不是计费凭据面）——不设则每次都打 15 组
 * count/sum/distinct，洪水之下打穿连接池。门是这里唯一写入的位置，契约不变（仍是完整 PlatformPulse）。
 */
const PULSE_TTL_MS = 30_000;
const PULSE_REDIS_KEY = 'nexus:pulse:aggregate:v1';

let cachedPulse: { at: number; value: PlatformPulse } | null = null;
let pulseInFlight: Promise<PlatformPulse> | null = null;
let pulseRedis: Redis | null | undefined; // undefined = 还没试过；null = 这台没配置或用不了

/** 测试用：丢弃缓存，保证用例间无泄漏（含 redis 客户端，重建一次即可） */
export function resetPulseCache(): void {
  cachedPulse = null;
  pulseInFlight = null;
}

function pulseRedisClient(): Redis | null {
  if (pulseRedis !== undefined) return pulseRedis;
  const url = process.env.NEXUS_REDIS_URL;
  if (!url) {
    pulseRedis = null;
    return null;
  }
  try {
    pulseRedis = new Redis(url, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: 250,
    });
    pulseRedis.on('error', () => {
      /* 连不上就算了：读端重算/内存飞行，不让缓存把 503 藏掉 */
    });
    return pulseRedis;
  } catch {
    pulseRedis = null;
    return null;
  }
}

async function redisGetPulse(): Promise<PlatformPulse | null> {
  const client = pulseRedisClient();
  if (!client || client.status !== 'ready') return null;
  try {
    const raw = await client.get(PULSE_REDIS_KEY);
    return raw ? (JSON.parse(raw) as PlatformPulse) : null;
  } catch {
    return null;
  }
}

async function redisSetPulse(value: PlatformPulse): Promise<void> {
  const client = pulseRedisClient();
  if (!client || client.status !== 'ready') return;
  try {
    await client.set(PULSE_REDIS_KEY, JSON.stringify(value), 'PX', PULSE_TTL_MS);
  } catch {
    /* 写缓存失败不 fail 响应：值已经算准了 */
  }
}

/** 测试用：丢弃缓存，保证用例间无泄漏 */

export async function platformPulseCached(
  now: () => number = Date.now,
  load: () => Promise<PlatformPulse> = platformPulse,
): Promise<PlatformPulse> {
  const t = now();
  if (cachedPulse && t - cachedPulse.at < PULSE_TTL_MS) {
    return cachedPulse.value;
  }
  if (pulseInFlight) {
    return pulseInFlight;
  }

  // 先把 in-flight 登记在案，再进入 redis 探测：并发先到者走到这里会看到非空的 pulseInFlight，
  // 不会双双进入 load() —— 单飞是薄门的第一纪律（ADR 0094）
  pulseInFlight = (async (): Promise<PlatformPulse> => {
    const fromRedis = await redisGetPulse();
    if (fromRedis) {
      cachedPulse = { at: now(), value: fromRedis };
      return fromRedis;
    }
    const value = await load();
    cachedPulse = { at: now(), value };
    void redisSetPulse(value);
    return value;
  })().finally(() => {
    pulseInFlight = null;
  });
  return pulseInFlight;
}

export async function platformPulse(): Promise<PlatformPulse> {
  const db = getDb();
  const today = iso(new Date());
  const windowStart = iso(new Date(Date.now() - 13 * 24 * 3600 * 1000));
  const windowMid = iso(new Date(Date.now() - 6 * 24 * 3600 * 1000));

  const [
    [usersRow],
    [adminsRow],
    [worksRow],
    [totals],
    [totalsBot],
    [tod],
    [todBot],
    [visDistinct],
    [visDistinctBot],
    [gameClearsRow],
    [workCompletionsRow],
    [likesRow],
    [commentsRow],
    [remixesRow],
    [followsRow],
    trendRows,
    velocityRows,
  ] = await Promise.all([
    db.select({ n: sql<string>`count(*)` }).from(users),
    db.select({ n: sql<string>`count(*) filter (where ${eq(users.role, 'admin')})` }).from(users),
    db
      .select({ n: sql<string>`count(*)` })
      .from(publishedProjects)
      .where(sql`${publishedProjects.visibility} = 'public'`),
    db
      .select({
        opens: sql<string>`coalesce(sum(${publicationVisits.opens}) filter (where not ${publicationVisits.suspectedBot}), 0)`,
        visibleMs: sql<string>`coalesce(sum(${publicationVisits.visibleMs}) filter (where not ${publicationVisits.suspectedBot}), 0)`,
        visitorDays: sql<string>`count(*) filter (where not ${publicationVisits.suspectedBot})`,
      })
      .from(publicationVisits),
    db
      .select({
        opens: sql<string>`coalesce(sum(${publicationVisits.opens}) filter (where ${publicationVisits.suspectedBot}), 0)`,
        visitorDays: sql<string>`count(*) filter (where ${publicationVisits.suspectedBot})`,
      })
      .from(publicationVisits),
    db
      .select({
        opens: sql<string>`coalesce(sum(${publicationVisits.opens}) filter (where ${publicationVisits.day} = ${today} and not ${publicationVisits.suspectedBot}), 0)`,
        visitorDays: sql<string>`count(*) filter (where ${publicationVisits.day} = ${today} and not ${publicationVisits.suspectedBot})`,
        visitors: sql<string>`count(distinct ${publicationVisits.visitorKey}) filter (where ${publicationVisits.day} = ${today} and not ${publicationVisits.suspectedBot})`,
      })
      .from(publicationVisits),
    db
      .select({
        opens: sql<string>`coalesce(sum(${publicationVisits.opens}) filter (where ${publicationVisits.day} = ${today} and ${publicationVisits.suspectedBot}), 0)`,
      })
      .from(publicationVisits),
    db
      .select({ n: sql<string>`count(distinct ${publicationVisits.visitorKey}) filter (where not ${publicationVisits.suspectedBot})` })
      .from(publicationVisits),
    db
      .select({ n: sql<string>`count(distinct ${publicationVisits.visitorKey}) filter (where ${publicationVisits.suspectedBot})` })
      .from(publicationVisits),
    db
      .select({ n: sql<string>`count(distinct ${gameCompletions.visitorKey}) filter (where not ${gameCompletions.suspectedBot})` })
      .from(gameCompletions),
    db
      .select({ n: sql<string>`count(distinct ${workCompletions.visitorKey}) filter (where not ${workCompletions.suspectedBot})` })
      .from(workCompletions),
    db.select({ n: sql<string>`count(*)` }).from(likes),
    db.select({ n: sql<string>`count(*)` }).from(comments),
    db.select({ n: sql<string>`count(*)` }).from(remixes),
    db.select({ n: sql<string>`count(*)` }).from(follows),
    db
      .select({
        day: sql<string>`${publicationVisits.day}`,
        opens: sql<string>`coalesce(sum(${publicationVisits.opens}) filter (where not ${publicationVisits.suspectedBot}), 0)`,
        visitorDays: sql<string>`count(*) filter (where not ${publicationVisits.suspectedBot})`,
      })
      .from(publicationVisits)
      .where(gte(publicationVisits.day, windowStart))
      .groupBy(publicationVisits.day)
      .orderBy(publicationVisits.day),
    db
      .select({
        publicationId: publishedProjects.id,
        projectName: projects.name,
        path: publishedProjects.path,
        opensCurr: sql<string>`coalesce(sum(${publicationVisits.opens}) filter (where ${publicationVisits.day} >= ${windowMid} and not ${publicationVisits.suspectedBot}), 0)`,
        opensPrev: sql<string>`coalesce(sum(${publicationVisits.opens}) filter (where ${publicationVisits.day} < ${windowMid} and not ${publicationVisits.suspectedBot}), 0)`,
      })
      .from(publishedProjects)
      .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
      .innerJoin(publicationVisits, eq(publicationVisits.publicationId, publishedProjects.id))
      .where(and(
        sql`${publishedProjects.visibility} = 'public'`,
        isNull(projects.deletedAt),
        gte(publicationVisits.day, windowStart),
      ))
      .groupBy(publishedProjects.id, projects.name, publishedProjects.path),
  ]);

  const numbers: PulseNumbers = {
    users: int(usersRow?.n),
    admins: int(adminsRow?.n),
    publishedVersions: int(worksRow?.n),
    opens: int(totals?.opens) + int(totalsBot?.opens),
    opensBot: int(totalsBot?.opens),
    opensToday: int(tod?.opens) + int(todBot?.opens),
    visitors: int(visDistinct?.n) + int(visDistinctBot?.n),
    visitorsToday: int(tod?.visitors),
    visitorDays: int(totals?.visitorDays) + int(totalsBot?.visitorDays),
    visibleMs: int(totals?.visibleMs),
    gameClears: int(gameClearsRow?.n),
    workCompletions: int(workCompletionsRow?.n),
    likes: int(likesRow?.n),
    comments: int(commentsRow?.n),
    remixes: int(remixesRow?.n),
    follows: int(followsRow?.n),
  };

  const points = trendPoints(
    trendRows.map((r) => ({ day: String(r.day), opens: int(r.opens), visitorDays: int(r.visitorDays) })),
    today,
    14,
  );
  const trend: PulseTrend = {
    days: 14,
    points,
    opensDelta: deltaPct(points, 'opens'),
    visitorDaysDelta: deltaPct(points, 'visitorDays'),
  };

  const hot = buildHotItems(
    velocityRows.map((r) => ({
      publicationId: r.publicationId,
      projectName: r.projectName,
      path: r.path,
      opensCurr: int(r.opensCurr),
      opensPrev: int(r.opensPrev),
    })),
  );
  const warnings = buildWarnings(numbers, trend);

  return {
    ...numbers,
    trend,
    recommendations: buildRecommendations(numbers, trend),
    hot,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}
