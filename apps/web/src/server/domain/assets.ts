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
import {
  MAX_VIDEO_BYTES,
  VIDEO_MIME_EXTENSIONS,
  sniffVideoMime,
  videoMetadataViolations,
} from '../storage/videos';
import { refusalForStorage } from './credits';
import { isUuid } from './ids';
import { planOf, storageUsageBytes } from './credit-ledger';
import { assetRowToRef, projectBelongsTo, projectOwnerId } from './projects';
import { projectVisibleTo } from './team';
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

/**
 * id 形状不对就当查不到：`assets.id` 是 uuid 列，把 `"abc"` 这种直接送进 where，
 * Postgres 抛的是 `invalid input syntax for type uuid`——于是"这个资产不存在"在界面上变成 500。
 * 所有取行的入口都过这一格，路由侧就只剩 404 这一种说法（§159：不存在的别说成服务器坏了）。
 */
async function rowById(assetId: string): Promise<typeof assets.$inferSelect | null> {
  if (!isUuid(assetId)) return null;
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
  /**
   * 哪一道门拒的。路由据此分别给 400 与 413：
   * "这份文件不是我们能收的图"与"这次放不下了（配额）"是两件事，混成一个状态码，
   * 用户会去改文件名，而真正该做的是删素材。
   */
  code: 'invalid_image' | 'storage_exhausted';
  reason: string;
  issues: string[];
}

export type UploadResult =
  | { ok: true; asset: AssetRef; removed: string[]; reused: boolean }
  | UploadRejection;

/** 图片入库：识别 → 上限 → 剥元数据 → 落存储 → 落库。任一步不过就给明确原因 */
export async function uploadImageAsset(
  projectId: string,
  input: {
    data: ArrayBuffer | Uint8Array;
    filename?: string;
    createdById?: string;
    /** 摄取方是谁：上传还是生成。默认 upload——调用生成链路时必须显式写 generated，否则事后查不到来源 */
    source?: 'upload' | 'generated';
    /** 生成来源的元信息（prompt / provider / model / seed / demoMode / taskId） */
    genMeta?: Record<string, unknown>;
    /**
     * 这张图归属于哪个角色（§39 的"角色在别的场景里"）。`assets.character_id` 这一列
     * 从建库起就有但从来没有写入方——一列没人写的真值就是文档里的装饰，所以这次接上。
     */
    characterId?: string;
  },
): Promise<UploadResult> {
  const bytes = input.data instanceof Uint8Array ? input.data : new Uint8Array(input.data);
  const mime = sniffImageMime(bytes);
  if (!mime) {
    return {
      ok: false,
      code: 'invalid_image',
      reason: '只接受 PNG / JPEG / WebP / GIF 位图',
      issues: ['文件头（magic bytes）未识别为受支持的图片格式；扩展名与 Content-Type 不作为依据'],
    };
  }
  const size = readImageSize(bytes);
  const issues = imageLimitViolations(size, bytes.length);
  if (issues.length) return { ok: false, code: 'invalid_image', reason: '图片不符合上限要求', issues };

  let sanitized: { bytes: Uint8Array; removed: string[] };
  try {
    sanitized = stripImageMetadata(bytes);
  } catch (error) {
    return {
      ok: false,
      code: 'invalid_image',
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
  // 复用那一行时**不**改写它的 character_id：字节相同就是同一张图，归属仍是第一次写入它的那个角色，
  // 调用方从 `reused` 就知道这一张没有新建行
  if (twin) return { ok: true, asset: assetRowToRef(twin), removed: removedMetadataOf(twin), reused: true };

  // §133 的 storage 那一格：字节进存储之前先问"还放得下吗"（ADR-0018）。
  // 门放在这一处而不是路由上：上传与 §38 的生成走的是同一道摄取门，加在路由上会漏掉生成那条路。
  // 也放在复用判断**之后**：checksum 命中的那份字节已经在库里，不该再按新写入算一次占用。
  const ownerId = await projectOwnerId(projectId);
  if (ownerId) {
    const refusal = refusalForStorage({
      plan: await planOf(ownerId),
      usedBytes: await storageUsageBytes(ownerId),
      incomingBytes: sanitized.bytes.length,
    });
    if (refusal) {
      return {
        ok: false,
        code: 'storage_exhausted',
        reason: refusal,
        issues: ['存储配额按所有者名下所有项目合计；被拒的是这一次写入，库里已有的素材不会被自动删掉'],
      };
    }
  }

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
      source: input.source ?? 'upload',
      characterId: input.characterId ?? null,
      // removedMetadata 放在最后：它是这道摄取门的回执，不接受调用方覆盖
      genMeta: { ...input.genMeta, removedMetadata: sanitized.removed },
      createdById: input.createdById ?? null,
    })
    .returning();
  return { ok: true, asset: assetRowToRef(row!), removed: sanitized.removed, reused: false };
}

/**
 * 视频字节入库（§40-42 渲染产物 → 资产行）。
 *
 * 与 `uploadImageAsset` 共用同一条摄取链（magic 嗅探 → 限额 → 去重 → 配额 → 落存储 → 落库），
 * 但有两条**刻意不同**：
 *
 * 1. **没有 `source` 参数，写死 'generated'**。视频字节今天只有一个来源：本服务自己跑的
 *    ffmpeg（§40-42 的 DEMO 渲染）。用户上传通道对视频保持关闭——mp4/webm 的元数据长在
 *    容器结构里、剥不掉（见 `storage/videos.ts` 头注释），收下一颗来路不明的视频
 *    等于收下它的 GPS 与设备指纹。将来导入/上传真的需要视频时，入口开在这里，
 *    不开在调用方那里。
 * 2. **元数据在摄入时复核，不在摄入时剥**。位图那条链是"剥干净再入库"；视频剥不了，
 *    所以改成"渲染命令里就不写（`-map_metadata -1`），摄入时按容器结构验一遍"——
 *    见到 meta 盒 / Tags 元素就拒。少这一遍，"渲染命令忘了那两个旗"会静默产出一颗
 *    带着 encoder 与设备信息的成片，还照样进得了资产库。
 */
export interface VideoUploadRejection {
  ok: false;
  /** `invalid_video` 是"这颗字节不能进资产库"，`storage_exhausted` 是"这次放不下了"——两件事 */
  code: 'invalid_video' | 'storage_exhausted';
  reason: string;
  issues: string[];
}

export type VideoUploadResult =
  | { ok: true; asset: AssetRef; removed: string[]; reused: boolean }
  | VideoUploadRejection;

export async function uploadVideoAsset(
  projectId: string,
  input: {
    data: ArrayBuffer | Uint8Array;
    filename?: string;
    createdById?: string;
    /** 生成来源的元信息（prompt / provider / seed / demoMode / storyboardId / taskId） */
    genMeta?: Record<string, unknown>;
  },
): Promise<VideoUploadResult> {
  const bytes = input.data instanceof Uint8Array ? input.data : new Uint8Array(input.data);
  const mime = sniffVideoMime(bytes);
  if (!mime) {
    return {
      ok: false,
      code: 'invalid_video',
      reason: '只接受 MP4 / WebM 视频，且只接受本服务渲染链产出的字节',
      issues: [
        '文件头（magic bytes）未识别为受支持的视频容器；mp4 认第 4 字节起的 ftyp 盒，webm 认 EBML 魔数加 DocType',
      ],
    };
  }
  const violations = videoMetadataViolations(bytes);
  if (violations.length) {
    return {
      ok: false,
      code: 'invalid_video',
      reason: '视频字节里还挂着元数据：这不是本服务渲染链的产物，或渲染命令漏了 -map_metadata -1',
      issues: violations.map((item) => `容器里还带着 ${item}`),
    };
  }
  if (bytes.length > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      code: 'invalid_video',
      reason: `视频超过 ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB 上限`,
      issues: [`这一份 ${bytes.length} 字节`],
    };
  }

  const db = getDb();
  const checksum = createHash('sha256').update(bytes).digest('hex');
  // 同项目内的重复渲染复用同一份字节：省存储，也让引用计数反映真实使用（与图片同一口径）
  const [twin] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.projectId, projectId), eq(assets.checksum, checksum)))
    .limit(1);
  if (twin) return { ok: true, asset: assetRowToRef(twin), removed: [], reused: true };

  // §133 的 storage 配额（ADR-0018）：与图片共用同一道门，位置也一致——复用判断之后
  const ownerId = await projectOwnerId(projectId);
  if (ownerId) {
    const refusal = refusalForStorage({
      plan: await planOf(ownerId),
      usedBytes: await storageUsageBytes(ownerId),
      incomingBytes: bytes.length,
    });
    if (refusal) {
      return {
        ok: false,
        code: 'storage_exhausted',
        reason: refusal,
        issues: ['存储配额按所有者名下所有项目合计；被拒的是这一次写入，库里已有的素材不会被自动删掉'],
      };
    }
  }

  const id = randomUUID();
  const key = `projects/${projectId}/${id}${VIDEO_MIME_EXTENSIONS[mime]}`;
  await getStorage().put(key, bytes, mime);
  const [row] = await db
    .insert(assets)
    .values({
      id,
      projectId,
      kind: 'video',
      name: displayName(input.filename, `render-${id.slice(0, 8)}${VIDEO_MIME_EXTENSIONS[mime]}`),
      storageKey: key,
      mime,
      bytes: bytes.length,
      // 视频的宽高要 ffprobe 才知道，摄入这一层不引 ffmpeg：留空，不猜
      width: null,
      height: null,
      checksum,
      source: 'generated',
      characterId: null,
      genMeta: { ...input.genMeta, metadataStrippedBy: 'ffmpeg -map_metadata -1 -map_chapters -1 -bitexact' },
      createdById: input.createdById ?? null,
    })
    .returning();
  return { ok: true, asset: assetRowToRef(row!), removed: [], reused: false };
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

/** 资产属于哪个项目（不存在则 null）。DNA 提取用它守住"只能提本项目的图" */
export async function assetProjectId(assetId: string): Promise<string | null> {
  const row = await rowById(assetId);
  return row?.projectId ?? null;
}

/** 作者视角取图：非本人项目一律 null，路由据此回 404（403 会泄露"这个 id 存在"） */export async function openAssetForOwner(assetId: string, ownerId: string): Promise<AssetFile | null> {
  const row = await rowById(assetId);
  if (!row?.projectId) return null;
  if (!(await projectVisibleTo(row.projectId, ownerId))) return null;
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

