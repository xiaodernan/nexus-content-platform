import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql as rawSql } from 'drizzle-orm';
import { creatorAnalytics, recordVisit } from '../src/server/domain/analytics';
import { createProject } from '../src/server/domain/projects';
import { getPublishedPage, publishProject, unpublishProject } from '../src/server/domain/publish';
import { findPublicPath } from '../src/server/domain/moderation';
import { publicWorksOf } from '../src/server/domain/profile';
import { searchPlatform } from '../src/server/domain/search';
import { getDb } from '../src/server/db/client';
import { auditEvents, projects, publicationVisits, users } from '../src/server/db/schema';

/**
 * §168：**取消发布不再把统计一起删掉**（ROADMAP 那条欠账的另一半）。
 *
 * 欠账原文：
 * > **取消发布会把这一版的统计一起删掉**——`unpublishProject` 删 `published_projects` 行，
 * > `publication_visits` 跟着 `ON DELETE CASCADE` ⇒ 要留历史得把粒度改成挂 project_id
 * > 或**让下架只改 visibility**。
 *
 * 这一格走的是欠账自己给出的第二个办法：**下架只改 visibility**。
 * 为什么它今天就可行：库里**每个项目只有一行发布行**（版本号在同一行上 +1），
 * 所以"访客现场"本来就是**跨版本累在那一行**上的 ⇒ 把"删行"改成"改可见性"，
 * 统计的粒度一点没变，变的只是那一行还在不在。
 *
 * 要钉的是四件事：
 * 1. **下架之后统计还在**（访客数、完成度那些数原样保留）；
 * 2. **下架之后它真的不公开了**：公开 URL 读不到、采集端点写不进来、
 *    搜索与主页都不列它（"看不见"与"没统计"是两件事，不能互相顶）；
 * 3. **重新发布接着算**（版本号往上走，统计不重置）；
 * 4. **作者自己仍看得见那一行**（分析页上标着"已停"）——作者要能看到自己作品的履历。
 */

const RUN = `s168un${Date.now().toString(36)}`;
const KEY = (n: number) => `${n}`.padStart(2, '0').repeat(16);

let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `下架作者${RUN}`, email: `un+${RUN}@nexus.test`, handle: `un${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function publish(name: string): Promise<{ projectId: string; publicationId: string; path: string }> {
  const projectId = (await createProject(ownerId, { name, kind: 'website' })).id;
  const result = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
  if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
  return { projectId, publicationId: result.publication.id, path: result.publication.path };
}

describe('§168 取消发布不再把统计一起删掉', () => {
  it('下架之后统计还在，而且那一行作者自己还看得见（标着"已停"）', async () => {
    const { projectId, publicationId, path } = await publish(`下架保留${RUN}`);
    await recordVisit({
      publicationId,
      visitorKey: KEY(1),
      userId: null,
      open: true,
      visibleMs: 5000,
      completionPct: 80,
    });
    const before = (await creatorAnalytics(ownerId)).find((row) => row.path === path)!;
    expect(before.analytics.visitors, '先确认这条真的有访客现场').toBe(1);

    expect(await unpublishProject(projectId, ownerId)).toBe(true);

    const after = (await creatorAnalytics(ownerId)).find((row) => row.path === path);
    expect(after, '下架之后那一行不该消失：作者要看得见自己作品的履历').toBeTruthy();
    expect(after!.analytics.visitors, '访客数被下架抹掉了吗').toBe(1);
    expect(after!.analytics.completion?.avgPct, '完成度也被抹掉了吗').toBe(80);
    expect(after!.visibility, '那一行标着"已停"（private）').toBe('private');
    // 库里的原始行也还在（不是聚合层硬撑出来的）
    const rows = await getDb()
      .select()
      .from(publicationVisits)
      .where(eq(publicationVisits.publicationId, publicationId));
    expect(rows, '访客现场那一行被级联删掉了').toHaveLength(1);
    // 撤下这一笔必须留痕（URL 从这一刻起 404，但"谁撤的"不能跟着消失）
    const audit = await getDb()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'publish.unpublish'), eq(auditEvents.actorId, ownerId)));
    expect(audit.length, '下架没有留痕').toBeGreaterThan(0);
  });

  it('下架之后它真的不公开了：URL 读不到、采集写不进来、搜索与主页都不列它', async () => {
    const { projectId, path } = await publish(`下架不公开${RUN}`);
    await unpublishProject(projectId, ownerId);

    expect(await getPublishedPage(path), '公开 URL 还读得到：下架没生效').toBeNull();
    expect(await findPublicPath(path), '采集端点还能认出这一版：下架后不该再记').toBeNull();

    const found = await searchPlatform(`下架不公开${RUN}`, null);
    const projectHits = found.groups.find((group) => group.key === 'projects')?.hits ?? [];
    expect(
      projectHits.map((hit) => hit.id),
      '搜索里还能搜到已下架的作品',
    ).not.toContain(projectId);

    const works = await publicWorksOf(ownerId);
    expect(
      works.map((card) => card.path),
      '主页上还有已下架的作品',
    ).not.toContain(path);
  });

  it('重新发布接着算：版本号往上走，统计不重置', async () => {
    const { projectId, publicationId, path } = await publish(`下架再发${RUN}`);
    await recordVisit({
      publicationId,
      visitorKey: KEY(2),
      userId: null,
      open: true,
      visibleMs: 3000,
      completionPct: 40,
    });
    await unpublishProject(projectId, ownerId);

    const again = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    expect(again && again.ok, '重新发布应该成功').toBeTruthy();
    if (!again || !again.ok) return;

    expect(again.publication.version, '版本号该往上走，而不是重置成 1').toBe(2);
    const row = (await creatorAnalytics(ownerId)).find((item) => item.path === path)!;
    expect(row.analytics.visitors, '重新发布把统计清零了：那是"换了一个作品"的错觉').toBe(1);
  });
});
