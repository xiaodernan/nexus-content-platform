import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { notifyReportOutcome } from '../src/server/domain/marketplace-report-notify';
import { inbox, updateNotificationSetting } from '../src/server/domain/notifications';
import { getDb } from '../src/server/db/client';
import { notificationSettings, notifications, users } from '../src/server/db/schema';

/**
 * §123 × §164：工单进入终态时通知举报人一次。打真库。
 *
 * 路由层的接线由 `admin-marketplace.integration.test.ts` 钉（受理不写行、结案写一行）；
 * 这一片钉域层自己那几格路由用例问不到的行为：
 * **受理不算结论**（pending / reviewing 直接 skipped）、**重放不刷屏**（同一工单第二次是 duplicate）、
 * **关掉这一类就真的不写**（suppressed 之后连行都没有，重新打开才发）。
 *
 * 这几种结果必须分开报：`skipped` 是"这件事本来就不该出声"，`suppressed` 是"用户说了不想听"，
 * `duplicate` 是"同一件事已经说过一次"。三句合成一句"没发"的话，测试就只能测个寂寞。
 */

const RUN = `m163${Date.now().toString(36)}`;
const itemTitle = `雨夜素材包 ${RUN}`;
const reportResolved = crypto.randomUUID();
const reportDismissed = crypto.randomUUID();
const reportMuted = crypto.randomUUID();

let reporterId: string;

beforeAll(async () => {
  const [row] = await getDb()
    .insert(users)
    .values({ displayName: `举报人${RUN}`, email: `m163+${RUN}@nexus.test`, handle: `m163${RUN}` })
    .returning({ id: users.id });
  reporterId = row!.id;
});

afterAll(async () => {
  // users 上的外键是级联的，但通知与偏好是"我收到过什么"的物证，先按收件人收干净再删人
  await getDb().delete(notifications).where(eq(notifications.userId, reporterId));
  await getDb().delete(notificationSettings).where(eq(notificationSettings.userId, reporterId));
  await getDb().delete(users).where(eq(users.id, reporterId));
});

const rowsFor = (reportId: string) =>
  getDb()
    .select()
    .from(notifications)
    .where(eq(notifications.dedupeKey, `marketplace_report:${reportId}`));

describe('§123×§164 举报结论通知（受理不是结论，终态才出声）', () => {
  it('pending / reviewing 都是 skipped：一句"有人在看了"不该让举报人以为处理完了', async () => {
    expect(
      await notifyReportOutcome({ reporterId, reportId: reportResolved, itemTitle, status: 'pending' }),
    ).toBe('skipped');
    expect(
      await notifyReportOutcome({ reporterId, reportId: reportResolved, itemTitle, status: 'reviewing' }),
    ).toBe('skipped');
    expect(await rowsFor(reportResolved)).toHaveLength(0);
  });

  it('结案 → created：标题念出物品名、指回「我的举报」、正文说清结论不等于撤下物品', async () => {
    expect(
      await notifyReportOutcome({ reporterId, reportId: reportResolved, itemTitle, status: 'resolved' }),
    ).toBe('created');

    const rows = await rowsFor(reportResolved);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.userId).toBe(reporterId);
    expect(row.kind).toBe('marketplace_report');
    expect(row.title).toContain(itemTitle);
    expect(row.title).toContain('举报成立');
    expect(row.link).toBe('/marketplace/reports');
    expect(row.body).toContain('不会自动下架物品');
    // 没有"造成它的人"：审核员是按工单下结论，不是对举报人做了个动作
    expect(row.actorId).toBeNull();
    expect(row.readAt).toBeNull();
  });

  it('同一工单再通知一次 → duplicate，行数仍然是一：重放不把收件箱变成噪音', async () => {
    expect(
      await notifyReportOutcome({ reporterId, reportId: reportResolved, itemTitle, status: 'resolved' }),
    ).toBe('duplicate');
    expect(await rowsFor(reportResolved)).toHaveLength(1);
  });

  it('驳回也是一条结论：标题写"不成立：驳回"，与成立那句分开读', async () => {
    expect(
      await notifyReportOutcome({ reporterId, reportId: reportDismissed, itemTitle, status: 'dismissed' }),
    ).toBe('created');
    const row = (await rowsFor(reportDismissed))[0]!;
    expect(row.title).toContain('举报不成立');
    expect(row.title).toContain('驳回');
    expect(row.title).not.toContain('举报成立');
  });

  it('用户关掉「举报结论」这一类 → suppressed，连行都不写；重新打开后才发', async () => {
    await updateNotificationSetting(reporterId, 'marketplace_report', false);
    expect(
      await notifyReportOutcome({ reporterId, reportId: reportMuted, itemTitle, status: 'dismissed' }),
    ).toBe('suppressed');
    expect(await rowsFor(reportMuted)).toHaveLength(0);

    // 对照：重新打开后同一件事才写行——"没发"是这道开关挡的，不是数据没建起来
    await updateNotificationSetting(reporterId, 'marketplace_report', true);
    expect(
      await notifyReportOutcome({ reporterId, reportId: reportMuted, itemTitle, status: 'dismissed' }),
    ).toBe('created');
    expect(await rowsFor(reportMuted)).toHaveLength(1);
  });

  it('收件箱读得回：三张工单各一条（结案、驳回、静音对照补发），链接仍指得动', async () => {
    const page = await inbox(reporterId);
    const reports = page.items.filter((item) => item.kind === 'marketplace_report');
    // 静音那一张是另一个工单：关掉时零行，重新打开后才有——所以这里是三条而不是两条
    expect(reports).toHaveLength(3);
    expect(reports.filter((item) => item.title.includes('举报成立'))).toHaveLength(1);
    expect(reports.filter((item) => item.title.includes('举报不成立'))).toHaveLength(2);
    expect(reports.every((item) => item.link === '/marketplace/reports')).toBe(true);
    expect(reports.every((item) => item.unavailable === null)).toBe(true);
    expect(page.unread).toBe(3);
    expect(page.total).toBe(3);
  });
});
