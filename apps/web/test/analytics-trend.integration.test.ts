import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createProject } from '../src/server/domain/projects';
import { publishProject } from '../src/server/domain/publish';
import { creatorOverview, dayWindow, publicationTrend, recordVisit } from '../src/server/domain/analytics';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * §168 第二片：按天曲线与跨作品总览，打真库。
 *
 * 这一片要钉的是**窗口口径**，而窗口口径最容易在三个地方变成谎话：
 * 1. 缺的那天被跳过（曲线看着像"天天都有人来"）；
 * 2. 把每天的人数加起来当"窗口内访客"（同一个人来三天被数成三个人）；
 * 3. 把"这一天一条心跳都没有"显示成 0 秒（那是"来过但没攒够时长"，两件事）。
 *
 * 窗口两端由参数给死（`dayWindow(today, n)`），所以这一份不依赖运行时的当前时间——
 * 唯一读时钟的地方在那条"窗口最后一天没有活动时连续天数归零"的用例里，它自己指定了"今天"。
 */

const RUN = `t168${Date.now().toString(36)}`;
/** 32 位十六进制的匿名访客 key（写入侧有格式校验，短一个字符就会被丢掉） */
const KEY = (n: number) => `${n}`.padStart(2, '0').repeat(16);

let ownerId: string;
let otherId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `曲线作者${RUN}`, email: `tr+${RUN}@nexus.test`, handle: `tr${RUN}` })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({ displayName: `曲线路人${RUN}`, email: `tx+${RUN}@nexus.test`, handle: `tx${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  otherId = other!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, otherId]));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

async function publishFor(userId: string, name: string): Promise<{ projectId: string; publicationId: string }> {
  const projectId = (await createProject(userId, { name, kind: 'website' })).id;
  const result = await publishProject(projectId, { visibility: 'public', createdById: userId });
  if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
  return { projectId, publicationId: result.publication.id };
}

/** `at` 只给"哪一天"：这一片论的是 UTC 日，同一天几点几分不影响任何断言 */
async function visit(
  publicationId: string,
  over: {
    day: string;
    key?: string;
    open?: boolean;
    visibleMs?: number;
    completionPct?: number;
    userId?: string | null;
    suspectedBot?: boolean;
  },
): Promise<void> {
  const result = await recordVisit({
    publicationId,
    visitorKey: over.key ?? KEY(1),
    userId: over.userId ?? null,
    open: over.open ?? true,
    visibleMs: over.visibleMs ?? 1000,
    completionPct: over.completionPct ?? 50,
    suspectedBot: over.suspectedBot,
    at: new Date(`${over.day}T09:00:00.000Z`),
  });
  // key 不合法会被静默丢掉（那是写入侧另一条用例的事），这里必须确认数据真的进去了
  expect(result).toBe('recorded');
}

function pointOf(days: { day: string }[], day: string) {
  const found = days.find((point) => point.day === day);
  if (!found) throw new Error(`窗口里没有 ${day} 这一天（曲线必须是日期密集的）`);
  return found as { day: string; opens: number; visitors: number; playTimeMs: number | null };
}

describe('窗口的算术（纯函数，不碰库）', () => {
  it('闭区间：7 天窗口的最后一天是"今天"，第一天是六天前', () => {
    expect(dayWindow('2026-03-01', 7)).toEqual({ from: '2026-02-23', to: '2026-03-01' });
  });

  it('闰年二月照常往前数，不做"每月 30 天"这种近似', () => {
    expect(dayWindow('2024-03-01', 3)).toEqual({ from: '2024-02-28', to: '2024-03-01' });
  });

  it('天数被夹在 1..365：0 天不是"空窗口"，1000 天也不是十年', () => {
    expect(dayWindow('2026-01-10', 0)).toEqual({ from: '2026-01-10', to: '2026-01-10' });
    const capped = dayWindow('2026-01-10', 1000);
    const spanDays = (Date.parse(`${capped.to}T00:00:00.000Z`) - Date.parse(`${capped.from}T00:00:00.000Z`)) / 86_400_000 + 1;
    expect(spanDays).toBe(365);
  });
});

describe('按天曲线（真库）', () => {
  it('缺的那天补成 0，不跳过；但"一条心跳都没有"那天的时长是 null 不是 0', async () => {
    const { publicationId } = await publishFor(ownerId, `曲线 补零${RUN}`);
    const window = dayWindow('2026-05-10', 7); // 2026-05-04 .. 2026-05-10
    await visit(publicationId, { day: '2026-05-04', visibleMs: 2000 });
    await visit(publicationId, { day: '2026-05-10', visibleMs: 3000 });

    const overview = await creatorOverview(ownerId, window);
    // 只采到 2 天，但窗口里必须有 7 个点——跳过去会把"中间五天没人来"画成连续有人来
    expect(overview.days.map((point) => point.day)).toEqual([
      '2026-05-04',
      '2026-05-05',
      '2026-05-06',
      '2026-05-07',
      '2026-05-08',
      '2026-05-09',
      '2026-05-10',
    ]);
    expect(pointOf(overview.days, '2026-05-06')).toMatchObject({ opens: 0, visitors: 0, playTimeMs: null });
    expect(pointOf(overview.days, '2026-05-10').playTimeMs).toBe(3000);
    expect(overview.totals.activeDays).toBe(2);
    expect(overview.totals.playTimeMs).toBe(5000);
  });

  it('窗口两端都算，两端之外的那一行不算；把窗口放宽一天它就进来了（反向对照）', async () => {
    const { publicationId } = await publishFor(ownerId, `曲线 边界${RUN}`);
    // 这一段用 4 月：总览是**名下所有作品合在一起**的，撞上别条用例的日期就会把它的行也数进来
    await visit(publicationId, { day: '2026-04-03' }); // 窗口前一天
    await visit(publicationId, { day: '2026-04-04' }); // 窗口第一天
    await visit(publicationId, { day: '2026-04-10' }); // 窗口最后一天
    await visit(publicationId, { day: '2026-04-11' }); // 窗口后一天

    const tight = await creatorOverview(ownerId, dayWindow('2026-04-10', 7));
    expect(pointOf(tight.days, '2026-04-04').opens).toBe(1);
    expect(pointOf(tight.days, '2026-04-10').opens).toBe(1);
    // 两端的都算进去了，另外两天一行都不在里面
    expect(tight.days.reduce((sum, point) => sum + point.opens, 0)).toBe(2);

    const wide = await creatorOverview(ownerId, dayWindow('2026-04-11', 9)); // 2026-04-03 .. 2026-04-11
    expect(wide.days.reduce((sum, point) => sum + point.opens, 0)).toBe(4);
  });

  it('窗口内的访客跨天去重：同一个人来三天仍是一个人，而曲线上是三个"人·天"', async () => {
    const { publicationId } = await publishFor(ownerId, `曲线 去重${RUN}`);
    const window = dayWindow('2026-06-07', 7);
    await visit(publicationId, { day: '2026-06-05', key: KEY(7) });
    await visit(publicationId, { day: '2026-06-06', key: KEY(7) });
    await visit(publicationId, { day: '2026-06-07', key: KEY(7) });

    const overview = await creatorOverview(ownerId, window);
    expect(overview.totals.visitors).toBe(1);
    // 反向对照：把每天的人数相加是 3，而这个数在界面上叫"有多少人来看过"，是错的那个
    expect(overview.days.reduce((sum, point) => sum + point.visitors, 0)).toBe(3);
    expect(pointOf(overview.days, '2026-06-06').visitors).toBe(1);
  });

  it('有行但加出来是 0 秒时报 0，不报"未采集"', async () => {
    const { publicationId } = await publishFor(ownerId, `曲线 零秒${RUN}`);
    const window = dayWindow('2026-07-02', 3);
    await visit(publicationId, { day: '2026-07-02', visibleMs: 0 });

    const overview = await creatorOverview(ownerId, window);
    expect(pointOf(overview.days, '2026-07-02').playTimeMs).toBe(0);
    expect(pointOf(overview.days, '2026-07-01').playTimeMs).toBeNull();
    expect(overview.totals.playTimeMs).toBe(0);
  });

  it('完成度按行加权：三天里一行 100% 加三行 20%，是 40% 不是 60%', async () => {
    const { publicationId } = await publishFor(ownerId, `曲线 加权${RUN}`);
    const window = dayWindow('2026-08-02', 3);
    await visit(publicationId, { day: '2026-08-01', key: KEY(1), completionPct: 100 });
    await visit(publicationId, { day: '2026-08-02', key: KEY(2), completionPct: 20 });
    await visit(publicationId, { day: '2026-08-02', key: KEY(3), completionPct: 20 });
    await visit(publicationId, { day: '2026-08-02', key: KEY(4), completionPct: 20 });

    const overview = await creatorOverview(ownerId, window);
    // (100 + 20 + 20 + 20) / 4 = 40；"每天先平均再平均"会得到 (100 + 20) / 2 = 60
    expect(overview.totals.completionPct).toBe(40);
    expect(overview.totals.completionPct).not.toBe(60);
    expect(overview.totals.completionOver).toBe(4);
  });

  it('连续有人来看的是窗口末尾：最后一天没人来就是 0', async () => {
    const { publicationId } = await publishFor(ownerId, `曲线 连续${RUN}`);
    await visit(publicationId, { day: '2026-09-04' });
    await visit(publicationId, { day: '2026-09-05' });

    const endingToday = await creatorOverview(ownerId, dayWindow('2026-09-05', 5));
    expect(endingToday.streakDays).toBe(2);

    // 同一份数据，窗口只往后挪一天：最后一天没有任何心跳，连续天数必须归零
    const endingTomorrow = await creatorOverview(ownerId, dayWindow('2026-09-06', 5));
    expect(endingTomorrow.streakDays).toBe(0);
    expect(endingTomorrow.totals.opens).toBe(2);
  });

  it('爬虫不进曲线也不续连续天数：窗口里的 botOpens 另计（§168 第三片）', async () => {
    const { publicationId } = await publishFor(ownerId, `曲线 爬虫${RUN}`);
    const window = dayWindow('2026-12-03', 3); // 2026-12-01 .. 2026-12-03
    // 窗口最后一天真人来过；前一天只有爬虫
    await visit(publicationId, { day: '2026-12-02', key: KEY(41), suspectedBot: true, visibleMs: 60_000 });
    await visit(publicationId, { day: '2026-12-03', key: KEY(40), suspectedBot: false });

    const overview = await creatorOverview(ownerId, window);
    // 曲线：2 号那天是空的（0），不是被爬虫撑起来的"有人来"
    expect(pointOf(overview.days, '2026-12-02')).toMatchObject({ opens: 0, visitors: 0, playTimeMs: null });
    // 连续天数止于真人来的那天——爬虫不算"有人来"
    expect(overview.streakDays).toBe(1);
    // 人的汇总不含爬虫；爬虫的打开次数在自己的格子里
    expect(overview.totals.opens).toBe(1);
    expect(overview.totals.visitors).toBe(1);
    expect(overview.totals.botOpens).toBe(1);
    // 单件曲线同一口径
    const trend = (await publicationTrend(ownerId, publicationId, window))!;
    expect(trend.totals.botOpens).toBe(1);
    expect(trend.totals.opens).toBe(1);
  });
});

describe('跨作品总览（真库）', () => {
  it('只数自己的作品：别人的访问不进这一份，软删的项目也不进', async () => {
    const mine = await publishFor(ownerId, `总览 我的${RUN}`);
    const hidden = await publishFor(ownerId, `总览 软删${RUN}`);
    const others = await publishFor(otherId, `总览 别人的${RUN}`);
    const window = dayWindow('2026-10-03', 3);
    await visit(mine.publicationId, { day: '2026-10-03', key: KEY(1) });
    await visit(hidden.publicationId, { day: '2026-10-03', key: KEY(2) });
    await visit(others.publicationId, { day: '2026-10-03', key: KEY(3) });

    // 同一个账号名下还有别条用例建的作品，所以这里断言的是**增量**而不是绝对数——
    // 绝对数会把"这条用例漏算了一件作品"和"别的用例多建了一件"混成同一个信号
    const withAll = await creatorOverview(ownerId, window);
    expect(withAll.totals.opens).toBe(2);
    expect(withAll.totals.visitors).toBe(2);

    // 软删之后它的行不再进总览——与列表那一侧同一个谓词
    await getDb().update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, hidden.projectId));
    const after = await creatorOverview(ownerId, window);
    expect(after.publications).toBe(withAll.publications - 1);
    expect(after.totals.opens).toBe(1);
    // 反向对照：恢复之后那一行原样回来，不是"删过一次就永久少一个"
    await getDb().update(projects).set({ deletedAt: null }).where(eq(projects.id, hidden.projectId));
    const restored = await creatorOverview(ownerId, window);
    expect(restored.publications).toBe(withAll.publications);
    expect(restored.totals.opens).toBe(2);
  });
});

describe('单个作品的曲线（真库）', () => {
  it('不是自己的作品读不到——与"不存在"给同一个答案', async () => {
    const mine = await publishFor(ownerId, `单件 我的${RUN}`);
    const window = dayWindow('2026-11-05', 3);
    await visit(mine.publicationId, { day: '2026-11-05', key: KEY(5) });

    const ok = await publicationTrend(ownerId, mine.publicationId, window);
    expect(ok?.days).toHaveLength(3);
    expect(ok?.totals.visitors).toBe(1);
    expect(ok?.streakDays).toBe(1);

    expect(await publicationTrend(otherId, mine.publicationId, window)).toBeNull();
    expect(await publicationTrend(ownerId, randomUUID(), window)).toBeNull();
  });
});
