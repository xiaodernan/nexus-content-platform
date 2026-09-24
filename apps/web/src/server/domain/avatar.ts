import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import { getStorage } from '../storage/config';
import {
  IMAGE_MIME_EXTENSIONS,
  imageLimitViolations,
  readImageSize,
  sniffImageMime,
  stripImageMetadata,
} from '../storage/images';

/**
 * §60 头像：`users.avatar_url` 从建库那一版起就在，但全库没有一处写它，
 * 所以公开主页永远走"首字母"那支。这里补上写入方。
 *
 * 校验链整条复用 §9c 的图片管线（magic bytes 判定 → 尺寸/体积上限 → 剥元数据），
 * 不另起一套"头像专用"的宽松规则：头像会以 `<img>` 出现在别人的公开页上，
 * 风险面和设计稿里的图片一模一样。
 *
 * 为什么不进 `assets` 表：那张表按**项目**归属（project_id 级联删除、发布快照按 id 引用、
 * 两条读取路径都要求有项目），而头像归属是人。硬塞进去要么给 project_id 开空值、
 * 要么让人删项目时把自己的头像带走——两个都比多写这一个模块贵。
 */

/** URL 里带内容摘要：换一张图就是换一个地址，于是可以放心 `immutable` 缓存一整年 */
export const AVATAR_URL_PREFIX = '/api/avatar/';
const AVATAR_FILE = /^avatar-([0-9a-f]{8})\.(png|jpg|webp|gif)$/;
/** 对外可断言的完整地址形状：写入方和读取方都用它判定，脏 URL 一律当"没有头像" */
export const AVATAR_URL_SHAPE = /^\/api\/avatar\/[0-9a-f-]{36}\/avatar-[0-9a-f]{8}\.(png|jpg|webp|gif)$/;

function keyOf(userId: string, file: string): string {
  return `users/${userId}/${file}`;
}

export interface AvatarFile {
  bytes: Uint8Array;
  contentType: string;
}

export type SetAvatarResult =
  | { ok: true; url: string; removed: string[]; bytes: number; reused: boolean }
  | { ok: false; reason: string; issues: string[] };

/**
 * 换头像：识别 → 上限 → 剥元数据 → 落存储 → 写 URL → 清掉上一张。
 *
 * 顺序是有意的：**先写库再删旧字节**。反过来做的话，写库失败会留下一个
 * "头像已经没了但新头像没换上"的中间态；现在最坏情况只是多留一个没人引用的对象。
 */
export async function setAvatar(
  userId: string,
  input: { data: ArrayBuffer | Uint8Array },
): Promise<SetAvatarResult> {
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

  const checksum = createHash('sha256').update(sanitized.bytes).digest('hex').slice(0, 8);
  const file = `avatar-${checksum}${IMAGE_MIME_EXTENSIONS[mime]}`;
  const url = `${AVATAR_URL_PREFIX}${userId}/${file}`;
  const db = getDb();
  const [before] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);
  if (before?.avatarUrl === url) return { ok: true, url, removed: [], bytes: sanitized.bytes.length, reused: true };

  await getStorage().put(keyOf(userId, file), sanitized.bytes, mime);
  await db.update(users).set({ avatarUrl: url, updatedAt: new Date() }).where(eq(users.id, userId));

  const previous = avatarFileOf(before?.avatarUrl ?? null);
  if (previous && previous !== file) await getStorage().delete(keyOf(userId, previous)).catch(() => undefined);
  return { ok: true, url, removed: sanitized.removed, bytes: sanitized.bytes.length, reused: false };
}

/** 从 URL 里取出文件名那一段；形状不对就是脏数据，一律当"没有头像"而不是拿去拼路径 */
function avatarFileOf(url: string | null): string | null {
  if (!url || !AVATAR_URL_SHAPE.test(url)) return null;
  const file = url.slice(url.lastIndexOf('/') + 1);
  return AVATAR_FILE.test(file) ? file : null;
}

/**
 * 取字节。文件名也要对得上：URL 里带的是内容摘要，被换掉之后旧地址应当 404，
 * 而不是把新头像当成旧 URL 的内容发出去（那等于让一份 immutable 缓存指错东西）。
 */
export async function openAvatar(userId: string, file: string): Promise<AvatarFile | null> {
  if (!AVATAR_FILE.test(file)) return null;
  const [row] = await getDb().select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);
  if (avatarFileOf(row?.avatarUrl ?? null) !== file) return null;
  const found = await getStorage().get(keyOf(userId, file));
  if (!found) return null;
  return { bytes: found.bytes, contentType: found.contentType ?? 'application/octet-stream' };
}

/** 摘掉头像：列回到 null，公开主页重新走首字母那一支（不是换一张默认图，§159） */
export async function clearAvatar(userId: string): Promise<{ removed: boolean }> {
  const db = getDb();
  const [before] = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);
  const file = avatarFileOf(before?.avatarUrl ?? null);
  await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, userId));
  if (file) await getStorage().delete(keyOf(userId, file)).catch(() => undefined);
  return { removed: !!file };
}
