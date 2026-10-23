import { raisePlan } from './support/test-plan';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createProject } from '../src/server/domain/projects';
import { publishProject, recordView } from '../src/server/domain/publish';
import { creatorAnalytics, publicationAnalytics, recordVisit } from '../src/server/domain/analytics';
import { utcDay } from '../src/lib/visit-meter';
import { getDb } from '../src/server/db/client';
import { follows, likes, projects, publicationVisits, publishedProjects, remixes, users } from '../src/server/db/schema';

/**
 * §168 Analytics 的读写端，打真库。
 *
 * 这里要钉的是**聚合语义**：一天一行怎么合并、完成度取最远而不是平均、
 * 截断要留痕迹、六个数各自挂在哪个粒度上（项目 / 版本 / 作者）。
 * 这些都在 SQL 里，内存里拼不出来；而且"没采到"与"采到 0"必须在库里就分得开——
 * 否则界面上那个"未采集"就成了谎话。
 *
 * 照 §165/§166 的纪律：每条否定断言都要有同一份数据换个状态就成立的对照。
 */

const RUN = `s168${Date.now().toString(36)}`;
const KEY = (n: number) => `${n}`.padStart(2, '0').repeat(16); // 32 位十六进制的匿名 key
let ownerId: string;
let otherId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `分析作者${RUN}`, email: `an+${RUN}@nexus.test`, handle: `an${RUN}` })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({ displayName: `分析路人${RUN}`, email: `ax+${RUN}@nexus.test`, handle: `ax${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  await raisePlan(ownerId);
  otherId = other!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, otherId]));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

async function publish(name: string): Promise<{ projectId: string; publicationId: string; path: string }> {
  const projectId = (await createProject(ownerId, { name, kind: 'website' })).id;
  const result = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
  if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
  return { projectId, publicationId: result.publication.id, path: result.publication.path };
}

/** 直接读库里的原始行，绕开聚合层，才能确认"合并"真的发生在写入侧 */
async function visitRows(publicationId: string) {
  const db = getDb();
  return db
    .select({
      visitorKey: publicationVisits.visitorKey,
      day: publicationVisits.day,
      userId: publicationVisits.userId,
      opens: publicationVisits.opens,
      visibleMs: publicationVisits.visibleMs,
      completionPct: publicationVisits.completionPct,
      cappedReports: publicationVisits.cappedReports,
    })
    .from(publicationVisits)
    .where(eq(publicationVisits.publicationId, publicationId))
    .orderBy(publicationVisits.visitorKey, publicationVisits.day);
}

async function visit(
  publicationId: string,
  over: {
    key?: string | null;
    userId?: string | null;
    open?: boolean;
    visibleMs?: number;
    completionPct?: number;
    suspectedBot?: boolean;
    at?: Date;
  } = {},
) {
  return recordVisit({
    publicationId,
    // 'key' in over 而不是 ??：显式传 null 是要测"坏 key 不收"，不能被默认值救回来
    visitorKey: 'key' in over ? over.key : KEY(1),
    userId: over.userId ?? null,
    open: over.open ?? true,
    visibleMs: over.visibleMs ?? 1000,
    completionPct: over.completionPct ?? 10,
    suspectedBot: over.suspectedBot,
    at: over.at,
  });
}

describe('访客现场的写入（一天一行）', () => {
  it('同一访客同一天的多次心跳合成一行：打开次数相加、时长相加、完成度取最远', async () => {
    const { publicationId } = await publish(`分析 同日合并${RUN}`);
    expect(await visit(publicationId, { visibleMs: 1000, completionPct: 30 })).toBe('recorded');
    await visit(publicationId, { visibleMs: 2000, completionPct: 90 });
    // 第三次只是心跳，不该再多算一次"打开"
    await visit(publicationId, { open: false, visibleMs: 500, completionPct: 10 });

    const rows = await visitRows(publicationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ opens: 2, visibleMs: 3500, completionPct: 90, cappedReports: 0 });
    // 对照：90 不是平均数（(30+90+10)/3 = 43），是"最远到达"
    expect(rows[0]!.completionPct).not.toBe(43);
  });

  it('换一天就是新的一行，跨天不合并；但访客数按人去重，不按行', async () => {
    const { publicationId } = await publish(`分析 跨天${RUN}`);
    await visit(publicationId, { at: new Date('2026-01-05T08:00:00.000Z') });
    await visit(publicationId, { at: new Date('2026-01-06T08:00:00.000Z') });
    const rows = await visitRows(publicationId);
    expect(rows.map((row) => row.day)).toEqual(['2026-01-05', '2026-01-06']);
    // 两行数据是同一个人：库里分行是为了算"每天"，界面上的"访客"不该数成 2
    const { analytics } = (await publicationAnalytics(ownerId, publicationId))!;
    expect(analytics.visitors).toBe(1);
    expect(analytics.visitorsToday).toBe(0);
    expect(analytics.opensToday).toBe(0);
    expect(analytics.playTimeMs).toBe(2000);
  });

  it('坏 key 一行都不写：既不是 0 时长，也不是"来了个匿名访客"', async () => {
    const { publicationId } = await publish(`分析 坏key${RUN}`);
    expect(await visit(publicationId, { key: 'not-a-hex-key' })).toBe('rejected');
    expect(await visit(publicationId, { key: '' })).toBe('rejected');
    expect(await visit(publicationId, { key: null })).toBe('rejected');
    // 反向对照：同一张表换个 key 就写得进去，说明前面是被规则挡的
    expect(await visit(publicationId, { key: KEY(2) })).toBe('recorded');
    const rows = await visitRows(publicationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.visitorKey).toBe(KEY(2));
  });

  it('超上限的时长截断入库，并把"被动过"记在 capped_reports 里', async () => {
    const { publicationId } = await publish(`分析 截断${RUN}`);
    await visit(publicationId, { key: KEY(3), visibleMs: 600_000, completionPct: 50 });
    const rows = await visitRows(publicationId);
    expect(rows[0]).toMatchObject({ visibleMs: 60_000, cappedReports: 1 });
    // 对照：没超上限的那条不产生截断痕迹
    await visit(publicationId, { key: KEY(4), visibleMs: 60_000, completionPct: 50 });
    expect((await visitRows(publicationId)).find((r) => r.visitorKey === KEY(4))?.cappedReports).toBe(0);
  });

  it('先匿名后来登录：补上账号归属；已经记了账号的行不被后来的匿名覆盖', async () => {
    const { publicationId } = await publish(`分析 归属${RUN}`);
    await visit(publicationId, { key: KEY(5), userId: null });
    await visit(publicationId, { key: KEY(5), userId: otherId });
    expect((await visitRows(publicationId))[0]!.userId).toBe(otherId);

    await visit(publicationId, { key: KEY(6), userId: ownerId });
    await visit(publicationId, { key: KEY(6), userId: null });
    expect((await visitRows(publicationId)).find((r) => r.visitorKey === KEY(6))!.userId).toBe(ownerId);
  });
});

describe('六个数的口径（真实数据库）', () => {
  it('一条心跳都没采到时：时长与完成度是 null，不是 0', async () => {
    const { publicationId } = await publish(`分析 空指标${RUN}`);
    const row = await publicationAnalytics(ownerId, publicationId);
    expect(row).not.toBeNull();
    expect(row!.analytics.playTimeMs).toBeNull();
    expect(row!.analytics.completion).toBeNull();
    expect(row!.analytics.visitors).toBe(0);
    // 对照：同一个数写入之后立刻不再是 null，说明前面的 null 是"没采到"
    await visit(publicationId, { key: KEY(7), visibleMs: 1000, completionPct: 20 });
    const after = await publicationAnalytics(ownerId, publicationId);
    expect(after!.analytics.playTimeMs).toBe(1000);
    expect(after!.analytics.completion).toEqual({ avgPct: 20, over: 1 });
  });

  it('来了但一秒都没攒到：是 0 秒，不是"未采集"', async () => {
    // 打开即关掉的访客真实存在。把 0 渲染成"未采集"，等于说这一页没人在看
    const { publicationId } = await publish(`分析 零时长${RUN}`);
    await visit(publicationId, { key: KEY(20), visibleMs: 0, completionPct: 0 });
    const { analytics } = (await publicationAnalytics(ownerId, publicationId))!;
    expect(analytics.visitors).toBe(1);
    expect(analytics.opensToday).toBe(1);
    expect(analytics.playTimeMs).toBe(0);
    expect(analytics.completion).toBeNull();
  });

  it('完成度按访客取平均，并说明是几个人聚合出来的', async () => {
    const { publicationId } = await publish(`分析 完成度${RUN}`);
    await visit(publicationId, { key: KEY(8), completionPct: 40, visibleMs: 100 });
    await visit(publicationId, { key: KEY(9), completionPct: 80, visibleMs: 100 });
    // 第三个人一行心跳都没留下（0%），他不该把平均值拉低、也不该被算进 over
    await visit(publicationId, { key: KEY(10), completionPct: 0, open: false, visibleMs: 0 });

    const { analytics } = (await publicationAnalytics(ownerId, publicationId))!;
    expect(analytics.completion).toEqual({ avgPct: 60, over: 2 });
    expect(analytics.visitors).toBe(3);
    expect(analytics.playTimeMs).toBe(200);
  });

  it('点赞与改编挂项目，不挂某一个版本；粉丝挂作者', async () => {
    const db = getDb();
    const first = await publish(`分析 挂项目${RUN}`);
    const second = await publish(`分析 挂项目${RUN}`);
    await db.insert(likes).values([
      { userId: otherId, projectId: first.projectId },
      { userId: ownerId, projectId: first.projectId },
    ]);
    await db.insert(follows).values({ followerId: otherId, followeeId: ownerId });
    const forked = (await createProject(otherId, { name: `分析 改编作品${RUN}`, kind: 'website' })).id;
    await db.insert(remixes).values({ sourceProjectId: first.projectId, forkedProjectId: forked, userId: otherId });

    const rows = await creatorAnalytics(ownerId);
    const a = rows.find((r) => r.publicationId === first.publicationId)!;
    const b = rows.find((r) => r.publicationId === second.publicationId)!;
    expect(a.analytics.likes).toBe(2);
    expect(a.analytics.remixes).toBe(1);
    // 作者级：两条作品行给的是同一个数，它不是"这一版被关注了"
    expect(a.analytics.followers).toBe(1);
    expect(b.analytics.followers).toBe(1);
    // 项目级：另一条作品的点赞与改编不会被 first 的数据污染
    expect(b.analytics.likes).toBe(0);
    expect(b.analytics.remixes).toBe(0);
  });

  it('views 是页面打开次数（含作者自己），今日打开次数来自新表', async () => {
    const { publicationId } = await publish(`分析 views${RUN}`);
    await recordView(publicationId);
    await recordView(publicationId);
    await visit(publicationId, { key: KEY(11), userId: ownerId, visibleMs: 100 });
    await visit(publicationId, { key: KEY(12), open: false, visibleMs: 100 });
    // 昨天的行只进总数，不进今日
    await visit(publicationId, { key: KEY(13), at: new Date('2020-01-01T00:00:00.000Z') });

    const { analytics } = (await publicationAnalytics(ownerId, publicationId))!;
    expect(analytics.views).toBe(2);
    expect(analytics.opensToday).toBe(1);
    expect(analytics.visitors).toBe(3);
    expect(utcDay(new Date('2020-01-01T16:00:00.000Z'))).toBe('2020-01-01');
    expect(analytics.visitorsToday).toBe(2);
  });

  it('只有作者自己看过：selfOnly 为真，来一个匿名访客就变假', async () => {
    const { publicationId } = await publish(`分析 selfOnly${RUN}`);
    await visit(publicationId, { key: KEY(14), userId: ownerId });
    expect((await publicationAnalytics(ownerId, publicationId))!.analytics.selfOnly).toBe(true);

    await visit(publicationId, { key: KEY(15) });
    expect((await publicationAnalytics(ownerId, publicationId))!.analytics.selfOnly).toBe(false);
  });

  it('截断痕迹按作品汇总，读的人知道这份数据被削过几次', async () => {
    const { publicationId } = await publish(`分析 capped 汇总${RUN}`);
    await visit(publicationId, { key: KEY(16), visibleMs: 600_000 });
    await visit(publicationId, { key: KEY(16), visibleMs: 120_000 });
    await visit(publicationId, { key: KEY(17), visibleMs: 1_000 });
    const { analytics } = (await publicationAnalytics(ownerId, publicationId))!;
    expect(analytics.cappedReports).toBe(2);
    expect(analytics.playTimeMs).toBe(121_000);
  });
});

describe('爬虫与真人区分（§168 第三片）', () => {
  it('只有爬虫来过：真人的格子一个都不涨，botOpens 另计；时长是 null 不是 0', async () => {
    const { publicationId } = await publish(`分析 纯爬虫${RUN}`);
    await visit(publicationId, { key: KEY(30), suspectedBot: true, visibleMs: 5_000, completionPct: 100 });
    const { analytics } = (await publicationAnalytics(ownerId, publicationId))!;
    expect(analytics.visitors).toBe(0);
    expect(analytics.opensToday).toBe(0);
    expect(analytics.playTimeMs).toBeNull(); // 没有真人的心跳 = 没采到，不是 0 秒
    expect(analytics.completion).toBeNull();
    expect(analytics.selfOnly).toBe(false); // 爬虫不是"你自己"
    expect(analytics.botOpens).toBe(1);
    expect(analytics.botVisitors).toBe(1);
  });

  it('真人和爬虫混着来：人的数是人的，爬虫的只进 botOpens', async () => {
    const { publicationId } = await publish(`分析 人爬混合${RUN}`);
    await visit(publicationId, { key: KEY(31), visibleMs: 1_000, completionPct: 40 });
    await visit(publicationId, { key: KEY(32), suspectedBot: true, visibleMs: 60_000, completionPct: 100 });
    await visit(publicationId, { key: KEY(33), suspectedBot: true, open: false, visibleMs: 60_000 });
    const { analytics } = (await publicationAnalytics(ownerId, publicationId))!;
    expect(analytics.visitors).toBe(1);
    expect(analytics.opensToday).toBe(1);
    expect(analytics.playTimeMs).toBe(1_000); // 爬虫那 12 万毫秒一滴都没混进来
    expect(analytics.completion).toEqual({ avgPct: 40, over: 1 });
    expect(analytics.botOpens).toBe(1); // KEY(32) 那次 open=true；KEY(33) 是心跳不算打开
    expect(analytics.botVisitors).toBe(2);
  });

  it('判定是粘的：同一个 key 先人后爬，整行按爬虫读——不给"刷成真人"留门', async () => {
    const { publicationId } = await publish(`分析 粘判定${RUN}`);
    await visit(publicationId, { key: KEY(34), visibleMs: 2_000, completionPct: 60 });
    expect((await publicationAnalytics(ownerId, publicationId))!.analytics.visitors).toBe(1);

    // 同一个 key 当天又来了，这次像爬虫：整行翻过去，人的数清零
    await visit(publicationId, { key: KEY(34), suspectedBot: true, open: false });
    const { analytics } = (await publicationAnalytics(ownerId, publicationId))!;
    expect(analytics.visitors).toBe(0);
    expect(analytics.playTimeMs).toBeNull();
    expect(analytics.botVisitors).toBe(1);
    // 反过来（先爬后人）不洗白——这一条由 SQL 的 or 保证，用例钉的是结果
    await visit(publicationId, { key: KEY(34), suspectedBot: false, open: false });
    expect((await publicationAnalytics(ownerId, publicationId))!.analytics.visitors).toBe(0);
  });
});

describe('所有权：看别人的数没有默认通道', () => {
  it('别人的 publicationId 查不出任何一行；换回作者本人立刻有', async () => {
    const { publicationId } = await publish(`分析 归属校验${RUN}`);
    await visit(publicationId, { key: KEY(18), visibleMs: 5000 });
    expect(await publicationAnalytics(otherId, publicationId)).toBeNull();
    expect(await creatorAnalytics(otherId)).toHaveLength(0);
    // 反向对照：数据确实在库里，只是不属于这个人的读取窗口
    const own = await publicationAnalytics(ownerId, publicationId);
    expect(own!.analytics.playTimeMs).toBe(5000);
  });

  it('项目软删后从创作者列表里消失，但发布记录本身还在', async () => {
    const db = getDb();
    const target = await publish(`分析 待删${RUN}`);
    const control = await publish(`分析 删除对照${RUN}`);
    await visit(target.publicationId, { key: KEY(19), visibleMs: 3000 });
    expect((await creatorAnalytics(ownerId)).map((r) => r.projectId)).toContain(target.projectId);

    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, target.projectId));
    const ids = (await creatorAnalytics(ownerId)).map((r) => r.projectId);
    expect(ids).not.toContain(target.projectId);
    expect(ids).toContain(control.projectId);
    // 反向：行还在 visits 表里，说明消失是读取窗口挡掉的，不是级联删的
    const orphan = await db
      .select({ n: rawSql<number>`count(*)` })
      .from(publicationVisits)
      .innerJoin(publishedProjects, eq(publishedProjects.id, publicationVisits.publicationId))
      .where(and(eq(publishedProjects.projectId, target.projectId)));
    expect(Number(orphan[0]!.n)).toBe(1);
  });
});
