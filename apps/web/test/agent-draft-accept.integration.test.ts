import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { StepReportSchema } from '@/lib/agent-runtime';
import { runReadinessCheck } from '../src/server/agent/runtime';
import { POST as acceptDraft } from '../src/app/api/projects/[projectId]/agent/draft/route';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { createGame } from '@nexus/game-model';
import { countGames, loadGame, saveGame } from '../src/server/domain/games';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { auditEvents, games, projects, sessions, users } from '../src/server/db/schema';

/**
 * §52 的接受入口（`POST /api/projects/<projectId>/agent/draft`）打真库。
 *
 * 这一片要钉的是五条边界，每一条都是"少一道就会出事"的那种：
 * - CSRF 没过就一次库都不碰（与全站写路由同一道门）；
 * - **写入的内容来自任务行，不来自请求体**：请求体只有 `taskId` 与可选的 `stepId`，界面上贴不进任意一份文档；
 * - **要哪一步的那一份就由 `stepId` 说了算**（§52 那条链有两份草稿时，"默认取链末"不能变成唯一答案）；
 * - 不是你的任务 / 挂在别的项目上的任务 → 与"不存在"同一个答案（任务行里存着别人的提示词摘要与草稿）；
 * - 项目已经有游戏设计时**拒绝覆盖**，并且拒绝之后库里那份一字未动。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'a1b2c3d4e5f60718';

/** 会话 cookie 由这里的罐子给；`requireUser` 拿这个 token 查不到会话行时会造一个 guest 用户，
 *  所以每个身份都要自己先插一行会话，身份才由测试说了算 */
async function identityFor(userId: string): Promise<string> {
  const token = `tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function asUser(token: string, withCsrf = true): Record<string, string> {
  jar.clear();
  jar.set(SESSION_COOKIE, token);
  if (withCsrf) jar.set(CSRF_COOKIE, CSRF_TOKEN);
  const headers: Record<string, string> = { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${token}` };
  if (withCsrf) headers[CSRF_HEADER] = CSRF_TOKEN;
  return headers;
}

function call(projectId: string, body: unknown, headers: Record<string, string>): Promise<Response> {
  return acceptDraft(
    new Request(`http://localhost:3100/api/projects/${projectId}/agent/draft`, {
      method: 'POST',
      headers,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ projectId }) },
  );
}

let owner: string;
let ownerToken: string;
let stranger: string;
let strangerToken: string;

beforeAll(async () => {
  const db = getDb();
  const [me] = await db
    .insert(users)
    .values({ displayName: '接受房主', email: `accept+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = me!.id;
  ownerToken = await identityFor(owner);
  const [other] = await db
    .insert(users)
    .values({ displayName: '接受路人', email: `accept2+${Date.now()}@nexus.test` })
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
  return (await createProject(owner, { name, kind: 'game' })).id;
}

/**
 * 跑一次编排，返回任务行 id 与**最后一份草稿**（不带 stepId 时接受入口取的就是它）。
 *
 * §52 那条链现在有两步会留草稿：game 的原始那份与 combat 调过数值的那份。
 * 缺省不传 `stepId` 时服务端取链末（combat），所以这里对齐到那一份，别拿 game 那份来比。
 */
async function seededRun(projectId: string) {
  const result = await runReadinessCheck({ projectId, actorId: owner, goal: '接受入口的草稿' });
  if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);
  const withDraft = result.steps.filter((item) => item.draft);
  const step = withDraft[withDraft.length - 1];
  return { taskId: result.taskId, draft: step?.draft, drafts: new Map(withDraft.map((item) => [item.id, item.draft])) };
}

describe('§52 接受入口', () => {
  it('过 CSRF 之后写进项目：读回来的是任务行里那一份，且留下一条放行审计', async () => {
    const projectId = await newProject('接受成功');
    const { taskId, draft } = await seededRun(projectId);
    expect(draft, '这一步没产草稿').toBeTruthy();
    expect(await countGames(projectId)).toBe(0);

    const res = await call(projectId, { taskId }, asUser(ownerToken));
    // 报文只能读一次：`expect(res.status, await res.text())` 之后不能再 `res.json()`
    const text = await res.text();
    expect(res.status, text).toBe(200);
    const body = JSON.parse(text);
    expect(body.ok).toBe(true);
    // 落库的那一份就是任务行里的草稿（内容相同），而 id 换成行上的 uuid（草稿自带的是临时值）
    expect(body.document.id).not.toBe(draft!.id);
    expect(body.document.projectId).toBe(projectId);
    expect(body.document.entities).toEqual(draft!.entities);

    const loaded = await loadGame(projectId);
    expect(loaded?.ok && loaded.document.name).toBe(draft!.name);

    // 按这一份文档查：库是共享的，`limit(1)` 不带条件会捞到上一轮留下的行，
    // 那种读法证明的是"历史上有人接受过"，不是"这一次留下了证据"
    const rows = await getDb()
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'agent.game.accept'), eq(auditEvents.targetId, body.document.id)))
      .limit(2);
    expect(rows, '一次接受只该留一条针对这份文档的审计').toHaveLength(1);
    const audit = rows[0]!;
    expect(audit.allowed).toBe(true);
    expect(audit.targetType).toBe('game');
    expect(audit.actorId).toBe(owner);
    expect(audit.detail).toMatchObject({ taskId, projectId });
  });

  it('点名要哪一步的那一份：stepId 给的就是那一步，不是"最后一份"', async () => {
    // §52 链现在有两步留草稿（game 原始那份 + combat 调过数值的那份）。
    // 缺省取链末是便利，但"接受的是哪一份"必须由点下去的那一步说了算——
    // 否则界面上写着 combat、库里进的是 game，用户看到的和他拿到的不是同一样东西。
    const a = await newProject('接受指定 combat');
    const runA = await seededRun(a);
    expect([...runA.drafts.keys()], '三步都该留草稿').toEqual(['game', 'combat', 'level']);
    expect(runA.drafts.get('game')!.entities).not.toEqual(runA.drafts.get('combat')!.entities);

    const resCombat = await call(a, { taskId: runA.taskId, stepId: 'combat' }, asUser(ownerToken));
    const textCombat = await resCombat.text();
    expect(resCombat.status, textCombat).toBe(200);
    expect(JSON.parse(textCombat).document.entities).toEqual(runA.drafts.get('combat')!.entities);

    // 换一个干净项目只给 game：写进库的必须是原始那份，与上面那份不同
    const b = await newProject('接受指定 game');
    const runB = await seededRun(b);
    const resGame = await call(b, { taskId: runB.taskId, stepId: 'game' }, asUser(ownerToken));
    const textGame = await resGame.text();
    expect(resGame.status, textGame).toBe(200);
    const body = JSON.parse(textGame);
    expect(body.document.entities).toEqual(runB.drafts.get('game')!.entities);
    expect(body.document.entities).not.toEqual(runB.drafts.get('combat')!.entities);
  });

  it('点了一份没留草稿的步骤：409 的话点名哪几步真有草稿', async () => {
    const projectId = await newProject('接受点了空步骤');
    const { taskId, drafts } = await seededRun(projectId);
    const res = await call(projectId, { taskId, stepId: 'context' }, asUser(ownerToken));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('draft_missing');
    // 话要说清"这一步没有"和"哪几步有"，否则用户只知道失败，不知道怎么才能成功
    expect(body.message).toContain('context');
    for (const id of drafts.keys()) expect(body.message).toContain(id);

    const rows = await getDb()
      .select({ allowed: auditEvents.allowed, detail: auditEvents.detail })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'agent.game.accept'), eq(auditEvents.targetId, taskId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.allowed).toBe(false);
    // 拒绝的证据要带上他点的那一步，以及当时真能接受的清单
    expect(rows[0]!.detail).toMatchObject({ reason: 'draft-missing', projectId, stepId: 'context', available: ['game', 'combat', 'level'] });
    expect(await countGames(projectId)).toBe(0);
  });

  it('CSRF 没过 → 403，且一次库都没碰（游戏行还是 0）', async () => {
    const projectId = await newProject('接受缺 CSRF');
    const { taskId } = await seededRun(projectId);
    jar.clear();
    jar.set(SESSION_COOKIE, ownerToken);
    const res = await call(projectId, { taskId }, { 'content-type': 'application/json', cookie: `${SESSION_COOKIE}=${ownerToken}` });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
    expect(await countGames(projectId)).toBe(0);
  });

  it('请求体只认 taskId：把整份文档贴进来不会改变写进库的内容，缺 taskId 则是 400', async () => {
    const projectId = await newProject('接受只认任务号');
    const { taskId } = await seededRun(projectId);
    // 多带的字段被 zod 丢掉（不是报错），所以这一条证明的是"贴进来的文档进不了库"
    const res = await call(projectId, { taskId, document: { name: '我贴进来的', entities: [] } }, asUser(ownerToken));
    const okText = await res.text();
    expect(res.status, okText).toBe(200);
    const loaded = await loadGame(projectId);
    expect(loaded?.ok && loaded.document.name).not.toBe('我贴进来的');

    const other = await newProject('接受缺字段');
    const bad = await call(other, { somethingElse: 1 }, asUser(ownerToken));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('validation_failed');
    expect(await countGames(other)).toBe(0);
  });

  it('这一步没有草稿（注入的 runner 不产草稿）→ 409 draft_missing，并留下拒绝审计', async () => {
    const projectId = await newProject('接受无草稿');
    const result = await runReadinessCheck({
      projectId,
      actorId: owner,
      goal: '这一步故意不产东西',
      runners: {
        game: async () => ({ summary: '探针：这一步没有草稿', counts: { entities: 0 }, notes: [] }),
      },
    });
    if (!result.ok) throw new Error(`不该拒收：${result.refusal.message}`);
    const steps = StepReportSchema.array().safeParse(result.steps);
    expect(steps.success && steps.data.find((step) => step.id === 'game')?.draft).toBeUndefined();

    const res = await call(projectId, { taskId: result.taskId }, asUser(ownerToken));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('draft_missing');
    expect(body.message).toContain('草稿');
    expect(await countGames(projectId)).toBe(0);
    // 按这一条任务查：拒绝的证据要指向"这一次点错了地方"，不是历史上某次拒绝
    const rows = await getDb()
      .select({ allowed: auditEvents.allowed, detail: auditEvents.detail })
      .from(auditEvents)
      .where(and(eq(auditEvents.action, 'agent.game.accept'), eq(auditEvents.targetId, result.taskId)));
    expect(rows, '没有草稿却来接受，这条越权尝试该留证据').toHaveLength(1);
    expect(rows[0]!.allowed).toBe(false);
    expect(rows[0]!.detail).toMatchObject({ reason: 'draft-missing', projectId });
  });

  it('别人的任务与不存在的任务给同一个 404；自己的任务贴到别的自有项目也是 404', async () => {
    const projectId = await newProject('接受归属');
    const { taskId } = await seededRun(projectId);

    // 路人用自己项目走一遍路径判定：任务不是他的，答案必须与"这一行不存在"完全一致
    const strangerProject = (await createProject(stranger, { name: '接受路人的项目', kind: 'game' })).id;
    const notYours = await call(strangerProject, { taskId }, asUser(strangerToken));
    expect(notYours.status).toBe(404);
    const ghost = await call(projectId, { taskId: crypto.randomUUID() }, asUser(ownerToken));
    expect(ghost.status).toBe(404);
    // 三种问法的答复必须一字不差：能分辨"存在但不给看"就等于泄露了别人的任务号存不存在
    expect((await ghost.json()).error).toBe((await notYours.json()).error);

    // 同一份任务、换成**自己另一个**项目：路径上的项目是合法的、任务也是自己的，
    // 只有"这一份草稿属于那个项目"这一道在挡。少了它，草稿就写进了一个从没跑过它的项目。
    const ownOther = await newProject('接受归属的另一格');
    const mismatch = await call(ownOther, { taskId }, asUser(ownerToken));
    expect(mismatch.status).toBe(404);
    expect((await mismatch.json()).error).toBe('not_found');
    expect(await countGames(projectId)).toBe(0);
    expect(await countGames(ownOther), '草稿被接受进了它不属于的项目').toBe(0);
  });

  it('旧设计 + 刚跑出来的草稿：409 只可能来自 createOnly 这一道门', async () => {
    // 上一条把已有那份的 updatedAt 写成 2099，于是"更旧的写"那道守卫也挡得住这次写——
    // 那条红证明不了红的是 createOnly。真实情形是反的：项目里那份是用户很久以前存的，
    // 草稿的时间戳是刚刚，守卫不发声，唯一挡着覆盖的就是 createOnly。
    const projectId = await newProject('接受不覆盖旧设计');
    const { taskId } = await seededRun(projectId);
    expect((await saveGame(projectId, owner, { ...createGame('三年前的设计', projectId), updatedAt: '2020-01-01T00:00:00.000Z' })).ok).toBe(true);
    const rowOf = () => getDb().select({ document: games.document }).from(games).where(eq(games.projectId, projectId));
    const before = await rowOf();

    const res = await call(projectId, { taskId }, asUser(ownerToken));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('accept_refused');
    expect(body.message, '拒绝的原因说的是"已经有这一份"，不是"这次写的是旧版本"').toContain('三年前的设计');

    expect(JSON.stringify(await rowOf()), '拒绝之后库里那份被改过').toBe(JSON.stringify(before));
    expect(await countGames(projectId)).toBe(1);
  });

  it('项目已有游戏设计 → 409 且不覆盖，库里那份一字未动', async () => {
    const projectId = await newProject('接受不覆盖');
    const { taskId } = await seededRun(projectId);
    // 先按用户正常的保存写一份自己的设计（`updatedAt` 给得很新，这样"更旧的写"那道门不会先来挡，
    // 拒绝确实只来自 createOnly 这一道）
    expect(await loadGame(projectId)).toBeNull();
    const created = await saveGame(projectId, owner, {
      ...createGame('我自己的游戏', projectId),
      updatedAt: '2099-01-01T00:00:00.000Z',
    });
    expect(created.ok).toBe(true);
    const rowOf = () => getDb().select({ document: games.document }).from(games).where(eq(games.projectId, projectId));
    const before = await rowOf();

    const res = await call(projectId, { taskId }, asUser(ownerToken));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('accept_refused');
    // 拒绝的话要说清"已经有哪一份"，而不是一个笼统的冲突码
    expect(body.message).toContain('我自己的游戏');
    expect(body.message).toContain('不会覆盖');

    // 一字未动：整列 JSONB 原样
    expect(JSON.stringify(await rowOf())).toBe(JSON.stringify(before));
    const loaded = await loadGame(projectId);
    expect(loaded?.ok && loaded.document.name).toBe('我自己的游戏');
    expect(await countGames(projectId)).toBe(1);
  });
});
