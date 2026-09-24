import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { characters, comments, follows, likes, projects, publishedProjects, remixes, saves, users, worlds } from '../db/schema';
import type { DiscoverCard } from './social';

/**
 * §60 创作者主页与 §59 的 Save。
 *
 * 这里刻意窄，而且把"为什么窄"写在返回结果里：
 * - 作品只列**公网上传着**的那些（published_projects.visibility='public' 且没被人工拒绝）；
 * - 世界与角色只列属于这些公开作品的，而且只给名字与一句可展示的话——
 *   世界文档、角色档案（声音、关系、记忆）是作者项目里的内容，发布一张设计稿不等于把它们放上公网；
 * - 游戏表是空的（M5 未开工），所以给 0 并说明原因，而不是省掉这一栏让人以为漏了。
 */

/** 三张表三种外键名，分支写清楚比一个 as never 的索引表达式好读，也不给类型留洞 */
async function countBy(table: 'likes' | 'comments' | 'remixes', id: string): Promise<number> {
  const db = getDb();
  if (table === 'likes') {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(likes).where(eq(likes.projectId, id));
    return row?.n ?? 0;
  }
  if (table === 'comments') {
    const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(comments).where(eq(comments.projectId, id));
    return row?.n ?? 0;
  }
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(remixes).where(eq(remixes.sourceProjectId, id));
  return row?.n ?? 0;
}

/** 这个人的哪些项目真的在公网上传着 */
export async function publicWorksOf(ownerId: string): Promise<DiscoverCard[]> {
  const db = getDb();
  const rows = await db
    .select({
      publicationId: publishedProjects.id,
      projectId: publishedProjects.projectId,
      path: publishedProjects.path,
      name: projects.name,
      publishedAt: publishedProjects.publishedAt,
      views: publishedProjects.views,
      kind: projects.kind,
    })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(
      and(
        eq(projects.ownerId, ownerId),
        eq(publishedProjects.visibility, 'public'),
        sql`${publishedProjects.moderation} <> 'rejected'`,
        isNull(projects.deletedAt),
      ),
    )
    .orderBy(desc(publishedProjects.publishedAt));

  return Promise.all(
    rows.map(async (r) => ({
      publicationId: r.publicationId,
      path: r.path,
      name: r.name,
      owner: '',
      handle: null,
      publishedAt: r.publishedAt.toISOString(),
      views: r.views,
      likes: await countBy('likes', r.projectId),
      comments: await countBy('comments', r.projectId),
      remixes: await countBy('remixes', r.projectId),
      kind: r.kind,
    })),
  );
}

export interface PublicEntityEntry {
  name: string;
  summary: string | null;
  project: string;
}

export interface ProfileView {
  handle: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  works: DiscoverCard[];
  worlds: PublicEntityEntry[];
  characters: PublicEntityEntry[];
  games: { count: number; note: string };
  followers: number;
  following: number;
  followingByViewer: boolean;
  isSelf: boolean;
}

export async function profileOf(handle: string, viewerId: string | null): Promise<ProfileView | null> {
  const db = getDb();
  const [person] = await db
    .select({ id: users.id, name: users.displayName, handle: users.handle, avatarUrl: users.avatarUrl, bio: users.bio })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);
  if (!person) return null;

  const works = await publicWorksOf(person.id);
  const scope = works.map((w) => w.publicationId);
  // 世界 / 角色挂在项目上，所以先把"公开作品"换成对应的项目 id 集合
  const projectRows = scope.length
    ? await db.select({ id: publishedProjects.projectId }).from(publishedProjects).where(inArray(publishedProjects.id, scope))
    : [];
  const projectIds = projectRows.map((r) => r.id);

  const worldRows = projectIds.length
    ? await db
        .select({ name: worlds.name, summary: worlds.summary, project: projects.name })
        .from(worlds)
        .innerJoin(projects, eq(projects.id, worlds.projectId))
        .where(inArray(worlds.projectId, projectIds))
    : [];
  const characterRows = projectIds.length
    ? await db
        .select({ name: characters.name, profile: characters.profile, project: projects.name })
        .from(characters)
        .innerJoin(projects, eq(projects.id, characters.projectId))
        .where(inArray(characters.projectId, projectIds))
    : [];

  const [[followers], [following], [gameCount], followed] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followeeId, person.id)),
    db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followerId, person.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(eq(projects.ownerId, person.id), eq(projects.kind, 'game'), isNull(projects.deletedAt))),
    viewerId && viewerId !== person.id
      ? db
          .select({ followerId: follows.followerId })
          .from(follows)
          .where(and(eq(follows.followerId, viewerId), eq(follows.followeeId, person.id)))
          .limit(1)
      : Promise.resolve([] as { followerId: string }[]),
  ]);

  return {
    handle: person.handle ?? handle,
    name: person.name,
    avatarUrl: person.avatarUrl,
    bio: person.bio,
    works,
    worlds: worldRows.map((w) => ({ name: w.name, summary: w.summary, project: w.project })),
    characters: characterRows.map((c) => ({
      name: c.name,
      // 只取档案里那句可展示的 tagline；正文（声音、关系、经历）不外泄
      summary: taglineOf(c.profile),
      project: c.project,
    })),
    games: {
      count: gameCount?.n ?? 0,
      note:
        '这一栏数的是 kind=game 的项目。§54 的游戏设计文档（11 类实体、数值与引用）已经能存能改，' +
        '在 Studio 的「游戏」面板里；把设计变成可玩东西的那半（§50 构建、§53 Playtest）还没开工。',
    },
    followers: followers?.n ?? 0,
    following: following?.n ?? 0,
    followingByViewer: followed.length > 0,
    isSelf: viewerId === person.id,
  };
}

function taglineOf(profile: unknown): string | null {
  if (!profile || typeof profile !== 'object') return null;
  const value = (profile as { tagline?: unknown }).tagline;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** 首页要显示"我的主页"这一栏：按 id 拿 handle 与简介，不走主页那整套查询 */
export async function accountOf(
  userId: string,
): Promise<{ handle: string | null; name: string; bio: string | null; avatarUrl: string | null }> {
  const [row] = await getDb()
    .select({ handle: users.handle, name: users.displayName, bio: users.bio, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return {
    handle: row?.handle ?? null,
    name: row?.name ?? '',
    bio: row?.bio ?? null,
    avatarUrl: row?.avatarUrl ?? null,
  };
}

export interface SaveState {
  saved: boolean;
  count: number;
}

/** §59 Save：收下这一版公开页。再点一次就是取消，和点赞一样是开关 */
export async function toggleSave(actorId: string, publicationId: string): Promise<SaveState> {
  const db = getDb();
  const existing = await db
    .select({ userId: saves.userId })
    .from(saves)
    .where(and(eq(saves.publicationId, publicationId), eq(saves.userId, actorId)))
    .limit(1);
  if (existing.length) {
    await db.delete(saves).where(and(eq(saves.publicationId, publicationId), eq(saves.userId, actorId)));
  } else {
    await db.insert(saves).values({ userId: actorId, publicationId });
  }
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(saves)
    .where(eq(saves.publicationId, publicationId));
  return { saved: !existing.length, count: count?.n ?? 0 };
}

export interface SavedCard extends DiscoverCard {
  savedAt: string;
  /** 作者下架或被拒绝之后没有公开地址可去，但收藏记录要留着并说清为什么点不开 */
  unavailableReason: string | null;
}

export async function listSaves(actorId: string, limit = 30): Promise<SavedCard[]> {
  const rows = await getDb()
    .select({
      publicationId: publishedProjects.id,
      projectId: publishedProjects.projectId,
      path: publishedProjects.path,
      name: projects.name,
      owner: users.displayName,
      handle: users.handle,
      publishedAt: publishedProjects.publishedAt,
      views: publishedProjects.views,
      kind: projects.kind,
      savedAt: saves.createdAt,
      visibility: publishedProjects.visibility,
      moderation: publishedProjects.moderation,
    })
    .from(saves)
    .innerJoin(publishedProjects, eq(publishedProjects.id, saves.publicationId))
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .innerJoin(users, eq(users.id, projects.ownerId))
    .where(eq(saves.userId, actorId))
    .orderBy(desc(saves.createdAt))
    .limit(limit);

  return Promise.all(
    rows.map(async (r) => ({
      publicationId: r.publicationId,
      path: r.path,
      name: r.name,
      owner: r.owner,
      handle: r.handle,
      publishedAt: r.publishedAt.toISOString(),
      views: r.views,
      likes: await countBy('likes', r.projectId),
      comments: await countBy('comments', r.projectId),
      remixes: await countBy('remixes', r.projectId),
      kind: r.kind,
      savedAt: r.savedAt.toISOString(),
      unavailableReason:
        r.moderation === 'rejected' ? '被人工拒绝，已经不可访问' : r.visibility === 'private' ? '作者已下架' : null,
    })),
  );
}

/** §60 的自我介绍。只能改自己的——调用方传进来的 actorId 就是唯一写入范围 */
export async function updateProfile(
  actorId: string,
  input: { bio?: string; displayName?: string },
): Promise<{ bio: string | null; name: string }> {
  const db = getDb();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof input.bio === 'string') patch.bio = input.bio.trim().slice(0, 500) || null;
  if (typeof input.displayName === 'string' && input.displayName.trim()) patch.displayName = input.displayName.trim().slice(0, 60);
  const [row] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, actorId))
    .returning({ bio: users.bio, name: users.displayName });
  return { bio: row?.bio ?? null, name: row?.name ?? '' };
}
