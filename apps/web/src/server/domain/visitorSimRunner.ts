/**
 * §SIM-1 模拟入库：挑一个公开作品，把 simulateVisits 产出的人·天写进 `publication_visits`。
 *
 * 与 recordVisit 同一合并语义：同一天同一 visitorKey 行已存在时 opens 累加；
 * completionPct 取最大（与现网「最远滚到第几」一致）。
 *
 * 写入路径是**故意走现网 recordVisit** 还是**直插**？——这里的行多到上百条、每行都带疑似爬虫
 * 标记，逐条走 recordVisit 的校验门与 upsert 有两层开销；但按统一口径办，还是走直插表，
 * 因为 round-trip 参数（爬虫标记、userId）是显式提供的，没有绕过任何隐私门。
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { projects, publicationVisits, publishedProjects } from '../db/schema';
import { utcDay } from '@/lib/visit-meter';
import {
  mulberry32,
  simulateVisits,
  summarize,
  PROFILE_WEIGHTS,
  type VisitorProfile,
} from './visitorSim';

export interface SimulationResult {
  inserted: number;
  targetPublicationId: string;
  targetProjectName: string;
  targetPath: string;
  byProfile: Record<VisitorProfile, number>;
  totalOpens: number;
  avgVisibleMs: number;
  avgCompletionPct: number;
  weightShare: Record<VisitorProfile, number>;
  seed: number;
}

export async function runVisitorSimulation({
  db,
  count,
  seed,
}: {
  db?: ReturnType<typeof getDb>;
  count: number;
  seed: number;
}): Promise<SimulationResult> {
  const database = db ?? getDb();
  const rand = mulberry32(seed);
  // 随机挑一个公开作品当模拟目标：有助于运维看到"这个 demo 被自动化轰过"对 churn-risk 的连带效应
  const targets = await database
    .select({
      publicationId: publishedProjects.id,
      projectName: projects.name,
      path: publishedProjects.path,
    })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(
      and(
        sql`${publishedProjects.visibility} = 'public'`,
        isNull(projects.deletedAt),
      ),
    )
    .orderBy(desc(publishedProjects.publishedAt))
    .limit(20);
  if (targets.length === 0) {
    throw new Error('没有可接受模拟流量的公开作品。先把一个 demo 公开发布再来。');
  }
  const target = targets[Math.floor(rand() * targets.length)]!;

  const visits = simulateVisits(count, seed);
  const day = utcDay(new Date());
  const rows = visits.map((v, i) => ({
    publicationId: target.publicationId,
    visitorKey: `sim:${seed}:${i}`,
    day,
    userId: null as string | null,
    opens: v.opens,
    visibleMs: v.visibleMs,
    completionPct: v.completionPct,
    cappedReports: 0,
    suspectedBot: true,
  }));

  if (rows.length > 0) {
    // 与现网同口径 upsert：opens 累加，completionPct 取最大值（滚动最远百分比不能回退）
    await database
      .insert(publicationVisits)
      .values(rows)
      .onConflictDoUpdate({
        target: [publicationVisits.publicationId, publicationVisits.visitorKey, publicationVisits.day],
        set: {
          opens: sql`${publicationVisits.opens} + excluded.opens`,
          visibleMs: sql`${publicationVisits.visibleMs} + excluded.visible_ms`,
          completionPct: sql`greatest(${publicationVisits.completionPct}, excluded.completion_pct)`,
        },
      });
  }

  const summary = summarize(visits);
  const weightShare = Object.fromEntries(
    Object.keys(PROFILE_WEIGHTS).map((k) => [
      k,
      Math.round((summary.byProfile[k as VisitorProfile] / Math.max(1, summary.total)) * 1000) / 10,
    ]),
  ) as Record<VisitorProfile, number>;

  return {
    inserted: rows.length,
    targetPublicationId: target.publicationId,
    targetProjectName: target.projectName,
    targetPath: target.path,
    byProfile: summary.byProfile,
    totalOpens: summary.totalOpens,
    avgVisibleMs: summary.avgVisibleMs,
    avgCompletionPct: summary.avgCompletionPct,
    weightShare,
    seed,
  };
}
