import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { duplicateDocument, remapAssetIds } from '@nexus/design-model';
import { getDb } from '../db/client';
import { comments, follows, likes, projects, publishedProjects, remixes, users } from '../db/schema';
import { createProject, saveDocument } from './projects';
import { copyProjectAssets } from './assets';
import { readSnapshot } from './snapshots';
import { scanTextForRedlines } from './moderation';

/**
 * §59 社区动作（Like / Comment / Follow / Remix / Share）与 §61 的发现列表。
 *
 * 三条塑造了这里写法的事实：
 * - **Remix 分叉的是"发布出去的那一版"**，不是作者正在改的工作稿（§58）：
 *   别人点 Remix 时拿到的是快照里的文档，作者没公开的东西不会因为有人想 remix 就漏出去。
 * - **评论走发布机检同一份红线词表**（§129）：命中就不发出去。
 *   没命中也**不**等于安全——这句话随回执一起给调用方，不只在代码注释里。
 * - **发现列表只排真有的信号**：New 按发布时间、Popular 按累计浏览与点赞、Following 按关注关系。
 *   Trending 要的是互动时间序列（我们现在只有累计数），AI Picks 要的是模型——
 *   两者都列进 `unavailable` 而不是拿累计数换个名字冒充。
 */

export interface PublicationRef {
  publicationId: string;
  projectId: string;
  ownerId: string;
  path: string;
  visibility: string;
  moderation: string;
  /** §164 的通知标题要用；顺手带上，省得每个动作再回库查一次项目名 */
  projectName: string;
}

/** 公开可见的那一版：private 与被人工拒绝的都不算存在（和 resolvePublishedPath 同一口径） */
export async function publicRefByPath(path: string): Promise<PublicationRef | null> {
  const [row] = await getDb()
    .select({
      publicationId: publishedProjects.id,
      projectId: publishedProjects.projectId,
      ownerId: projects.ownerId,
      path: publishedProjects.path,
      visibility: publishedProjects.visibility,
      moderation: publishedProjects.moderation,
      projectName: projects.name,
    })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(eq(publishedProjects.path, path))
    .limit(1);
  if (!row) return null;
  if (row.visibility === 'private' || row.moderation === 'rejected') return null;
  return row;
}

/** 公开页一进来要显示的那一份现场：计数 + 我做过没有。全部来自真表，没有一处是猜的 */
export interface PublicationState {
  publicationId: string;
  projectId: string;
  path: string;
  ownerHandle: string | null;
  ownerName: string;
  ownerId: string;
  likeCount: number;
  likedByMe: boolean;
  followers: number;
  followingOwner: boolean;
  isOwner: boolean;
  comments: CommentEntry[];
  remixCount: number;
}

export async function publicationState(path: string, viewerId: string | null): Promise<PublicationState | null> {
  const ref = await publicRefByPath(path);
  if (!ref) return null;
  const db = getDb();
  const [owner] = await db
    .select({ displayName: users.displayName, handle: users.handle })
    .from(users)
    .where(eq(users.id, ref.ownerId))
    .limit(1);
  const likedByMe = viewerId
    ? (
        await db
          .select({ userId: likes.userId })
          .from(likes)
          .where(and(eq(likes.projectId, ref.projectId), eq(likes.userId, viewerId)))
          .limit(1)
      ).length > 0
    : false;
  const followingOwner = viewerId
    ? viewerId !== ref.ownerId &&
      (
        await db
          .select({ followerId: follows.followerId })
          .from(follows)
          .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, ref.ownerId)))
          .limit(1)
      ).length > 0
    : false;
  const [[followers], [remixCount]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followeeId, ref.ownerId)),
    db.select({ n: sql<number>`count(*)::int` }).from(remixes).where(eq(remixes.sourceProjectId, ref.projectId)),
  ]);
  return {
    publicationId: ref.publicationId,
    projectId: ref.projectId,
    path: ref.path,
    ownerHandle: owner?.handle ?? null,
    ownerName: owner?.displayName ?? '',
    ownerId: ref.ownerId,
    likeCount: await likeCount(ref.projectId),
    likedByMe,
    followers: followers?.n ?? 0,
    followingOwner,
    isOwner: viewerId === ref.ownerId,
    comments: await listComments(ref.projectId),
    remixCount: remixCount?.n ?? 0,
  };
}

export interface LikeState {
  liked: boolean;
  count: number;
}

export async function toggleLike(actorId: string, publicationId: string): Promise<LikeState> {
  const db = getDb();
  const [pub] = await db
    .select({ projectId: publishedProjects.projectId })
    .from(publishedProjects)
    .where(eq(publishedProjects.id, publicationId))
    .limit(1);
  if (!pub) throw new Error('没有这个发布版本');

  const existing = await db
    .select({ userId: likes.userId })
    .from(likes)
    .where(and(eq(likes.projectId, pub.projectId), eq(likes.userId, actorId)))
    .limit(1);
  if (existing.length) {
    await db.delete(likes).where(and(eq(likes.projectId, pub.projectId), eq(likes.userId, actorId)));
  } else {
    await db.insert(likes).values({ projectId: pub.projectId, userId: actorId });
  }
  return { liked: !existing.length, count: await likeCount(pub.projectId) };
}

async function likeCount(projectId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(likes)
    .where(eq(likes.projectId, projectId));
  return row?.n ?? 0;
}

export interface CommentEntry {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

export async function listComments(projectId: string, limit = 50): Promise<CommentEntry[]> {
  const rows = await getDb()
    .select({ id: comments.id, body: comments.body, author: users.displayName, createdAt: comments.createdAt })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.projectId, projectId))
    .orderBy(desc(comments.createdAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, body: r.body, author: r.author, createdAt: r.createdAt.toISOString() }));
}

export type CommentResult =
  | { ok: true; comment: CommentEntry; notice: string }
  | { ok: false; reason: string; rule?: string };

/** 评论用发布机检的同一份红线词表；命中就不发出去，不"先发出去再等人看" */
export async function addComment(actorId: string, publicationId: string, body: string): Promise<CommentResult> {
  const text = body.trim();
  if (!text) return { ok: false, reason: '评论是空的' };
  if (text.length > 2000) return { ok: false, reason: '评论超过 2000 字' };

  const hits = scanTextForRedlines(text);
  if (hits.length) {
    return { ok: false, reason: `这条评论被机检挡下：${hits[0]!.why}`, rule: hits[0]!.rule };
  }

  const db = getDb();
  const [pub] = await db
    .select({ projectId: publishedProjects.projectId })
    .from(publishedProjects)
    .where(eq(publishedProjects.id, publicationId))
    .limit(1);
  if (!pub) return { ok: false, reason: '没有这个发布版本' };

  const inserted = await db
    .insert(comments)
    .values({ projectId: pub.projectId, userId: actorId, body: text })
    .returning({ id: comments.id, body: comments.body, createdAt: comments.createdAt });
  const row = inserted[0]!;
  const [author] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, actorId)).limit(1);
  return {
    ok: true,
    comment: { id: row.id, body: row.body, author: author?.displayName ?? '', createdAt: row.createdAt.toISOString() },
    // §159：机检没命中不等于合规，这句话给到调用方也显示在界面上
    notice: '评论已发布。机检只挡得住它写得出规则的那部分，没命中不等于内容合规。',
  };
}

export interface FollowState {
  following: boolean;
  followers: number;
}

export async function toggleFollow(actorId: string, targetUserId: string): Promise<FollowState> {
  if (actorId === targetUserId) throw new Error('不能关注自己');
  const db = getDb();
  const existing = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, actorId), eq(follows.followeeId, targetUserId)))
    .limit(1);
  if (existing.length) {
    await db.delete(follows).where(and(eq(follows.followerId, actorId), eq(follows.followeeId, targetUserId)));
  } else {
    await db.insert(follows).values({ followerId: actorId, followeeId: targetUserId });
  }
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followeeId, targetUserId));
  return { following: !existing.length, followers: count?.n ?? 0 };
}

export type RemixResult = { ok: true; projectId: string; name: string } | { ok: false; reason: string };

/**
 * §58 Remix = 分叉，不是改原作品。分叉的是**这一版发布快照**：
 * 作者工作区里还没公开的东西不该因为有人想 remix 就跟着出去。
 */
export async function remixPublication(actorId: string, publicationId: string): Promise<RemixResult> {
  const db = getDb();
  const [pub] = await db
    .select()
    .from(publishedProjects)
    .where(eq(publishedProjects.id, publicationId))
    .limit(1);
  if (!pub) return { ok: false, reason: '没有这个发布版本' };
  if (pub.visibility === 'private' || pub.moderation === 'rejected') return { ok: false, reason: '这一版已经不公开了' };
  if (!pub.snapshotId) return { ok: false, reason: '这一版没有对应的快照，分叉不出来' };

  const snapshot = await readSnapshot(pub.projectId, pub.snapshotId);
  if (!snapshot) return { ok: false, reason: '快照读不到，分叉不出来' };

  const [source] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, pub.projectId)).limit(1);
  const name = `${source?.name ?? '作品'} 的改编`.slice(0, 120);
  const forked = duplicateDocument(snapshot.document, name);
  const created = await createProject(actorId, {
    name,
    kind: snapshot.document.metadata.projectType ?? 'website',
    fromDocument: forked,
  });
  // 资产换号并复制字节：共享一行等于"源项目被删就把副本的图一起删掉"，所有权也会认错
  const idMap = await copyProjectAssets(pub.projectId, created.id, actorId);
  if (idMap.size) {
    await saveDocument(created.id, remapAssetIds(forked, idMap));
  }
  await db.insert(remixes).values({ sourceProjectId: pub.projectId, forkedProjectId: created.id, userId: actorId });
  return { ok: true, projectId: created.id, name };
}

export type DiscoverSort = 'new' | 'popular' | 'following';

export interface DiscoverCard {
  publicationId: string;
  path: string;
  name: string;
  owner: string;
  handle: string | null;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  remixes: number;
  kind: string;
}

export interface DiscoverResult {
  sort: DiscoverSort;
  cards: DiscoverCard[];
  /** 排不出来就说排不出来，连同原因；不要拿累计浏览数改个名字叫 Trending */
  unavailable: { key: string; reason: string }[];
}

const DISCOVER_UNAVAILABLE = [
  { key: 'Trending', reason: '要的是互动时间序列；库里只有累计浏览与点赞数，按它们排出来的不是"正在热"' },
  { key: 'AI Picks', reason: '要的是模型推荐，没有可用的推荐 provider' },
];

/** §61 发现：只看真公开、且没被人工拒绝的版本 */
export async function discover(input: { sort: DiscoverSort; viewerId?: string | null; limit?: number }): Promise<DiscoverResult> {
  const db = getDb();
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 60);
  const base = {
    publicationId: publishedProjects.id,
    path: publishedProjects.path,
    name: projects.name,
    owner: users.displayName,
    handle: users.handle,
    publishedAt: publishedProjects.publishedAt,
    views: publishedProjects.views,
    kind: projects.kind,
    ownerId: projects.ownerId,
  };

  let followedIds: string[] | null = null;
  if (input.sort === 'following') {
    if (!input.viewerId) {
      return { sort: input.sort, cards: [], unavailable: [...DISCOVER_UNAVAILABLE, { key: 'Following', reason: '没有登录，看不到关注关系' }] };
    }
    const rows = await db.select({ followeeId: follows.followeeId }).from(follows).where(eq(follows.followerId, input.viewerId));
    followedIds = rows.map((r) => r.followeeId);
    if (!followedIds.length) return { sort: input.sort, cards: [], unavailable: DISCOVER_UNAVAILABLE };
  }

  const where = and(
    eq(publishedProjects.visibility, 'public'),
    sql`${publishedProjects.moderation} <> 'rejected'`,
    isNull(projects.deletedAt),
    followedIds ? inArray(projects.ownerId, followedIds) : undefined,
  );

  const rows = await db
    .select({
      ...base,
      likes: sql<number>`(select count(*)::int from likes where likes.project_id = ${publishedProjects.projectId})`,
      comments: sql<number>`(select count(*)::int from comments where comments.project_id = ${publishedProjects.projectId})`,
      remixes: sql<number>`(select count(*)::int from remixes where remixes.source_project_id = ${publishedProjects.projectId})`,
    })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(where)
    .orderBy(
      input.sort === 'popular'
        ? desc(sql`${publishedProjects.views} + (select count(*) from likes where likes.project_id = ${publishedProjects.projectId})`)
        : desc(publishedProjects.publishedAt),
    )
    .limit(limit);

  return {
    sort: input.sort,
    cards: rows.map((r) => ({
      publicationId: r.publicationId,
      path: r.path,
      name: r.name,
      owner: r.owner,
      handle: r.handle,
      publishedAt: r.publishedAt.toISOString(),
      views: r.views,
      likes: Number(r.likes),
      comments: Number(r.comments),
      remixes: Number(r.remixes),
      kind: r.kind,
    })),
    unavailable: DISCOVER_UNAVAILABLE,
  };
}
