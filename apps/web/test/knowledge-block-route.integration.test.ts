import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as getBlock, POST as postBlock } from '../src/app/api/projects/[projectId]/knowledge/block/route';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { retrieveProjectKnowledge } from '../src/server/domain/knowledge';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, sessions, users } from '../src/server/db/schema';

/**
 * §49 取整块语料那条路由（`/api/projects/<id>/knowledge/block`）的**通道形状**，打真库。
 *
 * 这一片钉的是一个已经发生过的事故：`ef33e55` 把这条路由从 GET 改写成了 POST，
 * 而 Studio 的 `ContextPanel.readBlock` 一直是 GET——客户端在真环境里拿 405，功能是坏的，
 * 却没人发现，因为 e2e 用 page.route 把这条路径的请求整个 mock 掉了。
 * 所以这里直接从路由模块 import GET/POST 自己调，绕开任何 mock：路由只要又丢了 GET，这条立刻红。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function identityFor(userId: string): Promise<string> {
  const token = `tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

let owner: string;
let token: string;
let projectId: string;
let designSourceId: string;

beforeAll(async () => {
  const db = getDb();
  const [me] = await db
    .insert(users)
    .values({ displayName: '整块语料房主', email: `kblock+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = me!.id;
  token = await identityFor(owner);
  projectId = (await createProject(owner, { name: '整块语料', kind: 'website' })).id;
  // 起手模板落库即建索引；顺着检索命中拿一个真的 design 出处
  const hit = await retrieveProjectKnowledge(projectId, '从一句话到一个可发布的产品');
  const item = hit.items.find((i) => i.sourceType === 'design');
  if (!item) throw new Error('起点就不是绿的：检索没命中设计正文');
  designSourceId = item.sourceId;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(users).where(eq(users.id, owner));
});

function callGet(query: string, withAuth = true): Promise<Response> {
  jar.clear();
  if (withAuth) jar.set(SESSION_COOKIE, token);
  return getBlock(
    new Request(`http://localhost:3100/api/projects/${projectId}/knowledge/block?${query}`, {
      headers: withAuth ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
    }),
    { params: Promise.resolve({ projectId }) },
  );
}

describe('§49 取整块语料路由的通道形状', () => {
  it('GET 存在且真的返回整块（客户端走的就是这条）——丢了 GET 这条立刻红', async () => {
    const res = await callGet(`sourceType=design&sourceId=${encodeURIComponent(designSourceId)}`);
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const body = JSON.parse(text) as { ok: boolean; blocks: { chunkIndex: number; content: string }[] };
    expect(body.ok).toBe(true);
    expect(body.blocks.length).toBeGreaterThan(0);
    expect(body.blocks[0]!.chunkIndex).toBe(0);
    expect(body.blocks[0]!.content).toContain('设计文档：');
  });

  it('出处不在库里 → 404 block_not_found（不是给个空列表装作成功）', async () => {
    const res = await callGet('sourceType=design&sourceId=%23page-%E6%B2%A1%E6%9C%89%E8%BF%99%E4%B8%80%E9%A1%B5');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('block_not_found');
  });

  it('坏 sourceType / 空 sourceId → 400，且说的是哪一格错了', async () => {
    const badType = await callGet('sourceType=不存在&sourceId=x');
    expect(badType.status).toBe(400);
    expect((await badType.json()).error).toBe('bad_source_type');

    const badId = await callGet('sourceType=design&sourceId=');
    expect(badId.status).toBe(400);
    expect((await badId.json()).error).toBe('bad_source_id');
  });

  it('POST 入口仍在（别为补 GET 砸掉另一处的用法）：body 里给出处照样取得到', async () => {
    jar.clear();
    jar.set(SESSION_COOKIE, token);
    const res = await postBlock(
      new Request(`http://localhost:3100/api/projects/${projectId}/knowledge/block`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${token}` },
        body: JSON.stringify({ sourceType: 'design', sourceId: designSourceId }),
      }),
      { params: Promise.resolve({ projectId }) },
    );
    const text = await res.text();
    expect(res.status, text).toBe(200);
    expect((JSON.parse(text) as { blocks: unknown[] }).blocks.length).toBeGreaterThan(0);
  });
});
