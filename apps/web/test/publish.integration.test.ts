import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createDocument, createNode, findPage, type DesignDocument } from '@nexus/design-model';
import {
  getPublication,
  publishProject,
  recordView,
  resolvePublishedPath,
  runPublishGate,
  unpublishProject,
} from '../src/server/domain/publish';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { listSnapshots } from '../src/server/domain/snapshots';
import { getDb } from '../src/server/db/client';
import { pages, projects, publishedProjects, users } from '../src/server/db/schema';

/**
 * §56 / §57 发布与分享。打真实 Postgres：URL 指向的是"发布那一刻的快照"，
 * 这条只能靠真库验证——内存里改一改是看不出来的。
 */

let ownerId: string;
let otherId: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Publisher', email: `publish+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({ displayName: 'Visitor', email: `visitor+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  otherId = other!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(projects).where(eq(projects.ownerId, otherId));
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, otherId));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(ownerId, { name, kind: 'website' })).id;
}

/** 往活动页加一个带名字的文本节点并落库——用它标记"这是哪一版" */
async function addText(projectId: string, text: string): Promise<void> {
  const document = await loadDocument(projectId);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: text, text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(projectId, document!);
}

const hasText = (document: DesignDocument, text: string) =>
  document.pages.some((page) => Object.values(page.nodes).some((node) => node.text === text));

describe('发布与分享（真实数据库）', () => {
  it('门禁只报真检查过的项，没运行的项如实列出', () => {
    const good = createDocument('可以发布');
    const gate = runPublishGate(good);
    expect(gate.passed).toBe(true);
    expect(gate.checks.map((c) => c.name)).toEqual([
      '设计模型自洽',
      '对比度 / 点击目标 / 间距',
      '有可发布的内容',
    ]);
    expect(gate.notRun.length).toBeGreaterThan(0);

    const empty = createDocument('空的');
    empty.pages = [];
    empty.activePageId = '';
    const blocked = runPublishGate(empty);
    expect(blocked.passed).toBe(false);
    expect(blocked.blockers.join('')).toContain('文档没有任何页面');
  });

  it('发布：生成 /n/<handle>/<slug>，并留下一条 publish 快照', async () => {
    const id = await newProject('Publish Basic');
    const before = await listSnapshots(id);
    const result = await publishProject(id, { visibility: 'public', createdById: ownerId });
    if (!result || !result.ok) throw new Error(result && !result.ok ? result.reason : '发布失败');

    expect(result.publication.path).toMatch(/^\/n\/u[0-9a-f]{8,12}\/publish-basic$/);
    expect(result.publication.version).toBe(1);
    expect(result.publication.visibility).toBe('public');
    // 审核管线还没接入：这里必须是 pending，不能假装 approved
    expect(result.publication.moderation).toBe('pending');
    const after = await listSnapshots(id);
    expect(after.length - before.length).toBe(1);
    expect(after[0]!.label).toBe('发布 v1');
    expect(after[0]!.source).toBe('publish');

    const found = await resolvePublishedPath(result.publication.path);
    expect(found?.projectName).toBe('Publish Basic');
    expect(found?.ownerName).toBe('Publisher');
    expect(hasText(found!.document, '从一句话到一个可发布的产品')).toBe(true);

    // guest/普通用户首次发布时补一个稳定 handle，第二次还是同一个
    const db = getDb();
    const [row] = await db.select({ handle: users.handle }).from(users).where(eq(users.id, ownerId)).limit(1);
    expect(row!.handle).toBe(result.publication.path.split('/')[2]);
    expect(otherId).toBeTruthy();
  });

  it('公开链接锁的是发布那一刻：之后再改工作区也不会换掉它', async () => {
    const id = await newProject('Publish Pin');
    const first = await publishProject(id, { visibility: 'public', createdById: ownerId });
    if (!first || !first.ok) throw new Error('发布失败');
    const path = first.publication.path;

    await addText(id, '发布之后的改动');
    const pinned = await resolvePublishedPath(path);
    expect(hasText(pinned!.document, '发布之后的改动')).toBe(false);
    expect(hasText((await loadDocument(id))!, '发布之后的改动')).toBe(true);

    // 重新发布才换出去，同一条 URL 换版本而不是多一行
    const second = await publishProject(id, { visibility: 'public', createdById: ownerId });
    if (!second || !second.ok) throw new Error('第二次发布失败');
    expect(second.publication.version).toBe(2);
    expect(second.publication.path).toBe(path);
    const republished = await resolvePublishedPath(path);
    expect(hasText(republished!.document, '发布之后的改动')).toBe(true);
    const db = getDb();
    const rows = await db.select({ id: publishedProjects.id }).from(publishedProjects).where(eq(publishedProjects.projectId, id));
    expect(rows).toHaveLength(1);
  });

  it('可见性：private 的 URL 对任何人都不通，unlisted 只认精确路径', async () => {
    const id = await newProject('Publish Visibility');
    const published = await publishProject(id, { visibility: 'public', createdById: ownerId });
    if (!published || !published.ok) throw new Error('发布失败');
    const path = published.publication.path;
    expect(await resolvePublishedPath(path)).not.toBeNull();

    const off = await publishProject(id, { visibility: 'private', createdById: ownerId });
    if (!off || !off.ok) throw new Error('改为私有失败');
    expect(off.publication.version).toBe(2);
    // 作者本人走 /studio 看自己那一版，公开 URL 不认身份
    expect(await resolvePublishedPath(path)).toBeNull();
    const db = getDb();
    const [project] = await db.select({ visibility: projects.visibility }).from(projects).where(eq(projects.id, id)).limit(1);
    expect(project!.visibility).toBe('private');

    const listed = await publishProject(id, { visibility: 'unlisted', createdById: ownerId });
    if (!listed || !listed.ok) throw new Error('改为仅链接失败');
    expect(await resolvePublishedPath(path)).not.toBeNull();
    expect((await getPublication(id))!.visibility).toBe('unlisted');
  });

  it('取消发布：URL 立刻失效，历史快照留着', async () => {
    const id = await newProject('Publish Revoke');
    const published = await publishProject(id, { visibility: 'public', createdById: ownerId });
    if (!published || !published.ok) throw new Error('发布失败');
    const path = published.publication.path;
    expect(await unpublishProject(id)).toBe(true);
    expect(await resolvePublishedPath(path)).toBeNull();
    expect(await getPublication(id)).toBeNull();
    const snapshots = await listSnapshots(id);
    expect(snapshots.some((s) => s.source === 'publish')).toBe(true);
    // 没发布过再取消：如实返回 false，不报错
    expect(await unpublishProject(id)).toBe(false);
  });

  it('门禁挡住时不写发布记录，也不留 publish 快照', async () => {
    const id = await newProject('Publish Blocked');
    const db = getDb();
    // 把页面清空：loadDocument 会兜底出一个空白页，于是"有可发布的内容"这一项过不了
    await db.delete(pages).where(eq(pages.projectId, id));
    const before = await listSnapshots(id);
    const result = await publishProject(id, { visibility: 'public', createdById: ownerId });
    expect(result).not.toBeNull();
    if (!result) throw new Error('项目应当存在');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('空内容不该发布成功');
    expect(result.gate.checks.find((c) => c.name === '有可发布的内容')?.passed).toBe(false);
    expect(result.reason).toContain('门禁未通过');
    expect(await getPublication(id)).toBeNull();
    expect((await listSnapshots(id)).length).toBe(before.length);
    const rows = await db.select({ id: publishedProjects.id }).from(publishedProjects).where(eq(publishedProjects.projectId, id));
    expect(rows).toEqual([]);
  });

  it('浏览量只在公开访问上累加', async () => {
    const id = await newProject('Publish Views');
    const published = await publishProject(id, { visibility: 'public', createdById: ownerId });
    if (!published || !published.ok) throw new Error('发布失败');
    expect(published.publication.views).toBe(0);
    await recordView(published.publication.id);
    await recordView(published.publication.id);
    const again = await getPublication(id);
    expect(again!.views).toBe(2);
    const found = await resolvePublishedPath(published.publication.path);
    expect(found!.publication.views).toBeGreaterThanOrEqual(2);
  });
});
