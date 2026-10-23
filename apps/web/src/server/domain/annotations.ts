import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DesignDocument } from '@nexus/design-model';
import { getDb } from '../db/client';
import { comments, users } from '../db/schema';
import { loadDocument, projectBelongsTo } from './projects';
import { isUuid } from './ids';

/**
 * §111 画布批注：点击元素 → 写一条评论，Agent 拿得到它挂在哪个节点上。
 *
 * 复用 comments 表而不是另起一张：`node_id` 那一列本来就是为这个准备的（§111），
 * 公开评论（§59）node_id 为空、画布批注不为空 —— 一张表两种用途，
 * 少一处"同一句评论存在两个地方、各自漂移"的可能。
 *
 * 这里刻意**不**过发布机检的红线词表：批注是作者项目内部的私有笔记，
 * 不会被公网读到；它变成页面文字被发布出去的那一刻，才轮到 §131 那套管。
 * 但随上下文发给模型时，它走的是服务端派生那一条路（见 assemble.ts）——
 * 客户端不能自己声明"我在某个节点上留过话"。
 */

export interface Annotation {
  id: string;
  nodeId: string;
  pageId: string;
  pageName: string;
  nodeName: string;
  body: string;
  author: string;
  createdAt: string;
  /**
   * §111「已解决」：ISO 时间，`null` = 还没解决。存在性即状态（迁移 0038），
   * 所以这里不是布尔——"什么时候解决的"和"是不是解决的"是两件事，
   * 存后者就再也答不出前者（重新打开再标一次，第一次的时间会被盖掉）。
   */
  resolvedAt: string | null;
}

export type AnnotationResult = { ok: true; annotation: Annotation } | { ok: false; reason: string };

/**
 * 标记/取消「已解决」的三种失败各自不同答案，所以不返回 boolean：
 * - `not_found`：没有这条，或者不是你的（对外同一个答案，不泄露存在性）
 * - `not_annotation`：这是回复线程里的一句话，"已解决"属于它头顶那条批注
 * - `public_comment`：公开评论（§59）不钉在任何元素上，没有"解决了"这一说
 */
export type AnnotationResolveResult =
  | { ok: true; annotationId: string; resolvedAt: string | null }
  | { ok: false; reason: 'not_found' | 'not_annotation' | 'public_comment' };

/**
 * 节点在哪个页面、叫什么名字。按页面的节点表找（与 Design Index 的归属判定同一口径），
 * 而不是信客户端传来的 pageId —— 批注的定位是服务端的结论。
 */
function locateNode(document: DesignDocument, nodeId: string): { pageId: string; pageName: string; nodeName: string } | null {
  for (const page of document.pages) {
    const node = page.nodes[nodeId];
    if (node) return { pageId: page.id, pageName: page.name, nodeName: node.name };
  }
  return null;
}

export async function listAnnotations(projectId: string): Promise<Annotation[]> {
  const db = getDb();
  const document = await loadDocument(projectId);
  if (!document) return [];
  const where = new Map<string, { pageId: string; pageName: string; nodeName: string }>();
  for (const page of document.pages) {
    for (const node of Object.values(page.nodes)) {
      if (!where.has(node.id)) where.set(node.id, { pageId: page.id, pageName: page.name, nodeName: node.name });
    }
  }

  const rows = await db
    .select({
      id: comments.id,
      nodeId: comments.nodeId,
      resolvedAt: comments.resolvedAt,
      body: comments.body,
      createdAt: comments.createdAt,
      author: users.displayName,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(and(eq(comments.projectId, projectId), isNull(comments.parentId)))
    .orderBy(desc(comments.createdAt))
    .limit(200);

  return rows
    .filter((r) => r.nodeId !== null)
    .map((r) => {
      const located = where.get(r.nodeId!);
      return {
        id: r.id,
        nodeId: r.nodeId!,
        pageId: located?.pageId ?? '',
        pageName: located?.pageName ?? '(节点已不在文档里)',
        nodeName: located?.nodeName ?? '(已删除的节点)',
        body: r.body,
        author: r.author,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      };
    });
}

export async function addAnnotation(actorId: string, projectId: string, nodeId: string, body: string): Promise<AnnotationResult> {
  const text = body.trim();
  if (!text) return { ok: false, reason: '批注是空的' };
  if (text.length > 1000) return { ok: false, reason: '批注超过 1000 字' };
  if (!(await projectBelongsTo(projectId, actorId))) return { ok: false, reason: '这不是你的项目' };

  const document = await loadDocument(projectId);
  if (!document) return { ok: false, reason: '读不到这个项目的设计文档' };
  const located = locateNode(document, nodeId);
  if (!located) return { ok: false, reason: '这个节点已经不在文档里了，批注没有落点' };

  const [row] = await getDb()
    .insert(comments)
    .values({ projectId, userId: actorId, nodeId, body: text })
    .returning({ id: comments.id, createdAt: comments.createdAt });
  const [author] = await getDb().select({ displayName: users.displayName }).from(users).where(eq(users.id, actorId)).limit(1);
  return {
    ok: true,
    annotation: {
      id: row!.id,
      nodeId,
      pageId: located.pageId,
      pageName: located.pageName,
      nodeName: located.nodeName,
      body: text,
      author: author?.displayName ?? '',
      createdAt: row!.createdAt.toISOString(),
      resolvedAt: null,
    },
  };
}

export async function deleteAnnotation(actorId: string, annotationId: string): Promise<boolean> {
  // 形状不对的 id 按"没有这条批注"处理：eq(comments.id, …) 会撞 22P02 变 500（domain/ids.ts）。
  // 路由侧（DELETE /api/annotations/[annotationId]）对 false 本来就有 404 分支
  if (!isUuid(annotationId)) return false;
  const db = getDb();
  const [row] = await db.select({ projectId: comments.projectId }).from(comments).where(eq(comments.id, annotationId)).limit(1);
  if (!row) return false;
  if (!(await projectBelongsTo(row.projectId, actorId))) return false;
  await db.delete(comments).where(and(eq(comments.id, annotationId), isNull(comments.parentId), eq(comments.projectId, row.projectId)));
  return true;
}

/**
 * §111 批注的「已解决」：把它标成"这句话已经处理过了"。
 *
 * 三件事只有这里说得清：
 * 1. **幂等**：已经解决过的再标一次，保留**第一次**的时间（"什么时候解决的"问的是第一次），
 *    重新打开是清空。这条由**两道**共同保证：早退（值不会变就不写）+ `next` 读回原值。
 *    实测摘掉任一道另一道还在（单独摘都还是绿的），所以探针要两道一起摘才红——
 *    写在这里是因为下一个人改其中一道时，会以为另一道是多余的。
 * 2. **回复与公开评论不能单独标**：前者是线程里的一句话，后者不钉在任何元素上。
 *    服务端按 `parent_id` / `node_id` 判，库上的 CHECK 是第二道门（不是唯一一道）。
 * 3. **归属先查**，且别人的与不存在的一律 `not_found`：不告诉调用方"这条存在，只是不是你的"。
 */
export async function setAnnotationResolved(
  actorId: string,
  annotationId: string,
  resolved: boolean,
): Promise<AnnotationResolveResult> {
  // 形状不对的 id 按"没有这条批注"处理，与 deleteAnnotation 同一句口径（eq() 会撞 22P02 变 500）
  if (!isUuid(annotationId)) return { ok: false, reason: 'not_found' };
  const db = getDb();
  const [row] = await db
    .select({
      projectId: comments.projectId,
      parentId: comments.parentId,
      nodeId: comments.nodeId,
      resolvedAt: comments.resolvedAt,
    })
    .from(comments)
    .where(eq(comments.id, annotationId))
    .limit(1);
  if (!row) return { ok: false, reason: 'not_found' };
  if (!(await projectBelongsTo(row.projectId, actorId))) return { ok: false, reason: 'not_found' };
  if (row.parentId !== null) return { ok: false, reason: 'not_annotation' };
  if (row.nodeId === null) return { ok: false, reason: 'public_comment' };

  const next = resolved ? (row.resolvedAt ?? new Date()) : null;
  const unchanged = next === null ? row.resolvedAt === null : row.resolvedAt !== null;
  if (unchanged) {
    return {
      ok: true,
      annotationId,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    };
  }
  const [updated] = await db
    .update(comments)
    .set({ resolvedAt: next })
    .where(and(eq(comments.id, annotationId), eq(comments.projectId, row.projectId)))
    .returning({ resolvedAt: comments.resolvedAt });
  return { ok: true, annotationId, resolvedAt: updated!.resolvedAt ? updated!.resolvedAt.toISOString() : null };
}
