import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createNode, findPage } from '@nexus/design-model';
import { PATCH } from '../src/app/api/annotations/[annotationId]/route';
import { addAnnotation, setAnnotationResolved } from '../src/server/domain/annotations';
import { createProject, loadDocument, saveDocument } from '../src/server/domain/projects';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { getDb } from '../src/server/db/client';
import { comments, projects, sessions, users } from '../src/server/db/schema';

/**
 * §111 批注「已解决」的入口（`PATCH /api/annotations/[annotationId]`）。
 *
 * 域层的语义（时间戳、幂等、回复/公开评论不能标）在 `annotations.integration.test.ts`。
 * 这一格只钉**路由上才说得清**的四件事：
 *
 * 1. **CSRF 双提交**：这是写请求，没有它就是跨站就能把人家的批注标成已解决；
 * 2. **正文过 zod**：`resolved` 不是布尔就 400，不是 500（坏 JSON 同样）；
 * 3. **三种失败分成两个状态码**：不存在 / 不是你的 → 404（同一个答案）；
 *    回复、公开评论 → 400 且说清为什么——它们不是"权限不够"，是"这个对象没有这一说"；
 * 4. **回填的是服务端的时间**：`resolvedAt` 来自响应体，不是客户端自己算的。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'a1b2c3d4e5f60718';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

let me: string;
let meToken: string;
let they: string;
let theyToken: string;

async function makeUser(label: string, handle: string): Promise<{ id: string; token: string }> {
  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({ displayName: label, email: `resolve+${handle}+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  const token = `tok-${handle}`;
  await db
    .insert(sessions)
    .values({ userId: row!.id, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return { id: row!.id, token };
}

beforeAll(async () => {
  const a = await makeUser('批注作者', 'resolver-a');
  const b = await makeUser('旁观者', 'resolver-b');
  me = a.id;
  meToken = a.token;
  they = b.id;
  theyToken = b.token;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [me, they]));
  await db.delete(sessions).where(inArray(sessions.userId, [me, they]));
  await db.delete(users).where(inArray(users.id, [me, they]));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(me, { name, kind: 'website' })).id;
}

/** 往活动页加一个节点并落库，返回它的 id */
async function addNode(projectId: string, name: string, text: string): Promise<string> {
  const document = await loadDocument(projectId);
  const page = findPage(document!, document!.activePageId) ?? document!.pages[0]!;
  const root = page.nodes[page.rootId]!;
  const node = createNode({ type: 'text', name, text, parentId: root.id });
  page.nodes[node.id] = node;
  root.children.push(node.id);
  await saveDocument(projectId, document!);
  return node.id;
}

function call(annotationId: string, body: unknown, as: string, withCsrf = true): Promise<Response> {
  jar.clear();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  jar.set(SESSION_COOKIE, as);
  const cookies: string[] = [`${SESSION_COOKIE}=${as}`];
  if (withCsrf) {
    jar.set(CSRF_COOKIE, CSRF_TOKEN);
    cookies.push(`${CSRF_COOKIE}=${CSRF_TOKEN}`);
    headers[CSRF_HEADER] = CSRF_TOKEN;
  }
  headers.cookie = cookies.join('; ');
  return PATCH(
    new Request(`http://localhost:3100/api/annotations/${annotationId}`, {
      method: 'PATCH',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ annotationId }) },
  );
}

describe('PATCH /api/annotations/[annotationId] 的入口形状', () => {
  it('写请求先过 CSRF：没有双提交令牌就是 403，一条都不改', async () => {
    const id = await newProject('CSRF 门');
    const nodeId = await addNode(id, 'A', 'a');
    const created = await addAnnotation(me, id, nodeId, '一句话');
    if (!created.ok) throw new Error('前置写入失败');

    const res = await call(created.annotation.id, { resolved: true }, meToken, false);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
    const [row] = await getDb()
      .select({ resolvedAt: comments.resolvedAt })
      .from(comments)
      .where(eq(comments.id, created.annotation.id))
      .limit(1);
    expect(row!.resolvedAt).toBeNull();
  });

  it('坏正文一律 400：不是 JSON、少了 resolved、resolved 不是布尔', async () => {
    const id = await newProject('坏正文');
    const nodeId = await addNode(id, 'B', 'b');
    const created = await addAnnotation(me, id, nodeId, '一句话');
    if (!created.ok) throw new Error('前置写入失败');

    for (const body of ['{ 不是 JSON', JSON.stringify({}), JSON.stringify({ resolved: 'yes' })]) {
      const res = await call(created.annotation.id, body, meToken);
      expect(res.status, body).toBe(400);
    }
  });

  it('往返：标上 → 有 resolvedAt；重新打开 → 归 null，两次都是服务端的时间', async () => {
    const id = await newProject('往返');
    const nodeId = await addNode(id, 'C', 'c');
    const created = await addAnnotation(me, id, nodeId, '一句话');
    if (!created.ok) throw new Error('前置写入失败');

    const marked = await call(created.annotation.id, { resolved: true }, meToken);
    expect(marked.status).toBe(200);
    const markedBody = (await marked.json()) as { resolvedAt: string | null };
    expect(markedBody.resolvedAt).toBeTruthy();

    const reopened = await call(created.annotation.id, { resolved: false }, meToken);
    expect(reopened.status).toBe(200);
    expect(((await reopened.json()) as { resolvedAt: string | null }).resolvedAt).toBeNull();

    const [row] = await getDb()
      .select({ resolvedAt: comments.resolvedAt })
      .from(comments)
      .where(eq(comments.id, created.annotation.id))
      .limit(1);
    expect(row!.resolvedAt).toBeNull();
  });

  it('别人的批注 → 404，和"没有这条"是同一个答案', async () => {
    const id = await newProject('别人的');
    const nodeId = await addNode(id, 'D', 'd');
    const created = await addAnnotation(me, id, nodeId, '一句话');
    if (!created.ok) throw new Error('前置写入失败');

    const res = await call(created.annotation.id, { resolved: true }, theyToken);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
    // 域层同样答 not_found：两层之间没有第二套说法
    expect(await setAnnotationResolved(they, created.annotation.id, true)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('回复与公开评论 → 400，并且说清是为什么（不是"权限不够"）', async () => {
    const id = await newProject('不能标的两种');
    const nodeId = await addNode(id, 'E', 'e');
    const created = await addAnnotation(me, id, nodeId, '主批注');
    if (!created.ok) throw new Error('前置写入失败');
    const db = getDb();
    // 回复与公开评论各插一条，id 由 returning 拿回来——不靠"哪一行 node_id 为空"去猜
    const [reply] = await db
      .insert(comments)
      .values({ projectId: id, userId: me, parentId: created.annotation.id, body: '回复一句' })
      .returning({ id: comments.id });
    const [pub] = await db
      .insert(comments)
      .values({ projectId: id, userId: me, nodeId: null, body: '公开评论一句' })
      .returning({ id: comments.id });

    const replyRes = await call(reply!.id, { resolved: true }, meToken);
    expect(replyRes.status).toBe(400);
    expect((await replyRes.json()).issues.join('')).toContain('回复');

    const pubRes = await call(pub!.id, { resolved: true }, meToken);
    expect(pubRes.status).toBe(400);
    expect((await pubRes.json()).issues.join('')).toContain('公开评论');
  });
});
