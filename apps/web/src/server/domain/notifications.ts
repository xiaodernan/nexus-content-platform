import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { planNotification, targetState, UNBACKED_NOTIFICATIONS, type NotificationKind, type NotifyEvent } from '@/lib/notify-plan';
import { relationOf } from './blocks';
import { getDb } from '../db/client';
import { notifications, projects, publishedProjects, users } from '../db/schema';

/**
 * §164 收件箱的读写。规则不在这里（在 `lib/notify-plan.ts`），这里只做三件事：
 * 按计划写一行（同一件事不重复写）、按收件人读一页、把读过的标上时间。
 *
 * 三条塑造了这里的写法：
 * - **emit 是幂等的**：`ON CONFLICT DO NOTHING` 挂在 dedupe_key 上，
 *   所以客户端重试、心跳重发都不会把收件箱变成噪音发生器。返回值区分 created / duplicate /
 *   suppressed，测试才能问出"这条没写进去是规则挡的还是根本没跑"。
 * - **读的时候要现场判断目标还在不在**：作者下架或换版本之后，通知指向的公开页会 404。
 *   行留着、明说"这一版已经不公开了"，比悄悄消失或给一个死链都好（§59 同一口径）。
 * - **只能按收件人读写**：所有查询都带 `user_id = 当前用户`，别人的通知查不到也标不掉。
 */

export type EmitResult = 'created' | 'duplicate' | 'suppressed';

/**
 * 写一条通知。`suppressed` 现在有两种原因：规则说这件事不出声（`notify-plan`），
 * 或者**收件人自己说过不想再听到这个人**（§132 的 block / mute）。
 * 两种都不写行、都不报错——一个人屏蔽了骚扰者之后，收件箱不该在背后继续长大。
 * 测试要分清这两层：同一种事件只换收件人就必须出声。
 */
export async function emit(event: NotifyEvent): Promise<EmitResult> {
  const plan = planNotification(event);
  if (!plan) return 'suppressed';
  if ('actorId' in event && event.actorId && (await relationOf(event.recipientId, event.actorId))) return 'suppressed';
  const db = getDb();
  const inserted = await db
    .insert(notifications)
    .values(plan)
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  return inserted.length ? 'created' : 'duplicate';
}

export interface InboxItem {
  id: string;
  /** 表里存的是 text；读到不认识的一类就报 'other'，不冒充成别的一类 */
  kind: NotificationKind | 'other';
  title: string;
  body: string | null;
  /** 造成这件事的人；账号注销后为 null，界面写"已注销的用户"而不是编一个名字 */
  actor: string | null;
  /** 只有在点得开的时候才给；否则 null，配合 unavailable 说明为什么点不开 */
  link: string | null;
  unavailable: string | null;
  createdAt: string;
  read: boolean;
}

export interface Inbox {
  items: InboxItem[];
  unread: number;
  total: number;
  /** 原文列了四类，这里如实交代没来源的那三类（§159） */
  unbacked: { spec: string; reason: string }[];
}

function isKind(value: string): value is NotificationKind {
  return (
    value === 'publish' || value === 'moderation' || value === 'like' || value === 'comment' || value === 'follow' ||
    value === 'remix' || value === 'generation'
  );
}

export async function inbox(userId: string, limit = 30): Promise<Inbox> {
  const db = getDb();
  const take = Math.min(Math.max(Math.trunc(limit) || 1, 1), 100);
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      link: notifications.link,
      projectId: notifications.projectId,
      publicationId: notifications.publicationId,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
      actorName: users.displayName,
      projectDeletedAt: projects.deletedAt,
      pubVisibility: publishedProjects.visibility,
      pubModeration: publishedProjects.moderation,
    })
    .from(notifications)
    .leftJoin(users, eq(users.id, notifications.actorId))
    .leftJoin(projects, eq(projects.id, notifications.projectId))
    .leftJoin(publishedProjects, eq(publishedProjects.id, notifications.publicationId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(take);

  const items: InboxItem[] = rows.map((row) => {
    // 判断依据是链接形态而不是 kind：切成私有的那条发布通知指向编辑区，不该按公开页去查
    const needsPublication = row.link?.startsWith('/n/') ?? false;
    const state = targetState({
      link: row.link,
      needsPublication,
      publicationId: row.publicationId,
      publicationLive: !!row.pubVisibility && row.pubVisibility !== 'private' && row.pubModeration !== 'rejected',
      projectId: row.projectId,
      projectDeleted: row.projectDeletedAt !== null,
    });
    return {
      id: row.id,
      kind: isKind(row.kind) ? row.kind : 'other',
      title: row.title,
      body: row.body,
      actor: row.actorName,
      link: state.ok ? row.link : null,
      unavailable: state.ok ? null : state.why,
      createdAt: row.createdAt.toISOString(),
      read: row.readAt !== null,
    };
  });

  const [counts] = await db
    .select({
      unread: sql<number>`count(*) filter (where ${notifications.readAt} is null)::int`,
      total: sql<number>`count(*)::int`,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId));

  return { items, unread: counts?.unread ?? 0, total: counts?.total ?? 0, unbacked: [...UNBACKED_NOTIFICATIONS] };
}

/** 标已读只认"这个人的行"：传别人的通知 id 不会改动任何东西，返回实际标掉的条数 */
export async function markRead(userId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const updated = await getDb()
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}

/** 只标当前查得到的这一批未读；不区分"哪一页"，因为收件箱不是分页产品 */
export async function markAllRead(userId: string): Promise<number> {
  const updated = await getDb()
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}
