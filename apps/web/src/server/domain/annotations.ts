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
}

export type AnnotationResult = { ok: true; annotation: Annotation } | { ok: false; reason: string };

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
