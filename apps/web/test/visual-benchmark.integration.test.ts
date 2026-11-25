import { deflateSync } from 'node:zlib';
import { raisePlan } from './support/test-plan';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import { POST as visualBenchmark } from '../src/app/api/projects/[projectId]/visual-benchmark/route';
import { uploadImageAsset } from '../src/server/domain/assets';
import { createProject } from '../src/server/domain/projects';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getDb } from '../src/server/db/client';
import { projects, sessions, users } from '../src/server/db/schema';
import { resetStorageForTests } from '../src/server/storage/config';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';

/**
 * §86 视觉基准的路由这一格，打真库 + 真存储。域层的 `compareVisuals` 已有纯函数用例
 * 钉着"指标该动的时候动"；这里钉的是路由自己那几件域层管不到的事：
 * 1. **两张图都必须是这个项目的**：跨项目借图当候选 ⇒ 404（不泄露"这个 id 存在"）；
 * 2. **同图自比在形状上就拒**：schema 的 refine 让它 400，不用等到解像素；
 * 3. **不是 PNG 如实 415**、解得开上传却解不开比较的坏字节如实 422（带原因，不返回空指标）；
 * 4. **CSRF / 会话**两道边界都在。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const storeDir = `${process.cwd()}/.nexus-storage-vbench-${Date.now()}`;
const CSRF_TOKEN = 'c3d4e5f607189a2b';

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type, 'ascii'), Buffer.from(data), Buffer.alloc(4)]);
}

type Rgb = [number, number, number];

function png(width: number, height: number, pixel: (x: number, y: number) => Rgb): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      const at = rowStart + 1 + x * 3;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** IHDR 合法、IDAT 解出来的字节数不对：能过上传（不解码），过不了比较（要解码） */
function brokenIdatPng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(8, 0);
  ihdr.writeUInt32BE(8, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', new Uint8Array(deflateSync(Buffer.from([1, 2, 3, 4])))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const gif = ((): Buffer => {
  // GIF89a 头 + 几个字节：足够过 mime 嗅探，不需要真的是一张能解的图（这条用例到不了解码）
  return Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(16, 7)]);
})();

const block = (x: number, y: number): Rgb => (x >= 8 && x < 40 && y >= 8 && y < 40 ? [0, 0, 0] : [255, 255, 255]);

let ownerId: string;
let strangerId: string;
let token: string;
let projectId: string;
let otherProjectId: string;
let refAssetId: string;
let candAssetId: string;

beforeAll(async () => {
  resetStorageForTests({ NEXUS_STORAGE_LOCAL_DIR: storeDir });
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const [owner] = await db
    .insert(users)
    .values({ displayName: `视觉基准作者${Date.now()}`, email: `vb+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  await raisePlan(ownerId);
  const [stranger] = await db
    .insert(users)
    .values({ displayName: `视觉基准路人${Date.now()}`, email: `vbx+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  strangerId = stranger!.id;
  projectId = (await createProject(ownerId, { name: '视觉基准项目', kind: 'website' })).id;
  otherProjectId = (await createProject(strangerId, { name: '别人的项目', kind: 'website' })).id;

  const token_hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vb-token'));
  await db.insert(sessions).values({
    userId: ownerId,
    tokenHash: Buffer.from(token_hash).toString('hex'),
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  token = 'vb-token';

  const ref = await uploadImageAsset(projectId, { data: png(128, 128, block), createdById: ownerId });
  if (!ref.ok) throw new Error(`参考图上传失败：${JSON.stringify(ref)}`);
  refAssetId = ref.asset.id;
  const cand = await uploadImageAsset(projectId, { data: png(128, 128, (x, y) => (x >= 72 && x < 104 && y >= 72 && y < 104 ? [0, 0, 0] : [255, 255, 255])), createdById: ownerId });
  if (!cand.ok) throw new Error(`生成图上传失败：${JSON.stringify(cand)}`);
  candAssetId = cand.asset.id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(projects).where(eq(projects.ownerId, strangerId));
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, strangerId));
});

function post(projectId: string, body: unknown, withCsrf = true): Promise<Response> {
  jar.clear();
  jar.set(SESSION_COOKIE, token);
  if (withCsrf) jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (withCsrf) headers[CSRF_HEADER] = CSRF_TOKEN;
  return visualBenchmark(
    new Request(`http://localhost/api/projects/${projectId}/visual-benchmark`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ projectId }) },
  );
}

describe('§86 视觉基准路由', () => {
  it('两张本项目的 PNG ⇒ 200：指标齐全、资产回显、测不出的维度如实披露', async () => {
    const res = await post(projectId, { referenceAssetId: refAssetId, candidateAssetId: candAssetId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      referenceAssetId: string;
      candidateAssetId: string;
      shapeMismatch: boolean;
      metrics: { layout: { score: number }; alignment: { score: number } };
      notMeasured: { area: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.referenceAssetId).toBe(refAssetId);
    expect(body.candidateAssetId).toBe(candAssetId);
    expect(body.shapeMismatch).toBe(false);
    // 这对 fixtures 一个块在左上、一个在右下 ⇒ 布局与对齐都该是 0
    expect(body.metrics.layout.score).toBe(0);
    expect(body.metrics.alignment.score).toBe(0);
    expect(body.notMeasured.map((n) => n.area).sort()).toEqual(['componentCorrectness', 'typography']);
  });

  it('同一份资产既当参考又当候选 ⇒ 400（和它自己比没有意义）', async () => {
    const res = await post(projectId, { referenceAssetId: refAssetId, candidateAssetId: refAssetId });
    expect(res.status).toBe(400);
  });

  it('CSRF 没过 ⇒ 403', async () => {
    const res = await post(projectId, { referenceAssetId: refAssetId, candidateAssetId: candAssetId }, false);
    expect(res.status).toBe(403);
  });

  it('候选图是别的项目的 ⇒ 404（不泄露存在性）', async () => {
    const strangerAsset = await uploadImageAsset(otherProjectId, { data: png(128, 128, block), createdById: strangerId });
    if (!strangerAsset.ok) throw new Error('路人图上传失败');
    const res = await post(projectId, { referenceAssetId: refAssetId, candidateAssetId: strangerAsset.asset.id });
    expect(res.status).toBe(404);
  });

  it('不存在的资产 ⇒ 404', async () => {
    const res = await post(projectId, { referenceAssetId: refAssetId, candidateAssetId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('候选是 GIF ⇒ 415，消息说清只支持 PNG', async () => {
    const gifAsset = await uploadImageAsset(projectId, { data: gif, createdById: ownerId });
    if (!gifAsset.ok) throw new Error(`GIF 上传失败：${JSON.stringify(gifAsset)}`);
    const res = await post(projectId, { referenceAssetId: refAssetId, candidateAssetId: gifAsset.asset.id });
    expect(res.status).toBe(415);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toContain('PNG');
  });

  it('能过上传却解不开比较的坏 IDAT ⇒ 422 带原因，不是空指标', async () => {
    const broken = await uploadImageAsset(projectId, { data: brokenIdatPng(), createdById: ownerId });
    if (!broken.ok) throw new Error(`坏图上传失败：${JSON.stringify(broken)}`);
    const res = await post(projectId, { referenceAssetId: refAssetId, candidateAssetId: broken.asset.id });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toContain('生成图');
  });
});
