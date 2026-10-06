import { and, desc, eq, gte, inArray, isNull, notInArray, sql, type SQLWrapper } from 'drizzle-orm';
import { duplicateDocument, remapAssetIds } from '@nexus/design-model';
import { getDb } from '../db/client';
import { comments, follows, likes, projects, publishedProjects, publicationVisits, remixes, saves, snapshots, users } from '../db/schema';
import { createProject, saveDocument } from './projects';
import { copyProjectAssets } from './assets';
import { readSnapshot } from './snapshots';
import { scanTextForRedlines } from './moderation';
import { canInteract, hiddenAuthorIds } from './blocks';
import {
  TRENDING_CANDIDATE_CAP,
  TRENDING_WINDOW_DAYS,
  dayAgo,
  decayedScore,
  trendingMethod,
  type DecayBucket,
} from './trending';

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
 * - **§132 的 block / mute 在这里生效**（判定与理由在 `domain/blocks.ts`）：block 挡住会落到
 *   对方身上的互动，mute 只管"我这边不再看到"。所以每个动作前问一次 `canInteract`，
 *   而列表与发现页按 `hiddenAuthorIds(当前查看者)` 过滤——过滤是**按查看者**算的，
 *   作者拉黑某人之后别人仍然看得到那条评论，这是 block 而不是 moderation 的分界。
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

/**
 * 公开可见的那一版：private、被人工拒绝的、以及项目已被删掉的都不算存在
 * （和 `resolvePublishedPath` 同一口径——那条链挡的是 `projects.deletedAt`，
 * 这里以前只挡了前两个，于是"页面已经 404 但点赞/评论/改编接口还在收"，
 * §74 让 deletedAt 真的会有值之后这个洞才是能撞上的）。
 */
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
    .where(and(eq(publishedProjects.path, path), isNull(projects.deletedAt)))
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
  /**
   * 被查看者过滤掉的评论条数（§132）。为什么不干脆不显示：那样评论从 5 条变成 3 条，
   * 作者会以为对方只发了三条，或者以为自己的过滤坏了——明说"这里还有 2 条是你选择不要看的"
   * 才是可核对的界面。
   */
  hiddenComments: number;
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
  // 过滤按**查看者**的屏蔽名单算：同一条评论，作者看是被过滤的，别人看他自己的名单
  const hidden = await hiddenAuthorIds(viewerId);
  const [visibleComments, hiddenComments] = await Promise.all([
    listComments(ref.projectId, 50, hidden),
    hiddenCommentCount(ref.projectId, hidden),
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
    comments: visibleComments,
    hiddenComments,
    remixCount: remixCount?.n ?? 0,
  };
}

export interface LikeState {
  liked: boolean;
  count: number;
  /** §132 挡住时是 'me' / 'them'（谁先拉的谁），没挡住是 null；不是一次"点赞失败" */
  blocked: 'me' | 'them' | null;
  reason: string | null;
}

export async function toggleLike(actorId: string, publicationId: string): Promise<LikeState> {
  const db = getDb();
  const [pub] = await db
    .select({ projectId: publishedProjects.projectId, ownerId: projects.ownerId })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(eq(publishedProjects.id, publicationId))
    .limit(1);
  if (!pub) throw new Error('没有这个发布版本');

  const verdict = await canInteract(actorId, pub.ownerId);
  if (!verdict.allowed) {
    // 不写库：被挡住的那次点击不该先让点赞数动一下、下一次再动回去
    return { liked: false, count: await likeCount(pub.projectId), blocked: verdict.blockedBy, reason: verdict.reason };
  }

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
  return { liked: !existing.length, count: await likeCount(pub.projectId), blocked: null, reason: null };
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

/**
 * 列评论。`excludeAuthorIds` 是**查看者**选择不要看到的人（§132 的 block + mute），
 * 过滤写在 SQL 的 where 里而不是拿到前端再 filter：limit 要在过滤之后才有意义，
 * 否则"翻一页 50 条，前端扔掉 48 条"会既少显示又谎报分页。
 */
export async function listComments(projectId: string, limit = 50, excludeAuthorIds: string[] = []): Promise<CommentEntry[]> {
  const db = getDb();
  const rows = await db
    .select({ id: comments.id, body: comments.body, author: users.displayName, createdAt: comments.createdAt })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.projectId, projectId), excludeAuthorIds.length ? notInArray(comments.userId, excludeAuthorIds) : undefined))
    .orderBy(desc(comments.createdAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, body: r.body, author: r.author, createdAt: r.createdAt.toISOString() }));
}

/** 被查看者过滤掉了多少条：过滤要在界面上报数，不然评论"变少"这件事没有解释 */
export async function hiddenCommentCount(projectId: string, excludeAuthorIds: string[]): Promise<number> {
  if (!excludeAuthorIds.length) return 0;
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(comments)
    .where(and(eq(comments.projectId, projectId), inArray(comments.userId, excludeAuthorIds)));
  return row?.n ?? 0;
}

export type CommentResult =
  | { ok: true; comment: CommentEntry; notice: string }
  | { ok: false; reason: string; rule?: string; blocked?: 'me' | 'them' };

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
    .select({ projectId: publishedProjects.projectId, ownerId: projects.ownerId })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(eq(publishedProjects.id, publicationId))
    .limit(1);
  if (!pub) return { ok: false, reason: '没有这个发布版本' };

  // §132：先问能不能落到对方身上，再写库。机检在前是因为那一步不需要查库、
  // 而"被谁拉黑"是一个人随时能改的状态，放在后面判定才不会用到过期结果
  const verdict = await canInteract(actorId, pub.ownerId);
  if (!verdict.allowed) return { ok: false, reason: verdict.reason, blocked: verdict.blockedBy };

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
  blocked: 'me' | 'them' | null;
  reason: string | null;
}

export async function toggleFollow(actorId: string, targetUserId: string): Promise<FollowState> {
  if (actorId === targetUserId) throw new Error('不能关注自己');
  const db = getDb();
  const existing = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(and(eq(follows.followerId, actorId), eq(follows.followeeId, targetUserId)))
    .limit(1);
  // §132：拉黑之后不能开始关注。"取消关注"不需要单独开一条路——setBlock 已经把两个方向的
  // 关注边一起删掉了，所以真存在一条边的时候从来不会是"被挡住"的状态
  const verdict = await canInteract(actorId, targetUserId);
  if (!verdict.allowed) {
    const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followeeId, targetUserId));
    return { following: false, followers: count?.n ?? 0, blocked: verdict.blockedBy, reason: verdict.reason };
  }
  if (existing.length) {
    await db.delete(follows).where(and(eq(follows.followerId, actorId), eq(follows.followeeId, targetUserId)));
  } else {
    await db.insert(follows).values({ followerId: actorId, followeeId: targetUserId });
  }
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(follows)
    .where(eq(follows.followeeId, targetUserId));
  return { following: !existing.length, followers: count?.n ?? 0, blocked: null, reason: null };
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

  const [source] = await db
    .select({ name: projects.name, ownerId: projects.ownerId })
    .from(projects)
    .where(eq(projects.id, pub.projectId))
    .limit(1);
  // 改编会挂在原作者的统计上并给他发一条通知，所以它和评论一样是"落到对方身上"的动作（§132）
  const verdict = source ? await canInteract(actorId, source.ownerId) : { allowed: true as const };
  if (!verdict.allowed) return { ok: false, reason: verdict.reason };
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

export type DiscoverSort = 'new' | 'popular' | 'trending' | 'following';

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
  /** 只有 trending 那一栏会填：折了时间衰减的互动分，页面上要能把数说出来 */
  score?: number;
  /** §927 封面图：快照文档里第一个被页面引用的图片资产 ID；没有就是 null */
  coverAssetId: string | null;
  /** 作者 handle（拼公共图片 URL 要用，§57） */
  ownerHandle: string | null;
}

export interface DiscoverResult {
  sort: DiscoverSort;
  cards: DiscoverCard[];
  /** 排不出来就说排不出来，连同原因；不要拿累计浏览数改个名字叫 Trending */
  unavailable: { key: string; reason: string }[];
  /**
   * 这次过滤掉了几个人（§132）。给"人数"而不是"少了几张卡片"：后者要么再跑一次不带过滤的
   * 查询、要么把四条可见性谓词抄第二份，两个都会和真正的过滤逻辑漂移。
   */
  hiddenAuthors: number;
  /** trending 那一栏的算法要能在页面上复述；别的排序是 null */
  method: string | null;
}

/**
 * AI Picks 仍然排不出来：要的是模型推荐，而这里没有可用的推荐 provider（§159 不许放假生成）。
 * Trending 以前也在这张单子上，理由是"只有累计数"——那句话已经不成立：
 * 点赞/评论/收藏/改编每行都有 created_at，访问按"访客 × 天"存着 opens，
 * 按天的互动序列因此是真的，能排。限度（窗口、半衰期、只排最近 N 条）改由 `method` 说。
 */
const DISCOVER_UNAVAILABLE = [{ key: 'AI Picks', reason: '要的是模型推荐，没有可用的推荐 provider' }];

/** §61 发现：只看真公开、且没被人工拒绝的版本 */
export async function discover(input: { sort: DiscoverSort; viewerId?: string | null; limit?: number }): Promise<DiscoverResult> {
  const db = getDb();
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 60);
  // 屏蔽名单要在任何分支之前拿到：三条 return 都要如实报"这次过滤了几个人"
  const hidden = await hiddenAuthorIds(input.viewerId ?? null);
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
    projectId: publishedProjects.projectId,
  };

  let followedIds: string[] | null = null;
  if (input.sort === 'following') {
    if (!input.viewerId) {
      return {
        sort: input.sort,
        cards: [],
        hiddenAuthors: 0,
        method: null,
        unavailable: [...DISCOVER_UNAVAILABLE, { key: 'Following', reason: '没有登录，看不到关注关系' }],
      };
    }
    const rows = await db.select({ followeeId: follows.followeeId }).from(follows).where(eq(follows.followerId, input.viewerId));
    followedIds = rows.map((r) => r.followeeId);
    if (!followedIds.length) return { sort: input.sort, cards: [], hiddenAuthors: hidden.length, method: null, unavailable: DISCOVER_UNAVAILABLE };
  }

  const where = and(
    eq(publishedProjects.visibility, 'public'),
    sql`${publishedProjects.moderation} <> 'rejected'`,
    isNull(projects.deletedAt),
    followedIds ? inArray(projects.ownerId, followedIds) : undefined,
    // §132：我屏蔽/拉黑的人的作品不再出现（block 与 mute 共同的效果就是"别在我面前"）
    hidden.length ? notInArray(projects.ownerId, hidden) : undefined,
  );

  const rows = await db
    .select({
      ...base,
      likes: sql<number>`(select count(*)::int from likes where likes.project_id = ${publishedProjects.projectId})`,
      comments: sql<number>`(select count(*)::int from comments where comments.project_id = ${publishedProjects.projectId})`,
      remixes: sql<number>`(select count(*)::int from remixes where remixes.source_project_id = ${publishedProjects.projectId})`,
      /** §927 封面图：快照文档里的第一个图片资产（被页面引用的） */
      snapshotDocument: snapshots.document,
    })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .innerJoin(users, eq(users.id, projects.ownerId))
    .leftJoin(snapshots, eq(snapshots.id, publishedProjects.snapshotId))
    .where(where)
    .orderBy(
      input.sort === 'popular'
        ? desc(sql`${publishedProjects.views} + (select count(*) from likes where likes.project_id = ${publishedProjects.projectId})`)
        : desc(publishedProjects.publishedAt),
    )
    // trending 要在"最近这么多条公开版本"里算分：候选集就是这一句，页面上也照这句话写
    .limit(input.sort === 'trending' ? TRENDING_CANDIDATE_CAP : limit);

  const cards: DiscoverCard[] = rows.map((r) => {
    // §927 从快照文档里找第一个被页面引用的图片资产作为封面
    let coverAssetId: string | null = null;
    if (r.snapshotDocument) {
      const doc = r.snapshotDocument as { assets?: Array<{ id: string; kind: string }> };
      const pages = (doc as any).pages || [];
      const assetIds = new Set<string>();
      // 收集所有页面节点引用的资产 ID
      for (const page of pages) {
        const collectAssetRefs = (node: any): void => {
          if (!node) return;
          if (node.assetId && typeof node.assetId === 'string') {
            assetIds.add(node.assetId);
          }
          if (node.children && Array.isArray(node.children)) {
            for (const child of node.children) collectAssetRefs(child);
          }
        };
        if (page.nodes && Array.isArray(page.nodes)) {
          for (const node of page.nodes) collectAssetRefs(node);
        }
      }
      // 找到第一个是图片且被引用的资产
      if (doc.assets && Array.isArray(doc.assets)) {
        for (const asset of doc.assets) {
          if (asset.kind === 'image' && assetIds.has(asset.id)) {
            coverAssetId = asset.id;
            break;
          }
        }
      }
    }
    return {
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
      coverAssetId,
      ownerHandle: r.handle,
    };
  });

  let method: string | null = null;
  if (input.sort === 'trending') {
    const scores = await trendScores(rows.map((r) => ({ publicationId: r.publicationId, projectId: r.projectId })));
    for (const card of cards) card.score = scores.get(card.publicationId) ?? 0;
    // 同分按发布时间倒序，再同则按路径：只到"发布时间"这一级时，同一毫秒发布的两份
    // 会跟着数据库返回行的顺序漂，两次刷新看到的榜就不一样了
    cards.sort(
      (a, b) =>
        (b.score ?? 0) - (a.score ?? 0) ||
        b.publishedAt.localeCompare(a.publishedAt) ||
        b.path.localeCompare(a.path),
    );
    cards.splice(limit);
    method = trendingMethod();
  }

  return {
    sort: input.sort,
    cards,
    unavailable: DISCOVER_UNAVAILABLE,
    hiddenAuthors: hidden.length,
    method,
  };
}

/**
 * 一周内这些作品各被"动"了多少：按天分桶后折成衰减分。
 * 键是 publicationId（发现页排的是版本，不是项目），所以先把 project → publication 对上。
 */
async function trendScores(pairs: { publicationId: string; projectId: string }[]): Promise<Map<string, number>> {
  const db = getDb();
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86_400_000);
  const byProject = new Map(pairs.map((pair) => [pair.projectId, pair.publicationId]));
  const buckets = new Map<string, DecayBucket[]>();
  const push = (publicationId: string | undefined, bucket: DecayBucket): void => {
    if (!publicationId) return;
    const list = buckets.get(publicationId) ?? [];
    list.push(bucket);
    buckets.set(publicationId, list);
  };
  const daySql = (column: SQLWrapper) => sql<string>`to_char(${column}, 'YYYY-MM-DD')`;

  const [likeRows, commentRows, saveRows, remixRows, visitRows] = await Promise.all([
    db
      .select({ projectId: likes.projectId, day: daySql(likes.createdAt), count: sql<number>`count(*)::int` })
      .from(likes)
      .where(gte(likes.createdAt, since))
      .groupBy(likes.projectId, daySql(likes.createdAt)),
    db
      .select({ projectId: comments.projectId, day: daySql(comments.createdAt), count: sql<number>`count(*)::int` })
      .from(comments)
      .where(gte(comments.createdAt, since))
      .groupBy(comments.projectId, daySql(comments.createdAt)),
    db
      .select({ publicationId: saves.publicationId, day: daySql(saves.createdAt), count: sql<number>`count(*)::int` })
      .from(saves)
      .where(gte(saves.createdAt, since))
      .groupBy(saves.publicationId, daySql(saves.createdAt)),
    db
      .select({ projectId: remixes.sourceProjectId, day: daySql(remixes.createdAt), count: sql<number>`count(*)::int` })
      .from(remixes)
      .where(gte(remixes.createdAt, since))
      .groupBy(remixes.sourceProjectId, daySql(remixes.createdAt)),
    db
      .select({
        publicationId: publicationVisits.publicationId,
        day: publicationVisits.day,
        opens: sql<number>`coalesce(sum(${publicationVisits.opens}), 0)::int`,
      })
      .from(publicationVisits)
      .where(gte(publicationVisits.day, since.toISOString().slice(0, 10)))
      .groupBy(publicationVisits.publicationId, publicationVisits.day),
  ]);

  for (const row of likeRows) push(byProject.get(row.projectId), { kind: 'like', dayAgo: dayAgo(new Date(`${row.day}T12:00:00Z`)) ?? 0, count: row.count });
  for (const row of commentRows)
    push(byProject.get(row.projectId), { kind: 'comment', dayAgo: dayAgo(new Date(`${row.day}T12:00:00Z`)) ?? 0, count: row.count });
  for (const row of remixRows)
    push(byProject.get(row.projectId), { kind: 'remix', dayAgo: dayAgo(new Date(`${row.day}T12:00:00Z`)) ?? 0, count: row.count });
  for (const row of saveRows) push(row.publicationId, { kind: 'save', dayAgo: dayAgo(new Date(`${row.day}T12:00:00Z`)) ?? 0, count: row.count });
  for (const row of visitRows) push(row.publicationId, { kind: 'open', dayAgo: dayAgo(new Date(`${row.day}T12:00:00Z`)) ?? 0, count: row.opens });

  const scores = new Map<string, number>();
  for (const [publicationId, list] of buckets) scores.set(publicationId, decayedScore(list));
  return scores;
}
