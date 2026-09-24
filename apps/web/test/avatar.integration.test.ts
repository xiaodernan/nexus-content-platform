import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import { AVATAR_URL_SHAPE, clearAvatar, openAvatar, setAvatar } from '../src/server/domain/avatar';
import { MAX_IMAGE_BYTES } from '../src/server/storage/images';
import { getDb } from '../src/server/db/client';
import { users } from '../src/server/db/schema';
import { resetStorageForTests } from '../src/server/storage/config';

/**
 * §60 头像打真库 + 真存储。头像这条链要回答的四个问题，mock 一个都答不了：
 * 字节真的落到这个用户名下吗、换掉之后旧对象还在不在磁盘上、
 * 旧 URL 是不是真的读不到新图（immutable 缓存的前提）、别人的文件名能不能套出别人的字节。
 *
 * 照仓库纪律：每条"读不到 / 没有"都在同一份数据里配一条换个条件就有的对照。
 */

const RUN = `av${Date.now().toString(36)}`;
const storeDir = `${process.cwd()}/.nexus-storage-avatar-${RUN}`;
let ownerId: string;
let otherId: string;

const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
function pngChunk(type: string, data: number[]): number[] {
  return [...be32(data.length), ...enc(type), ...data, 0, 0, 0, 0];
}
function makePng(width = 8, height = 8, seed = 1, withMeta = true): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = [...be32(width), ...be32(height), 8, 6, 0, 0, 0];
  const parts = [...sig, ...pngChunk('IHDR', ihdr)];
  if (withMeta) {
    parts.push(...pngChunk('eXIf', enc(`ExifII*GPS:37.77,seed${seed}`)));
  }
  parts.push(...pngChunk('IDAT', [seed, seed + 1, seed + 2]), ...pngChunk('IEND', []));
  return Uint8Array.from(parts);
}

/** 按字节序列找，不按单个字节：找 "GPS:" 这种明文只出现在元数据里的串 */
function containsSeq(bytes: Uint8Array, text: string): boolean {
  const needle = enc(text);
  const matches = (i: number) => needle.every((b, j) => bytes[i + j] === b);
  for (let i = 0; i + needle.length <= bytes.length; i++) {
    if (matches(i)) return true;
  }
  return false;
}

/** 磁盘上这个用户名下的对象数（本地驱动会为每个对象多写一份 .content-type 旁路文件，不计入） */
function objectsOf(userId: string): string[] {
  try {
    return readdirSync(`${storeDir}/users/${userId}`).filter((f) => !f.endsWith('.content-type'));
  } catch {
    return [];
  }
}

async function urlOf(userId: string): Promise<string | null> {
  const [row] = await getDb().select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.avatarUrl ?? null;
}

beforeAll(async () => {
  resetStorageForTests({ NEXUS_STORAGE_LOCAL_DIR: storeDir });
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `头像作者${RUN}`, email: `av+${RUN}@nexus.test`, handle: `av${RUN}` })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({ displayName: `头像路人${RUN}`, email: `av2+${RUN}@nexus.test`, handle: `av2${RUN}` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  otherId = other!.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
  resetStorageForTests();
  rmSync(storeDir, { recursive: true, force: true });
});

describe('setAvatar：只有真图片能变成头像', () => {
  it('非位图字节被拒，列与磁盘都不留东西；同一份数据换个合法 PNG 就能写进去', async () => {
    const spoof = Uint8Array.from([...enc('PK\x03\x04 zip 冒充头像'), ...enc('x'.repeat(64))]);
    const rejected = await setAvatar(ownerId, { data: spoof });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reason).toContain('PNG');
      expect(rejected.issues.join()).toContain('magic bytes');
    }
    expect(await urlOf(ownerId)).toBeNull();
    expect(objectsOf(ownerId)).toEqual([]);

    const ok = await setAvatar(ownerId, { data: makePng() });
    expect(ok.ok).toBe(true);
    expect(objectsOf(ownerId)).toHaveLength(1);
  });

  it('元数据在落盘之前就被剥掉：回执说剥了哪些段，磁盘上的字节里也确实没有', async () => {
    const raw = makePng(8, 8, 5);
    // 先确认这段明文确实在原始字节里，否则下面的"没有"只是没造出来
    expect(containsSeq(raw, 'GPS:')).toBe(true);

    const result = await setAvatar(ownerId, { data: raw });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removed).toContain('eXIf');

    const file = result.url.slice(result.url.lastIndexOf('/') + 1);
    const stored = await openAvatar(ownerId, file);
    expect(stored).not.toBeNull();
    expect(stored!.contentType).toBe('image/png');
    expect(containsSeq(stored!.bytes, 'GPS:')).toBe(false);
  });

  it('超过体积上限的位图按同一条 §9c 规则拒掉，不落存储', async () => {
    const before = objectsOf(ownerId).length;
    const huge = makePng(8, 8, 9);
    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1024);
    oversized.set(huge);
    const result = await setAvatar(ownerId, { data: oversized });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join()).toContain('MB');
    expect(objectsOf(ownerId)).toHaveLength(before);
    // 对照：合法的那张本来就在磁盘上，说明"数量没变"不是因为整条链路根本没写
    expect(before).toBeGreaterThan(0);
  }, 30_000);
});

describe('换头像留下的痕迹', () => {
  it('同样的字节再交一次是复用，不新增对象也不改地址', async () => {
    const first = await setAvatar(ownerId, { data: makePng(8, 8, 21) });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await setAvatar(ownerId, { data: makePng(8, 8, 21) });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.reused).toBe(true);
    expect(second.url).toBe(first.url);
    expect(objectsOf(ownerId)).toHaveLength(1);
  });

  it('换成另一张：旧地址读不到（不是返回新图），旧对象从磁盘带走', async () => {
    const before = await urlOf(ownerId);
    expect(before).not.toBeNull();
    const oldFile = before!.slice(before!.lastIndexOf('/') + 1);

    const next = await setAvatar(ownerId, { data: makePng(8, 8, 33) });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.reused).toBe(false);
    expect(next.url).not.toBe(before);
    expect(next.url).toMatch(AVATAR_URL_SHAPE);
    expect(await urlOf(ownerId)).toBe(next.url);

    // 旧 URL 必须 404：内容摘要写进了地址，让它返回新图就等于让一份 immutable 缓存指错东西
    expect(await openAvatar(ownerId, oldFile)).toBeNull();
    // 对照：新地址读得到
    expect(await openAvatar(ownerId, next.url.slice(next.url.lastIndexOf('/') + 1))).not.toBeNull();
    expect(objectsOf(ownerId)).toEqual([next.url.slice(next.url.lastIndexOf('/') + 1)]);
  });

  it('摘掉头像回到 null，不是换一张默认图；清空后再传又能用', async () => {
    const cleared = await clearAvatar(ownerId);
    expect(cleared.removed).toBe(true);
    expect(await urlOf(ownerId)).toBeNull();
    expect(objectsOf(ownerId)).toEqual([]);
    // 没有头像时再摘一次：不是错误，但要说清"本来就没有"
    expect((await clearAvatar(ownerId)).removed).toBe(false);

    const again = await setAvatar(ownerId, { data: makePng(8, 8, 44) });
    expect(again.ok).toBe(true);
    expect(objectsOf(ownerId)).toHaveLength(1);
  });
});

describe('openAvatar：地址里的 id 与文件名都得对上', () => {
  it('知道别人的文件名也换不到别人的字节；同一份文件名给本人就能读', async () => {
    const mine = await setAvatar(ownerId, { data: makePng(8, 8, 55) });
    expect(mine.ok).toBe(true);
    if (!mine.ok) return;
    const file = mine.url.slice(mine.url.lastIndexOf('/') + 1);

    expect(await openAvatar(otherId, file)).toBeNull();
    // 对照：文件名对、人也对才读得到
    expect(await openAvatar(ownerId, file)).not.toBeNull();
  });

  it('文件名形状不对就是一次空查询：不碰磁盘也不碰库', async () => {
    for (const bad of ['../../users/other/secret.png', 'avatar-zzzzzzzz.png', 'avatar-12345678.exe', '']) {
      expect(await openAvatar(ownerId, bad)).toBeNull();
    }
  });

  it('磁盘上多出来的对象摸不到：库里的行是唯一依据（删旧字节失败时靠这条兜住）', async () => {
    // 换头像时删旧字节是 best-effort（失败只吞掉不报错）。所以真正要守的是：
    // 只要库里的行不再指向那个文件名，那个地址就必须读不到——
    // 否则用户换掉的那张脸会一直挂在一个没人知道的 URL 上，而缓存规则写的是"存一年"
    const current = await setAvatar(ownerId, { data: makePng(8, 8, 66) });
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    const orphan = 'avatar-deadbeef.png';
    writeFileSync(`${storeDir}/users/${ownerId}/${orphan}`, makePng(8, 8, 77));
    writeFileSync(`${storeDir}/users/${ownerId}/${orphan}.content-type`, 'image/png');
    expect(objectsOf(ownerId)).toContain(orphan);

    expect(await openAvatar(ownerId, orphan)).toBeNull();
    // 对照：同一时刻库里指着的文件名读得到，说明"读不到"是规则挡的而不是整条链坏了
    expect(await openAvatar(ownerId, current.url.slice(current.url.lastIndexOf('/') + 1))).not.toBeNull();
  });
});
