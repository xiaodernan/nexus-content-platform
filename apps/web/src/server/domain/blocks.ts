import { and, eq, or } from 'drizzle-orm';
import {
  BLOCK_KINDS,
  COMMUNITY_REFUSAL,
  INTERACTION_BLOCKING_KINDS,
  INTERACTION_REFUSAL,
  type BlockKind,
  type InteractionVerdict,
} from '@nexus/schemas';
import { getDb } from '../db/client';
import { follows, userBlocks, users } from '../db/schema';
import { invalidateDiscoverFor } from './discover-cache';

/**
 * §132 社区治理的第三、第四件：block 与 mute。report 与 moderation 先落了
 * （`abuse_reports` / `moderation_cases`），但被骚扰的人除了举报没有任何自助手段——
 * 举报走的是"平台来处理"，而 block 是"我现在就不想再看到这个人"。两者不能互相替代。
 *
 * 两类关系刻意不一样（这是这一片最需要说清的边界）：
 * - **mute 只管可见性**：被屏蔽的人**照样**能评论、关注、点赞我，只是我这边不再看到他，
 *   也不再收到他造成的通知。屏蔽不是禁言，把它当禁言用会以为自己在处理骚扰，其实没有。
 * - **block 双向挡住互动**：他碰不到我，我也碰不到他（两个方向都拒），并且顺带把
 *   已有关注关系拆掉——留一条"我关注了一个我拉黑的人"的边，关注流里就还会冒出他的内容，
 *   等于自己给 block 留口子。mute 不动关注，因为"还想知道他在做什么，但不想被他找到"是合法的用法。
 *
 * 都不追溯历史：拉黑之前发出去的评论还在（别人仍然看得到，只是我自己这边过滤掉了），
 * 删别人的发言是 moderation 的活，不是 block 的。§131 那条"机检只升级不认证"在这里的对应是
 * "一个人的自助动作不改写公共记录"。
 *
 * kinds 与拒绝理由的字面量在 `packages/schemas/src/community-policy.ts`：java-domain-service 读同一份
 * 导出（§SC-17），这里不再抄第二份。
 */

function isKind(value: unknown): value is BlockKind {
  return (BLOCK_KINDS as readonly unknown[]).includes(value);
}

export interface BlockEntry {
  targetId: string;
  handle: string | null;
  name: string;
  kind: BlockKind;
  createdAt: string;
}

/** observer 对 subject 做过什么（没做过就是 null）。只认 observer 自己的选择 */
export async function relationOf(observerId: string | null, subjectId: string): Promise<BlockKind | null> {
  if (!observerId || observerId === subjectId) return null;
  const [row] = await getDb()
    .select({ kind: userBlocks.kind })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, observerId), eq(userBlocks.blockedId, subjectId)))
    .limit(1);
  // 不认识的一类一律当"没有关系"而不是当成 block：那要么是没写对，要么是旧数据，
  // 拿它去拒掉别人的正常互动比放行更糟
  return isKind(row?.kind) ? row.kind : null;
}

/** 这个人不该再看到的用户 id（block 与 mute 都算——两者共同的效果就是"别出现在我面前"） */
export async function hiddenAuthorIds(observerId: string | null): Promise<string[]> {
  if (!observerId) return [];
  const rows = await getDb().select({ id: userBlocks.blockedId }).from(userBlocks).where(eq(userBlocks.blockerId, observerId));
  return rows.map((r) => r.id);
}

/**
 * 能不能对对方做一件"会落到对方身上"的事（评论 / 点赞 / 关注 / 改编）。
 * 只看 block，不看 mute —— 见文件头那条边界；挡哪几类由 `INTERACTION_BLOCKING_KINDS` 说，
 * 因为 java-domain-service 读的是同一份导出（§SC-17）。
 */
export async function canInteract(actorId: string, targetId: string): Promise<InteractionVerdict> {
  const [theyBlockedMe, iBlockedThem] = await Promise.all([relationOf(targetId, actorId), relationOf(actorId, targetId)]);
  if (theyBlockedMe && INTERACTION_BLOCKING_KINDS.includes(theyBlockedMe)) {
    return { allowed: false, blockedBy: 'them', reason: INTERACTION_REFUSAL.them };
  }
  if (iBlockedThem && INTERACTION_BLOCKING_KINDS.includes(iBlockedThem)) {
    return { allowed: false, blockedBy: 'me', reason: INTERACTION_REFUSAL.me };
  }
  return { allowed: true };
}

export type SetBlockResult =
  | { ok: true; kind: BlockKind; created: boolean; unfollowed: number }
  | { ok: false; reason: string };

/** 拉黑 / 屏蔽一个人。同一对人反复提交只有一行，kind 以最后一次为准 */
export async function setBlock(actorId: string, targetId: string, kind: BlockKind): Promise<SetBlockResult> {
  if (!isKind(kind)) return { ok: false, reason: COMMUNITY_REFUSAL.unknownKind };
  if (actorId === targetId) return { ok: false, reason: COMMUNITY_REFUSAL.selfBlock };
  const db = getDb();
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).limit(1);
  if (!target) return { ok: false, reason: COMMUNITY_REFUSAL.noSuchUser };

  const existing = await db
    .select({ kind: userBlocks.kind })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, actorId), eq(userBlocks.blockedId, targetId)))
    .limit(1);
  await db
    .insert(userBlocks)
    .values({ blockerId: actorId, blockedId: targetId, kind, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [userBlocks.blockerId, userBlocks.blockedId],
      set: { kind, updatedAt: new Date() },
    });

  let unfollowed = 0;
  if (kind === 'block') {
    const removed = await db
      .delete(follows)
      .where(
        or(
          and(eq(follows.followerId, actorId), eq(follows.followeeId, targetId)),
          and(eq(follows.followerId, targetId), eq(follows.followeeId, actorId)),
        ),
      )
      .returning({ followerId: follows.followerId });
    unfollowed = removed.length;
  }
  // §SC-41：屏蔽名单变了 → actor 的全部发现视图即时作废。block 还拆掉了双向关注，
  // 目标用户那侧的 following 列表也变了，一起失效；mute 不动关注，只失效 actor 自己。
  // 隐私即时生效，不依赖 TTL——否则拉黑后 TTL 内仍看得到被拉黑的人。
  invalidateDiscoverFor(actorId, kind === 'block' ? targetId : null);
  return { ok: true, kind, created: !existing.length, unfollowed };
}

/** 解除关系。没有这一行就是 no-op，返回 removed=false 而不是报错：界面上"取消"点两次不该变红 */
export async function clearBlock(actorId: string, targetId: string): Promise<{ removed: boolean }> {
  const removed = await getDb()
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, actorId), eq(userBlocks.blockedId, targetId)))
    .returning({ blockerId: userBlocks.blockerId });
  // §SC-41：解除屏蔽 → actor 的发现视图即时重算（解除后作品该立刻回来，不能等 TTL）。
  if (removed.length) invalidateDiscoverFor(actorId);
  return { removed: removed.length > 0 };
}

/** 我自己拉黑/屏蔽了谁——没有这一页的话，拉黑就成了一条只有做的时候才有的单向门 */
export async function listBlocks(actorId: string): Promise<BlockEntry[]> {
  const rows = await getDb()
    .select({
      targetId: userBlocks.blockedId,
      handle: users.handle,
      name: users.displayName,
      kind: userBlocks.kind,
      createdAt: userBlocks.createdAt,
    })
    .from(userBlocks)
    .innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, actorId))
    .orderBy(userBlocks.createdAt);
  return rows.map((r) => ({
    targetId: r.targetId,
    handle: r.handle,
    name: r.name,
    // 直接收窄而不是"认不出来就当 block"：SQL 的 CHECK（迁移 0011）保证只有这两类，
    // 而把一行 mute 显示成 block 会让人以为对方已经碰不到自己了——那是个谎（§159）
    kind: r.kind as BlockKind,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** 按 handle 找到那个人：入口给的是 @name，关系表要的是 id */
export async function userByHandle(handle: string): Promise<{ id: string; handle: string; name: string } | null> {
  const [row] = await getDb()
    .select({ id: users.id, handle: users.handle, name: users.displayName })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);
  return row ? { id: row.id, handle: row.handle ?? handle, name: row.name } : null;
}
