import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { POST as postBlock } from '../src/app/api/projects/[projectId]/knowledge/block/route';
import { POST as postSearch } from '../src/app/api/projects/[projectId]/knowledge/search/route';
import { POST as postChat } from '../src/app/api/projects/[projectId]/characters/[characterId]/chat/route';
import { POST as postAiRun } from '../src/app/api/ai/run/route';
import { POST as postAiJobs } from '../src/app/api/ai/jobs/route';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { createProject } from '../src/server/domain/projects';
import { createProjectCharacter } from '../src/server/domain/characters';
import { retrieveProjectKnowledge } from '../src/server/domain/knowledge';
import { getDb } from '../src/server/db/client';
import { projects, sessions, users } from '../src/server/db/schema';

/**
 * 坏正文的形状：`req.json()` 抛出来的 SyntaxError 不许变成 500。
 *
 * 这一族已经修过一次：`marketplace/route.ts` 里那句注释记着——"此前 `await req.json()`
 * 在 try 之外，非 JSON 正文直接把请求带崩成 500"。当时只修了那一条，
 * 同族还有三条路由把 `await req.json()` 放在 try 里：SyntaxError 照样被 catch 收走，
 * 只是回的话从"请求体不是 JSON"变成了"服务器处理失败"。**调用方写错了请求，
 * 服务端不该报自己的故障**——错误码是契约的一部分，500 会让客户端走上重试与报警，
 * 而它该做的是改正文。
 *
 * 三条（都只此一处，改完即全绿）：
 * - `POST /api/projects/<id>/knowledge/block`
 * - `POST /api/projects/<id>/knowledge/search`
 * - `POST /api/projects/<id>/characters/<characterId>/chat`
 *
 * 判据三层：
 *   ① 坏正文 → 400 `validation_failed`，不是 500；
 *   ② 判据不只一种坏法：截断的 JSON、空正文、合法 JSON 但不是对象（数组/字符串/数字/null）；
 *   ③ **正对照不可省**：同一颗子弹打正常正文，路由照旧走完它该走的路
 *      （block/search 200，chat 走到 DEMO MODE 那道 409——它证明正文被解析成功了，
 *      否则会停在 400）。没有这一组，"把 body 整个拒掉"也能让前三条变绿。
 *
 * 顺带把两条**早就做对了**的路由（`/api/ai/run`、`/api/ai/jobs`）钉在这里：
 * 它们用 try 包着 `req.text()` + `JSON.parse`，坏正文回 400「请求体必须是 JSON」。
 * 同族不同形状，分开钉，将来谁把它们"统一"成上面那种写法，这条会红。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'e5f7a9c1b3d52086';

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

let owner: string;
let token: string;
let projectId: string;
let characterId: string;
let designSourceId: string;

beforeAll(async () => {
  const db = getDb();
  const [me] = await db
    .insert(users)
    .values({ displayName: '坏正文房主', email: `badbody+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = me!.id;
  token = `tok-${owner}`;
  await db.insert(sessions).values({ userId: owner, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  projectId = (await createProject(owner, { name: '坏正文', kind: 'website' })).id;
  const made = await createProjectCharacter(projectId, owner, { name: '坏正文角色' });
  if (!made.ok) throw new Error('起点就不是绿的：角色建不出来');
  characterId = made.character.id;
  // 起手模板落库即建索引；顺着检索命中拿一个真的 design 出处，正对照要用
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

/**
 * 泛型在 Ctx 上：三条项目路由的 params 形状各不相同（chat 那条窄到具体两个键），
 * 而 `call` 只负责把 params 递进去，不该替它们统一成一个形状。
 */
function call<Ctx extends { params: Promise<Record<string, string>> }>(
  handler: (req: Request, ctx: Ctx) => Promise<Response>,
  path: string,
  params: Record<string, string>,
  body: string,
): Promise<Response> {
  jar.clear();
  jar.set(SESSION_COOKIE, token);
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
  return handler(
    new Request(`http://localhost:3100${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE}=${token}; ${CSRF_COOKIE}=${CSRF_TOKEN}`,
        [CSRF_HEADER]: CSRF_TOKEN,
      },
      body,
    }),
    { params: Promise.resolve(params) } as Ctx,
  );
}

/** 那两条不吃路径参数，单独一个入口（免得为它们把 Ctx 撑成可选） */
function callNoParams(handler: (req: Request) => Promise<Response>, path: string, body: string): Promise<Response> {
  jar.clear();
  jar.set(SESSION_COOKIE, token);
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
  return handler(
    new Request(`http://localhost:3100${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${SESSION_COOKIE}=${token}; ${CSRF_COOKIE}=${CSRF_TOKEN}`,
        [CSRF_HEADER]: CSRF_TOKEN,
      },
      body,
    }),
  );
}

const project = (extra: Record<string, string> = {}) => ({ projectId, ...extra });

/** 六种坏法：截断的 JSON、空正文、合法 JSON 但不是对象 */
const BROKEN_BODIES: [string, string][] = [
  ['截断的 JSON', '{"sourceType": "design",'],
  ['空正文', ''],
  ['JSON 数组', '[1,2,3]'],
  ['JSON 字符串', '"一段字符串"'],
  ['JSON 数字', '42'],
  ['JSON null', 'null'],
];

describe('坏正文的形状：req.json() 抛出来的 SyntaxError 不许变成 500', () => {
  it('knowledge/block：每一种坏正文都是 400，且说的是正文有问题', async () => {
    for (const [label, body] of BROKEN_BODIES) {
      const res = await call(postBlock, `/api/projects/${projectId}/knowledge/block`, project(), body);
      const text = await res.text();
      expect(res.status, `${label} → ${text}`).toBe(400);
      expect((JSON.parse(text) as { error: string }).error).toBe('validation_failed');
    }
  });

  it('knowledge/search：每一种坏正文都是 400', async () => {
    for (const [label, body] of BROKEN_BODIES) {
      const res = await call(postSearch, `/api/projects/${projectId}/knowledge/search`, project(), body);
      const text = await res.text();
      expect(res.status, `${label} → ${text}`).toBe(400);
    }
  });

  it('characters/chat：每一种坏正文都是 400（CSRF 先过，才轮得到正文）', async () => {
    for (const [label, body] of BROKEN_BODIES) {
      const res = await call(
        postChat,
        `/api/projects/${projectId}/characters/${characterId}/chat`,
        project({ characterId }),
        body,
      );
      const text = await res.text();
      expect(res.status, `${label} → ${text}`).toBe(400);
    }
  });

  it('正对照：正常正文照旧走完——block/search 200，chat 走到 DEMO MODE 那道 409', async () => {
    const block = await call(
      postBlock,
      `/api/projects/${projectId}/knowledge/block`,
      project(),
      JSON.stringify({ sourceType: 'design', sourceId: designSourceId }),
    );
    const blockText = await block.text();
    expect(block.status, blockText).toBe(200);
    expect((JSON.parse(blockText) as { blocks: unknown[] }).blocks.length).toBeGreaterThan(0);

    const search = await call(
      postSearch,
      `/api/projects/${projectId}/knowledge/search`,
      project(),
      JSON.stringify({ q: '设计' }),
    );
    const searchText = await search.text();
    expect(search.status, searchText).toBe(200);
    expect((JSON.parse(searchText) as { vectorAvailable: boolean }).vectorAvailable).toBe(false);

    // 409 demo_mode 是这条路今天的正确答案（没有真 provider 就不假装角色在说话）。
    // 它在这里的含义是：正文解析成功、门一道没落，停在"没有 provider"那一格。
    const chat = await call(
      postChat,
      `/api/projects/${projectId}/characters/${characterId}/chat`,
      project({ characterId }),
      JSON.stringify({ message: '你好' }),
    );
    const chatText = await chat.text();
    expect(chat.status, chatText).toBe(409);
    expect((JSON.parse(chatText) as { error: string }).error).toBe('demo_mode');
  });

  it('同族两早就做对了的路由：坏正文回 400「请求体必须是 JSON」，不是 500', async () => {
    for (const [label, handler] of [
      ['/api/ai/run', postAiRun],
      ['/api/ai/jobs', postAiJobs],
    ] as [string, (req: Request) => Promise<Response>][]) {
      const res = await callNoParams(handler, label, '{ 这不是 JSON');
      const text = await res.text();
      expect(res.status, `${label} → ${text}`).toBe(400);
      expect(text).toContain('请求体必须是 JSON');
    }
  });
});
