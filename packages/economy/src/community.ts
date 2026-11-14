/**
 * M7 Stage C — 社区面数据模型（预设计，受 ADR 0018 阻塞）。
 *
 * 纯前端类型与纯函数，不引入 fetch、localStorage、session 或任何服务端依赖。
 * 一旦 ADR 0018 落地（有服务端 accounts），这些模型即可被路由与 API 层消费；
 * 在那之前只做类型定义和纯逻辑测试，不写任何网络代码。
 *
 * 设计原则（与 ADR 0018 §60 一致）：
 *  - 无 signedIn 徽章、无会话、无 cookie
 *  - 客户端不生成身份，只携带服务端或 localStorage 下发的 accountId
 *  - 每条记录都带 accountId，服务端在写入时校验归属
 */

export type AccountId = string;

/** 一个账号的公开简介（只读，来自服务端或本地缓存）。 */
export interface Profile {
  accountId: AccountId;
  handle: string;
  /** 头像 URL，可为空。 */
  avatarUrl?: string | null;
  /** 注册/创建时刻（epoch ms）。 */
  createdAt: number;
}

/** “A 关注 B”的关系记录。 */
export interface Follow {
  followerId: AccountId;
  followeeId: AccountId;
  /** 建立关注的时刻（epoch ms）。 */
  createdAt: number;
}

/** 对一篇 publication 的点赞。 */
export interface Like {
  accountId: AccountId;
  projectId: string;
  /** 点赞时刻（epoch ms）。 */
  createdAt: number;
}

/** 对一篇 publication 的评论。 */
export interface Comment {
  id: string;
  accountId: AccountId;
  projectId: string;
  /** 评论正文，已经过 HTML 转义（见 escapeHtml）。 */
  body: string;
  /** 发表时刻（epoch ms）。 */
  createdAt: number;
  /** 可被作者删除；deleted === true 时正文不再展示。 */
  deleted: boolean;
}

/** 把一组 Follow 压成“谁关注了谁”的查询索引：followeeId → Set<followerId>。 */
export function buildFollowersIndex(follows: Follow[]): Map<AccountId, Set<AccountId>> {
  const index = new Map<AccountId, Set<AccountId>>();
  for (const f of follows) {
    let set = index.get(f.followeeId);
    if (!set) {
      set = new Set();
      index.set(f.followeeId, set);
    }
    set.add(f.followerId);
  }
  return index;
}

/** 把一组 Follow 压成“谁在关注谁”的查询索引：followerId → Set<followeeId>。 */
export function buildFollowingIndex(follows: Follow[]): Map<AccountId, Set<AccountId>> {
  const index = new Map<AccountId, Set<AccountId>>();
  for (const f of follows) {
    let set = index.get(f.followerId);
    if (!set) {
      set = new Set();
      index.set(f.followerId, set);
    }
    set.add(f.followeeId);
  }
  return index;
}

/** 给定项目的点赞数（去重：同一 account 对同一 project 只算一次，以最新 createdAt 为准）。 */
export function likeCountFor(projectId: string, likes: Like[]): number {
  const seen = new Set<AccountId>();
  let count = 0;
  for (const like of likes) {
    if (like.projectId !== projectId) continue;
    if (seen.has(like.accountId)) continue;
    seen.add(like.accountId);
    count += 1;
  }
  return count;
}

/** 给定项目的未删除评论，按 createdAt 升序（旧→新）。 */
export function commentsFor(projectId: string, comments: Comment[]): Comment[] {
  return comments
    .filter((c) => c.projectId === projectId && !c.deleted)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** 判断当前账号是否已关注某账号。 */
export function isFollowing(followerId: AccountId, followeeId: AccountId, follows: Follow[]): boolean {
  return follows.some((f) => f.followerId === followerId && f.followeeId === followeeId);
}

/** 把一组 Profile 按 accountId 索引，方便在卡片/作者行里 O(1) 查 handle。 */
export function buildProfileIndex(profiles: Profile[]): Map<AccountId, Profile> {
  const index = new Map<AccountId, Profile>();
  for (const p of profiles) {
    index.set(p.accountId, p);
  }
  return index;
}

/** HTML 转义（与 explore/artifact 复用同一套：caller-controlled text 不得原样插入）。 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Stage C UI 辅助：把关注关系渲染成按钮文本。纯函数，不触网络、不写状态。 */
export function followButtonText(isFollowingNow: boolean): 'Follow' | 'Unfollow' {
  return isFollowingNow ? 'Unfollow' : 'Follow';
}

/** Stage C UI 辅助：点赞数的显示文本。0 条时不展示数字（与 explore 卡片保持一致的极简风格）。 */
export function likeCountText(count: number): string {
  return count === 0 ? '' : String(count);
}

/** Stage C UI 辅助：评论正文的展示文本，deleted 时显示占位而非原文。 */
export function commentBodyText(comment: Comment): string {
  if (comment.deleted) return '[deleted]';
  return comment.body;
}

/** Stage C 权限：谁能删除一条评论。评论作者本人，或该 publication 的作者，可以删除。
 *  纯判断，不改状态；服务端在写入前会再校验一次（ADR 0018 落地后）。 */
export function canDeleteComment(
  comment: Comment,
  viewerId: AccountId | null,
  publicationOwnerId: AccountId | null,
): boolean {
  if (!viewerId) return false;
  return viewerId === comment.accountId || viewerId === publicationOwnerId;
}

/** Stage C 显示：把 epoch ms 渲染成人类可读的相对时间（纯函数，host-supplied now 便于测试）。
 *  阈值：< 1 分钟 → "just now"；< 1 小时 → "N m ago"；< 24 小时 → "N h ago"；否则 "N d ago"。 */
export function formatSince(createdAt: number, now: number): string {
  const diffSec = Math.max(0, now - createdAt) / 1000;
  if (diffSec < 60) return 'just now';
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes} m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

/** Stage C Like：不可变集合操作。点赞/取消点赞返回一个新集合，不改原集合（host 自己决定何时写回）。 */
export function toggleLike(likes: ReadonlySet<AccountId>, accountId: AccountId): Set<AccountId> {
  const next = new Set(likes);
  if (next.has(accountId)) next.delete(accountId);
  else next.add(accountId);
  return next;
}

/** Stage C Like：给定账号是否已点赞。 */
export function isLiked(likes: ReadonlySet<AccountId>, accountId: AccountId): boolean {
  return likes.has(accountId);
}

/** Stage C Follow：不可变集合操作。关注/取消关注返回一个新集合，不改原集合（host 自己决定何时写回）。 */
export function toggleFollow(following: ReadonlySet<AccountId>, targetId: AccountId): Set<AccountId> {
  const next = new Set(following);
  if (next.has(targetId)) next.delete(targetId);
  else next.add(targetId);
  return next;
}

/** Stage C Follow：查询某账号正在关注的集合（接口预留：ADR 0018 落地后由服务端/持久层提供真实实现，
 *  这里只做纯内存占位，供客户端先写 UI 与测试）。 */
export function followingOf(viewerId: AccountId): Set<AccountId> {
  // The viewer is part of the API the caller compiles against; this placeholder has no store to read it
  // from until ADR 0018 lands.
  void viewerId;
  return new Set();
}

/** Stage C UI 辅助：屏蔽按钮文本。纯函数，不触网络、不写状态。 */
export function blockButtonText(isBlocked: boolean): 'Block' | 'Unblock' {
  return isBlocked ? 'Unblock' : 'Block';
}

/** Stage C UI 辅助：静音开关按钮文本。纯函数，不触网络、不写状态。 */
export function muteToggleButtonText(isMutedNow: boolean): 'Mute' | 'Unmute' {
  return isMutedNow ? 'Unmute' : 'Mute';
}

/** Stage C 静音：给定账号是否在 viewer 的静音集合中。纯判断，不改状态。 */
export function isMutedBy(muted: ReadonlySet<AccountId>, viewerId: AccountId): boolean {
  return muted.has(viewerId);
}