import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import type { AiRequest } from '@nexus/schemas';
import { createNode, findPage } from '@nexus/design-model';
import { addAnnotation, deleteAnnotation, listAnnotations, setAnnotationResolved } from '../src/server/domain/annotations';
import { assembleAiRequest } from '../src/server/ai/assemble';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { comments, projects, users } from '../src/server/db/schema';

/**
 * §111 画布批注。两条最容易被糊过去的边界都在这里：
 * ① 批注钉在哪个页面、那个元素叫什么，是服务端在文档里查出来的，不是客户端说的；
 * ② 批注随 AI 请求上线时走的是"现场由服务端回答"那条路（§68）——
 *    客户端上传 annotations 和上传整份文档同罪，一律 400。
 */

let ownerId: string;
let otherId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Annotator', email: `an-a+${Date.now()}@nexus.test` },
      { displayName: 'Outsider', email: `an-b+${Date.now()}@nexus.test` },
    ])
    .returning({ id: users.id });
  ownerId = rows[0]!.id;
  otherId = rows[1]!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, otherId]));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(ownerId, { name, kind: 'website' })).id;
}

/** 往活动页加一个节点并落库，返回它的 id */
async function addNode(projectId: string, name: string, text: string): Promise<string> {
  const document = await loadDocument(projectId);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name, text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(projectId, document!);
  return node.id;
}

function aiRequest(projectId: string, extra: Partial<AiRequest['context']> = {}): AiRequest {
  return {
    requestId: 'req_annotations_test',
    intent: 'design-edit',
    prompt: '按批注改一下',
    modelClass: 'balanced',
    variants: 1,
    references: [],
    approvalPolicy: [],
    dryRun: false,
    context: { projectId, selection: [], recentChanges: [], ...extra },
  };
}

describe('批注的写入与归属', () => {
  it('钉得住：回来的定位是服务端从文档里查的', async () => {
    const id = await newProject('批注定位');
    const nodeId = await addNode(id, 'CTA', '开始设计');
    const result = await addAnnotation(ownerId, id, nodeId, '这个按钮太大');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.annotation.nodeName).toBe('CTA');
    expect(result.annotation.pageName).toBeTruthy();

    const listed = await listAnnotations(id);
    expect(listed.map((a) => a.body)).toEqual(['这个按钮太大']);
    expect(listed[0]!.nodeId).toBe(nodeId);
    expect(listed[0]!.author).toBe('Annotator');
  });

  it('节点不存在就不写：批注没有落点比没有批注更糟', async () => {
    const id = await newProject('批注落点');
    const result = await addAnnotation(ownerId, id, 'node_不存在', '改这里');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('不该写进去');
    expect(result.reason).toContain('不在文档里');
    expect(await listAnnotations(id)).toHaveLength(0);
  });

  it('别人的项目：既写不进也列不出', async () => {
    const id = await newProject('别人的批注');
    const nodeId = await addNode(id, 'X', 'x');
    expect((await addAnnotation(otherId, id, nodeId, '借个地方说话')).ok).toBe(false);
    expect(await listAnnotations(id)).toHaveLength(0);
  });

  it('节点被删掉之后批注仍在，但定位说明它是悬空的', async () => {
    const id = await newProject('删掉节点的批注');
    const nodeId = await addNode(id, 'WillGo', '要删的');
    await addAnnotation(ownerId, id, nodeId, '这句话留着');

    const document = await loadDocument(id);
    const page = findPage(document!, document!.activePageId)!;
    delete page.nodes[nodeId];
    rootWithout(page.nodes[page.rootId]!.children, nodeId);
    await saveDocument(id, document!);

    const listed = await listAnnotations(id);
    expect(listed).toHaveLength(1); // 历史不该被一次删除抹掉
    expect(listed[0]!.pageName).toBe('(节点已不在文档里)');
  });

  it('删除批注只对自己的项目有效', async () => {
    const id = await newProject('删批注');
    const nodeId = await addNode(id, 'Y', 'y');
    const created = await addAnnotation(ownerId, id, nodeId, '一句话');
    if (!created.ok) throw new Error('前置写入失败');
    expect(await deleteAnnotation(otherId, created.annotation.id)).toBe(false);
    expect(await listAnnotations(id)).toHaveLength(1);
    expect(await deleteAnnotation(ownerId, created.annotation.id)).toBe(true);
    expect(await listAnnotations(id)).toHaveLength(0);
  });
});

describe('批注随 AI 请求上线（§68 + §111）', () => {
  it('客户端上传 annotations 一律 400，和上传整份文档同一纪律', async () => {
    const id = await newProject('上传批注被拒');
    const result = await assembleAiRequest(
      aiRequest(id, { annotations: [{ nodeId: 'n_我编的', pageId: 'p', pageName: 'P', nodeName: 'N', body: '我说' }] }),
      ownerId,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('不该被收下');
    expect(result.status).toBe(400);
    expect(result.code).toBe('context_annotations_not_allowed');

    const note = await assembleAiRequest(aiRequest(id, { annotationsNote: '我自己算的说明' }), ownerId);
    expect(note.ok).toBe(false);
    if (note.ok) throw new Error('annotationsNote 也不该由客户端给');
    expect(note.code).toBe('context_annotationsNote_not_allowed');
  });

  it('wire 里的批注是服务端从库里读、按文档核对过的', async () => {
    const id = await newProject('批注进上下文');
    const nodeId = await addNode(id, 'Hero copy', '主标题');
    await addAnnotation(ownerId, id, nodeId, '这个标题太大，压到下面的卡片了');

    const result = await assembleAiRequest(aiRequest(id, { pageId: (await loadDocument(id))!.activePageId }), ownerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const annotations = result.wire.context.annotations;
    expect(annotations).toHaveLength(1);
    expect(annotations![0]).toMatchObject({ nodeId, nodeName: 'Hero copy', body: '这个标题太大，压到下面的卡片了' });
    expect(annotations![0]!.pageName).toBeTruthy();
    // 没省略就不该编一条"省略说明"出来
    expect(result.wire.context.annotationsNote).toBeUndefined();
  });

  it('批注钉的节点被删了：不带上来，并且说清少了几条', async () => {
    const id = await newProject('悬空批注');
    const nodeId = await addNode(id, 'Doomed', '会删');
    await addAnnotation(ownerId, id, nodeId, '这句话还在');
    const document = await loadDocument(id);
    const page = findPage(document!, document!.activePageId)!;
    delete page.nodes[nodeId];
    rootWithout(page.nodes[page.rootId]!.children, nodeId);
    await saveDocument(id, document!);

    const result = await assembleAiRequest(aiRequest(id), ownerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wire.context.annotations).toEqual([]);
    expect(result.wire.context.annotationsNote).toContain('节点已经不在文档里');
  });

  it('已解决的批注不带上去，并且说明少了几条（不静默降级）', async () => {
    const id = await newProject('已解决的批注');
    const nodeId = await addNode(id, 'Done', '好了');
    const created = await addAnnotation(ownerId, id, nodeId, '这个已经改好了，别再动');
    if (!created.ok) throw new Error('前置写入失败');
    await setAnnotationResolved(ownerId, created.annotation.id, true);

    const result = await assembleAiRequest(aiRequest(id), ownerId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 「已解决」的意思是"这句话处理过了"：再喂给模型就是让它把收工的事重做一遍
    expect(result.wire.context.annotations).toEqual([]);
    expect(result.wire.context.annotationsNote).toContain('已解决');
    expect(result.wire.context.annotationsNote).toContain('1 条');

    // 正对照：同一条重新打开，就又该带上来了——否则上面那条红可能只是"批注根本没上线"
    await setAnnotationResolved(ownerId, created.annotation.id, false);
    const back = await assembleAiRequest(aiRequest(id), ownerId);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.wire.context.annotations).toHaveLength(1);
    expect(back.wire.context.annotationsNote).toBeUndefined();
  });
});

describe('批注的「已解决」（§111 / 迁移 0038）', () => {
  it('标上再打开：状态由时间戳的存在性推出来，两次读回来一致', async () => {
    const id = await newProject('已解决往返');
    const nodeId = await addNode(id, 'Hero', '主标题');
    const created = await addAnnotation(ownerId, id, nodeId, '标题压到下面的卡片了');
    if (!created.ok) throw new Error('前置写入失败');
    // 新写出来的一条一定是未解决：没有"默认解决"这种状态
    expect(created.annotation.resolvedAt).toBeNull();
    expect((await listAnnotations(id))[0]!.resolvedAt).toBeNull();

    const marked = await setAnnotationResolved(ownerId, created.annotation.id, true);
    expect(marked).toMatchObject({ ok: true, annotationId: created.annotation.id });
    if (!marked.ok) return;
    expect(marked.resolvedAt).toBeTruthy();
    // 服务端读回来的与写回来的是同一个值：不是"各自算一个时间"
    expect((await listAnnotations(id))[0]!.resolvedAt).toBe(marked.resolvedAt);

    const reopened = await setAnnotationResolved(ownerId, created.annotation.id, false);
    expect(reopened.ok && reopened.resolvedAt).toBeNull();
    expect((await listAnnotations(id))[0]!.resolvedAt).toBeNull();

    // 重新打开再标一次：这一次的时间是新的（"什么时候解决的"问的是最近那一次）
    const again = await setAnnotationResolved(ownerId, created.annotation.id, true);
    expect(again.ok && again.resolvedAt).toBeTruthy();
    if (!again.ok || !again.resolvedAt || !marked.resolvedAt) return;
    expect(new Date(again.resolvedAt).getTime()).toBeGreaterThanOrEqual(new Date(marked.resolvedAt).getTime());
  });

  it('幂等：已经解决过的再标一次，保留第一次的时间，库里还是那一行', async () => {
    const id = await newProject('已解决幂等');
    const nodeId = await addNode(id, 'Btn', '按钮');
    const created = await addAnnotation(ownerId, id, nodeId, '这句话');
    if (!created.ok) throw new Error('前置写入失败');
    const first = await setAnnotationResolved(ownerId, created.annotation.id, true);
    if (!first.ok) throw new Error('标记失败');
    // 隔开足够长：两次调用若都写库，时间戳必然不同（同一毫秒里返回会被误判成"没变"）
    await new Promise((r) => setTimeout(r, 30));
    const second = await setAnnotationResolved(ownerId, created.annotation.id, true);
    expect(second.ok && second.resolvedAt).toBe(first.resolvedAt);
    const db = getDb();
    const rows = await db.select({ n: rawSql<number>`count(*)::int` }).from(comments).where(eq(comments.projectId, id));
    expect(rows[0]!.n).toBe(1);
  });

  it('别人的批注：标不了，且与"没有这条"同一个答案（不泄露存在性）', async () => {
    const id = await newProject('别人标已解决');
    const nodeId = await addNode(id, 'X', 'x');
    const created = await addAnnotation(ownerId, id, nodeId, '一句话');
    if (!created.ok) throw new Error('前置写入失败');
    expect(await setAnnotationResolved(otherId, created.annotation.id, true)).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect((await listAnnotations(id))[0]!.resolvedAt).toBeNull();
  });

  it('回复与公开评论都不能单独标：它们没有「已解决」这一说', async () => {
    const id = await newProject('不能标的两种');
    const nodeId = await addNode(id, 'Y', 'y');
    const created = await addAnnotation(ownerId, id, nodeId, '主批注');
    if (!created.ok) throw new Error('前置写入失败');
    const db = getDb();
    // 回复与公开评论各插一条，id 由 returning 拿回来——不靠"哪一行 node_id 为空"去猜
    const [reply] = await db
      .insert(comments)
      .values({ projectId: id, userId: ownerId, parentId: created.annotation.id, body: '回复一句' })
      .returning({ id: comments.id });
    const [publicComment] = await db
      .insert(comments)
      .values({ projectId: id, userId: ownerId, nodeId: null, body: '公开评论一句' })
      .returning({ id: comments.id });

    expect(await setAnnotationResolved(ownerId, reply!.id, true)).toEqual({ ok: false, reason: 'not_annotation' });
    expect(await setAnnotationResolved(ownerId, publicComment!.id, true)).toEqual({
      ok: false,
      reason: 'public_comment',
    });
    // 主批注没被连带改动
    expect((await listAnnotations(id))[0]!.resolvedAt).toBeNull();
  });

  it('库上是第二道门：node_id 为空 + resolved_at 非空插不进去', async () => {
    const id = await newProject('库上的 CHECK');
    const nodeId = await addNode(id, 'Z', 'z');
    const created = await addAnnotation(ownerId, id, nodeId, '这句话');
    if (!created.ok) throw new Error('前置写入失败');
    const db = getDb();
    // 公开评论本身插得进（那条路是 §59 的正常用途）
    await db.insert(comments).values({ projectId: id, userId: ownerId, nodeId: null, body: '公开评论' });
    // 但给它一个 resolved_at 就被 CHECK 挡下：绕过服务端也改不出这种行
    await expect(
      db
        .insert(comments)
        .values({ projectId: id, userId: ownerId, nodeId: null, body: '公开评论', resolvedAt: new Date() }),
    ).rejects.toThrow();
    const rows = await db.select({ n: rawSql<number>`count(*)::int` }).from(comments).where(eq(comments.projectId, id));
    expect(rows[0]!.n).toBe(2); // 一条批注 + 一条公开评论，失败的那条没留下
  });
});

function rootWithout(children: string[], nodeId: string): void {
  const i = children.indexOf(nodeId);
  if (i >= 0) children.splice(i, 1);
}
