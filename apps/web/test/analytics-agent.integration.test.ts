import { raisePlan } from './support/test-plan';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { analyzeCreatorFacts, buildCreatorFact } from '../src/server/domain/analytics-agent';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { publishProject } from '../src/server/domain/publish';
import { saveGame } from '../src/server/domain/games';
import { recordVisit } from '../src/server/domain/analytics';
import { getDb } from '../src/server/db/client';
import { assets, projects, users } from '../src/server/db/schema';

/**
 * §169 的装配那一半打真库：规则本身在 `analytics-agent.test.ts` 里逐条钉过，
 * 这里钉的是"事实是不是从真实现场读出来的"——归属、删除、没发布过这三种拿不到答案的情形
 * 必须是同一个答案，而数字必须与 §168 那一页读到的一致（两边不一致就是分析在编）。
 */

const RUN = `s169${Date.now().toString(36)}`;
const KEY = 'ab'.repeat(16); // 32 位十六进制的匿名 key
let ownerId: string;
let otherId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const rows = await db
    .insert(users)
    .values([
      { displayName: `分析作者${RUN}`, email: `aa+${RUN}@nexus.test`, handle: `aa${RUN}` },
      { displayName: `分析路人${RUN}`, email: `ab+${RUN}@nexus.test`, handle: `ab${RUN}` },
    ])
    .returning({ id: users.id });
  ownerId = rows[0]!.id;
  await raisePlan(ownerId);
  otherId = rows[1]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, otherId]));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

/** 建项目 →（可选）写一句简介 → 公开发布。返回两个 id：分析读项目行，访客读发布行 */
async function published(name: string, description: string | null = null): Promise<{ projectId: string; publicationId: string }> {
  const projectId = (await createProject(ownerId, { name, kind: 'website' })).id;
  if (description !== null) {
    // 简介是项目的元信息：走一遍 saveDocument 确认它不会把这一列冲掉，再直接写那一列
    const document = (await loadDocument(projectId))!;
    await saveDocument(projectId, document);
    await getDb().update(projects).set({ description }).where(eq(projects.id, projectId));
  }
  const result = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
  if (!result || !result.ok) throw new Error(result ? result.reason : '发布失败（返回了 null）');
  return { projectId, publicationId: result.publication.id };
}

describe('装配出来的事实必须来自真实现场', () => {
  it('刚发布、只有作者自己打开过 → 说的是"这串数字只证明你自己看过"，不是"零访客"', async () => {
    const { projectId, publicationId } = await published('只有自己的作品');
    expect(await recordVisit({ publicationId, visitorKey: KEY, userId: ownerId, open: true, visibleMs: 4000, completionPct: 80 })).toBe('recorded');

    const fact = await buildCreatorFact(projectId, ownerId);
    expect(fact).not.toBe(null);
    const findings = analyzeCreatorFacts(fact!);
    const traffic = findings.find((f) => f.area === 'traffic');
    // 这一条是这片最容易被编错的地方：作者自己刷了十次，界面上写成"有人在看了"是谎话；
    // 反过来写成"零访客"也是谎话——库里确实有一行访客
    expect(traffic?.evidence).toContain('都是你本人');
    expect(traffic?.evidence).not.toContain('独立访客 0 人');
    // 完成度采到了（80%）→ 不该出现"没采到"那两条
    expect(fact?.numbers.completion?.avgPct).toBe(80);
    expect(findings.some((f) => f.area === 'retention')).toBe(false);
    // 新项目没有简介、也没有被画到的图片资产：这两条要出现
    expect(findings.some((f) => f.area === 'description')).toBe(true);
    expect(findings.some((f) => f.area === 'thumbnail')).toBe(true);
    // 刚发布的那一版审核还停在 pending：这一条要出现，但不能被说成"被驳回 / 被搜索挡掉"
    const settings = findings.find((f) => f.area === 'settings');
    expect(settings?.evidence).toContain('pending');
    expect(settings?.conclusion).toContain('不是"没人看"的直接原因');
  });

  it('作者写过简介时，简介那条建议就不该出现（同一份规则换个事实）', async () => {
    const { projectId } = await published('有简介的作品', '三分钟检查一版设计稿的间距与字号层级。');
    const fact = await buildCreatorFact(projectId, ownerId);
    expect(fact?.description).toBe('三分钟检查一版设计稿的间距与字号层级。');
    expect(analyzeCreatorFacts(fact!).some((f) => f.area === 'description')).toBe(false);
    // 反向对照：同一个装配路径下，没写简介的那一件确实报出这一条
    const bare = await published('没写简介的作品');
    const bareFact = await buildCreatorFact(bare.projectId, ownerId);
    expect(bareFact?.description).toBe(null);
    expect(analyzeCreatorFacts(bareFact!).some((f) => f.area === 'description')).toBe(true);
  });

  it('封面那条读的是钉住的那一版：真被画到的图片资产才算，光有一行资产记录不算', async () => {
    // 造一份"首屏画着这张图"的作品：assets 表里有一行 + 根节点的 fills 真的引用它
    const projectId = (await createProject(ownerId, { name: '有封面的作品', kind: 'website' })).id;
    const [asset] = await getDb()
      .insert(assets)
      .values({ projectId, kind: 'image', name: 'cover.png', storageKey: `projects/${projectId}/cover.png`, source: 'upload' })
      .returning({ id: assets.id });
    const document = (await loadDocument(projectId))!;
    const page = document.pages[0]!;
    page.nodes[page.rootId]!.style = { ...page.nodes[page.rootId]!.style, fills: [{ kind: 'image', assetId: asset!.id, fit: 'cover' }] };
    await saveDocument(projectId, document);
    const result = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!result || !result.ok) throw new Error(result ? result.reason : '发布失败');

    const fact = await buildCreatorFact(projectId, ownerId);
    expect(fact?.hasCoverImage).toBe(true);
    expect(analyzeCreatorFacts(fact!).some((f) => f.area === 'thumbnail')).toBe(false);

    // 反向对照一：资产在库里、但这一版没画到它 → 仍然不算封面（§57/§166 同一口径，
    // 否则被设计删掉的图会一直算作"有封面"）
    const bareId = (await createProject(ownerId, { name: '有图没画的作品', kind: 'website' })).id;
    await getDb()
      .insert(assets)
      .values({ projectId: bareId, kind: 'image', name: 'loose.png', storageKey: `projects/${bareId}/loose.png`, source: 'upload' });
    const barePublish = await publishProject(bareId, { visibility: 'public', createdById: ownerId });
    if (!barePublish || !barePublish.ok) throw new Error(barePublish ? barePublish.reason : '发布失败');
    const bareFact = await buildCreatorFact(bareId, ownerId);
    expect(bareFact?.hasCoverImage).toBe(false);
    expect(analyzeCreatorFacts(bareFact!).some((f) => f.area === 'thumbnail')).toBe(true);
  });

  it('别人的项目、不存在的项目、没发布过的项目：三个都是 null，不给"差在哪"的线索', async () => {
    const mine = await published('别人的读不到');
    expect(await buildCreatorFact(mine.projectId, otherId)).toBe(null);
    expect(await buildCreatorFact('not-a-uuid', ownerId)).toBe(null);

    const unpublished = (await createProject(ownerId, { name: '还没发布', kind: 'website' })).id;
    expect(await buildCreatorFact(unpublished, ownerId)).toBe(null);
  });

  it('软删掉的项目不再给分析（回收站里的那一件不该出现在数据页上）', async () => {
    const { projectId } = await published('会被删掉');
    expect(await buildCreatorFact(projectId, ownerId)).not.toBe(null);
    await getDb().update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, projectId));
    expect(await buildCreatorFact(projectId, ownerId)).toBe(null);
  });

  it('可玩的那一类 · 有人来过但没人玩到结局 ⇒ 事实里带 hasGame，那条发现真的出现', async () => {
    const projectId = (await createProject(ownerId, { name: `可玩的作品${RUN}`, kind: 'website' })).id;
    // 存一份游戏设计再发布 ⇒ 发布那一刻钉住它（ADR-0009）⇒ 那一版才是"可玩的那一类"
    const now = new Date().toISOString();
    const saved = await saveGame(projectId, ownerId, {
      id: `g-${RUN}`,
      projectId,
      name: '一次到结局的对话',
      summary: '两段对话，第二段没有下一段',
      kind: 'interactive-story',
      entities: [
        {
          id: 'beat-1',
          kind: 'dialogue',
          name: '门口',
          notes: '你站在门口。',
          tags: [],
          stats: {},
          refs: [{ id: 'ref-1', to: 'beat-2', role: '推门进去' }],
          updatedAt: now,
        },
        {
          id: 'beat-2',
          kind: 'dialogue',
          name: '收下这张画',
          notes: '你收下了那张画。',
          tags: [],
          stats: {},
          refs: [],
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    });
    expect(saved.ok, '游戏设计没存进去').toBe(true);
    const result = await publishProject(projectId, { visibility: 'public', createdById: ownerId });
    if (!result || !result.ok) throw new Error('发布失败');
    // 一个真人访客来看过（不是作者自己 ⇒ selfOnly 不会把这条压掉）
    await recordVisit({
      publicationId: result.publication.id,
      visitorKey: KEY,
      userId: null,
      open: true,
      visibleMs: 4000,
      completionPct: 100,
    });

    const fact = await buildCreatorFact(projectId, ownerId);
    expect(fact!.hasGame, '这一版明明钉住了游戏设计 ⇒ 事实里却没说它可玩').toBe(true);
    const out = analyzeCreatorFacts(fact!);
    const finding = out.find((f) => f.evidence.includes('玩到结局'));
    expect(finding, '有人来过却没人玩到结局 ⇒ 那条发现没出现').toBeTruthy();
    expect(finding!.evidence).toContain('0 人玩到结局');
  });
});
