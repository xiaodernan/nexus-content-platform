import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { createProject } from '../src/server/domain/projects';
import { publishProject } from '../src/server/domain/publish';
import {
  emit,
  getNotificationSettings,
  inbox,
  shouldSendNotification,
  updateNotificationSetting,
} from '../src/server/domain/notifications';
import { getDb } from '../src/server/db/client';
import { getRealtimeBus, channels } from '../src/server/realtime/bus';
import { notificationSettings, notifications, projects, users } from '../src/server/db/schema';
import type { NotifyEvent } from '../src/lib/notify-plan';

/**
 * §164 静音门：用户关掉的那一类，emit 直接 suppressed——不写行、不推实时事件、
 * 收件箱不会在背后继续长大。打真库。
 *
 * 此前唯一的 suppressed 断言是"自己对自己做的事"（§164 集成测试里那条）；
 * **偏好开关这一路零覆盖**——而它恰好是设置端点存在的全部理由：
 * 写端（notifications-settings.integration.test.ts）只证了"开关落库"，
 * 没证"关掉之后真的不发"。两件事分开才看得见：写进去 ≠ 生效。
 *
 * 每条"静音了"都配一条对照：同一时刻未静音的别类照发、解除静音后照发——
 * 少一种，"通过"就只是"数据没建起来"的同义反复。
 */

const RUN = `s164m${Date.now().toString(36)}`;
let ownerId: string;
let actorId: string;
let actor2Id: string;
let target: { projectId: string; publicationId: string; path: string };

beforeAll(async () => {
  const db = getDb();
  const [owner] = await db
    .insert(users)
    .values({ displayName: `静音作者${RUN}`, email: `n164mo+${RUN}@nexus.test`, handle: `nm${RUN}` })
    .returning({ id: users.id });
  const [actor] = await db
    .insert(users)
    .values({ displayName: `静音路人${RUN}`, email: `n164ma+${RUN}@nexus.test`, handle: `nma${RUN}` })
    .returning({ id: users.id });
  // 第二个路人：实时事件那条要"同一类换一个人"来绕开 dedupe，假 id 会撞 actor 外键
  const [actor2] = await db
    .insert(users)
    .values({ displayName: `静音路人二${RUN}`, email: `n164mb+${RUN}@nexus.test`, handle: `nmb${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  actorId = actor!.id;
  actor2Id = actor2!.id;

  const projectId = (await createProject(ownerId, { name: `静音作品${RUN}`, kind: 'website' })).id;
  const result = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
  if (!result || !result.ok) throw new Error('发布失败');
  target = { projectId, publicationId: result.publication.id, path: result.publication.path };
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, actorId, actor2Id]));
  await db.delete(users).where(inArray(users.id, [ownerId, actorId, actor2Id]));
});

const likeOn = (): NotifyEvent => ({
  kind: 'like',
  recipientId: ownerId,
  actorId,
  actorName: `静音路人${RUN}`,
  projectId: target.projectId,
  publicationId: target.publicationId,
  path: target.path,
  projectName: `静音作品${RUN}`,
});

/** 显式钉成 follow 变体：联合类型上改 actorId 会撞上 publish 变体没有该字段 */
type FollowEvent = Extract<NotifyEvent, { kind: 'follow' }>;

const followFrom = (): FollowEvent => ({
  kind: 'follow',
  recipientId: ownerId,
  actorId,
  actorName: `静音路人${RUN}`,
  actorHandle: `nma${RUN}`,
});

/** 直接数库里的行：读的一侧与被测的一侧不共用一份实现 */
async function rowsFor(userId: string): Promise<{ kind: string }[]> {
  return getDb()
    .select({ kind: notifications.kind })
    .from(notifications)
    .where(eq(notifications.userId, userId));
}

/** 只看 like 这一类的行：beforeAll 里那次发布会给作者留一条 publish 通知（那是另一类的事） */
async function likeRowsFor(userId: string): Promise<{ kind: string }[]> {
  return getDb()
    .select({ kind: notifications.kind })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.kind, 'like')));
}

describe('§164 静音门（写端只证落库，这一片证生效）', () => {
  it('默认全开：没写过设置的用户，每一类都该收', async () => {
    expect(await shouldSendNotification(ownerId, 'like')).toBe(true);
    const settings = await getNotificationSettings(ownerId);
    expect(Object.values(settings).every((enabled) => enabled)).toBe(true);
  });

  it('关掉 like → emit 被 suppressed：不写行、收件箱不长大', async () => {
    await updateNotificationSetting(ownerId, 'like', false);
    expect(await shouldSendNotification(ownerId, 'like')).toBe(false);

    const result = await emit(likeOn());
    expect(result).toBe('suppressed');

    // like 零行：suppressed 是"连库都不写"，不是"写了再过滤"
    // （beforeAll 那次发布给作者留的 publish 行是另一类的事，这里只看 like）
    expect(await likeRowsFor(ownerId)).toHaveLength(0);
    const page = await inbox(ownerId);
    expect(page.items.filter((item) => item.kind === 'like')).toHaveLength(0);
  });

  it('不误伤别类：同一时刻未静音的 follow 照发', async () => {
    const result = await emit(followFrom());
    expect(result).toBe('created');
    expect((await rowsFor(ownerId)).map((r) => r.kind)).toContain('follow');
  });

  it('静音的那一类不推实时事件，照发的那一类才推（订阅用户频道数事件）', async () => {
    await updateNotificationSetting(ownerId, 'like', false);
    const bus = getRealtimeBus();
    const seen: string[] = [];
    const unsubscribe = bus.subscribe(channels.user(ownerId), (event) => {
      // RealtimeEvent 是联合：agent.plan 那类没有 title，只收通知这一类
      if ('title' in event) seen.push(event.title);
    });

    // 静音的 like：suppressed → 无事件
    expect(await emit(likeOn())).toBe('suppressed');
    // 未静音的 follow：第三条已经写过 actor 的那条（dedupe 键相同），这里换成第二个路人关注——
    // dedupe 是"同一件事只留一条"的库级去重，不是"这一类只能有一条"，
    // 换 actor 就是另一件事，应当 created 并推出事件
    const other = followFrom();
    other.actorId = actor2Id;
    other.actorName = `静音路人二${RUN}`;
    expect(await emit(other)).toBe('created');

    await new Promise((resolve) => setTimeout(resolve, 50));
    unsubscribe();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('关注');
  });

  it('解除静音 → 照发（upsert 的"有就改"这一半）', async () => {
    await updateNotificationSetting(ownerId, 'like', true);
    expect(await shouldSendNotification(ownerId, 'like')).toBe(true);
    const result = await emit(likeOn());
    expect(result).toBe('created');
    expect((await rowsFor(ownerId)).map((r) => r.kind)).toContain('like');
  });

  it('设置落库的形态：显式写过的才有一行，别的按默认全开回答', async () => {
    const settings = await getNotificationSettings(ownerId);
    expect(settings.like).toBe(true); // 上一条解除过
    expect(settings.follow).toBe(true);
    // 没有显式写过的类：库里无行，读取层按默认全开回答（follow 全程走默认，没写过设置）
    const explicit = await getDb()
      .select({ kind: notificationSettings.kind })
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, ownerId));
    expect(explicit.map((r) => r.kind)).toEqual(['like']);
  });
});
