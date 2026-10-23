import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/design-model';
import {
  addComment,
  discover,
  listComments,
  publicRefByPath,
  publicationState,
  remixPublication,
  toggleFollow,
  toggleLike,
} from '../src/server/domain/social';
import { publishProject } from '../src/server/domain/publish';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, publishedProjects, remixes, users } from '../src/server/db/schema';

/**
 * §59 / §61 社区动作与发现列表。打真库：点赞去重、关注关系、分叉出来的到底是哪一版，
 * 这些在内存里都演不出来。
 *
 * 最要紧的一条是最后那个分叉测试：**Remix 拿到的必须是发布出去的那一版快照**，
 * 不是作者工作区里正在改的稿子——否则"有人想改编"就成了泄露未公开内容的口子。
 */

let authorId: string;
let fanId: string;
let otherId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Author', email: `so-a+${Date.now()}@nexus.test`, handle: `soa${Date.now().toString(36)}` },
      { displayName: 'Fan', email: `so-b+${Date.now()}@nexus.test`, handle: `sob${Date.now().toString(36)}` },
      { displayName: 'Stranger', email: `so-c+${Date.now()}@nexus.test`, handle: `soc${Date.now().toString(36)}` },
    ])
    .returning({ id: users.id });
  authorId = rows[0]!.id;
  fanId = rows[1]!.id;
  otherId = rows[2]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [authorId, fanId, otherId]));
  await db.delete(users).where(inArray(users.id, [authorId, fanId, otherId]));
});

/** 状态读不到就是没这条公开版本——测试里宁可当场炸，也不要 `?.` 把断言糊成通过 */
async function stateOf(path: string, viewerId: string | null) {
  const state = await publicationState(path, viewerId);
  if (!state) throw new Error(`读不到公开页状态：${path}`);
  return state;
}

async function published(name: string, text: string, owner = authorId) {
  const project = await createProject(owner, { name, kind: 'website' });
  const document = await loadDocument(project.id);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: 'body', text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(project.id, document!);
  const result = await publishProject(project.id, { visibility: 'public', createdById: owner });
  if (!result?.ok) throw new Error(`前置发布失败：${!result || result.ok ? '?' : result.reason}`);
  return { projectId: project.id, path: result.publication.path, publicationId: result.publication.id };
}

describe('Like / Comment / Follow', () => {
  it('点赞是可切换的开关，计数说的是真数', async () => {
    const { path } = await published('点赞页', '正常内容');
    const first = await toggleLike(fanId, (await publicRefByPath(path))!.publicationId);
    expect(first).toMatchObject({ liked: true, count: 1 });
    const again = await toggleLike(fanId, (await publicRefByPath(path))!.publicationId);
    expect(again).toMatchObject({ liked: false, count: 0 });
    await toggleLike(fanId, (await publicRefByPath(path))!.publicationId);
    await toggleLike(otherId, (await publicRefByPath(path))!.publicationId);
    expect((await stateOf(path, fanId)).likeCount).toBe(2);
    // "我做没做过"要按观察者算，不是给所有人同一个数
    expect((await stateOf(path, fanId)).likedByMe).toBe(true);
    expect((await stateOf(path, otherId)).likedByMe).toBe(true);
    expect((await stateOf(path, null)).likedByMe).toBe(false);
  });

  it('并发双点不再 500：两个开关同时到达时都拿到与库一致的终局', async () => {
    // 双击是真实存在的输入（移动端尤其），不是理论竞态：read-then-write 的开关
    // 在两次点击几乎同时到达时，第二次 insert 会撞 (user_id, project_id) 主键（23505）。
    // 修复前这条以 PostgresError 抛出，公开页上一次双点就是 500。
    const { path } = await published('并发点赞页', '正常内容');
    const publicationId = (await publicRefByPath(path))!.publicationId;
    const [a, b] = await Promise.all([toggleLike(fanId, publicationId), toggleLike(fanId, publicationId)]);
    expect(a).toMatchObject({ liked: true, count: 1 });
    expect(b).toMatchObject({ liked: true, count: 1 });
    expect((await stateOf(path, fanId)).likeCount).toBe(1);

    const [on, alsoOn] = await Promise.all([toggleFollow(fanId, authorId), toggleFollow(fanId, authorId)]);
    expect(on).toMatchObject({ following: true, followers: 1 });
    expect(alsoOn).toMatchObject({ following: true, followers: 1 });
    // 收尾取消：后面的 discover 用例以"fan 没关注 author"为前提（与本文件其它用例的约定一致）
    await toggleFollow(fanId, authorId);
  });

  it('评论走发布机检同一份红线词表：命中就不发出去', async () => {
    const { projectId, path } = await published('评论页', '正常内容');
    const publicationId = (await publicRefByPath(path))!.publicationId;

    const blocked = await addComment(fanId, publicationId, 'buy nude children now');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.rule).toBe('redline.minor_safety');
    expect(await listComments(projectId)).toHaveLength(0);

    const ok = await addComment(fanId, publicationId, '这个配色挺舒服的');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.notice).toContain('没命中不等于内容合规');
    const listed = await listComments(projectId);
    expect(listed.map((c) => c.body)).toEqual(['这个配色挺舒服的']);
    expect(listed[0]!.author).toBe('Fan');
  });

  it('空评论与超长评论都不入库', async () => {
    const { projectId, path } = await published('评论边界', '正常内容');
    const publicationId = (await publicRefByPath(path))!.publicationId;
    expect((await addComment(fanId, publicationId, '   ')).ok).toBe(false);
    expect((await addComment(fanId, publicationId, '啊'.repeat(2001))).ok).toBe(false);
    expect(await listComments(projectId)).toHaveLength(0);
  });

  it('关注可来回切换，不能关注自己', async () => {
    const [author] = await getDb().select({ handle: users.handle }).from(users).where(eq(users.id, authorId)).limit(1);
    const handle = author!.handle!;
    const on = await toggleFollow(fanId, authorId);
    // toEqual 而不是 toMatchObject：多一个字段就得多写一次，界面之外没人会被静默加进来的字段骗过
    expect(on).toEqual({ following: true, followers: 1, blocked: null, reason: null });
    const off = await toggleFollow(fanId, authorId);
    expect(off).toEqual({ following: false, followers: 0, blocked: null, reason: null });
    await expect(toggleFollow(authorId, authorId)).rejects.toThrow('不能关注自己');
    expect((await stateOf((await published('关注显示', 'x')).path, fanId)).ownerHandle).toBe(handle);
  });
});

describe('Remix（§58 分叉，不是改原作品）', () => {
  it('分叉出来的是发布那一版，作者没公开的改动不会跟着出去', async () => {
    const { projectId, path } = await published('待改编', '这一版看得见的文字');
    const publicationId = (await publicRefByPath(path))!.publicationId;

    // 作者随后在工作区里加一段没再发布的内容
    const live = await loadDocument(projectId);
    const page = findPage(live!, live!.activePageId) ?? live!.pages[0]!;
    const root = page.nodes[page.rootId]!;
    const secret = createNode({ type: 'text', name: 'draft', text: '还没公开的草稿内容', parentId: root.id });
    page.nodes[secret.id] = secret;
    root.children.push(secret.id);
    await saveDocument(projectId, live!);

    const remix = await remixPublication(fanId, publicationId);
    expect(remix.ok).toBe(true);
    if (!remix.ok) return;

    const forked = await loadDocument(remix.projectId);
    const texts = Object.values(forked!.pages[0]!.nodes).flatMap((n) => (typeof n.text === 'string' ? [n.text] : []));
    expect(texts.join(' ')).toContain('这一版看得见的文字');
    expect(texts.join(' ')).not.toContain('还没公开的草稿内容');

    // 副本属于点 Remix 的人，原作品一行都不该被改
    const [forkRow] = await getDb().select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, remix.projectId)).limit(1);
    expect(forkRow!.ownerId).toBe(fanId);
    const [sourceRow] = await getDb().select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, projectId)).limit(1);
    expect(sourceRow!.ownerId).toBe(authorId);
    const [lineage] = await getDb().select().from(remixes).where(eq(remixes.forkedProjectId, remix.projectId)).limit(1);
    expect(lineage?.sourceProjectId).toBe(projectId);

    // 页面上一眼能看出"有几个改编"
    expect((await stateOf(path, fanId)).remixCount).toBe(1);
  });

  it('不公开 / 被拒绝的版本分叉不出来', async () => {
    const { path, projectId } = await published('会下架的', '正常内容');
    await publishProject(projectId, { visibility: 'private', createdById: authorId });
    const ref = await publicRefByPath(path);
    expect(ref).toBeNull();
    const publicationId = (
      await getDb().select({ id: publishedProjects.id }).from(publishedProjects).where(eq(publishedProjects.projectId, projectId)).limit(1)
    )[0]!.id;
    expect((await remixPublication(fanId, publicationId)).ok).toBe(false);
  });
});

describe('discover（§61）', () => {
  it('只收真公开、没被拒绝的版本；New 与 Popular 排的是各自说的那件事', async () => {
    const a = await published('热门', 'a');
    const b = await published('最新', 'b');
    // 给 a 攒浏览量与点赞，让它成为 Popular 的第一名。
    // 两个数都放在存量之上（这台开发库里公开版本的最高浏览量是 151，而列表只给 60 条）：
    // 给到 1 的话，"b 在不在列表里"取决于库里积了多少条别人的公开版本，断言就变成在测环境宽度
    await getDb().update(publishedProjects).set({ views: 900 }).where(eq(publishedProjects.path, a.path));
    await toggleLike(fanId, a.publicationId);
    await toggleLike(otherId, a.publicationId);
    await getDb().update(publishedProjects).set({ views: 800 }).where(eq(publishedProjects.path, b.path));

    // 这台开发库里有别的测试留下的公开版本，所以不断言"第几名"，只断言
    // 两张卡都在列表里、并且各自的排序确实按各自说的那件事排
    const popular = await discover({ sort: 'popular', limit: 60 });
    const pa = popular.cards.findIndex((c) => c.path === a.path);
    const pb = popular.cards.findIndex((c) => c.path === b.path);
    expect(pa, '浏览量 900 的那一张应当进得了这一页').toBeGreaterThanOrEqual(0);
    expect(pb, '浏览量 800 的那一张应当进得了这一页').toBeGreaterThanOrEqual(0);
    expect(pa, '浏览量 900 + 2 赞的那一个应当排在前面').toBeLessThan(pb);
    expect(popular.cards[pa]!.likes).toBe(2);

    const fresh = await discover({ sort: 'new', limit: 60 });
    const fa = fresh.cards.findIndex((c) => c.path === a.path);
    const fb = fresh.cards.findIndex((c) => c.path === b.path);
    expect(fa).toBeGreaterThanOrEqual(0);
    expect(fb).toBeGreaterThanOrEqual(0);
    expect(fb, '后发布的应当排在前面').toBeLessThan(fa);

    // private 的那条不该出现
    const hidden = await published('会下架的2', 'c');
    await publishProject((await publicRefByPath(hidden.path))!.projectId, { visibility: 'private', createdById: authorId });
    const after = await discover({ sort: 'new', limit: 60 });
    expect(after.cards.some((c) => c.path === hidden.path)).toBe(false);
  });

  it('Following 只看到关注的人；没登录时如实说不给看', async () => {
    const mine = await published('关注流里的作品', 'd', authorId);
    expect((await discover({ sort: 'following', viewerId: fanId })).cards.some((c) => c.path === mine.path)).toBe(false);
    await toggleFollow(fanId, authorId);
    const after = await discover({ sort: 'following', viewerId: fanId });
    expect(after.cards.map((c) => c.path)).toContain(mine.path);

    const anon = await discover({ sort: 'following', viewerId: null });
    expect(anon.cards).toEqual([]);
    expect(anon.unavailable.some((u) => u.key === 'Following')).toBe(true);
  });

  it('排不出来的排序写在结果里；排得出来的不再占着那个位子', async () => {
    const result = await discover({ sort: 'new' });
    const keys = result.unavailable.map((u) => u.key);
    // Trending 以前在这张单子上（理由是"只有累计数"）。按天的互动序列进库之后它排得出来了，
    // 那就把它从"排不出来"里摘掉——留着不改口，就是拿一条过期的限度骗人（§159）
    expect(keys).not.toContain('Trending');
    expect(keys).toContain('AI Picks');
    // 只有 trending 那一栏会带算法说明；别的排序不该顺手编一句"排法"
    expect(result.method).toBe(null);
    const trending = await discover({ sort: 'trending' });
    expect(trending.method).toContain('半衰期');
  });
});

// 分叉关系挂在 projects 的 ON DELETE CASCADE 上，上面那个 afterAll 删掉项目就够了
