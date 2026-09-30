import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RealtimeEvent } from '@nexus/schemas';
import { eq } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/design-model';
import { publishProject, resolvePublishedPath, unpublishProject } from '../src/server/domain/publish';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { channels, setRealtimeBus, type RealtimeBus } from '../src/server/realtime/bus';
import { getDb } from '../src/server/db/client';
import { projects, publishedProjects, users } from '../src/server/db/schema';

/**
 * §163 的最后两类事件（`build.status` / `preview.status`）的第一批生产者就是发布链路。
 * 这一份用例要挡的是三种谎：
 * ① "请求一进来就报构建中、返回前报成功"——中间什么都没做也有刻度，所以钉的是**整串顺序**，
 *    门禁挡下的那一次必须是 `building → failed` 且一条 preview 都没有；
 * ② "库里有行就说预览就绪"——`preview.status` 那一格必须来自 `resolvePublishedPath` 的真实解析，
 *    所以下架那一次断的是 idle，并把判据本身再读一遍做对照；
 * ③ 事件里那句话与 HTTP 回话里那句话各写一遍、后来对不上——挡下时断言 `log === result.reason`，
 *    同一个字符串才不可能漂移。
 *
 * 打真实 Postgres，总线换成记账用的假驱动：要验的是"该发的时候发了、不该发的时候一条都没有"。
 */

interface Captured {
  channel: string;
  event: RealtimeEvent;
}

let captured: Captured[] = [];
const bus: RealtimeBus = {
  publish: (channel, event) => captured.push({ channel, event }),
  subscribe: () => () => undefined,
  subscriberCount: () => 0,
};

let ownerId: string;

/** 每个用例都从"记账总线已装好、账本已清空"开始（同 realtime.integration.test.ts：不写成末尾恢复） */
beforeEach(() => {
  captured = [];
  setRealtimeBus(bus);
});

beforeAll(async () => {
  const db = getDb();
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Build Status', email: `build+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
});

afterAll(async () => {
  setRealtimeBus(undefined);
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(ownerId, { name, kind: 'website' })).id;
}

/**
 * 整串事件的形状（类型 + 状态），用来把顺序与条数一起钉住。
 * 只看项目频道那一路：`emit()` 走的是用户频道（通知），混在一条串里就把"发布进度在项目频道上"
 * 这句主张测成了"总共有几条事件"。
 */
function traceFor(projectId: string): string[] {
  return captured
    .filter((item) => item.channel === channels.project(projectId))
    .map((item) => {
      const event = item.event;
      if (event.type === 'build.status' || event.type === 'preview.status') return `${event.type}:${event.status}`;
      return `${event.type}:*`;
    });
}

const statusEvents = (projectId: string) =>
  captured.filter(
    (item): item is Captured & { event: Extract<RealtimeEvent, { type: 'build.status' } | { type: 'preview.status' }> } =>
      item.channel === channels.project(projectId) &&
      (item.event.type === 'build.status' || item.event.type === 'preview.status'),
  );

/** 把活动页清空：门禁那条"页面里还没有可见内容"就是这么触发的，不靠改门禁 */
async function emptyThePage(projectId: string): Promise<void> {
  const document = await loadDocument(projectId);
  if (!document) throw new Error('文档读不出来');
  const page = findPage(document, document.activePageId) ?? document.pages[0]!;
  const root = page.nodes[page.rootId]!;
  for (const childId of [...root.children]) delete page.nodes[childId];
  root.children = [];
  await saveDocument(projectId, document);
}

/** 往活动页塞一段会命中硬红线的可见文字（机检看的是访客能读到的东西） */
async function addBlockedText(projectId: string, text: string): Promise<void> {
  const document = await loadDocument(projectId);
  if (!document) throw new Error('文档读不出来');
  const page = findPage(document, document.activePageId) ?? document.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: text, text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(projectId, document);
}

const publicationRows = (projectId: string) =>
  getDb().select({ id: publishedProjects.id }).from(publishedProjects).where(eq(publishedProjects.projectId, projectId));

describe('发布链路的 build.status / preview.status（真实数据库）', () => {
  it('发布成功：building → ok → preview ready，ready 说的就是真的解析得出的那一条路径', async () => {
    const projectId = await newProject('Build Ok');
    const result = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!result || !result.ok) throw new Error(!result ? '发布返回 null' : result.reason);

    expect(traceFor(projectId)).toEqual(['build.status:building', 'build.status:ok', 'preview.status:ready']);
    // 频道各管各的：进度在项目频道，通知在用户频道，一条都不许串
    expect(captured.some((item) => item.channel === channels.user(ownerId) && item.event.type === 'notification')).toBe(true);
    expect(
      captured.every((item) =>
        item.event.type === 'build.status' || item.event.type === 'preview.status'
          ? item.channel === channels.project(projectId)
          : true,
      ),
    ).toBe(true);

    const ready = statusEvents(projectId)[2]!.event;
    if (ready.type !== 'preview.status') throw new Error('第三条不是 preview.status');
    // 路径从返回的那一条派生，不在这里重抄；再拿公开页用的同一个解析函数对照一次
    expect(ready.url).toBe(result.publication.path);
    expect(await resolvePublishedPath(result.publication.path)).not.toBeNull();
  });

  it('门禁挡下：building → failed，log 与返回的 reason 是同一个字符串，一条 preview 都不发', async () => {
    const projectId = await newProject('Build Gate');
    await emptyThePage(projectId);
    const result = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!result || result.ok) throw new Error(!result ? '发布返回 null' : '门禁居然放行了');

    expect(traceFor(projectId)).toEqual(['build.status:building', 'build.status:failed']);
    const failed = statusEvents(projectId)[1]!.event;
    if (failed.type !== 'build.status') throw new Error('第二条不是 build.status');
    // 同一句原因：界面从事件读到的与 HTTP 回话里的是同一个字符串，不会各漂移一份
    expect(failed.log).toBe(result.reason);
    // 什么都没变得可达，就不许出现"预览就绪"；挡下也不发通知——没有"构建完成"可报
    expect(statusEvents(projectId).filter((item) => item.event.type === 'preview.status')).toHaveLength(0);
    expect(captured.some((item) => item.event.type === 'notification')).toBe(false);
    // 库里也确实没多出 publication 行——事件说的和库里的对得上
    expect(await publicationRows(projectId)).toHaveLength(0);
  });

  it('机检挡下：同样 building → failed，原因里带着命中的那条规则', async () => {
    const projectId = await newProject('Build Scan');
    await addBlockedText(projectId, 'a nude teen teaser here');
    const result = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!result || result.ok) throw new Error(!result ? '发布返回 null' : '机检居然放行了');

    expect(traceFor(projectId)).toEqual(['build.status:building', 'build.status:failed']);
    const failed = statusEvents(projectId)[1]!.event;
    if (failed.type !== 'build.status') throw new Error('第二条不是 build.status');
    expect(failed.log).toBe(result.reason);
    expect(failed.log).toContain('redline.');
    expect(statusEvents(projectId).filter((item) => item.event.type === 'preview.status')).toHaveLength(0);
    expect(await publicationRows(projectId)).toHaveLength(0);
  });

  it('切成私有（下架方向）：ok 之后 preview 是 idle，而 idle 之前那条路径真的解析不出来', async () => {
    const projectId = await newProject('Build Retract');
    const first = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!first || !first.ok) throw new Error(!first ? '发布返回 null' : first.reason);
    const path = first.publication.path;
    captured = [];

    const off = await publishProject(projectId, { visibility: 'private', createdById: ownerId });
    if (!off || !off.ok) throw new Error(!off ? '改成私有返回 null' : '改成私有失败');
    expect(traceFor(projectId)).toEqual(['build.status:building', 'build.status:ok', 'preview.status:idle']);
    const idle = statusEvents(projectId)[2]!.event;
    if (idle.type !== 'preview.status') throw new Error('第三条不是 preview.status');
    expect(idle.url).toBe(path);
    // 这一格是读出来的不是推断的：把判据本身再读一遍
    expect(await resolvePublishedPath(path)).toBeNull();
  });

  it('取消发布只发 preview idle，不发 build.status（下架不是一次构建）', async () => {
    const projectId = await newProject('Build Unpublish');
    const published = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!published || !published.ok) throw new Error(!published ? '发布返回 null' : published.reason);
    const path = published.publication.path;
    captured = [];

    expect(await unpublishProject(projectId, ownerId)).toBe(true);
    expect(traceFor(projectId)).toEqual(['preview.status:idle']);
    // 行真的没了，所以路径不再解析得出
    expect(await resolvePublishedPath(path)).toBeNull();
  });

  it('从没开始的操作一条事件都不发：项目不存在时既没有 building 也没有 failed', async () => {
    const result = await publishProject('00000000-0000-4000-8000-000000000000', {
      visibility: 'public',
      createdById: ownerId,
    });
    expect(result).toBeNull();
    expect(captured).toHaveLength(0);
  });
});
