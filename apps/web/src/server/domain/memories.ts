import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { syncProjectKnowledge } from './knowledge';
import { getDb } from '../db/client';
import { memories } from '../db/schema';

/**
 * §48 记忆：四类（session / character / world / user），必须可查看、可删除。
 *
 * 归属是硬边界：每一行都记着 `ownerId`，所有读写都按它过滤——
 * 只有 scope + subjectId 的话，任何人拿着 id 都能读到别人的记忆（迁移 0004 补的就是这个）。
 *
 * 这一层**不做检索**。语义检索要 embedding，而 embedding 要真 provider（§49）；
 * 没有 provider 时那一列就是 null，界面上也这么写。"可查看可删除"是 §48 的全部要求，
 * 不顺手假装能搜。
 */

export const MEMORY_SCOPES = ['session', 'character', 'world', 'user'] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const MEMORY_SCOPE_LABELS: Record<MemoryScope, string> = {
  session: '本次会话',
  character: '角色',
  world: '世界',
  user: '我的偏好',
};

export const MEMORY_SCOPE_HINTS: Record<MemoryScope, string> = {
  session: '只在这个项目的工作过程里跟着走',
  character: '挂在某个角色身上（§46）',
  world: '整个世界都成立的事实',
  user: '你本人的偏好，跨项目有效',
};

export interface MemoryEntry {
  id: string;
  scope: MemoryScope;
  subjectId: string;
  content: string;
  createdAt: string;
  /** 有 provider 之后才会有值；null 就是没向量，界面上不许显示成"已索引" */
  embedded: boolean;
}

export interface MemoryFilter {
  ownerId: string;
  projectId: string;
  scope?: MemoryScope;
  subjectId?: string;
  limit?: number;
}

function isMemoryScope(value: unknown): value is MemoryScope {
  return typeof value === 'string' && (MEMORY_SCOPES as readonly string[]).includes(value);
}

function toEntry(row: typeof memories.$inferSelect): MemoryEntry {
  return {
    id: row.id,
    scope: row.scope,
    subjectId: row.subjectId,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    embedded: row.embedding != null,
  };
}

/**
 * 归属条件：这个人的记忆，且要么属于当前项目、要么是他自己的全局记忆（user / session 类不挂项目）。
 * 少了 `isNull(projectId)` 那一半，用户在项目里就看不见"我的偏好"，那是残缺的查看能力。
 */
function ownerCondition(filter: { ownerId: string; projectId: string }) {
  return and(
    eq(memories.ownerId, filter.ownerId),
    or(eq(memories.projectId, filter.projectId), isNull(memories.projectId)),
  );
}

export async function listMemories(filter: MemoryFilter): Promise<MemoryEntry[]> {
  const db = getDb();
  const conditions = [ownerCondition(filter)];
  if (filter.scope) conditions.push(eq(memories.scope, filter.scope));
  if (filter.subjectId) conditions.push(eq(memories.subjectId, filter.subjectId));
  const rows = await db
    .select()
    .from(memories)
    .where(and(...conditions))
    .orderBy(desc(memories.createdAt))
    .limit(filter.limit ?? 200);
  return rows.map(toEntry);
}

/** 四类各有多少条：面板顶部的总览，不受 limit 影响 */
export async function countMemoriesByScope(
  ownerId: string,
  projectId: string,
): Promise<Record<MemoryScope, number>> {
  const db = getDb();
  const rows = await db
    .select({ scope: memories.scope, id: memories.id })
    .from(memories)
    .where(ownerCondition({ ownerId, projectId }));
  const counts = Object.fromEntries(MEMORY_SCOPES.map((scope) => [scope, 0])) as Record<
    MemoryScope,
    number
  >;
  for (const row of rows) {
    if (isMemoryScope(row.scope)) counts[row.scope] += 1;
  }
  return counts;
}

export type AddMemoryResult = { ok: true; entry: MemoryEntry } | { ok: false; reason: string };

export async function addMemory(input: {
  ownerId: string;
  projectId: string;
  scope: unknown;
  subjectId?: unknown;
  content: unknown;
}): Promise<AddMemoryResult> {
  if (!isMemoryScope(input.scope)) {
    return { ok: false, reason: `记忆类型只能是 ${MEMORY_SCOPES.join(' / ')} 之一。` };
  }
  if (typeof input.content !== 'string' || !input.content.trim()) {
    return { ok: false, reason: '这条记忆没有内容。' };
  }
  const content = input.content.trim().slice(0, 4000);
  // 主体默认值：user 类就是本人；session 类跟着这个项目的工作过程走；
  // world / character 必须显式给，否则会变成"不知道在说哪个世界"的孤儿记忆
  let subjectId = typeof input.subjectId === 'string' ? input.subjectId.trim() : '';
  if (!subjectId && input.scope === 'user') subjectId = input.ownerId;
  if (!subjectId && input.scope === 'session') subjectId = `project:${input.projectId}`;
  if (!subjectId) {
    return { ok: false, reason: `${MEMORY_SCOPE_LABELS[input.scope]}类的记忆要指明挂在哪个${input.scope === 'world' ? '世界' : '角色'}上。` };
  }
  const db = getDb();
  const [row] = await db
    .insert(memories)
    .values({
      scope: input.scope,
      subjectId,
      content,
      projectId: input.scope === 'user' ? null : input.projectId,
      ownerId: input.ownerId,
      meta: { source: 'manual' },
    })
    .returning();
  // 「我的偏好」类不挂项目（上面 project_id 写的是 null），也就不在任何项目的
  // 语料库里——重建索引对它是白做一次全量删写。与 deleteMemory 保持同一判断。
  if (input.scope !== 'user') await syncProjectKnowledge(input.projectId);
  return { ok: true, entry: toEntry(row!) };
}

export async function deleteMemory(id: string, ownerId: string): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(memories)
    .where(and(eq(memories.id, id), eq(memories.ownerId, ownerId)))
    .returning({ id: memories.id, projectId: memories.projectId });
  if (!deleted.length) return false;
  // 记忆也是语料（§49）：删掉之后索引里不能再留着那条被删的记忆。
  // 「我的偏好」类不挂项目、也就不在任何语料库里，删它不该触发重建
  if (deleted[0]!.projectId) await syncProjectKnowledge(deleted[0]!.projectId);
  return true;
}

/**
 * 按类清空。必须指定 scope：§48 要的是"这一类的记忆删掉"，
 * 不给一个"连四类一起抹了"的按钮——误操作一次就把用户的全部记忆清了。
 */
export async function clearMemories(
  ownerId: string,
  projectId: string,
  scope: unknown,
): Promise<{ removed: number; reason?: string }> {
  if (!isMemoryScope(scope)) return { removed: 0, reason: '要先选定清哪一类记忆。' };
  const db = getDb();
  const rows = await db
    .select({ id: memories.id })
    .from(memories)
    .where(and(ownerCondition({ ownerId, projectId }), eq(memories.scope, scope)));
  if (!rows.length) return { removed: 0 };
  await db.delete(memories).where(inArray(memories.id, rows.map((r) => r.id)));
  await syncProjectKnowledge(projectId);
  return { removed: rows.length };
}
