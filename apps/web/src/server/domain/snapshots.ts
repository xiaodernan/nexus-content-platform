import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DesignDocument } from '@nexus/design-model';
import { getDb } from '../db/client';
import { projects, snapshots } from '../db/schema';
import { loadDocument, saveDocument } from './projects';

/**
 * §27 / §108：Snapshot 是用户项目历史，与 git 的开发历史是两回事。
 * 快照存 DesignDocument 的完整序列化（与 .nexus/ 导出同源，§102），
 * 所以恢复 = 把那份文档原样写回当前项目，而不是回放补丁。
 */

/** 与 schema 里的 snapshot_source 枚举一致 */
export type SnapshotSource = 'manual' | 'ai' | 'import' | 'publish' | 'branch';

export interface SnapshotMeta {
  id: string;
  label: string | null;
  source: SnapshotSource;
  summary: string | null;
  parentId: string | null;
  createdAt: string;
}

export interface SnapshotEntry extends SnapshotMeta {
  document: DesignDocument;
}

export interface CreateSnapshotInput {
  document: DesignDocument;
  source: SnapshotSource;
  label?: string | null;
  summary?: string | null;
  /** AI 事务的补丁清单（§151）：快照本身存全量文档，patch 只用于展示 diff 来源 */
  patch?: unknown;
  createdById?: string | null;
}

/**
 * 键顺序无关、且与 JSON 序列化语义一致的比较。两个来源都会造成"看起来不同、其实相同"：
 * jsonb 不保留对象键顺序（它按长度+字节重排），而 loadDocument 重建文档时会给缺省字段填 undefined
 * ——这种字段落库时会被丢弃。用 JSON.stringify 直接比会把"没改动"判成"有改动"，
 * 于是每次恢复都多写一条无意义的安全快照。
 */
function stableKey(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableKey).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableKey(record[key])}`)
    .join(',')}}`;
}

function toMeta(row: typeof snapshots.$inferSelect): SnapshotMeta {
  return {
    id: row.id,
    label: row.label,
    source: row.source as SnapshotSource,
    summary: row.summary,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** 列表不带 document：一份文档可能有几 MB，历史面板只要元信息 */
export async function listSnapshots(projectId: string): Promise<SnapshotMeta[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.projectId, projectId))
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id))
    .limit(200);
  return rows.map(toMeta);
}

export async function createSnapshot(
  projectId: string,
  input: CreateSnapshotInput,
): Promise<SnapshotMeta> {
  const db = getDb();
  const [head] = await db
    .select({ id: snapshots.id })
    .from(snapshots)
    .where(eq(snapshots.projectId, projectId))
    .orderBy(desc(snapshots.createdAt), desc(snapshots.id))
    .limit(1);
  const [row] = await db
    .insert(snapshots)
    .values({
      projectId,
      label: input.label?.slice(0, 120) ?? null,
      source: input.source,
      summary: input.summary?.slice(0, 500) ?? null,
      parentId: head?.id ?? null,
      document: input.document as unknown as Record<string, unknown>,
      patch: (input.patch ?? null) as Record<string, unknown> | null,
      createdById: input.createdById ?? null,
    })
    .returning();
  await db
    .update(projects)
    .set({ currentSnapshotId: row!.id })
    .where(eq(projects.id, projectId));
  return toMeta(row!);
}

/** 归属由调用方（路由）先过 projectBelongsTo；这里再按 projectId 收口，避免跨项目读 */
export async function readSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<SnapshotEntry | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.id, snapshotId), eq(snapshots.projectId, projectId)))
    .limit(1);
  if (!row) return null;
  return { ...toMeta(row), document: row.document as unknown as DesignDocument };
}

export interface RestoreResult {
  document: DesignDocument;
  /** 恢复动作自身产生的快照（"恢复到 X"） */
  snapshot: SnapshotMeta;
  /** 恢复前为当前状态补的安全快照；当前状态与目标一致时为 null */
  safetySnapshot: SnapshotMeta | null;
}

/**
 * 恢复不是"就地改写"，而是先把当前状态存下来再切换：
 * 用户点恢复时期待的是"不丢东西"，而不是"回不去"。
 */
export async function restoreSnapshot(
  projectId: string,
  snapshotId: string,
  createdById?: string | null,
): Promise<RestoreResult | null> {
  const target = await readSnapshot(projectId, snapshotId);
  if (!target) return null;
  const current = await loadDocument(projectId);
  if (!current) return null;

  const db = getDb();
  const alive = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!alive.length) return null;

  const same =
    stableKey(current.pages) === stableKey(target.document.pages) &&
    stableKey(current.tokens) === stableKey(target.document.tokens);
  const safetySnapshot = same
    ? null
    : await createSnapshot(projectId, {
        document: current,
        source: 'manual',
        label: '恢复前自动保存',
        summary: `恢复点：${target.label ?? target.id}`,
        createdById,
      });

  const restored: DesignDocument = { ...target.document, id: projectId };
  await saveDocument(projectId, restored);
  const snapshot = await createSnapshot(projectId, {
    document: restored,
    source: 'manual',
    label: `恢复到「${target.label ?? target.id}」`,
    summary: `来源快照 ${target.id}`,
    createdById,
  });
  return { document: (await loadDocument(projectId)) ?? restored, snapshot, safetySnapshot };
}
