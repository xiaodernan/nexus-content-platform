import { raisePlan } from './support/test-plan';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql as rawSql } from 'drizzle-orm';
import { listSitemapEntries, publishProject, resolvePublishedPath, unpublishProject, type PublishedPage } from '../src/server/domain/publish';
import { buildPublishedSeo } from '../src/server/domain/seo';
import { createProject, softDeleteProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { auditEvents, projects, publishedProjects, users } from '../src/server/db/schema';

/**
 * §166 的读取端：sitemap 与公开页元数据。
 *
 * 打真库的理由很简单——"哪些发布该被爬虫看到"是**跨表的可见性判断**
 * （published_projects × projects × moderation × 软删除 × 快照存在），
 * 内存里拼不出来。这里也照 §165 那条纪律走：
 * 每条"不在清单里"都要有"同一份数据换个状态就在"的对照，
 * 否则分不清是被规则挡了，还是数据压根没建成。
 *
 * 只测读取端：`rejected` 是谁写进去的、怎么写，moderation 那套测试已经钉过。
 */

const RUN = `s166${Date.now().toString(36)}`;
const ORIGIN = 'https://nexus.test';
let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `SEO 作者${RUN}`, email: `seo+${RUN}@nexus.test`, handle: `seo${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  await raisePlan(ownerId);
});

afterAll(async () => {
  const db = getDb();
  // 审计行的 actorId 是 `onDelete: 'set null'`，不先清就会在下面删用户之后留下无主的行
  await db.delete(auditEvents).where(eq(auditEvents.actorId, ownerId));
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

/** 建一个能过门禁的项目并发布；visibility 由调用方给 */
async function publish(name: string, visibility: 'public' | 'unlisted'): Promise<PublishedPage & { publicationId: string }> {
  const projectId = (await createProject(ownerId, { name, kind: 'website' })).id;
  const result = await publishProject(projectId, { visibility, createdById: ownerId });
  if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
  const found = await resolvePublishedPath(result.publication.path);
  if (!found) throw new Error(`刚发布的 ${result.publication.path} 解析不出来`);
  return { ...found, publicationId: result.publication.id };
}

async function sitemapPaths(): Promise<string[]> {
  return (await listSitemapEntries(5000)).map((row) => row.path);
}

async function setDescription(projectId: string, description: string | null): Promise<void> {
  const db = getDb();
  await db.update(projects).set({ description }).where(eq(projects.id, projectId));
}

async function setModeration(publicationId: string, moderation: 'pending' | 'rejected'): Promise<void> {
  const db = getDb();
  await db.update(publishedProjects).set({ moderation }).where(eq(publishedProjects.id, publicationId));
}

/** 这一条用例自己造的审计行（按项目 + 放行与否取，避免读到别人留下的同名动作） */
async function auditRow(projectId: string, allowed: boolean): Promise<unknown> {
  const db = getDb();
  const [row] = await db
    .select({ action: auditEvents.action, allowed: auditEvents.allowed, detail: auditEvents.detail })
    .from(auditEvents)
    .where(and(eq(auditEvents.targetId, projectId), eq(auditEvents.action, 'project.delete'), eq(auditEvents.allowed, allowed)))
    .limit(1);
  return row ?? null;
}

describe('sitemap 与公开页元数据（真实数据库）', () => {
  it('public 进清单；unlisted 不进，同一次查询里互为对照', async () => {
    const listed = await publish(`SEO 公开${RUN}`, 'public');
    const hidden = await publish(`SEO 仅链接${RUN}`, 'unlisted');
    // 仅链接的那一条对访客仍然打得开——它只是不该出现在清单里
    expect(await resolvePublishedPath(hidden.publication.path)).not.toBeNull();

    const paths = await sitemapPaths();
    expect(paths).toContain(listed.publication.path);
    expect(paths).not.toContain(hidden.publication.path);
    expect(paths.filter((p) => p === listed.publication.path)).toHaveLength(1);
  });

  it('人工驳回的那一版从清单里消失，公开 URL 也一起失效', async () => {
    const target = await publish(`SEO 会被驳回${RUN}`, 'public');
    const control = await publish(`SEO 对照组${RUN}`, 'public');
    expect(await sitemapPaths()).toContain(target.publication.path);

    await setModeration(target.publicationId, 'rejected');
    const paths = await sitemapPaths();
    expect(paths).not.toContain(target.publication.path);
    // 反向对照：同一次查询里另一条 public 还在，说明不是查询整体空了
    expect(paths).toContain(control.publication.path);
    expect(await resolvePublishedPath(target.publication.path)).toBeNull();
  });

  it('项目删除后不再出现在清单里（走的是真删除那条路：确认名不对就不该收手）', async () => {
    const name = `SEO 待删除${RUN}`;
    const target = await publish(name, 'public');
    const control = await publish(`SEO 删除对照${RUN}`, 'public');
    expect(await sitemapPaths()).toContain(target.publication.path);

    /**
     * 这一条以前是直接 `UPDATE projects SET deleted_at`，标题写着"软删这列目前没有写入方"。
     * 那句已经过期：`softDeleteProject` 是它的第一个写入方。绕过域函数写列，测到的是
     * "读取端认得这一列"，而产品里根本没有"绕过域函数"的那条路——真删项目时如果确认门、
     * 归属门或审计哪一段坏了，这条用例照样绿。所以改成走真那一步，并且先演一次"没删成"。
     */
    const refused = await softDeleteProject(ownerId, target.publication.projectId, '名字打错了');
    expect(refused).toEqual({ ok: false, code: 'approval_required' });
    const stillThere = await sitemapPaths();
    expect(stillThere).toContain(target.publication.path);
    expect(await resolvePublishedPath(target.publication.path)).not.toBeNull();
    expect(await auditRow(target.publication.projectId, false)).toMatchObject({
      action: 'project.delete',
      detail: { reason: 'confirm_mismatch' },
    });

    const deleted = await softDeleteProject(ownerId, target.publication.projectId, name);
    expect(deleted).toEqual({ ok: true, name });
    const paths = await sitemapPaths();
    expect(paths).not.toContain(target.publication.path);
    // 反向对照：同一次查询里另一个人的项目还在，说明不是查询整体空了
    expect(paths).toContain(control.publication.path);
    expect(await resolvePublishedPath(target.publication.path)).toBeNull();
    expect(await auditRow(target.publication.projectId, true)).toMatchObject({ action: 'project.delete' });
  });

  it('取消发布：清单与 URL 同时收手，lastmod 用的是真实发布时间', async () => {
    const target = await publish(`SEO 待下线${RUN}`, 'public');
    const rows = await listSitemapEntries(5000);
    const row = rows.find((r) => r.path === target.publication.path);
    expect(row?.publishedAt).toBeInstanceOf(Date);
    // lastmod 必须等于那一版的 publishedAt，不是"刚刚渲染过一次"
    expect(row?.publishedAt.getTime()).toBe(new Date(target.publication.publishedAt).getTime());

    await unpublishProject(target.publication.projectId);
    expect(await sitemapPaths()).not.toContain(target.publication.path);
    expect(await resolvePublishedPath(target.publication.path)).toBeNull();
  });

  it('resolvePublishedPath 把描述与 handle 一起交给渲染层', async () => {
    const db = getDb();
    const target = await publish(`SEO 有描述${RUN}`, 'public');
    expect(target.description).toBeNull();
    expect(target.ownerHandle).toBe(`seo${RUN}`);

    await setDescription(target.publication.projectId, '一间只在深夜出现的便利店。');
    const found = await resolvePublishedPath(target.publication.path);
    expect(found?.description).toBe('一间只在深夜出现的便利店。');
    expect(found?.ownerName).toBe(`SEO 作者${RUN}`);
    expect(found?.projectName).toBe(`SEO 有描述${RUN}`);
    const ownerRow = await db
      .select({ handle: users.handle })
      .from(users)
      .where(eq(users.id, ownerId))
      .limit(1);
    expect(found?.ownerHandle).toBe(ownerRow[0]!.handle);
  });

  it('元数据吃的是真数据：og:url 用真实 path，收录开关随可见性变', async () => {
    const listed = await publish(`SEO 元数据公开${RUN}`, 'public');
    const hidden = await publish(`SEO 元数据仅链接${RUN}`, 'unlisted');
    await setDescription(listed.publication.projectId, '把这一句放进描述。');
    // 描述是发布之后才写的：重新解析一次，拿到的才是当前那一行（快照本身不受影响）
    const listedNow = await resolvePublishedPath(listed.publication.path);
    if (!listedNow) throw new Error('公开页解析不出来');

    const publicSeo = buildPublishedSeo(listedNow, ORIGIN);
    expect(publicSeo.metadata.title).toBe(`SEO 元数据公开${RUN} · SEO 作者${RUN}`);
    expect(publicSeo.metadata.description).toBe('把这一句放进描述。');
    expect(publicSeo.metadata.openGraph?.url).toBe(`${ORIGIN}${listed.publication.path}`);
    expect((publicSeo.metadata.robots as { index?: boolean }).index).toBe(true);
    // 没有上传图片的公开作品：宁可不给封面，也不放一张取不到字节的占位图
    expect(publicSeo.metadata.openGraph?.images).toBeUndefined();
    expect(publicSeo.omitted.join('')).toContain('不放占位图');

    const unlistedSeo = buildPublishedSeo(hidden, ORIGIN);
    expect((unlistedSeo.metadata.robots as { index?: boolean }).index).toBe(false);
    // 描述列是空的：这时用这一版自己的文字，而不是兜底模板句
    expect(unlistedSeo.metadata.description).not.toContain('公开快照。');
    expect((unlistedSeo.metadata.description ?? '').length).toBeGreaterThan(0);

    const data = JSON.parse(unlistedSeo.jsonLd) as { author: { url?: string }; url?: string };
    expect(data.url).toBe(`${ORIGIN}${hidden.publication.path}`);
    expect(data.author.url).toBe(`${ORIGIN}/u/seo${RUN}`);
  });
});
