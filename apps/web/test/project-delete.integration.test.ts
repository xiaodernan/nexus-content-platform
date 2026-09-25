import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { ProjectDeleteRequestSchema } from '@nexus/schemas';
import { createProject, listDeletedProjects, listProjects, projectBelongsTo, restoreProject, softDeleteProject } from '../src/server/domain/projects';
import { listSitemapEntries, publishProject, resolvePublishedPath } from '../src/server/domain/publish';
import { creatorAnalytics } from '../src/server/domain/analytics';
import { discover, publicRefByPath } from '../src/server/domain/social';
import { publicWorksOf } from '../src/server/domain/profile';
import { searchPlatform } from '../src/server/domain/search';
import { emit, inbox } from '../src/server/domain/notifications';
import { getDb } from '../src/server/db/client';
import { auditEvents, projects, publishedProjects, snapshots, users } from '../src/server/db/schema';

/**
 * §74 删除项目：审批门 + `projects.deletedAt` 的第一个写入方。
 *
 * 这个文件主要钉两件事。
 * 一是**审批真的挡在写入之前**：确认词打错时库里的 `deleted_at` 必须还是 null，
 * 只多出一行 `allowed:false` 的审计——否则"审批"就只是界面上的一句提示。
 * 二是**软删的语义是完整的**：近二十处读取谓词从今天起才有东西可挡（列表 / 搜索 / 发现 /
 * 公开页 / 创作数据 / 个人主页），而快照与发布行必须还在，恢复后原样回来。
 * 后半句是"软删"这个选择的全部理由，所以它得是可证的，不是注释里的承诺。
 *
 * 每条否定断言都在同一份数据上配一个换个状态就成立的对照（§165 起立的纪律）。
 */

const RUN = `s74${Date.now().toString(36)}`;
let ownerId: string;
let otherId: string;
const created: string[] = [];

async function newProject(name: string): Promise<string> {
  const doc = await createProject(ownerId, { name, kind: 'website' });
  created.push(doc.id);
  return doc.id;
}

/** 直接读那一行，绕开所有谓词——"删掉了没有"最终要看的是 deleted_at 本身 */
async function deletedAtOf(projectId: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ deletedAt: projects.deletedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row?.deletedAt ?? null;
}

async function auditRows(action: string, projectId: string) {
  return getDb()
    .select({ allowed: auditEvents.allowed, detail: auditEvents.detail })
    .from(auditEvents)
    .where(and(eq(auditEvents.action, action), eq(auditEvents.targetId, projectId)));
}

async function publish(name: string): Promise<{ projectId: string; path: string; publicationId: string }> {
  const projectId = await newProject(name);
  const result = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
  if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
  return { projectId, path: result.publication.path, publicationId: result.publication.id };
}

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `删除作者${RUN}`, email: `s74o+${RUN}@nexus.test`, handle: `s74${RUN}` })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({ displayName: `删除路人${RUN}`, email: `s74a+${RUN}@nexus.test`, handle: `s74a${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  otherId = other!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.id, created));
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

describe('报文层：什么样的确认词算作了数', () => {
  it('没有 confirm、空串、纯空白都不合法——什么都不填就删项目正是这一条要挡的', () => {
    expect(ProjectDeleteRequestSchema.safeParse({}).success).toBe(false);
    expect(ProjectDeleteRequestSchema.safeParse({ confirm: '' }).success).toBe(false);
    expect(ProjectDeleteRequestSchema.safeParse({ confirm: '   ' }).success).toBe(false);
    // 对照：正常的名字过
    expect(ProjectDeleteRequestSchema.safeParse({ confirm: '雨中的王城' }).success).toBe(true);
  });

  it('首尾空白会被去掉；2000 字以内过，多一个字就拒（宁可拒也不给一个删不掉的项目）', () => {
    const trimmed = ProjectDeleteRequestSchema.safeParse({ confirm: '  雨中的王城  ' });
    expect(trimmed.success).toBe(true);
    if (trimmed.success) expect(trimmed.data.confirm).toBe('雨中的王城');

    expect(ProjectDeleteRequestSchema.safeParse({ confirm: '城'.repeat(2000) }).success).toBe(true);
    expect(ProjectDeleteRequestSchema.safeParse({ confirm: '城'.repeat(2001) }).success).toBe(false);
  });
});

describe('审批门：打错字就一条都不写', () => {
  it('确认词不匹配时库里没动，只留下一行 allowed:false 的审计', async () => {
    const projectId = await newProject(`审批门${RUN}`);
    const result = await softDeleteProject(ownerId, projectId, `审批门${RUN} 的隔壁`);
    expect(result).toEqual({ ok: false, code: 'approval_required' });
    expect(await deletedAtOf(projectId)).toBeNull();
    expect((await listProjects(ownerId)).some((p) => p.id === projectId)).toBe(true);
    const rejected = await auditRows('project.delete', projectId);
    expect(rejected.filter((r) => !r.allowed)).toHaveLength(1);
    expect(rejected.filter((r) => r.allowed)).toHaveLength(0);

    // 反向对照：同一处调用换成逐字的项目名，这次真的删掉了
    const ok = await softDeleteProject(ownerId, projectId, `审批门${RUN}`);
    expect(ok.ok).toBe(true);
    expect(await deletedAtOf(projectId)).not.toBeNull();
    const after = await auditRows('project.delete', projectId);
    expect(after.filter((r) => r.allowed)).toHaveLength(1);
  });

  it('逐字匹配但两端带空格照样算——界面上手滑多打一个空格不该变成"你不批准"', async () => {
    const projectId = await newProject(`空格容差${RUN}`);
    const result = await softDeleteProject(ownerId, projectId, `  空格容差${RUN}  `);
    expect(result.ok).toBe(true);
    // 对照：大小写不同不是"手滑"，是另一个名字
    const other = await newProject(`Another Name ${RUN}`);
    expect(await softDeleteProject(ownerId, other, `another name ${RUN}`)).toEqual({ ok: false, code: 'approval_required' });
  });

  it('别人的项目与不存在的项目是同一个答案，而且别人的项目一个字都没变', async () => {
    const projectId = await newProject(`别人的项目${RUN}`);
    // 拿对了确认词也没用：审批不能替所有权开门
    expect(await softDeleteProject(otherId, projectId, `别人的项目${RUN}`)).toEqual({ ok: false, code: 'not_found' });
    expect(await deletedAtOf(projectId)).toBeNull();

    const ghost = '00000000-0000-4000-8000-000000000000';
    expect(await softDeleteProject(ownerId, ghost, ghost)).toEqual({ ok: false, code: 'not_found' });

    // 反向对照：同一个人删自己的，成功
    expect((await softDeleteProject(ownerId, projectId, `别人的项目${RUN}`)).ok).toBe(true);
  });

  it('删第二次不是"又删了一次"：已经不在的项目就是不在', async () => {
    const projectId = await newProject(`重复删除${RUN}`);
    expect((await softDeleteProject(ownerId, projectId, `重复删除${RUN}`)).ok).toBe(true);
    expect(await softDeleteProject(ownerId, projectId, `重复删除${RUN}`)).toEqual({ ok: false, code: 'not_found' });
    // 对照：恢复之后同一次调用又成立，说明 not_found 判的是 deletedAt 而不是别的
    expect(await restoreProject(ownerId, projectId)).not.toBeNull();
    expect((await softDeleteProject(ownerId, projectId, `重复删除${RUN}`)).ok).toBe(true);
  });
});

describe('删除之后，哪些面再也看不到它', () => {
  it('项目列表与 Studio 归属都收掉；回收站接住它（对照：恢复后两边都翻回来）', async () => {
    const projectId = await newProject(`回收站${RUN}`);
    expect(await projectBelongsTo(projectId, ownerId)).toBe(true);

    expect((await softDeleteProject(ownerId, projectId, `回收站${RUN}`)).ok).toBe(true);
    expect((await listProjects(ownerId)).some((p) => p.id === projectId)).toBe(false);
    expect(await projectBelongsTo(projectId, ownerId)).toBe(false);
    const trash = await listDeletedProjects(ownerId);
    expect(trash.map((t) => t.id)).toContain(projectId);
    expect(trash.find((t) => t.id === projectId)?.name).toBe(`回收站${RUN}`);

    expect(await restoreProject(ownerId, projectId)).toEqual({ name: `回收站${RUN}` });
    expect((await listProjects(ownerId)).some((p) => p.id === projectId)).toBe(true);
    expect(await projectBelongsTo(projectId, ownerId)).toBe(true);
    expect((await listDeletedProjects(ownerId)).map((t) => t.id)).not.toContain(projectId);
  });

  it('别人的回收站看不到我的项目，恢复也恢复不了（回收站按人隔离）', async () => {
    const projectId = await newProject(`他人回收站${RUN}`);
    expect((await softDeleteProject(ownerId, projectId, `他人回收站${RUN}`)).ok).toBe(true);
    expect((await listDeletedProjects(otherId)).map((t) => t.id)).not.toContain(projectId);
    expect(await restoreProject(otherId, projectId)).toBeNull();
    // 对照：还在我的回收站里，没被别人动走
    expect((await listDeletedProjects(ownerId)).map((t) => t.id)).toContain(projectId);
    expect(await restoreProject(ownerId, projectId)).not.toBeNull();
  });

  it('没删过的项目不能"恢复"——那会是一句假的已恢复', async () => {
    const projectId = await newProject(`没删过${RUN}`);
    expect(await restoreProject(ownerId, projectId)).toBeNull();
    expect(await deletedAtOf(projectId)).toBeNull();
  });

  it('§165 搜索：删掉的项目不再命中它的名字', async () => {
    const name = `搜索删除对照${RUN}`;
    const projectId = await newProject(name);
    const hits = async () => {
      const results = await searchPlatform(name, ownerId);
      return (results.groups.find((g) => g.key === 'projects')?.hits ?? []).map((h) => h.id);
    };
    expect(await hits()).toContain(projectId);
    expect((await softDeleteProject(ownerId, projectId, name)).ok).toBe(true);
    expect(await hits()).not.toContain(projectId);
  });

  it('§61 发现与个人主页：公开着的项目一删就从两边消失', async () => {
    const { projectId, path, publicationId } = await publish(`发现删除${RUN}`);
    const inDiscover = async () => (await discover({ sort: 'new', viewerId: null, limit: 60 })).cards.some((c) => c.publicationId === publicationId);
    // 认 publicationId 而不是 projectId：DiscoverCard 这个形状上没有 projectId 字段，
    // 拿它去比会永远得到 false——一条永远为假的对照等于没有对照
    const inProfile = async () => (await publicWorksOf(ownerId)).some((c) => c.publicationId === publicationId);

    expect(await inDiscover()).toBe(true);
    expect(await inProfile()).toBe(true);
    expect((await softDeleteProject(ownerId, projectId, `发现删除${RUN}`)).ok).toBe(true);
    expect(await inDiscover()).toBe(false);
    expect(await inProfile()).toBe(false);

    // 对照：恢复后两边都回来，靠的是同一行 deleted_at 翻回 null
    expect(await restoreProject(ownerId, projectId)).not.toBeNull();
    expect(await inDiscover()).toBe(true);
    expect(await inProfile()).toBe(true);
    expect(path.startsWith('/n/')).toBe(true);
  });

  it('§57 公开页：URL 从这一秒打不开，但发布行与快照都还在', async () => {
    const name = `公开页删除${RUN}`;
    const { projectId, path } = await publish(name);
    expect(await resolvePublishedPath(path)).not.toBeNull();
    expect(await publicRefByPath(path)).not.toBeNull();
    const snapshotCount = async () => (await getDb().select({ id: snapshots.id }).from(snapshots).where(eq(snapshots.projectId, projectId))).length;
    const inSitemap = async () => (await listSitemapEntries()).some((e) => e.path === path);
    expect(await inSitemap()).toBe(true);
    const [publicationBefore] = await getDb()
      .select({ id: publishedProjects.id })
      .from(publishedProjects)
      .where(eq(publishedProjects.projectId, projectId));
    const before = await snapshotCount();
    expect(before).toBeGreaterThan(0);

    expect((await softDeleteProject(ownerId, projectId, name)).ok).toBe(true);
    expect(await resolvePublishedPath(path)).toBeNull();
    // §166 的 sitemap 谓词以前只是"防御性"的，因为没人能填 deleted_at；现在它是可测的
    expect(await inSitemap()).toBe(false);
    // 互动接口认的是 publicRefByPath，不是页面那条：两边都得挡，否则就是
    // "页面已经 404，但点赞/评论/改编还在替一个作者已经删掉的项目收写"
    expect(await publicRefByPath(path)).toBeNull();
    // 行没被删：这是"软"字的全部意义，也是恢复能带回公开页的原因
    expect(await snapshotCount()).toBe(before);
    const [publicationAfter] = await getDb()
      .select({ id: publishedProjects.id })
      .from(publishedProjects)
      .where(eq(publishedProjects.projectId, projectId));
    expect(publicationAfter?.id).toBe(publicationBefore?.id);

    // 对照：恢复之后同一条 URL、同一个互动接口与 sitemap 那一行都回到原来的答案
    expect(await restoreProject(ownerId, projectId)).not.toBeNull();
    expect(await resolvePublishedPath(path)).not.toBeNull();
    expect(await publicRefByPath(path)).not.toBeNull();
    expect(await inSitemap()).toBe(true);
  });

  it('§168 创作数据：名下不再数这一条版本', async () => {
    const name = `分析删除${RUN}`;
    const { projectId, publicationId } = await publish(name);
    const rows = async () => (await creatorAnalytics(ownerId)).map((r) => r.publicationId);
    expect(await rows()).toContain(publicationId);
    expect((await softDeleteProject(ownerId, projectId, name)).ok).toBe(true);
    expect(await rows()).not.toContain(publicationId);
  });

  it('§164 收件箱：指向已删项目的历史通知留着，但链接收走、理由写出来', async () => {
    const name = `收件箱删除${RUN}`;
    const { projectId, path, publicationId } = await publish(name);
    expect(
      await emit({
        kind: 'like',
        recipientId: ownerId,
        actorId: otherId,
        actorName: `点赞路人${RUN}`,
        projectId,
        publicationId,
        path,
        projectName: name,
      }),
    ).toBe('created');
    const item = async () => (await inbox(ownerId)).items.find((i) => i.kind === 'like' && i.title.includes(name));
    expect((await item())?.link).toBe(path);
    expect((await item())?.unavailable).toBeNull();

    expect((await softDeleteProject(ownerId, projectId, name)).ok).toBe(true);
    // 通知行不删：那是作者的事件历史，删掉等于替他把"有人赞过"这段记忆也抹了。
    // 但链接必须收走并说明原因——一个点开就 404 的铃铛和一个什么都不说的铃铛，
    // 是同一件事的两种说谎方式。
    expect((await item())?.link).toBeNull();
    expect((await item())?.unavailable).toContain('项目已经不存在');

    // 对照：恢复之后同一条通知又能点开，不需要重新发一条新的
    expect(await restoreProject(ownerId, projectId)).not.toBeNull();
    expect((await item())?.link).toBe(path);
    expect((await item())?.unavailable).toBeNull();
  });
});

describe('删除不会顺手做出来的事', () => {
  it('同名项目删掉后还能再建一个同名的：软删的行不占名字，slug 也不会撞车', async () => {
    const name = `重名复用${RUN}`;
    const first = await newProject(name);
    expect((await softDeleteProject(ownerId, first, name)).ok).toBe(true);
    const second = await newProject(name);
    expect(second).not.toBe(first);
    expect((await listProjects(ownerId)).some((p) => p.id === second)).toBe(true);
    // 对照：回收站里那条还在，两条同名项目互不影响
    expect((await listDeletedProjects(ownerId)).map((t) => t.id)).toContain(first);
  });

  it('删除不写简介、不动名字：deleted_at 是这次唯一变化的列', async () => {
    const name = `只动一列${RUN}`;
    const projectId = await newProject(name);
    const before = await getDb()
      .select({ name: projects.name, description: projects.description, visibility: projects.visibility, slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    expect((await softDeleteProject(ownerId, projectId, name)).ok).toBe(true);
    const after = (await getDb()
      .select({ name: projects.name, description: projects.description, visibility: projects.visibility, slug: projects.slug })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1))[0]!;
    expect(after).toEqual(before[0]!);
  });
});
