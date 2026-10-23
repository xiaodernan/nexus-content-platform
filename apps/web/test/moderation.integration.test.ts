import { raisePlan } from './support/test-plan';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createDocument, createNode, findPage, type DesignDocument } from '@nexus/design-model';
import {
  MODERATION_LIMITS,
  fileReport,
  findPublicPath,
  listReviewQueue,
  resolveCase,
  scanPublication,
  type AssetProvenance,
} from '../src/server/domain/moderation';
import { publishProject, resolvePublishedPath } from '../src/server/domain/publish';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { assets, moderationCases, projects, publishedProjects, users } from '../src/server/db/schema';

/**
 * §131 发布审核。这里要钉住的不是"能不能算出一个对象"，而是四条会被含糊掉的边界：
 * ① 机检只升级不认证 —— clear 永远不把 moderation 写成 approved；
 * ② 命中红线真的挡下发布，而且挡下也留案（否则连"有人试过"都查不到）；
 * ③ 下架（private）方向不受审核阻挡；
 * ④ 举报要么真的把案子挂进队列，要么如实说只是记录。
 */

let ownerId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Moderation Owner', email: `mod+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  await raisePlan(ownerId);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
});

/** 造一份只放了若干可见文字的文档；扫描看的是访客能读到的东西 */
function docWithTexts(texts: string[], names: string[] = []): DesignDocument {
  const document = createDocument('审核测试');
  const page = findPage(document, document.activePageId) ?? document.pages[0]!;
  const root = page.nodes[page.rootId]!;
  texts.forEach((text, i) => {
    const node = createNode({ type: 'text', name: names[i] ?? `T${i}`, text, parentId: root.id });
    page.nodes[node.id] = node;
    root.children.push(node.id);
  });
  return document;
}

function imageAsset(over: Partial<AssetProvenance> = {}): AssetProvenance {
  return { id: 'ast_1', name: 'hero.png', kind: 'image', source: 'upload', ...over };
}

/** 把某个资产挂到文档第一个文本节点上，模拟"公开页真的用到了它" */
function attachAsset(document: DesignDocument, assetId: string): void {
  const page = findPage(document, document.activePageId) ?? document.pages[0]!;
  const target = Object.values(page.nodes).find((n) => n.type === 'text') ?? page.nodes[page.rootId]!;
  target.assetId = assetId;
}

describe('scanPublication（机检规则本身）', () => {
  it('命中硬红线：blocked，证据带原文与位置，limits 一起出去', () => {
    const scan = scanPublication(docWithTexts(['a nude teen teaser here']), []);
    expect(scan.decision).toBe('blocked');
    const hit = scan.findings.find((f) => f.level === 'blocked');
    expect(hit?.rule).toBe('redline.minor_safety');
    expect(hit?.quote).toContain('teen');
    expect(hit?.where).toMatch(/^tex_/);
    expect(scan.limits.length).toBeGreaterThan(0);
    expect(scan.limits.join(' ')).toContain('换个说法');
  });

  it('词挨得远不算命中（正向对照：规则不是"出现 kid 就挡"）', () => {
    const scan = scanPublication(docWithTexts(['Kid-friendly lesson plan for ages 6-10']), []);
    expect(scan.decision).toBe('clear');
    expect(scan.findings).toEqual([]);
  });

  it('图层名里有红线词但访客看不到：不挡发布', () => {
    const scan = scanPublication(docWithTexts(['正常介绍'], ['nude teen mock asset']), []);
    expect(scan.decision).toBe('clear');
  });

  it('alt 文字参与判定：图片替代文本访客拿得到', () => {
    const document = docWithTexts(['正常介绍']);
    const page = findPage(document, document.activePageId) ?? document.pages[0]!;
    const target = Object.values(page.nodes).find((n) => n.type === 'text')!;
    target.text = '正常介绍';
    target.alt = 'revenge porn leak inside';
    expect(scanPublication(document, []).decision).toBe('blocked');
  });

  it('引用了上传图：挂人工；同一张若是平台生成的：不挂', () => {
    const uploaded = docWithTexts(['看这张图']);
    attachAsset(uploaded, 'ast_1');
    const review = scanPublication(uploaded, [imageAsset()]);
    expect(review.decision).toBe('review');
    expect(review.findings.map((f) => f.rule)).toContain('risk.external_media_consent');

    const generated = scanPublication(uploaded, [imageAsset({ source: 'generated' })]);
    expect(generated.decision).toBe('clear');
  });

  it('项目里有上传图但这一版没引用：不算事（看的是引用，不是"存在过"）', () => {
    const clean = docWithTexts(['纯文字页']);
    expect(scanPublication(clean, [imageAsset()]).decision).toBe('clear');
  });

  it('自称官方身份只挂人工，不自动挡：正常客服文案不该被拦', () => {
    const scan = scanPublication(docWithTexts(['联系官方客服 400-000-0000 完成身份核验']), []);
    expect(scan.decision).toBe('review');
    expect(scan.findings[0]!.level).toBe('review');
  });

  it('扫描统计说得出自己看了多少：pages / 可见文字段数 / 不同资产数', () => {
    const base = docWithTexts([]);
    const before = scanPublication(base, []);
    const document = docWithTexts(['一', '二']);
    attachAsset(document, 'ast_1');
    const scan = scanPublication(document, [imageAsset()]);
    expect(scan.scanned.pages).toBe(document.pages.length);
    // 起手文档本身就带可见文字，所以断言"加两段就多两段"，而不是硬写一个绝对数
    expect(scan.scanned.textNodes - before.scanned.textNodes).toBe(2);
    expect(scan.scanned.assetRefs).toBe(1);
  });
});

/** 真库那一段：发布挡不挡、案留没留、裁决能不能撤下内容 */
async function newProject(name: string): Promise<string> {
  return (await createProject(ownerId, { name, kind: 'website' })).id;
}

async function putText(projectId: string, text: string): Promise<void> {
  const document = await loadDocument(projectId);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name: 'body', text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(projectId, document!);
}

async function caseRows(projectId: string) {
  return getDb().select().from(moderationCases).where(eq(moderationCases.projectId, projectId));
}

describe('publishProject × 机检（§131 的四种走向）', () => {
  it('命中红线：公开被挡下，没有 publication 行，但案子留着', async () => {
    const id = await newProject('红线页');
    await putText(id, 'buy nude children now');
    const result = await publishProject(id, { visibility: 'public', createdById: ownerId });
    expect(result?.ok).toBe(false);
    if (!result || result.ok) throw new Error('本该被挡下');
    expect(result.reason).toContain('redline.minor_safety');
    expect(result.scan.decision).toBe('blocked');

    expect(await getDb().select({ id: publishedProjects.id }).from(publishedProjects).where(eq(publishedProjects.projectId, id))).toHaveLength(0);
    const rows = await caseRows(id);
    expect(rows.map((r) => r.decision)).toContain('blocked');
    expect(rows[0]!.reviewRequired).toBe(true);
    // 挡下的那次没有 publication 可挂，但版本号仍要记着当时想发第几版
    expect(rows[0]!.publicationId).toBeNull();
    expect(rows[0]!.publicationVersion).toBe(1);
  });

  it('该挂人工的：照发，但 moderation 仍是 pending —— 机检不许替人认证', async () => {
    const id = await newProject('待复核页');
    const document = await loadDocument(id);
    const [asset] = await getDb()
      .insert(assets)
      .values({ projectId: id, kind: 'image', name: 'photo.png', storageKey: `projects/${id}/photo.png`, source: 'upload' })
      .returning({ id: assets.id });
    const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
    const root = page.nodes[page.rootId]!;
    const node = createNode({ type: 'image', name: 'photo', parentId: root.id });
    node.assetId = asset!.id;
    page.nodes[node.id] = node;
    root.children.push(node.id);
    await saveDocument(id, document!);

    const result = await publishProject(id, { visibility: 'public', createdById: ownerId });
    expect(result?.ok).toBe(true);
    if (!result || !result.ok) return;
    expect(result.scan.decision).toBe('review');
    expect(result.publication.moderation).toBe('pending');

    const rows = await caseRows(id);
    expect(rows.map((r) => r.decision)).toContain('review');
    expect(rows[0]!.publicationId).not.toBeNull();
  });

  it('切成 private 是下架动作：机检不许挡', async () => {
    const id = await newProject('要下架的红线页');
    await putText(id, 'buy nude children now');
    const result = await publishProject(id, { visibility: 'private', createdById: ownerId });
    expect(result?.ok).toBe(true);
    // 下架方向不留案：留案的是"往外公开"的尝试
    expect(await caseRows(id)).toHaveLength(0);
  });

  it('人工裁决 rejected：公开 URL 立刻不可达；approved 只改状态不撤内容', async () => {
    const id = await newProject('裁决页');
    await putText(id, '联系官方客服完成核验');
    const published = await publishProject(id, { visibility: 'public', createdById: ownerId });
    expect(published?.ok).toBe(true);
    if (!published || !published.ok) return;
    const [reviewCase] = await caseRows(id);
    expect(reviewCase).toBeTruthy();

    expect(await resolvePublishedPath(published.publication.path)).not.toBeNull();
    const approved = await resolveCase(reviewCase!.id, { adminId: ownerId, resolution: 'approved', note: '看过，是他自己的店' });
    expect(approved.ok).toBe(true);
    expect((await getDb().select({ moderation: publishedProjects.moderation }).from(publishedProjects).where(eq(publishedProjects.id, published.publication.id)))[0]!.moderation).toBe('approved');
    expect(await resolvePublishedPath(published.publication.path)).not.toBeNull();

    // 再发一版并拒绝它：这次 URL 必须消失
    const second = await publishProject(id, { visibility: 'public', createdById: ownerId });
    expect(second?.ok).toBe(true);
    const pendingCase = (await caseRows(id)).find((c) => !c.resolvedAt);
    expect(pendingCase).toBeTruthy();
    const rejected = await resolveCase(pendingCase!.id, { adminId: ownerId, resolution: 'rejected' });
    expect(rejected).toMatchObject({ ok: true, hidden: true });
    expect(await resolvePublishedPath(published.publication.path)).toBeNull();
    // 同案不能裁决两次
    expect((await resolveCase(pendingCase!.id, { adminId: ownerId, resolution: 'approved' })).ok).toBe(false);
  });
});

describe('举报（§132）与人工队列', () => {
  async function published(name: string, text: string) {
    const id = await newProject(name);
    await putText(id, text);
    const result = await publishProject(id, { visibility: 'public', createdById: ownerId });
    expect(result?.ok).toBe(true);
    if (!result || !result.ok) throw new Error('前置发布没成功');
    return { projectId: id, publication: result.publication };
  }

  it('三条硬红线的举报会自动挂进人工队列；其他类别只记录', async () => {
    const { publication } = await published('被举报页', '普通内容');
    const escalated = await fileReport({
      publicationId: publication.id,
      path: publication.path,
      reason: 'minor_safety',
      detail: '页面里有指向未成年人的暗示',
      reporterId: null,
    });
    expect(escalated.escalated).toBe(true);

    const spam = await fileReport({
      publicationId: publication.id,
      path: publication.path,
      reason: 'spam',
      reporterId: null,
    });
    expect(spam.escalated).toBe(false);

    const rows = await caseRows(publication.projectId ?? '');
    const fromReport = rows.filter((r) => r.rulesVersion.startsWith('report:'));
    expect(fromReport).toHaveLength(1); // 同类重复举报不该再开一条，队列会被灌满
    expect(fromReport[0]!.reviewRequired).toBe(true);
  });

  it('队列只列待看的案子，举报数按案子算', async () => {
    const { publication, projectId } = await published('队列页', '联系官方客服完成核验');
    await fileReport({ publicationId: publication.id, path: publication.path, reason: 'impersonation', reporterId: null });
    const queue = await listReviewQueue(100);
    const mine = queue.filter((entry) => entry.projectId === projectId);
    // 这次发布本身就立案了，所以同类举报被去重：一条案 + 一次举报，不该看到两行
    expect(mine).toHaveLength(1);
    expect(mine[0]!.reportCount).toBe(1);

    // 裁决之后就从队列里出去了：人工看的永远是没处理完的
    await Promise.all(mine.map((entry) => resolveCase(entry.caseId, { adminId: ownerId, resolution: 'approved' })));
    const after = await listReviewQueue(100);
    expect(after.filter((entry) => entry.projectId === projectId)).toHaveLength(0);
  });

  it('举报入口按 path 找得到公开页，private 的不算', async () => {
    const { publication } = await published('可举报路径', '正常内容');
    expect(await findPublicPath(publication.path)).toMatchObject({ id: publication.id });
    await publishProject(publication.projectId!, { visibility: 'private', createdById: ownerId });
    expect(await findPublicPath(publication.path)).toBeNull();
  });

  it('limits 是常量清单的一部分：漏报解释不能靠临时措辞', () => {
    expect(MODERATION_LIMITS.join(' ')).toContain('没有图像');
    expect(MODERATION_LIMITS.join(' ')).toContain('从不写 approved');
  });
});

// 案子和举报都挂在 projects / published_projects 的 ON DELETE CASCADE 上，
// 所以前面那个删项目的 afterAll 就够了，这里不再手写一遍清理。
