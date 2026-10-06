import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { RealtimeEvent } from '@nexus/schemas';
import { planNotification, targetState, NOTIFICATION_KINDS, UNBACKED_NOTIFICATIONS, type NotificationKind, type NotificationPlan, type NotifyEvent } from '@/lib/notify-plan';
import { channels, getRealtimeBus } from '../realtime/bus';
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
  /**
   * `level` 是实时事件的提示（成功/失败要用不同的颜色），不是表里的列——
   * 插库前摘掉，别让 drizzle 去猜一个不存在的字段。
   */
  const { level: _level, ...row } = plan;
  const inserted = await db
    .insert(notifications)
    .values(row)
    .onConflictDoNothing({ target: notifications.dedupeKey })
    .returning({ id: notifications.id });
  if (!inserted.length) return 'duplicate';
  publishNotification(plan);
  return 'created';
}

/**
 * §163：真的**新写了一条**才推实时事件。`duplicate` 与 `suppressed` 都不推——
 * 收件箱不该被同一件事反复点亮，被挡下的那件更是连行都没有。
 *
 * 只推**收件人自己的用户频道**，不推项目频道：`notification` 的收件人未必是这个项目的所有者
 * （例如"你的作品被人 Remix 了"，事件里的 projectId 可能指向对方的副本），
 * 推到项目频道就会把一条写给 A 的通知送进 B 的连接里。
 * 客户端那条连接同时订阅了用户频道与当前项目频道，所以走用户频道一样能收到。
 */
function publishNotification(plan: NotificationPlan): void {
  const event: RealtimeEvent = {
    type: 'notification',
    ...(plan.projectId ? { projectId: plan.projectId } : {}),
    level: plan.level ?? levelOf(plan.kind),
    title: plan.title,
    ...(plan.body ? { body: plan.body } : {}),
  };
  getRealtimeBus().publish(channels.user(plan.userId), event);
}

/** 通知类型 → 实时事件的级别。只是把"这件事有多要紧"翻译成一个 UI 能用的档位 */
function levelOf(kind: NotificationKind): 'info' | 'success' | 'warning' | 'error' {
  switch (kind) {
    // build / agent 那两类正常情况下自带 level（成功与失败不一样，导出缺资产还要再降一档）；
    // 这里是没带时的兜底
    case 'publish':
    case 'generation':
    case 'agent':
    case 'build':
      return 'success';
    // 审核裁决可能是撤下内容，过期作废是"一件事因为没人管而永远做不成了"——
    // 这两件都不该和"有人点了赞"同一个颜色
    case 'moderation':
    case 'approval':
      return 'warning';
    case 'like':
    case 'comment':
    case 'follow':
    case 'remix':
      return 'info';
    default: {
      const exhaustive: never = kind;
      throw new Error(`未知的通知类型：${String(exhaustive)}`);
    }
  }
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
  /** 分页信息：当前页、每页条数、是否还有更多 */
  pagination?: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

function isKind(value: string): value is NotificationKind {
  // 名单只有一份（notify-plan 里那个 Record）：加一类忘了登记会在 typecheck 就红，
  // 而不是等到读回来被报成 'other' —— 那是一句"这条通知我不认识"的假话
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_KINDS, value);
}

export interface InboxOptions {
  /** 页码，从 1 开始；默认第 1 页 */
  page?: number;
  /** 每页条数，默认 50，最大 100 */
  limit?: number;
}

/**
 * 读收件箱。支持分页：默认第 1 页、每页 50 条（符合 §164 的口径）。
 * 超过一页时返回 `pagination.hasMore = true`，界面上可以显示"另有 N 条未列出"。
 */
export async function inbox(userId: string, options: InboxOptions | number = {}): Promise<Inbox> {
  const db = getDb();
  
  // 兼容旧调用方式：直接传数字当 limit
  const isLegacyCall = typeof options === 'number';
  let page = 1;
  let limit = 50;
  if (isLegacyCall) {
    limit = options;
  } else {
    page = Math.max(1, Math.trunc(options.page ?? 1));
    limit = options.limit ?? 50;
  }
  
  const take = Math.min(Math.max(limit, 1), 100);
  const offset = (page - 1) * take;

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
    .limit(take + 1) // 多取一条判断是否还有更多
    .offset(offset);

  // 判断是否还有更多：如果取回的比请求的多一条，说明后面还有
  const hasMore = rows.length > take;
  const actualRows = hasMore ? rows.slice(0, take) : rows;

  const items: InboxItem[] = actualRows.map((row) => {
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

  const result: Inbox = { 
    items, 
    unread: counts?.unread ?? 0, 
    total: counts?.total ?? 0, 
    unbacked: [...UNBACKED_NOTIFICATIONS] 
  };
  
  // 只有当使用新的 options 格式时才返回 pagination 信息（向后兼容）
  if (!isLegacyCall) {
    result.pagination = {
      page,
      limit: take,
      hasMore,
    };
  }

  return result;
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
