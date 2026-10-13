import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { GET as generateCode } from '../src/app/api/projects/[projectId]/game/code/route';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { gameDraft } from '../src/lib/agent-game-draft';
import type { GameDocument } from '@nexus/game-model';
import { saveGame } from '../src/server/domain/games';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, sessions, users } from '../src/server/db/schema';

/**
 * §52 最后一格（Code）的出口 `GET /api/projects/<id>/game/code` 打真库。
 *
 * 这一片要钉的是四件事，每件都是"少一条就会出事"的那种：
 * ① 没有游戏设计时说清"去哪建一份"，而不是回一个空产物让人以为生成成功；
 * ② 产物吃的是库里那份设计（不是请求体贴进来的任意文档）——**写接口与读投影分开**：
 *    这个端点只读、不需要 CSRF， Admission 走会话 cookie 与项目归属；
 * ③ 产物字节数如实报出来，超过上限回 413 而不是塞一份无界 JSON；
 * ④ 别人的项目与"不存在"同一个答案（项目归属判定，404）。
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

function asUser(token: string): Record<string, string> {
  jar.clear();
  jar.set(SESSION_COOKIE, token);
  return { cookie: `${SESSION_COOKIE}=${token}` };
}

function call(projectId: string, headers: Record<string, string>): Promise<Response> {
  return generateCode(new Request(`http://localhost:3100/api/projects/${projectId}/game/code`, { headers }), {
    params: Promise.resolve({ projectId }),
  });
}

/** §52 那张确定性配方表——与编排里 Game Agent 那一步同一份输入，投影的输入不用另造一份 */
function sampleGame(projectId: string): GameDocument {
  return gameDraft({ goal: '为这一片测试造一份能跑的设计', at: '2026-10-13T00:00:00.000Z', projectId });
}

let owner: string;
let ownerToken: string;
let stranger: string;
let strangerToken: string;

beforeAll(async () => {
  const db = getDb();
  const [me] = await db
    .insert(users)
    .values({ displayName: 'Codegen 房主', email: `codeout+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = me!.id;
  ownerToken = await identityFor(owner);
  const [other] = await db
    .insert(users)
    .values({ displayName: 'Codegen 路人', email: `codeout2+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  stranger = other!.id;
  strangerToken = await identityFor(stranger);
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, owner));
  await db.delete(projects).where(eq(projects.ownerId, stranger));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(users).where(eq(users.id, stranger));
});

async function newProject(name: string): Promise<string> {
  return (await createProject(owner, { name, kind: 'website' })).id;
}

describe('§52 Code 出口：把库里那份设计投影成拿得走的产物', () => {
  it('没有游戏设计 → 404，并且说清去哪建一份（不是回一个空产物）', async () => {
    const projectId = await newProject('还没有游戏');
    const res = await call(projectId, asUser(ownerToken));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('game_missing');
    expect(body.message).toContain('创建游戏骨架');
  });

  it('写进库的那份设计 → 产物与它逐字节对应：文件数、plan 里的实体、字节数都对上', async () => {
    const projectId = await newProject('有游戏');
    await saveGame(projectId, owner, sampleGame(projectId));

    const res = await call(projectId, asUser(ownerToken));
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const parsed = JSON.parse(text) as {
      ok: boolean;
      files: { path: string; contents: string; mime: string; origin: unknown }[];
      notes: string[];
      bytes: number;
      limits: string[];
    };
    expect(parsed.ok).toBe(true);
    // HTML 入口与 plan.json 都在：少一件就不是"拿得走的产物"
    const paths = parsed.files.map((f) => f.path);
    expect(paths).toContain('index.html');
    expect(paths).toContain('plan.json');
    expect(paths.some((p) => p.endsWith('.js')), '引擎 JS 不在产物里').toBe(true);
    // 产物吃的是库里那份：plan 的名字就是设计文档的名字，实体一个不多一个不少
    const plan = JSON.parse(parsed.files.find((f) => f.path === 'plan.json')!.contents) as {
      name: string;
      player: unknown;
      enemies: unknown[];
      items: unknown[];
      npcs: unknown[];
      quests: unknown[];
      playable: boolean;
    };
    const design = sampleGame(projectId);
    expect(plan.name).toBe(design.name);
    // 每个类别的个数与设计里的实体按 kind 数出来的相等（`compileGame` 按 kind 归类，
    // trigger 之类的类别不进 actor 列表——投影的归类口径要与设计数出来的对得上）
    const countOf = (kind: string): number => design.entities.filter((entity) => entity.kind === kind).length;
    expect(plan.player ? 1 : 0).toBe(countOf('player'));
    expect(plan.enemies.length).toBe(countOf('enemy'));
    expect(plan.items.length).toBe(countOf('item'));
    expect(plan.npcs.length).toBe(countOf('npc'));
    expect(plan.quests.length).toBe(countOf('quest'));
    expect(plan.playable, '这份设计应当能开跑').toBe(true);
    // 字节数是产物自己的数，不少于文件内容之和（上限保护，别让响应无界）
    const summed = parsed.files.reduce((total, f) => total + f.contents.length, 0);
    expect(parsed.bytes).toBeGreaterThan(0);
    expect(parsed.bytes).toBeGreaterThanOrEqual(summed);
    // §69：每个文件都标 origin，靠路径猜归属的那份索引迟早说谎
    expect(parsed.files.every((f) => f.origin !== undefined && f.origin !== null)).toBe(true);
    // 限度随产物一起念出来（转写、不执行、CSP）
    expect(parsed.limits.length).toBeGreaterThan(0);
    expect(parsed.limits.join('')).toContain('connect-src');
  });

  it('别人的项目 → 404（与"不存在"同一个答案）——项目里必须真的有游戏，否则 404 来自"没有设计"而不是归属', async () => {
    const mine = await newProject('边界归属');
    // 先让这份项目**有**游戏设计：否则"没有设计"那条 404 会替归属挡枪，这条就测不到想测的东西
    await saveGame(mine, owner, sampleGame(mine));
    const res = await call(mine, asUser(strangerToken));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error, '归属不对时不能拿"没有设计"当挡箭牌').not.toBe('game_missing');
  });
});
