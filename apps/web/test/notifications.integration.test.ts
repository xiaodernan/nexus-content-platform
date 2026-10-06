import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createProject } from '../src/server/domain/projects';
import { publishProject, unpublishProject } from '../src/server/domain/publish';
import { emit, inbox, markAllRead, markRead } from '../src/server/domain/notifications';
import { recordScan, resolveCase } from '../src/server/domain/moderation';
import { getDb } from '../src/server/db/client';
import { notifications, projects, users } from '../src/server/db/schema';
import type { NotifyEvent } from '../src/lib/notify-plan';
import type { ModerationScan } from '@nexus/schemas';

/**
 * §164 收件箱的读写端，打真库。
 *
 * 纯函数那层管"该不该写、写什么"；这一层管三件只有库能回答的事：
 * 唯一键真的挡得住重复吗、读的时候能不能判断目标还在不在、
 * 一个人的收件箱会不会漏进另一个人眼里。
 *
 * 照 §165/§166/§168 的纪律：每条"没有 / 查不到"都要在同一份数据里配一条
 * 换个状态就有的对照——少了一种，"测试通过"就只是"数据没建起来"的同义反复。
 */

const RUN = `s164${Date.now().toString(36)}`;
let ownerId: string;
let actorId: string;
let ghostId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `通知作者${RUN}`, email: `n164o+${RUN}@nexus.test`, handle: `no${RUN}` })
    .returning({ id: users.id });
  const [actor] = await db
    .insert(users)
    .values({ displayName: `通知路人${RUN}`, email: `n164a+${RUN}@nexus.test`, handle: `na${RUN}` })
    .returning({ id: users.id });
  // guest 没认领前 handle 是 null：关注通知因此没有可指的主页
  const [ghost] = await db
    .insert(users)
    .values({ displayName: `无主页${RUN}`, email: `n164g+${RUN}@nexus.test`, guest: true })
    .returning({ id: users.id });
  ownerId = owner!.id;
  actorId = actor!.id;
  ghostId = ghost!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, actorId, ghostId]));
  await db.delete(users).where(inArray(users.id, [ownerId, actorId, ghostId]));
});

async function publish(
  owner: string,
  name: string,
  visibility: 'public' | 'unlisted' | 'private' = 'public',
): Promise<{ projectId: string; publicationId: string; path: string }> {
  const projectId = (await createProject(owner, { name, kind: 'website' })).id;
  const result = await publishProject(projectId, { visibility, createdById: owner });
  if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');
  return { projectId, publicationId: result.publication.id, path: result.publication.path };
}

/** 直接看库里的行，绕开读取层：这样"读不到"才能分成"没写"和"读的规则挡的" */
async function rowsFor(userId: string) {
  return getDb()
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      dedupeKey: notifications.dedupeKey,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(notifications.createdAt);
}

/** 显式钉成点赞那一个变体：联合类型上展开再改 actorId 会撞上 publish 变体没有 actorId */
type LikeEvent = Extract<NotifyEvent, { kind: 'like' }>;

/** 未读数是直接数库里的行：读的一侧与被测的一侧不共用一份实现 */
async function unreadOf(userId: string): Promise<number> {
  return (await rowsFor(userId)).filter((row) => !row.readAt).length;
}

const likeOn = (target: { projectId: string; publicationId: string; path: string }, projectName: string): LikeEvent => ({
  kind: 'like',
  recipientId: ownerId,
  actorId,
  actorName: `通知路人${RUN}`,
  projectId: target.projectId,
  publicationId: target.publicationId,
  path: target.path,
  projectName,
});

describe('写入：谁收到、重复的怎么办', () => {
  it('发布完成时作者有一条，路人没有；路人自己发布后他那侧就有了', async () => {
    await publish(ownerId, `发布作品${RUN}`);
    const mine = await rowsFor(ownerId);
    expect(mine.map((row) => row.kind)).toContain('publish');
    expect(mine.find((row) => row.kind === 'publish')?.title).toContain(`发布作品${RUN}`);
    expect(await rowsFor(actorId)).toHaveLength(0);

    await publish(actorId, `路人的作品${RUN}`);
    expect(await rowsFor(actorId)).toHaveLength(1);
  });

  it('同一个人反复点同一个作品只留一条（dedupe 是库挡的，不是内存挡的）', async () => {
    const target = await publish(ownerId, `重复点赞${RUN}`);
    const event = likeOn(target, `重复点赞${RUN}`);
    expect(await emit(event)).toBe('created');
    expect(await emit(event)).toBe('duplicate');
    expect(await emit(event)).toBe('duplicate');
    const likes = (await rowsFor(ownerId)).filter((row) => row.kind === 'like');
    expect(likes).toHaveLength(1);
    // 反向对照：换个作品就是一条新通知，说明只留一条是因为键而不是因为写入没跑
    const other = await publish(ownerId, `另一个作品${RUN}`);
    expect(await emit(likeOn(other, `另一个作品${RUN}`))).toBe('created');
  });

  it('自己对自己做的事不写行，规则挡的与真写进去的在返回值里分得开', async () => {
    const target = await publish(ownerId, `自赞${RUN}`);
    const before = (await rowsFor(ownerId)).length;
    const selfEvent = likeOn(target, `自赞${RUN}`);
    expect(await emit({ ...selfEvent, recipientId: actorId, actorId })).toBe('suppressed');
    expect((await rowsFor(ownerId)).length).toBe(before);
    expect(await emit({ ...selfEvent, actorId: ghostId })).toBe('created');
  });

  it('评论的长正文按上限存成摘录，标题里没有正文', async () => {
    const target = await publish(ownerId, `评论作品${RUN}`);
    await emit({
      kind: 'comment',
      recipientId: ownerId,
      actorId,
      actorName: `通知路人${RUN}`,
      projectId: target.projectId,
      publicationId: target.publicationId,
      path: target.path,
      projectName: `评论作品${RUN}`,
      commentId: `c-${RUN}`,
      text: '长'.repeat(500),
    });
    const row = (await rowsFor(ownerId)).find((item) => item.kind === 'comment');
    expect(row?.body).toHaveLength(200);
    expect(row?.title).not.toContain('长');
  });

  it('没有 handle 的粉丝：通知留着，链接不给', async () => {
    await emit({ kind: 'follow', recipientId: ownerId, actorId: ghostId, actorName: `无主页${RUN}`, actorHandle: null });
    const page = await inbox(ownerId, 20);
    const item = page.items.find((entry) => entry.kind === 'follow');
    expect(item?.link).toBeNull();
    expect(item?.unavailable).toBe('没有可跳转的页面');
    // 反向对照：同一次关注换一个有 handle 的人，就有 /u/ 可指
    await emit({ kind: 'follow', recipientId: ownerId, actorId, actorName: `通知路人${RUN}`, actorHandle: `na${RUN}` });
    const again = await inbox(ownerId, 20);
    expect(again.items.find((entry) => entry.kind === 'follow' && entry.link)?.link).toBe(`/u/na${RUN}`);
  });
});

describe('读取：目标还在不在、是谁的、有多少', () => {
  it('作者下架之后，点赞通知还在，但改成说明原因而不是给一个 404 链接', async () => {
    const target = await publish(ownerId, `下架作品${RUN}`);
    await emit(likeOn(target, `下架作品${RUN}`));
    const kept = await inbox(ownerId, 50);
    const live = kept.items.find((item) => item.link === target.path);
    expect(live?.unavailable).toBeNull();
    expect(live?.title).not.toContain('不公开');

    expect(await unpublishProject(target.projectId)).toBe(true);
    const after = await inbox(ownerId, 50);
    const gone = after.items.find((item) => item.title.includes(`下架作品${RUN}`));
    expect(gone?.link).toBeNull();
    expect(gone?.unavailable).toBe('这一版已经不公开了');
    // 行没被删：下架的是作者的东西，不该顺手清掉别人的收件箱
    expect((await rowsFor(ownerId)).some((row) => row.title.includes(`下架作品${RUN}`))).toBe(true);
  });

  it('切成私有的那次发布指向编辑区，因此不受"这一版还公开吗"的判定牵连', async () => {
    const first = await publish(ownerId, `私有切换${RUN}`, 'public');
    const second = await publishProject(first.projectId, { visibility: 'private', createdById: ownerId });
    if (!second || !second.ok) throw new Error('切私有失败');
    const page = await inbox(ownerId, 50);
    const item = page.items.find((entry) => entry.title.includes('已切为私有'));
    expect(item?.link).toBe(`/studio/${first.projectId}`);
    expect(item?.unavailable).toBeNull();
  });

  it('未读数与总数各算各的，标已读只认这个人的行', async () => {
    const target = await publish(actorId, `归属检查${RUN}`);
    await emit({ ...likeOn(target, `归属检查${RUN}`), recipientId: actorId });
    const before = await inbox(actorId, 50);
    const unreadOne = before.items.find((item) => !item.read && item.title.includes(`归属检查${RUN}`))!;
    const otherId = (await rowsFor(ownerId))[0]!.id;

    // 拿别人的 id 去标：一条都标不掉，对方那侧的未读数不变
    // 未读数是直接数库里的行，不用 domain 层那个数——否则"标掉了"与"查询说标掉了"会互相圆场
    expect(await markRead(actorId, [otherId])).toBe(0);
    expect(await unreadOf(actorId)).toBe(before.unread);
    // 自己的 id：标掉一条，未读少一条
    expect(await markRead(actorId, [unreadOne.id])).toBe(1);
    expect(await unreadOf(actorId)).toBe(before.unread - 1);
    // 再标同一条：已经读过了，0 条——不是"成功"，也不是报错
    expect(await markRead(actorId, [unreadOne.id])).toBe(0);
  });

  it('全部标记已读只动未读的那些，第二次是幂等的 0', async () => {
    const unread = await unreadOf(ownerId);
    const total = (await rowsFor(ownerId)).length;
    expect(unread).toBeGreaterThan(0);
    expect(await markAllRead(ownerId)).toBe(unread);
    expect(await unreadOf(ownerId)).toBe(0);
    expect(await markAllRead(ownerId)).toBe(0);
    // 一行都没少：标已读是加时间戳，不是把通知删掉
    expect((await rowsFor(ownerId)).length).toBe(total);
  });

  it('收件箱不串人：作者看不到路人的通知，路人看不到作者的', async () => {
    const pageOwner = await inbox(ownerId, 50);
    const pageActor = await inbox(actorId, 50);
    const ownerTitles = new Set(pageOwner.items.map((item) => item.title));
    const actorTitles = new Set(pageActor.items.map((item) => item.title));
    const onlyActor = [...actorTitles].find((title) => title.includes(`归属检查`));
    expect(onlyActor).toBeDefined();
    expect(ownerTitles.has(onlyActor!)).toBe(false);
    // 反向对照：作者确实有自己的通知，不是两边都空所以"看起来不串"
    expect([...ownerTitles].some((title) => title.includes(`发布作品${RUN}`))).toBe(true);
  });

  it('limit 只截列表，不谎报总数', async () => {
    const page = await inbox(ownerId, 2);
    expect(page.items).toHaveLength(2);
    expect(page.total).toBeGreaterThan(2);
    // 表外的一类：手工插一行不认识的值，读出来是未分类而不是崩掉整页
    await getDb()
      .insert(notifications)
      .values({ userId: ownerId, kind: 'abuse_report', title: `不认识的一类${RUN}`, dedupeKey: `raw-${RUN}` });
    const after = await inbox(ownerId, 50);
    expect(after.items.find((item) => item.title.includes(`不认识的一类${RUN}`))?.kind).toBe('other');
  });

  it('分页：第二页从正确的位置开始，hasMore 如实反映是否还有更多', async () => {
    // 先确保有足够的数据（前面已经创建了很多通知）
    const firstPage = await inbox(ownerId, { page: 1, limit: 3 });
    const secondPage = await inbox(ownerId, { page: 2, limit: 3 });
    
    expect(firstPage.items).toHaveLength(3);
    expect(secondPage.items).toHaveLength(3);
    // 两页的数据不应该重叠
    const firstIds = new Set(firstPage.items.map((item) => item.id));
    expect(secondPage.items.every((item) => !firstIds.has(item.id))).toBe(true);
    
    // hasMore 应该如实反映
    if (firstPage.pagination) {
      expect(firstPage.pagination.page).toBe(1);
      expect(firstPage.pagination.limit).toBe(3);
    }
    if (secondPage.pagination) {
      expect(secondPage.pagination.page).toBe(2);
      expect(secondPage.pagination.limit).toBe(3);
    }
  });

  it('最后一页 hasMore 为 false', async () => {
    const total = (await rowsFor(ownerId)).length;
    const lastPage = await inbox(ownerId, { page: Math.ceil(total / 50), limit: 50 });
    expect(lastPage.pagination?.hasMore).toBe(false);
  });

  it('超出范围的页返回空列表', async () => {
    const farPage = await inbox(ownerId, { page: 9999, limit: 10 });
    expect(farPage.items).toHaveLength(0);
    expect(farPage.pagination?.hasMore).toBe(false);
  });

  it('向后兼容：直接传数字仍然当 limit 用', async () => {
    const page = await inbox(ownerId, 5);
    expect(page.items.length).toBeLessThanOrEqual(5);
    expect(page.pagination).toBeUndefined();
  });

  it('没来源的那一类随收件箱一起回来，展示面不用自己抄一份清单', async () => {
    const page = await inbox(ownerId, 1);
    // Generation complete 摘于 2026-09-25（`agent_tasks` 的写入方），Agent task complete 摘于
    // 2026-09-29（`server/agent/runtime.ts` 的多步编排），Build complete 摘于 2026-10-01
    // （§144 的导出：读完文档、投出代码、取回资产、打成包，那才叫"构建完成"）。
    // 单子现在是空的，但**读路径照旧把这张单子带回来**——将来加一类而没有来源时，
    // 它得有个地方冒出来，而不是等到有人去翻代码才发现收件箱少了什么。
    expect(page.unbacked).toEqual([]);
  });
});

describe('人工裁决：唯一一件"在别人请求结束之后才发生"的事', () => {
  const reviewScan: ModerationScan = {
    rulesVersion: `test-${RUN}`,
    decision: 'review',
    findings: [{ rule: 'impersonation', level: 'review', quote: '官方客服', where: 'node-1', why: '疑似冒充官方身份' }],
    limits: ['词表挡不住换个措辞'],
    scanned: { pages: 1, textNodes: 1, assetRefs: 0 },
  };

  const moderationRows = async () => (await rowsFor(ownerId)).filter((row) => row.kind === 'moderation');

  it('裁决下架：作者收到一条指向编辑区的通知，同一件作品的点赞通知改成点不开', async () => {
    const target = await publish(ownerId, `待审作品${RUN}`);
    await emit(likeOn(target, `待审作品${RUN}`));
    const recorded = await recordScan({
      projectId: target.projectId,
      publicationId: target.publicationId,
      publicationVersion: 1,
      visibility: 'public',
      scan: reviewScan,
    });
    const resolved = await resolveCase(recorded.id, { adminId: ghostId, resolution: 'rejected', note: '首页有冒充' });
    expect(resolved.ok).toBe(true);

    const rows = await moderationRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe(`《待审作品${RUN}》第 1 版经人工审核后已下架`);
    expect(rows[0]!.link).toBe(`/studio/${target.projectId}`);
    expect(rows[0]!.body).toBe('首页有冒充');

    // 同一次裁决把那一版打下架：之前那条点赞通知因此点不开，而不是留在列表里给一个 404
    const page = await inbox(ownerId, 60);
    const like = page.items.find((item) => item.title.includes(`待审作品${RUN}`) && item.kind === 'like');
    expect(like?.link).toBeNull();
    expect(like?.unavailable).toBe('这一版已经不公开了');

    // 二次裁决既改不动结论也不该再冒出一条通知
    expect((await resolveCase(recorded.id, { adminId: ghostId, resolution: 'approved' })).ok).toBe(false);
    expect(await moderationRows()).toHaveLength(1);
  });

  it('被机检当场挡下的那次发布（没有 publication 行）不发通知：作者当时就拿到了原因', async () => {
    const blockedProject = (await createProject(ownerId, { name: `挡下的发布${RUN}`, kind: 'website' })).id;
    const before = await moderationRows();
    const recorded = await recordScan({
      projectId: blockedProject,
      publicationId: null,
      publicationVersion: 1,
      visibility: 'public',
      scan: { ...reviewScan, decision: 'blocked' },
    });
    expect((await resolveCase(recorded.id, { adminId: ghostId, resolution: 'approved' })).ok).toBe(true);
    expect(await moderationRows()).toHaveLength(before.length);
  });
});
