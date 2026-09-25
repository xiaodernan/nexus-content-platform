import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/design-model';
import {
  canInteract,
  clearBlock,
  hiddenAuthorIds,
  listBlocks,
  relationOf,
  setBlock,
  userByHandle,
} from '../src/server/domain/blocks';
import { addComment, discover, listComments, publicRefByPath, publicationState, toggleFollow, toggleLike } from '../src/server/domain/social';
import { searchPlatform } from '../src/server/domain/search';
import { emit, inbox } from '../src/server/domain/notifications';
import { publishProject } from '../src/server/domain/publish';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { follows, notifications, projects, userBlocks, users } from '../src/server/db/schema';

/**
 * §132 的 block / mute。打真库：这一片的全部难点都在"关系改变了别的查询的结果"，
 * 而那是内存里的假判定演不出来的——过滤走的是 SQL 的 notInArray，通知抑制走的是 emit 的返回值。
 *
 * 每组断言都配一个**同一种数据、换一种关系**的对照，因为这些规则最容易犯的错不是"挡多了"
 * 而是"挡少了还全绿"：一个恒返回 null 的 relationOf 会让上面每一条负面断言都通过。
 */

let authorId: string;
let fanId: string;
let otherId: string;
let fanHandle: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const stamp = Date.now().toString(36);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Author', email: `bl-a+${Date.now()}@nexus.test`, handle: `bla${stamp}` },
      { displayName: 'Fan', email: `bl-b+${Date.now()}@nexus.test`, handle: `blb${stamp}` },
      { displayName: 'Stranger', email: `bl-c+${Date.now()}@nexus.test`, handle: `blc${stamp}` },
    ])
    .returning({ id: users.id, handle: users.handle });
  authorId = rows[0]!.id;
  fanId = rows[1]!.id;
  otherId = rows[2]!.id;
  fanHandle = rows[1]!.handle!;
});

afterAll(async () => {
  const db = getDb();
  const ids = [authorId, fanId, otherId];
  await db.delete(projects).where(inArray(projects.ownerId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

let seq = 0;
async function published(owner = authorId) {
  seq += 1;
  const name = `屏蔽测试作品${seq}`;
  const project = await createProject(owner, { name, kind: 'website' });
  const document = await loadDocument(project.id);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: 'body', text: '这一版看得见的文字', parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(project.id, document!);
  const result = await publishProject(project.id, { visibility: 'public', createdById: owner });
  if (!result?.ok) throw new Error(`前置发布失败：${!result || result.ok ? '?' : result.reason}`);
  return { projectId: project.id, path: result.publication.path, publicationId: result.publication.id };
}

function likeEvent(recipientId: string, actorId: string, ref: { projectId: string; publicationId: string; path: string }) {
  return {
    kind: 'like' as const,
    recipientId,
    actorId,
    actorName: 'Fan',
    projectId: ref.projectId,
    publicationId: ref.publicationId,
    path: ref.path,
    projectName: '屏蔽测试作品',
  };
}

describe('关系本身（user_blocks）', () => {
  it('拉黑自己与不存在的用户都不写库；正常的一对写得回来，而且只有一行', async () => {
    const self = await setBlock(authorId, authorId, 'block');
    expect(self).toMatchObject({ ok: false });
    if (self.ok) throw new Error('拉黑自己不该成功');

    const missing = await setBlock(authorId, randomUUID(), 'block');
    expect(missing).toMatchObject({ ok: false });

    const first = await setBlock(authorId, fanId, 'mute');
    expect(first).toMatchObject({ ok: true, kind: 'mute', created: true });
    // 方向性：关系是"谁做的选择"，被屏蔽的那个人一点都不知道，也不该被算成屏蔽者
    expect(await relationOf(authorId, fanId)).toBe('mute');
    expect(await relationOf(fanId, authorId)).toBe(null);
    // 对照组：没有任何关系的一对，读的也是 null（一个恒返回 null 的实现过不了下面那条）
    expect(await relationOf(otherId, authorId)).toBe(null);
    expect(await relationOf(authorId, fanId)).toBe('mute');

    const again = await setBlock(authorId, fanId, 'mute');
    expect(again).toMatchObject({ ok: true, created: false });
    const listed = await listBlocks(authorId);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ kind: 'mute', handle: fanHandle, name: 'Fan' });
    // 入口只认 handle：抄来的 uuid 不是做这件事的前提
    expect(await userByHandle(fanHandle)).toMatchObject({ id: fanId });
    expect(await userByHandle('没有这个人')).toBe(null);
  });

  it('mute 升级为 block 仍然只有一行；解除之后关系读不到，重复解除不是错误', async () => {
    expect((await setBlock(authorId, fanId, 'mute')).ok).toBe(true);
    const upgraded = await setBlock(authorId, fanId, 'block');
    expect(upgraded).toMatchObject({ ok: true, kind: 'block' });
    const listed = await listBlocks(authorId);
    expect(listed.map((b) => b.kind)).toEqual(['block']);

    expect(await clearBlock(authorId, fanId)).toEqual({ removed: true });
    expect(await relationOf(authorId, fanId)).toBe(null);
    // 点两次"取消"不该变红：本来就没有就是没做成，但不是错误
    expect(await clearBlock(authorId, fanId)).toEqual({ removed: false });
  });

  it('block 拆掉两个方向的已有关注，mute 不拆（这才是"只是不想看到"的意思）', async () => {
    const db = getDb();
    await toggleFollow(authorId, fanId);
    await toggleFollow(fanId, authorId);
    const edges = async () =>
      (
        await db
          .select({ followerId: follows.followerId })
          .from(follows)
          .where(inArray(follows.followerId, [authorId, fanId]))
      ).length;
    expect(await edges()).toBe(2);

    expect(await setBlock(authorId, fanId, 'mute')).toMatchObject({ ok: true, unfollowed: 0 });
    expect(await edges()).toBe(2);

    const blocked = await setBlock(authorId, fanId, 'block');
    expect(blocked.ok && blocked.unfollowed).toBe(2);
    expect(await edges()).toBe(0);
    await clearBlock(authorId, fanId);
  });
});

describe('互动的挡住与不挡住', () => {
  it('block 两个方向都拒（原因分别说清是谁的选择），mute 一个方向都不拒', async () => {
    expect(await canInteract(authorId, fanId)).toEqual({ allowed: true });
    expect(await setBlock(authorId, fanId, 'mute')).toMatchObject({ ok: true });
    expect(await canInteract(fanId, authorId)).toEqual({ allowed: true });
    expect(await canInteract(authorId, fanId)).toEqual({ allowed: true });

    await setBlock(authorId, fanId, 'block');
    // 同一条关系，两个方向的说法不一样：一个说"对方不接受"，一个说"是你自己拉黑的"
    expect(await canInteract(fanId, authorId)).toMatchObject({ allowed: false, blockedBy: 'them' });
    expect(await canInteract(authorId, fanId)).toMatchObject({ allowed: false, blockedBy: 'me' });
    // 对照组：第三个人不受这条关系影响
    expect(await canInteract(otherId, authorId)).toEqual({ allowed: true });
    await clearBlock(authorId, fanId);
  });

  it('被拉黑之后评论不入库、点赞不改计数；第三个人两样都做得到', async () => {
    const { projectId, publicationId, path } = await published();
    const ref = await publicRefByPath(path);
    expect(ref).not.toBeNull();
    await setBlock(authorId, fanId, 'block');

    const comment = await addComment(fanId, publicationId, '这句应该发不出去');
    expect(comment.ok).toBe(false);
    if (comment.ok) throw new Error('被拉黑之后评论不该发出去');
    expect(comment.blocked).toBe('them');
    expect(await listComments(projectId)).toHaveLength(0);

    const like = await toggleLike(fanId, publicationId);
    expect(like).toMatchObject({ liked: false, count: 0, blocked: 'them' });

    // 反向对照：换成没被拉黑的人，同一份代码路径要通
    expect((await addComment(otherId, publicationId, '这句发得出去')).ok).toBe(true);
    expect(await toggleLike(otherId, publicationId)).toMatchObject({ liked: true, count: 1, blocked: null });
    expect((await state(path)).comments).toHaveLength(1);

    // mute 不许挡住互动——那是 block 的权限，屏蔽只是自己不想看
    await setBlock(authorId, fanId, 'mute');
    expect((await addComment(fanId, publicationId, '屏蔽之后还能发')).ok).toBe(true);
    await clearBlock(authorId, fanId);
  });

  it('拉黑之后关注不生效，也不会把对方塞进粉丝列表', async () => {
    await setBlock(authorId, fanId, 'block');
    const on = await toggleFollow(fanId, authorId);
    expect(on).toMatchObject({ following: false, followers: 0, blocked: 'them' });
    const [rows] = await getDb()
      .select({ n: rawSql<number>`count(*)::int` })
      .from(follows)
      .where(eq(follows.followeeId, authorId));
    expect(rows?.n ?? 0).toBe(0);
    await clearBlock(authorId, fanId);
  });
});

async function state(path: string, viewerId: string | null = null) {
  const s = await publicationState(path, viewerId);
  if (!s) throw new Error(`读不到公开页状态：${path}`);
  return s;
}

describe('可见性：过滤按查看者算，不改公共记录', () => {
  it('我屏蔽的人的评论在我这边不显示，并且条数报得出来；别人照旧看得到', async () => {
    const { projectId, path } = await published();
    await addComment(fanId, (await publicRefByPath(path))!.publicationId, '来自粉丝的评论');
    await addComment(otherId, (await publicRefByPath(path))!.publicationId, '来自路人的评论');

    expect(await hiddenAuthorIds(fanId)).toEqual([]);
    await setBlock(authorId, fanId, 'mute');
    const hidden = await hiddenAuthorIds(authorId);
    expect(hidden).toEqual([fanId]);

    const listed = await listComments(projectId, 50, hidden);
    expect(listed.map((c) => c.body)).toEqual(['来自路人的评论']);

    const mine = await state(path, authorId);
    expect(mine.comments.map((c) => c.body)).toEqual(['来自路人的评论']);
    expect(mine.hiddenComments).toBe(1);
    // 反向对照一：另一个登录的人看这一页，一条都没被过滤（block 是私人的，不是全站删帖）
    const theirs = await state(path, otherId);
    expect(theirs.comments).toHaveLength(2);
    expect(theirs.hiddenComments).toBe(0);
    // 反向对照二：同一个作者，解除屏蔽之后过滤立刻消失——报数与列表是同一份名单算出来的
    await clearBlock(authorId, fanId);
    const after = await state(path, authorId);
    expect(after.comments).toHaveLength(2);
    expect(after.hiddenComments).toBe(0);
  });

  it('发现页不再出现我屏蔽的人的作品；没屏蔽的人与匿名访客照旧看得到', async () => {
    const fanWork = await published(fanId);
    const before = await discover({ sort: 'new', viewerId: authorId, limit: 60 });
    expect(before.cards.some((c) => c.path === fanWork.path)).toBe(true);
    expect(before.hiddenAuthors).toBe(0);

    await setBlock(authorId, fanId, 'mute');
    const after = await discover({ sort: 'new', viewerId: authorId, limit: 60 });
    expect(after.cards.some((c) => c.path === fanWork.path)).toBe(false);
    expect(after.hiddenAuthors).toBe(1);
    // 反向对照：换个人看同一个标签，那张卡片还在
    const stranger = await discover({ sort: 'new', viewerId: otherId, limit: 60 });
    expect(stranger.cards.some((c) => c.path === fanWork.path)).toBe(true);
    await clearBlock(authorId, fanId);
  });

  it('全平台搜索里也不冒出来：作品与用户两组都过滤', async () => {
    seq += 1;
    const named = `屏蔽搜索专用${seq}`;
    const project = await createProject(fanId, { name: named, kind: 'website' });
    const result = await publishProject(project.id, { visibility: 'public', createdById: fanId });
    if (!result?.ok) throw new Error('前置发布失败');

    const hits = async (viewerId: string | null) => {
      const r = await searchPlatform(named, viewerId, 8);
      return {
        projects: r.groups.find((g) => g.key === 'projects')?.hits.map((h) => h.id) ?? [],
        users: (await searchPlatform(fanHandle, viewerId, 8)).groups.find((g) => g.key === 'users')?.hits.map((h) => h.id) ?? [],
      };
    };
    expect((await hits(otherId)).projects).toContain(project.id);
    expect((await hits(otherId)).users).toContain(fanId);

    await setBlock(otherId, fanId, 'mute');
    expect((await hits(otherId)).projects).not.toContain(project.id);
    expect((await hits(otherId)).users).not.toContain(fanId);
    // 反向对照：同一次查询词换个查看者，两组都要有东西——否则"过滤"其实是"查不到"
    expect((await hits(null)).projects).toContain(project.id);
    await clearBlock(otherId, fanId);
  });
});

describe('通知：这个人不该再收到那个人的动静', () => {
  it('屏蔽与拉黑都让对方事件不进收件箱；换收件人或换方向就必须出声', async () => {
    const ref = await published();
    // 前面每个用例都发布过一次，而发布本身会给作者留一条通知——所以这里全部按增量算，
    // 断言绝对总数会把那些无关的行数进来，红在一次和本次无关的旧通知上
    const [baseAuthor, baseOther, baseFan] = [
      (await inbox(authorId)).total,
      (await inbox(otherId)).total,
      (await inbox(fanId)).total,
    ];

    // 基线：没有关系时真的会写一行
    expect(await emit(likeEvent(authorId, fanId, ref))).toBe('created');
    expect((await inbox(authorId)).total).toBe(baseAuthor + 1);
    // 同一件事第二次是 duplicate 而不是 suppressed——两种"没写进去"的原因不同，
    // 只盯返回值分不清是哪一层起的作用，所以先把 dedupe 那层跑出来再清掉
    expect(await emit(likeEvent(authorId, fanId, ref))).toBe('duplicate');
    expect((await inbox(authorId)).total).toBe(baseAuthor + 1);
    await getDb().delete(notifications).where(and(eq(notifications.userId, authorId), eq(notifications.actorId, fanId)));
    expect((await inbox(authorId)).total).toBe(baseAuthor);

    await setBlock(authorId, fanId, 'mute');
    expect(await emit(likeEvent(authorId, fanId, ref))).toBe('suppressed');
    expect((await inbox(authorId)).total).toBe(baseAuthor);
    // 反向对照一：同一种事件换个收件人（没屏蔽他的人）就必须出声
    expect(await emit(likeEvent(otherId, fanId, ref))).toBe('created');
    expect((await inbox(otherId)).total).toBe(baseOther + 1);
    // 反向对照二：方向反过来不算——fan 屏蔽了 other，不该连带把 other 的收件箱也关掉
    await setBlock(fanId, otherId, 'mute');
    expect(await emit(likeEvent(otherId, fanId, ref))).toBe('duplicate');
    // 但 fan 自己屏蔽的那个人发的动静，进不了 fan 的收件箱
    expect(await emit(likeEvent(fanId, otherId, ref))).toBe('suppressed');
    expect((await inbox(fanId)).total).toBe(baseFan);

    // 升级成 block 同样抑制（block 的效果包含 mute）
    await clearBlock(authorId, fanId);
    await setBlock(authorId, fanId, 'block');
    expect(await emit(likeEvent(authorId, fanId, ref))).toBe('suppressed');
    expect((await inbox(authorId)).total).toBe(baseAuthor);
    await clearBlock(authorId, fanId);
    await clearBlock(fanId, otherId);
  });
});

describe('约束在库里而不是只在调用方', () => {
  it('一条关系只有一行、kind 只认两类、自己不能对自己', async () => {
    const db = getDb();
    const shapes = (await db.execute(rawSql`
      select conname from pg_constraint
      where conrelid = 'user_blocks'::regclass and contype = 'c'
    `)) as unknown as { conname: string }[];
    const names = shapes.map((r) => r.conname);
    expect(names).toContain('user_blocks_not_self');
    expect(names).toContain('user_blocks_kind');

    // 绕过 domain 直接写库也要被挡：只挡在调用方的规则等于没挡
    await expect(db.insert(userBlocks).values({ blockerId: authorId, blockedId: authorId, kind: 'block' })).rejects.toThrow();
    await expect(db.insert(userBlocks).values({ blockerId: authorId, blockedId: otherId, kind: 'follow' })).rejects.toThrow();
    const [count] = await db
      .select({ n: rawSql<number>`count(*)::int` })
      .from(userBlocks)
      .where(eq(userBlocks.blockerId, authorId));
    expect(count?.n).toBe(0);
    // 对照组：同一张表按 domain 的写法插一行是成功的——红不是因为表根本写不进去
    expect((await setBlock(authorId, otherId, 'mute')).ok).toBe(true);
    await clearBlock(authorId, otherId);
  });
});
