import { raisePlan } from './support/test-plan';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/design-model';
import { accountOf, listSaves, profileOf, toggleSave, updateProfile } from '../src/server/domain/profile';
import { publicRefByPath } from '../src/server/domain/social';
import { publishProject } from '../src/server/domain/publish';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, publishedProjects, users, worlds } from '../src/server/db/schema';

/**
 * §60 创作者主页与 §59 的 Save。这一片最容易出事的地方是"顺手多给了一点"：
 * 主页是公网页面，把作者没公开的世界文档、角色档案、未发布项目一起列出去，
 * 就是一个不需要越权就能读到的泄露口。所以断言重点在**不该出现的没出现**。
 */

let ownerId: string;
let viewerId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Profile Owner', email: `pf-a+${Date.now()}@nexus.test`, handle: `pfa${Date.now().toString(36)}` },
      { displayName: 'Profile Viewer', email: `pf-b+${Date.now()}@nexus.test`, handle: `pfb${Date.now().toString(36)}` },
    ])
    .returning({ id: users.id });
  ownerId = rows[0]!.id;
  await raisePlan(ownerId);
  viewerId = rows[1]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, viewerId]));
  await db.delete(users).where(inArray(users.id, [ownerId, viewerId]));
});

async function projectWithText(name: string, text: string) {
  const project = await createProject(ownerId, { name, kind: 'website' });
  const document = await loadDocument(project.id);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: 'body', text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(project.id, document!);
  return project.id;
}

async function addWorld(projectId: string, name: string, secretSummary: string): Promise<void> {
  await getDb().insert(worlds).values({ projectId, ownerId, name, summary: secretSummary });
}

describe('profileOf（§60 的可见性边界）', () => {
  it('只列公网上传着的作品；未发布与已下架的不出现', async () => {
    const publishedId = await projectWithText('公开的那一个', 'a');
    const draftId = await projectWithText('从没发布过', 'b');
    const result = await publishProject(publishedId, { visibility: 'public', createdById: ownerId });
    expect(result?.ok).toBe(true);

    // handle 带时间戳，所以按这一行真实值取，不在测试里猜
    const [row] = await getDb().select({ handle: users.handle }).from(users).where(eq(users.id, ownerId)).limit(1);
    const profile = await profileOf(row!.handle!, viewerId);
    expect(profile).not.toBeNull();
    const names = profile!.works.map((w) => w.name);
    expect(names).toContain('公开的那一个');
    expect(names).not.toContain('从没发布过');
    expect(JSON.stringify(profile)).not.toContain(draftId);

    // 作者下架之后，主页上就没有这一栏可点了
    await publishProject(publishedId, { visibility: 'private', createdById: ownerId });
    const after = await profileOf(row!.handle!, viewerId);
    expect(after!.works.map((w) => w.name)).not.toContain('公开的那一个');
  });

  it('被人工拒绝的版本不出现在主页上（与公开页同一口径）', async () => {
    const id = await projectWithText('会被拒绝的', 'c');
    const result = await publishProject(id, { visibility: 'public', createdById: ownerId });
    if (!result || !result.ok) throw new Error('前置发布失败');
    const [row] = await getDb().select({ handle: users.handle }).from(users).where(eq(users.id, ownerId)).limit(1);
    expect((await profileOf(row!.handle!, viewerId))!.works.some((w) => w.name === '会被拒绝的')).toBe(true);

    await getDb().update(publishedProjects).set({ moderation: 'rejected' }).where(eq(publishedProjects.id, result.publication.id));
    expect((await profileOf(row!.handle!, viewerId))!.works.some((w) => w.name === '会被拒绝的')).toBe(false);
  });

  it('世界只给名字与摘要，文档正文不会因为主页而泄露', async () => {
    const id = await projectWithText('带着世界的作品', 'd');
    await addWorld(id, '艾泽拉', '三座浮岛与一条会说谎的河');
    const document = await loadDocument(id);
    // 世界文档里放一段绝不该出现在公网主页上的内容
    await getDb()
      .update(worlds)
      .set({ document: { name: '艾泽拉', entries: [{ kind: 'history', title: '秘史', body: '这段只存在于作者的项目里' }] } })
      .where(eq(worlds.projectId, id));
    await publishProject(id, { visibility: 'public', createdById: ownerId });

    const [row] = await getDb().select({ handle: users.handle }).from(users).where(eq(users.id, ownerId)).limit(1);
    const profile = await profileOf(row!.handle!, viewerId);
    expect(profile!.worlds.map((w) => w.name)).toContain('艾泽拉');
    const dumped = JSON.stringify(profile);
    expect(dumped).not.toContain('这段只存在于作者的项目里');
    expect(document).toBeTruthy();
  });

  it('游戏那一栏数的是 kind=game 的项目，说明里分清"已有"和"还没开工"', async () => {
    const [row] = await getDb().select({ handle: users.handle }).from(users).where(eq(users.id, ownerId)).limit(1);
    const profile = await profileOf(row!.handle!, viewerId);
    expect(profile!.games.count).toBe(0);
    expect(profile!.games.note).toContain('§54');
    expect(profile!.games.note).toContain('Playtest');
    // 别说"还没开工"涵盖整栏：设计文档这一半已经落地了
    expect(profile!.games.note).not.toContain('这一栏现在是空的');
  });
});

describe('Save（§59）与简介（§60）', () => {
  async function publicPath(name: string, text: string): Promise<string> {
    const id = await projectWithText(name, text);
    const result = await publishProject(id, { visibility: 'public', createdById: ownerId });
    if (!result || !result.ok) throw new Error('前置发布失败');
    return result.publication.path;
  }

  it('收藏是开关；计数说的是真数', async () => {
    const path = await publicPath('值得收藏', 'e');
    const ref = await publicRefByPath(path);
    const on = await toggleSave(viewerId, ref!.publicationId);
    expect(on).toEqual({ saved: true, count: 1 });
    const off = await toggleSave(viewerId, ref!.publicationId);
    expect(off).toEqual({ saved: false, count: 0 });
    await toggleSave(viewerId, ref!.publicationId);
    const saved = await listSaves(viewerId);
    expect(saved.map((c) => c.name)).toContain('值得收藏');
    expect(saved[0]!.unavailableReason).toBeNull();
  });

  it('并发双收藏不再 500：两次保存同时到达时终局与库一致', async () => {
    // 与点赞/关注同一族：read-then-write 撞 (user_id, publication_id) 主键（23505）。
    // 修复前 Promise.all 两次 toggleSave 第二次直接抛，公开页双点收藏就是 500。
    const path = await publicPath('并发收藏', 'g');
    const ref = await publicRefByPath(path);
    const [a, b] = await Promise.all([toggleSave(viewerId, ref!.publicationId), toggleSave(viewerId, ref!.publicationId)]);
    expect(a).toEqual({ saved: true, count: 1 });
    expect(b).toEqual({ saved: true, count: 1 });
  });

  it('作者下架之后收藏不悄悄消失，而是说清点不开的原因', async () => {
    const path = await publicPath('会被下架的收藏', 'f');
    const ref = await publicRefByPath(path);
    await toggleSave(viewerId, ref!.publicationId);
    await publishProject(ref!.projectId, { visibility: 'private', createdById: ownerId });

    const saved = await listSaves(viewerId);
    const row = saved.find((c) => c.name === '会被下架的收藏');
    expect(row?.unavailableReason).toBe('作者已下架');
    expect(row?.path).toBeTruthy(); // 记录还在，只是不能当链接用：页面按 unavailableReason 决定不渲染成链接
  });

  it('简介会随保存更新，超长被截到 500 字', async () => {
    await updateProfile(ownerId, { bio: '  做互动世界的人  ' });
    expect((await accountOf(ownerId)).bio).toBe('做互动世界的人');
    const long = await updateProfile(ownerId, { bio: '啊'.repeat(900) });
    expect(long.bio).toHaveLength(500);
    await updateProfile(ownerId, { bio: '   ' });
    expect((await accountOf(ownerId)).bio).toBeNull();
  });
});
