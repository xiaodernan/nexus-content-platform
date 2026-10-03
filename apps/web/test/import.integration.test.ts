import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count, inArray } from 'drizzle-orm';
import { createNode, type DesignDocument } from '@nexus/design-model';
import { crc32, textEntry, zipStore, type ZipEntry } from '../src/lib/zip';
import { readZip, readZipText } from '../src/lib/zip-read';
import { buildProjectExport, type NexusManifest } from '../src/server/domain/export';
import { importProjectZip } from '../src/server/domain/import';
import { openAssetForOwner, uploadImageAsset } from '../src/server/domain/assets';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { getStorage } from '../src/server/storage/config';
import { getDb } from '../src/server/db/client';
import { assets, projects, users } from '../src/server/db/schema';

/**
 * ADR-0024 欠的那一句：**所有导出必须能被另一个实例重新导入**。
 * `zip-import.test.ts` 打的是拒收表（不碰库）；这一份打的是往返——真导出一份，再真导回来。
 *
 * 包不是夹具手搓的，是从真项目 `buildProjectExport` 出来的，再在这一份真包上做**最小改动**
 * （换字节、换版本、抽掉资产）。理由：只有真包能保证清单的 CRC、路径拼法、`assetRefs`
 * 与写端当前一致；夹具一致而真包不一致的话，绿的是夹具。
 */

const MANIFEST_PATH = '.nexus/manifest.json';

let userId: string;
let otherUserId: string;
let sourceId: string;
/** 源项目里那张图的 id 与字节：换号与逐字节交还的对照物 */
let sourceAssetId: string;
let sourceAssetBytes: Uint8Array;
let sourceAssetKey: string;

function makePng(seed = 1): Uint8Array {
  const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);
  const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  const chunk = (type: string, data: number[]) => {
    const body = [...enc(type), ...data];
    return [...be32(data.length), ...body, 0, 0, 0, 0];
  };
  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', [...be32(4), ...be32(3), 8, 6, 0, 0, 0]),
    ...chunk('IDAT', [seed, 2, 3, 4]),
    ...chunk('IEND', []),
  ]);
}

/** 拆成真包的两层：清单 + 其余条目（条目原样，不重新编码） */
function packageOf(zipBytes: Uint8Array): { manifest: NexusManifest; files: ZipEntry[] } {
  const entries = readZip(zipBytes);
  const text = readZipText(entries, MANIFEST_PATH);
  if (text === null) throw new Error('真包里居然没有清单');
  return {
    manifest: JSON.parse(text) as NexusManifest,
    files: entries
      .filter((e) => e.path !== MANIFEST_PATH)
      .map((e) => ({ path: e.path, contents: e.contents })),
  };
}

/** 换掉包里的文件再压一份；`resync=True` 时按新字节重算清单的 entries（"包自洽但内容变了"） */
function repack(files: ZipEntry[], manifest: NexusManifest, resync: boolean): Uint8Array {
  const fixed: NexusManifest = resync
    ? {
        ...manifest,
        entries: files.map((e) => ({
          path: e.path,
          bytes: e.contents.length,
          crc32: crc32(e.contents).toString(16).toUpperCase().padStart(8, '0'),
        })),
      }
    : manifest;
  return zipStore([textEntry(MANIFEST_PATH, JSON.stringify(fixed)), ...files]);
}

async function projectTotal(): Promise<number> {
  const [row] = await getDb().select({ total: count() }).from(projects);
  return row?.total ?? 0;
}

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now().toString(36);
  const [me] = await db
    .insert(users)
    .values({ displayName: 'Import', email: `imp+${stamp}@nexus.test`, handle: `imp${stamp}` })
    .returning({ id: users.id });
  userId = me!.id;
  const [other] = await db
    .insert(users)
    .values({ displayName: 'Import Other', email: `imp-o+${stamp}@nexus.test`, handle: `impo${stamp}` })
    .returning({ id: users.id });
  otherUserId = other!.id;

  const created = await createProject(userId, { name: '导入往返 源项目', kind: 'website' });
  sourceId = created.id;

  const uploaded = await uploadImageAsset(sourceId, {
    data: makePng(),
    filename: '封面.png',
    createdById: userId,
    source: 'upload',
  });
  if (!uploaded.ok) throw new Error(`素材上传失败：${uploaded.reason}`);
  sourceAssetId = uploaded.asset.id;
  sourceAssetKey = uploaded.asset.storageKey;
  const served = await openAssetForOwner(sourceAssetId, userId);
  if (!served) throw new Error('刚上传的字节取不回来，这条用例失去意义');
  sourceAssetBytes = served.bytes;

  // 让文档真的**引用**这张图（image paint 挂在根节点上）：
  // 只有引用存在，换号这件事才有可对的东西——否则"引用没断"是一句空话
  const document = await loadDocument(sourceId);
  if (!document) throw new Error('源项目载入失败');
  const page = document.pages[0]!;
  const frame = createNode({ type: 'frame', name: 'hero-cover', parentId: page.rootId });
  frame.style.fills = [{ kind: 'image', assetId: sourceAssetId, fit: 'cover' }];
  page.nodes[frame.id] = frame;
  page.nodes[page.rootId]!.children = [...page.nodes[page.rootId]!.children, frame.id];
  await saveDocument(sourceId, document as DesignDocument);
});

afterAll(async () => {
  const db = getDb();
  // 导入会新建项目与资产行，字节落在本地目录里；按创建者收回，别把测试写的字节留在盘上
  const rows = await db
    .select({ key: assets.storageKey })
    .from(assets)
    .where(inArray(assets.createdById, [userId, otherUserId]));
  for (const row of rows) await getStorage().delete(row.key);
  await db.delete(projects).where(inArray(projects.ownerId, [userId, otherUserId]));
  await db.delete(users).where(inArray(users.id, [userId, otherUserId]));
});

describe('§105/§144 导入往返（真实数据库）', () => {
  it('自家导出的包导回来是一个新项目：结构在、页面换了号、图是自己的那份字节', async () => {
    const exported = await buildProjectExport(sourceId, userId, ['design', 'code', 'assets']);
    if (!exported) throw new Error('自己的项目导不出来');
    const imported = await importProjectZip(userId, exported.bytes);
    if (!imported.ok) throw new Error(`导入被拒：${imported.reason} / ${imported.issues.join('；')}`);

    expect(imported.projectId, '导回来是原地覆盖，不是新项目').not.toBe(sourceId);
    expect(imported.name).toBe('导入往返 源项目');
    expect(imported.kind).toBe('website');
    expect(imported.counts.design).toBe(1);
    expect(imported.counts.assets, '包里的图没落进新项目').toBe(1);
    expect(imported.codeFilesIgnored, '包里有几份代码这件事没报出来').toBe(exported.counts.code);
    // 一次干净的导入不该编造失败：这条为空就是"图会断"那条判据的反向见证
    expect(imported.assetFailures, `成功导入却报了失败：${JSON.stringify(imported.assetFailures)}`).toEqual([]);

    const source = await loadDocument(sourceId);
    const stored = await loadDocument(imported.projectId);
    if (!source || !stored) throw new Error('往返之后任何一份读不回来，后面都不用比了');

    // 页面 id 是全局主键：不换号就撞在源项目那几行上
    const sourcePages = new Set(source.pages.map((p) => p.id));
    expect(stored.pages.map((p) => p.id).some((id) => sourcePages.has(id)), '页面 id 没有换号').toBe(false);
    expect(stored.pages.length).toBe(source.pages.length);
    const shape = (doc: DesignDocument) =>
      doc.pages
        .map((p) => `${p.name}|${p.width}x${p.height}|${Object.values(p.nodes).map((n) => n.name).sort().join(',')}`)
        .sort();
    expect(shape(stored), '结构没搬过来').toEqual(shape(source));

    // 资产清单：新项目只有一行，且那不是源项目那一行
    expect(stored.assets.length, '新项目的资产清单不是自己那一份').toBe(1);
    const newAsset = stored.assets[0]!;
    expect(newAsset.id).not.toBe(sourceAssetId);
    expect(newAsset.storageKey).not.toBe(sourceAssetKey);
    const bytes = await openAssetForOwner(newAsset.id, userId);
    if (!bytes) throw new Error('新项目那份字节取不回来');
    expect(Array.from(bytes.bytes)).toEqual(Array.from(sourceAssetBytes));

    // 引用跟着换号：新文档画的是**自己**那一行的字节，源 id 在它里面一次都不该出现
    const nodeJson = JSON.stringify(stored.pages);
    expect(nodeJson.includes(sourceAssetId), '文档还在引用源项目那张图的 id').toBe(false);
    expect(nodeJson.includes(newAsset.id), 'image paint 没跟着换号').toBe(true);

    // 源项目一点没动
    expect((await loadDocument(sourceId))!.pages.map((p) => p.id)).toEqual(source.pages.map((p) => p.id));
    expect(await openAssetForOwner(sourceAssetId, userId), '源项目的那份字节被导入过程弄没了').not.toBeNull();
  });

  it('别人拿这份包导入：新项目归他，源项目与源资产都到不了他手里', async () => {
    const exported = await buildProjectExport(sourceId, userId, ['design', 'assets']);
    if (!exported) throw new Error('自己的项目导不出来');
    const imported = await importProjectZip(otherUserId, exported.bytes);
    if (!imported.ok) throw new Error(`导入被拒：${imported.reason}`);

    const [row] = await getDb().select({ owner: projects.ownerId }).from(projects).where(inArray(projects.id, [imported.projectId]));
    expect(row?.owner, '导入出来的项目不是导入者的').toBe(otherUserId);
    const stored = await loadDocument(imported.projectId);
    if (!stored) throw new Error('新项目读不回来');
    const newAssetId = stored.assets[0]!.id;
    expect(await openAssetForOwner(newAssetId, otherUserId), '导入者读不到自己刚导入的图').not.toBeNull();
    expect(await openAssetForOwner(sourceAssetId, otherUserId), '他拿到了源项目那张图的字节').toBeNull();
  });

  it('内容被动过而清单没改：整包拒收，一个项目都不新建', async () => {
    const exported = await buildProjectExport(sourceId, userId, ['design', 'code', 'assets']);
    if (!exported) throw new Error('自己的项目导不出来');
    const { manifest, files } = packageOf(exported.bytes);
    const before = await projectTotal();

    const hijacked = files.map((f) =>
      f.path === 'design/document.json'
        ? textEntry(f.path, JSON.stringify({ name: '被人塞了一页', pages: [], components: [], tokens: [], assets: [], variables: [] }))
        : f,
    );
    // resync=false：清单还是导出时那一份，包里的字节却换了——CRC 就是为这一格存在的
    const outcome = await importProjectZip(userId, repack(hijacked, manifest, false));

    expect(outcome.ok, '被改过的包照样导进来了').toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain('清单与包内容对不上');
    expect(outcome.issues.join('\n')).toContain('design/document.json');
    expect(await projectTotal(), '拒收了却还是建了项目').toBe(before);
  });

  it('v1 的包（清单没记 assetId）：拒收，并说清为什么要重新导出', async () => {
    const exported = await buildProjectExport(sourceId, userId, ['design', 'assets']);
    if (!exported) throw new Error('自己的项目导不出来');
    const { manifest, files } = packageOf(exported.bytes);
    const before = await projectTotal();

    // 一份**自洽**的 v1 包：条目字节与 CRC 都真，只是版本回到 1、assetRefs 那一层还不存在
    const asV1: NexusManifest = { ...manifest, formatVersion: 1, assetRefs: [] };
    const outcome = await importProjectZip(userId, repack(files, asV1, true));

    expect(outcome.ok, 'v1 的包被当成 v2 导进来了').toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toContain('这份是 v1');
    expect(outcome.issues.join('；'), '拒收了却没解释 v1 少了什么').toContain('资产 id');
    expect(outcome.issues.join('；')).toContain('重新导出');
    expect(await projectTotal()).toBe(before);
  });

  it('包里的字节过不了摄取门：项目还在，少的那一张点名', async () => {
    const exported = await buildProjectExport(sourceId, userId, ['design', 'assets']);
    if (!exported) throw new Error('自己的项目导不出来');
    const { manifest, files } = packageOf(exported.bytes);
    const assetPath = manifest.assetRefs[0]?.path;
    if (!assetPath) throw new Error('真包里没有资产条目');

    // 换成一坨不是位图的字节，并把清单跟着重算：这样拒的原因只剩"摄取门不收"这一条
    const junk = files.map((f) => (f.path === assetPath ? { ...f, contents: textEntry(f.path, '这不是 PNG').contents } : f));
    const outcome = await importProjectZip(userId, repack(junk, manifest, true));

    expect(outcome.ok, '位图门拒了却没报出来').toBe(true);
    if (!outcome.ok) return;
    expect(outcome.counts.assets).toBe(0);
    // 两条各自点名：一条是"这张图的字节没被收下"，一条是"文档还在引用它，引用会断"
    expect(outcome.assetFailures.length, `失败条数不对：${JSON.stringify(outcome.assetFailures)}`).toBe(2);
    const refused = outcome.assetFailures.find((f) => f.path === assetPath);
    if (!refused) throw new Error('字节不合格的那一张没有被点名');
    expect(refused.reason).toContain('只接受 PNG');
    const dangling = outcome.assetFailures.find((f) => f.path.includes('文档引用'));
    if (!dangling) throw new Error('断掉的引用没有被点名');
    expect(dangling.path, '悬空引用报的不是那一个 id').toContain(sourceAssetId);
    expect(dangling.reason).toContain('导入后这张图的引用会断');
    const stored = await loadDocument(outcome.projectId);
    if (!stored) throw new Error('项目没建起来');
    expect(stored.assets.length).toBe(0);
  });

  it('导出时就没带上字节的那张图（missingAssets 那一类）：导回来报的是同一件事', async () => {
    const exported = await buildProjectExport(sourceId, userId, ['design', 'assets']);
    if (!exported) throw new Error('自己的项目导不出来');
    const { manifest, files } = packageOf(exported.bytes);
    const stripped = files.filter((f) => !f.path.startsWith('assets/'));
    const outcome = await importProjectZip(userId, repack(stripped, { ...manifest, assetRefs: [] }, true));

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.counts.assets).toBe(0);
    expect(outcome.assetFailures.map((f) => f.reason).join('；')).toContain('包里没有这个资产的字节');
  });

  it('只导 design 的包照样导得回来；没导 design 的包导回来是个空项目，所以拒收', async () => {
    const designOnly = await buildProjectExport(sourceId, userId, ['design']);
    if (!designOnly) throw new Error('自己的项目导不出来');
    const ok = await importProjectZip(userId, designOnly.bytes);
    expect(ok.ok, ok.ok ? '' : `${ok.reason} / ${ok.issues.join('；')}`).toBe(true);

    const assetsOnly = await buildProjectExport(sourceId, userId, ['assets']);
    if (!assetsOnly) throw new Error('自己的项目导不出来');
    const empty = await importProjectZip(userId, assetsOnly.bytes);
    expect(empty.ok, '一份没有设计文档的包导成了一个空项目').toBe(false);
    if (empty.ok) return;
    expect(empty.reason).toContain('没导 design');
  });
});
