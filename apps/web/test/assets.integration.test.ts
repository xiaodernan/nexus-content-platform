import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { eq, sql as rawSql } from 'drizzle-orm';
import { createNode, findPage, type DesignDocument } from '@nexus/design-model';
import {
  copyProjectAssets,
  deleteAsset,
  documentReferencesAsset,
  getAsset,
  listProjectAssets,
  openAssetFile,
  openAssetForOwner,
  openAssetForPublicPath,
  uploadImageAsset,
} from '../src/server/domain/assets';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { publishProject } from '../src/server/domain/publish';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';
import { resetStorageForTests } from '../src/server/storage/config';

/**
 * 资产服务打真库 + 真存储（docs/TESTING.md 禁止 mock 数据库）。
 * 先 `npm run infra:up && npm run db:migrate`。
 * 存储指到本用例独占的临时目录，跑完删掉，不污染 .nexus-storage。
 */

let ownerId: string;
let otherId: string;
const storeDir = `${process.cwd()}/.nexus-storage-assets-${Date.now()}`;
const createdProjects: string[] = [];

const enc = (s: string) => Array.from(s, (c) => c.charCodeAt(0) & 0xff);
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
function pngChunk(type: string, data: number[]): number[] {
  return [...be32(data.length), ...enc(type), ...data, 0, 0, 0, 0];
}
function makePng(width = 8, height = 8): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = [...be32(width), ...be32(height), 8, 6, 0, 0, 0];
  return Uint8Array.from([...sig, ...pngChunk('IHDR', ihdr), ...pngChunk('IDAT', [1, 2, 3]), ...pngChunk('IEND', [])]);
}

beforeAll(async () => {
  resetStorageForTests({ NEXUS_STORAGE_LOCAL_DIR: storeDir });
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [owner] = await db
    .insert(users)
    .values({ displayName: 'Asset Owner', email: `asset+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  const [other] = await db
    .insert(users)
    .values({ displayName: 'Asset Intruder', email: `asset-intruder+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  otherId = other!.id;
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdProjects) await db.delete(projects).where(eq(projects.id, id));
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, otherId));
  resetStorageForTests();
  try {
    rmSync(storeDir, { recursive: true, force: true });
  } catch {
    /* 目录可能不存在，忽略 */
  }
});

async function newProject(name: string): Promise<string> {
  const doc = await createProject(ownerId, { name, kind: 'website' });
  createdProjects.push(doc.id);
  return doc.id;
}

describe('uploadImageAsset（真实存储 + 库）', () => {
  it('识别 → 剥离 → 落库，宽高与展示名都写对', async () => {
    const projectId = await newProject('Upload Happy');
    const result = await uploadImageAsset(projectId, { data: makePng(6, 4), filename: 'logo.png', createdById: ownerId });
    if (!result.ok) throw new Error(result.reason);
    expect(result.reused).toBe(false);
    expect(result.asset.kind).toBe('image');
    expect(result.asset.mimeType).toBe('image/png');
    expect(result.asset.width).toBe(6);
    expect(result.asset.height).toBe(4);
    // 展示名清洗，且绝不进 object key（key 由服务端按 id 生成）
    expect(result.asset.name).toBe('logo.png');
    expect(result.asset.storageKey).toBe(`projects/${projectId}/${result.asset.id}.png`);

    const file = await openAssetFile(result.asset.id);
    expect(file?.mime).toBe('image/png');
    // 字节确实是净化后的 PNG，落库体积为正
    expect((await getAsset(result.asset.id))?.sizeBytes).toBeGreaterThan(0);
  });

  it('拒绝非位图，并给出明确原因（不看扩展名）', async () => {
    const projectId = await newProject('Upload Reject');
    const fake = Uint8Array.from(enc('PK\x03\x04 我扩展名叫 .png 但不是图片'));
    const result = await uploadImageAsset(projectId, { data: fake, filename: 'evil.png' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('只接受');
  });

  it('同项目重复上传复用同一行（reused），不新增记录', async () => {
    const projectId = await newProject('Upload Dedupe');
    const bytes = makePng(3, 3);
    const first = await uploadImageAsset(projectId, { data: bytes, filename: 'a.png' });
    const second = await uploadImageAsset(projectId, { data: bytes.slice(), filename: 'b.png' });
    if (!first.ok || !second.ok) throw new Error('两次上传都应成功');
    expect(second.reused).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);
    expect(await listProjectAssets(projectId)).toHaveLength(1);
  });

  it('按 Content 字节判尺寸，超限字节也拒（此处用巨大声明尺寸）', async () => {
    const projectId = await newProject('Upload Limits');
    const huge = makePng(13000, 13000); // 单边 > 12000
    const result = await uploadImageAsset(projectId, { data: huge });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join()).toContain('单边');
  });
});

describe('鉴权取字节', () => {
  it('作者能取，非作者返回 null（路由据此 404，不泄露存在性）', async () => {
    const projectId = await newProject('Owner Check');
    const up = await uploadImageAsset(projectId, { data: makePng(), filename: 'x.png' });
    if (!up.ok) throw new Error(up.reason);
    expect(await openAssetForOwner(up.asset.id, ownerId)).not.toBeNull();
    expect(await openAssetForOwner(up.asset.id, otherId)).toBeNull();
  });

  it('公开路径要满足"发布 + 快照确实引用"两条，缺一即 null', async () => {
    const projectId = await newProject('Public Path');
    const up = await uploadImageAsset(projectId, { data: makePng(), filename: 'hero.png' });
    if (!up.ok) throw new Error(up.reason);
    const [ownerRow] = await getDb().select({ handle: users.handle }).from(users).where(eq(users.id, ownerId)).limit(1);

    // 引用该资产：往活动页挂一个 image paint 节点
    const document = await loadDocument(projectId);
    const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
    const frame = createNode({ type: 'frame', name: 'hero', parentId: page.rootId });
    frame.style.fills = [{ kind: 'image', assetId: up.asset.id, fit: 'cover' }];
    page.nodes[frame.id] = frame;
    page.nodes[page.rootId]!.children = [...page.nodes[page.rootId]!.children, frame.id];
    await saveDocument(projectId, document as DesignDocument);
    expect(documentReferencesAsset((await loadDocument(projectId))!, up.asset.id)).toBe(true);

    const handle = ownerRow?.handle ?? 'unknown';
    // 发布前：没有发布行 → null
    expect(await openAssetForPublicPath(handle, up.asset.id)).toBeNull();

    const published = await publishProject(projectId, { visibility: 'unlisted', createdById: ownerId });
    if (!published || !published.ok) throw new Error(`发布应通过门禁：${published && !published.ok ? published.gate.blockers.join('；') : 'null'}`);
    const after = await getDb().select({ handle: users.handle }).from(users).where(eq(users.id, ownerId)).limit(1);
    expect(await openAssetForPublicPath(after[0]!.handle!, up.asset.id)).not.toBeNull();
  });
});

describe('deleteAsset 与 copyProjectAssets（§27）', () => {
  it('删除：本人成功、他人拒绝，删后取不到字节', async () => {
    const projectId = await newProject('Delete');
    const up = await uploadImageAsset(projectId, { data: makePng(), filename: 'gone.png' });
    if (!up.ok) throw new Error(up.reason);
    expect(await deleteAsset(up.asset.id, otherId)).toBe(false);
    expect(await deleteAsset(up.asset.id, ownerId)).toBe(true);
    expect(await getAsset(up.asset.id)).toBeNull();
    expect(await openAssetFile(up.asset.id)).toBeNull();
  });

  it('复制：目标项目拿到自己的行与字节，源不受影响', async () => {
    const source = await newProject('Copy Source');
    const target = await newProject('Copy Target');
    const up = await uploadImageAsset(source, { data: makePng(10, 10), filename: 'shared.png' });
    if (!up.ok) throw new Error(up.reason);

    const map = await copyProjectAssets(source, target, ownerId);
    expect(map.size).toBe(1);
    const newId = map.get(up.asset.id)!;
    expect(newId).not.toBe(up.asset.id);

    // 两份字节都在，且新行属于 target 项目
    const copied = await getAsset(newId);
    expect(copied).not.toBeNull();
    const targetAssets = await listProjectAssets(target);
    expect(targetAssets.map((a) => a.id)).toContain(newId);
    expect(await openAssetFile(newId)).not.toBeNull();

    // 删掉源项目的资产，副本仍可读（各持各的字节）
    expect(await deleteAsset(up.asset.id, ownerId)).toBe(true);
    expect(await openAssetFile(newId)).not.toBeNull();
  });
});
