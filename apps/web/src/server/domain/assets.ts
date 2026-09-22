import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { AssetRef, DesignDocument } from '@nexus/design-model';
import { getDb } from '../db/client';
import { assets, publishedProjects, projects, users } from '../db/schema';
import { getStorage } from '../storage/config';
import {
  IMAGE_MIME_EXTENSIONS,
  imageLimitViolations,
  readImageSize,
  sniffImageMime,
  stripImageMetadata,
} from '../storage/images';
import { assetRowToRef, projectBelongsTo } from './projects';
import { readSnapshot } from './snapshots';

/**
 * 资产服务（§38 / §64 / §101）。
 *
 * 三条不可破的边界：
 * 1. 节点上的 paint 只持 `assetId`；字节、URL、路径都不进设计（§16）。
 *    文档级的 `assets[]` 清单由本服务水合，它是"这个项目有什么素材"的目录，
 *    不是渲染依据——渲染只按 id 走各自的鉴权路由。
 * 2. 文件名来自客户端，只能当展示文本；object key 一律由服务端按 id 生成（§80）
 * 3. 字节进存储之前必须过 magic-bytes 判定 + 元数据剥离（§80）
 *
 * 目前只接位图。视频/音频/3D 到 M4/M5 再接：那时校验规则不同，
 * 所以这里显式拒绝，而不是"先存下来以后再说"。
 */

export interface AssetFile {
  bytes: Uint8Array;
  mime: string;
  name: string;
}

/** 入库前剥掉了哪些元数据段：随响应返回一次，作为 §80 的处理回执 */
export function removedMetadataOf(row: typeof assets.$inferSelect): string[] {
  const meta = (row.genMeta ?? {}) as { removedMetadata?: unknown };
  return Array.isArray(meta.removedMetadata) ? (meta.removedMetadata as string[]) : [];
}

async function rowById(assetId: string): Promise<typeof assets.$inferSelect | null> {
  const [row] = await getDb().select().from(assets).where(eq(assets.id, assetId)).limit(1);
  return row ?? null;
}

/** 展示名：去掉路径分隔与控制字符。它绝不参与路径拼接，只用于界面显示 */
function displayName(raw: string | undefined, fallback: string): string {
  const cleaned = (raw ?? '')
    .replace(/[\\/]/g, '')
    .replace(/[^\P{C}\n\t]/gu, '')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export interface UploadRejection {
  ok: false;
  reason: string;
  issues: string[];
}

export type UploadResult =
  | { ok: true; asset: AssetRef; removed: string[]; reused: boolean }
  | UploadRejection;

/** 图片上传：识别 → 上限 → 剥元数据 → 落存储 → 落库。任一步不过就给明确原因 */
export async function uploadImageAsset(
  projectId: string,
  input: { data: ArrayBuffer | Uint8Array; filename?: string; createdById?: string },
): Promise<UploadResult> {
  const bytes = input.data instanceof Uint8Array ? input.data : new Uint8Array(input.data);
  const mime = sniffImageMime(bytes);
  if (!mime) {
    return {
      ok: false,
      reason: '只接受 PNG / JPEG / WebP / GIF 位图',
      issues: ['文件头（magic bytes）未识别为受支持的图片格式；扩展名与 Content-Type 不作为依据'],
    };
  }
  const size = readImageSize(bytes);
  const issues = imageLimitViolations(size, bytes.length);
  if (issues.length) return { ok: false, reason: '图片不符合上限要求', issues };

  let sanitized: { bytes: Uint8Array; removed: string[] };
  try {
    sanitized = stripImageMetadata(bytes);
  } catch (error) {
    return {
      ok: false,
      reason: '图片结构异常，已拒绝',
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }

  const db = getDb();
  const checksum = createHash('sha256').update(sanitized.bytes).digest('hex');
  // 同项目内的重复上传复用同一份字节：省存储，也让引用计数反映真实使用
  const [twin] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.checksum, checksum)))
    .limit(1);
  if (twin) return { ok: true, asset: assetRowToRef(twin), removed: removedMetadataOf(twin), reused: true };

  const id = randomUUID();
  const key = `projects/${projectId}/${id}${IMAGE_MIME_EXTENSIONS[mime]}`;
  await getStorage().put(key, sanitized.bytes, mime);
  const [row] = await db
    .insert(assets)
    .values({
      id,
      projectId,
      kind: 'image',
      name: displayName(input.filename, `image-${id.slice(0, 8)}${IMAGE_MIME_EXTENSIONS[mime]}`),
      storageKey: key,
      mime,
      bytes: sanitized.bytes.length,
      width: size?.width ?? null,
      height: size?.height ?? null,
      checksum,
      source: 'upload',
      genMeta: { removedMetadata: sanitized.removed },
      createdById: input.createdById ?? null,
    })
    .returning();
  return { ok: true, asset: assetRowToRef(row!), removed: sanitized.removed, reused: false };
}

export async function listProjectAssets(projectId: string): Promise<AssetRef[]> {
  const rows = await getDb()
    .select()
    .from(assets)
    .where(eq(assets.projectId, projectId))
    .orderBy(asc(assets.createdAt));
  return rows.map(assetRowToRef);
}

export async function getAsset(assetId: string): Promise<AssetRef | null> {
  const row = await rowById(assetId);
  return row ? assetRowToRef(row) : null;
}

/** 取字节。存储里的对象丢了就返回 null，调用方按 404 处理——不给占位图（§159） */
export async function openAssetFile(assetId: string): Promise<AssetFile | null> {
  const row = await rowById(assetId);
  if (!row) return null;
  const found = await getStorage().get(row.storageKey);
  if (!found) return null;
  return { bytes: found.bytes, mime: row.mime ?? found.contentType ?? 'application/octet-stream', name: row.name };
}

/** 作者视角取图：非本人项目一律 null，路由据此回 404（403 会泄露"这个 id 存在"） */
export async function openAssetForOwner(assetId: string, ownerId: string): Promise<AssetFile | null> {
  const row = await rowById(assetId);
  if (!row?.projectId) return null;
  if (!(await projectBelongsTo(row.projectId, ownerId))) return null;
  return openAssetFile(assetId);
}

/** 结构化遍历，不用字符串包含——assetId 可能正好落在某段 base64 或注释里 */
export function documentReferencesAsset(document: DesignDocument, assetId: string): boolean {
  const seen = new WeakSet<object>();
  const hit = (value: unknown): boolean => {
    if (typeof value === 'string') return value === assetId;
    if (Array.isArray(value)) return value.some(hit);
    if (value && typeof value === 'object') {
      if (seen.has(value)) return false;
      seen.add(value);
      return Object.values(value).some(hit);
    }
    return false;
  };
  return document.pages.some((page) => hit(Object.values(page.nodes)));
}

/**
 * 匿名访客取图（§57）。必须同时满足三件事：
 * 该项目有 public/unlisted 的发布行、handle 与项目所有者对得上、
 * 且**钉住的那一版快照文档确实引用了它**。
 * 漏掉最后一条，被设计删掉的资产会一直挂在公共 URL 上可达。
 */
export async function openAssetForPublicPath(handle: string, assetId: string): Promise<AssetFile | null> {
  const row = await rowById(assetId);
  if (!row?.projectId) return null;
  const db = getDb();
  const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
  if (!owner) return null;
  const publications = await db
    .select({ snapshotId: publishedProjects.snapshotId })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(
      and(
        eq(publishedProjects.projectId, row.projectId),
        eq(projects.ownerId, owner.id),
        inArray(publishedProjects.visibility, ['public', 'unlisted']),
      ),
    );
  for (const publication of publications) {
    if (!publication.snapshotId) continue;
    const snapshot = await readSnapshot(row.projectId, publication.snapshotId);
    if (snapshot && documentReferencesAsset(snapshot.document, assetId)) return openAssetFile(assetId);
  }
  return null;
}

/** 删资产：先删库（引用立刻失效）再删字节；删对象失败不回滚库 */
export async function deleteAsset(assetId: string, ownerId: string): Promise<boolean> {
  const row = await rowById(assetId);
  if (!row?.projectId) return false;
  if (!(await projectBelongsTo(row.projectId, ownerId))) return false;
  const db = getDb();
  await db.delete(assets).where(eq(assets.id, assetId));
  await getStorage().delete(row.storageKey);
  return true;
}

/**
 * §27 Duplicate 的资产那一半：给副本生成**自己的**行与字节，返回旧 id → 新 id。
 *
 * 为什么不共享同一行：`assets.project_id` 是 cascade 外键，删掉源项目会连带
 * 删掉副本正在引用的记录；鉴权路由又按 projectId 认人（§80），共享行等于
 * 让副本永远读不到自己的图。
 * 源对象在存储里已经丢失时，仍然把行复制过去（名字/尺寸这些元数据是真的），
 * 但打一条 warning——不造一条"看起来正常其实永远 404"的记录还不吭声。
 */
export async function copyProjectAssets(
  sourceProjectId: string,
  targetProjectId: string,
  createdById?: string,
): Promise<Map<string, string>> {
  const db = getDb();
  const storage = getStorage();
  const rows = await db.select().from(assets).where(eq(assets.projectId, sourceProjectId)).orderBy(asc(assets.createdAt));
  const map = new Map<string, string>();
  for (const row of rows) {
    const id = randomUUID();
    const extension = row.storageKey.slice(row.storageKey.lastIndexOf('.'));
    const key = `projects/${targetProjectId}/${id}${extension}`;
    const found = await storage.get(row.storageKey);
    if (found) {
      await storage.put(key, found.bytes, row.mime ?? found.contentType ?? 'application/octet-stream');
    } else {
      console.warn(`[assets] 源资产 ${row.id} 的字节已丢失，副本只带到 ${key} 的空引用`);
    }
    await db.insert(assets).values({
      ...row,
      id,
      projectId: targetProjectId,
      storageKey: key,
      createdAt: new Date(),
      createdById: createdById ?? row.createdById,
    });
    map.set(row.id, id);
  }
  return map;
}

