/**
 * §PULSE · 公开管理台（/admin/pulse）的数据源 —— **只读聚合，零个人字段**。
 *
 * 页面是公开的（口令 123 人人可知，用户明令如此，见 ADR-0276），
 * 所以这里只允许出现：计数、分布、趋势 —— 绝不允许出现邮箱、昵称、userId、IP、UA。
 * 任何人翻这份文件的人都应该能一眼确认：没有一个字段能把数字对回某一个人。
 *
 * 趋势预测：最小二乘法（n 个点的经典公式），中文管理台里叫「每日斜率 + R²」，
 * 14 天数据点上做 7 天外推。它是统计描述，不是预言 —— 样本量小的时候 R² 会诚实地塌掉。
 */
import { and, gte, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { projects, sessions, users } from '../db/schema';
import { readLedger } from './metrics';

export interface PulseDayPoint {
  day: string;
  count: number;
}

export interface PulseTrend {
  /** 每日斜率（人/天）；点不够/退化时为 0 */
  slopePerDay: number;
  intercept: number;
  /** 决定系数 0..1；n<2 或方差为 0 时为 0 */
  r2: number;
  /** 外推未来 7 天的累计新增；n<2 时为 0，绝不虚报 */
  projectedNext7d: number;
  points: number;
}

export interface PulseMetrics {
  /** 统计口径时间戳（ISO）—— 页面上必须印出来，两个读者不该争论"是什么时候的数" */
  capturedAt: string;
  usersTotal: number;
  guestsTotal: number;
  claimedTotal: number;
  registrationsByDay: PulseDayPoint[];
  sessionsActive: number;
  projectsPublic: number;
  projectsUnlisted: number;
  projectsPrivate: number;
  tasks: Array<{ status: string; capability: string | null; n: number; avgMs: number | null }>;
  audit: Array<{ action: string; allowed: boolean; n: number }>;
  apiCalls: Array<{ endpoint: string; calls: number }>;
  trend: PulseTrend;
}

export interface LeastSquaresResult {
  slope: number;
  intercept: number;
  r2: number;
}

/** 最小二乘：\(\hat y = a + b·x\)。x 由调用方给定（这里 0..n-1 = 第 n 天）。 */
export function leastSquares(points: ReadonlyArray<{ x: number; y: number }>): LeastSquaresResult {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: n === 1 ? points[0]!.y : 0, r2: 0 };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const meanY = sumY / n;
  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    const fit = intercept + slope * p.x;
    ssRes += (p.y - fit) ** 2;
    ssTot += (p.y - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, Math.min(1, 1 - ssRes / ssTot));
  return { slope, intercept, r2 };
}

/** 外推：以第 n-1 天（x = n-1）为锚点，x = n..n+6 求和。n<2 → 0。 */
export function projectNextSevenDays(counts: ReadonlyArray<number>): number {
  if (counts.length < 2) return 0;
  const fit = leastSquares(counts.map((y, i) => ({ x: i, y })));
  let total = 0;
  for (let k = counts.length; k < counts.length + 7; k += 1) {
    total += fit.intercept + fit.slope * k;
  }
  return Math.max(0, Math.round(total));
}

const dayKey = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** 读库聚合（只读各统计；不写任何行）。窗口：注册趋势 14 天，账本 7 天。 */
export async function readPulseMetrics(now = new Date()): Promise<PulseMetrics> {
  const db = getDb();

  const usersTotalRow = await db
    .select({ n: sql<string>`count(*)` })
    .from(users)
    .where(sql`${users.deletedAt} is null`);
  const guestsRow = await db
    .select({ n: sql<string>`count(*)` })
    .from(users)
    .where(sql`${users.deletedAt} is null and ${users.guest} = true`);
  const sessionsRow = await db
    .select({ n: sql<string>`count(*)` })
    .from(sessions)
    .where(sql`${sessions.expiresAt} > now()`);
  const byVisibilityRows = await db
    .select({ visibility: projects.visibility, n: sql<string>`count(*)` })
    .from(projects)
    .where(sql`${projects.deletedAt} is null`)
    .groupBy(projects.visibility);

  const since14 = new Date(now.getTime() - 13 * 24 * 3_600_000);

  const registrationRows = await db
    .select({
      day: sql<string>`to_char(${users.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      n: sql<string>`count(*)`,
    })
    .from(users)
    .where(and(isNull(users.deletedAt), gte(users.createdAt, since14)))
    .groupBy(sql`to_char(${users.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${users.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);

  const counted = new Map(registrationRows.map((r) => [r.day, Number(r.n)]));
  const registrationsByDay: PulseDayPoint[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const d = new Date(now.getTime() - offset * 24 * 3_600_000);
    const key = dayKey(d);
    registrationsByDay.push({ day: key, count: counted.get(key) ?? 0 });
  }

  const visibility = new Map(byVisibilityRows.map((r) => [r.visibility, Number(r.n)]));
  const ledger = await readLedger(24 * 7);

  const counts = registrationsByDay.map((p) => p.count);
  const fit = leastSquares(counts.map((y, i) => ({ x: i, y })));

  return {
    capturedAt: now.toISOString(),
    usersTotal: Number(usersTotalRow[0]?.n ?? 0),
    guestsTotal: Number(guestsRow[0]?.n ?? 0),
    claimedTotal: Number(usersTotalRow[0]?.n ?? 0) - Number(guestsRow[0]?.n ?? 0),
    registrationsByDay,
    sessionsActive: Number(sessionsRow[0]?.n ?? 0),
    projectsPublic: visibility.get('public') ?? 0,
    projectsUnlisted: visibility.get('unlisted') ?? 0,
    projectsPrivate: visibility.get('private') ?? 0,
    tasks: ledger.tasks,
    audit: ledger.audit,
    apiCalls: ledger.apiCalls,
    trend: {
      slopePerDay: fit.slope,
      intercept: fit.intercept,
      r2: fit.r2,
      projectedNext7d: projectNextSevenDays(counts),
      points: counts.length,
    },
  };
}

/** 喂给大模型的 digest（纯聚合；连「用户id」这种技术字段都不出现）。 */
export function buildPulseDigest(m: PulseMetrics): string {
  const lines = [
    '# NEXUS aggregate operations snapshot (no personal data)',
    `captured_at_utc: ${m.capturedAt}`,
    `users_total: ${m.usersTotal}`,
    `users_claimed: ${m.claimedTotal}`,
    `users_guest: ${m.guestsTotal}`,
    `active_sessions_now: ${m.sessionsActive}`,
    `projects_public: ${m.projectsPublic}`,
    `projects_unlisted: ${m.projectsUnlisted}`,
    `projects_private: ${m.projectsPrivate}`,
    'registrations_last_14d: ' + m.registrationsByDay.map((p) => `${p.day}=${p.count}`).join(', '),
    `trend_slope_per_day: ${m.trend.slopePerDay.toFixed(4)}`,
    `trend_r2: ${m.trend.r2.toFixed(4)}`,
    `trend_projected_next_7d: ${m.trend.projectedNext7d}`,
    'tasks_7d: ' + m.tasks.map((t) => `${t.status}${t.capability ? `/${t.capability}` : ''}=${t.n}`).join(', '),
    'audit_7d: ' + m.audit.map((a) => `${a.action}:${a.allowed ? 'allow' : 'deny'}=${a.n}`).join(', '),
    'api_usage_7d: ' + m.apiCalls.map((c) => `${c.endpoint}=${c.calls}`).join(', '),
  ];
  return lines.join('\n');
}
