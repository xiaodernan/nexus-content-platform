import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AiRequest } from '@nexus/schemas';
import { POST as runPost } from '../src/app/api/ai/run/route';
import { submitClientRequest } from '../src/server/ai/submit';
import { runReadinessCheck } from '../src/server/agent/runtime';
import { generateDemoImage } from '../src/server/domain/image-studio';
import { adjustCredits, readCredits, refusalForRun } from '../src/server/domain/credit-ledger';
import { createProject } from '../src/server/domain/projects';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getDb } from '../src/server/db/client';
import { agentTasks, assets, projects, sessions, users } from '../src/server/db/schema';

/**
 * §133 的 generation 那一格：**"超了就不许生成"到底有没有那一霸**。
 *
 * ROADMAP 上长期写着"generation 记账但不拦截（扣点照扣，没有超了就不许生成的那道闸）"。
 * 这一片用**每一条生成入口各打一次**来核对那句话：把四类余额全部压到 0，
 * 然后逐条问"还跑得起来吗"。判据有两层，缺一不可：
 *   ① 入口给出 `credits_exhausted`（429），不是 200/201；
 *   ② **一行 agent_tasks 都不写**——门必须在写任务行之前（理由与 `ai/run` 里那段注释一致：
 *      一条从没跑起来的请求如果先落了 running 行，它就成了任务列表里一条假账）。
 *
 * 入口清单（今天所有真的会跑生成的路）：
 * - `refusalForRun`：域层那一句本身，另三条都复用它；
 * - `submitClientRequest`：`POST /api/ai/jobs` 与 `POST /api/ai/tasks/<id>/retry` 共用；
 * - `runReadinessCheck`：`POST /api/projects/<id>/agent` 的编排；
 * - `POST /api/ai/run`：同步那一扇门（AI 指令条）；
 * - `generateDemoImage`：Image Studio（`POST /api/projects/<id>/images` 域层那一半）。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'e5f7a9c1b3d52086';
const RUN = Date.now();

let userId = '';
let projectId = '';
let token = '';

async function identityFor(id: string): Promise<string> {
  const value = `credits-gate-tok-${id}`;
  // tokenHash 存的是 SHA-256：`requireUser` 按哈希找会话，找不到就地造一个 guest 用户
  // （§137），于是"项目不属于你"会以一个 404 的形式出现——看着像项目没了，其实是身份换了
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const tokenHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  await getDb()
    .insert(sessions)
    .values({ userId: id, tokenHash, expiresAt: new Date(Date.now() + 86_400_000) });
  return value;
}

function asUser(withCsrf: boolean): Record<string, string> {
  jar.clear();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  jar.set(SESSION_COOKIE, token);
  headers.cookie = `${SESSION_COOKIE}=${token}`;
  if (withCsrf) {
    jar.set(CSRF_COOKIE, CSRF_TOKEN);
    headers[CSRF_HEADER] = CSRF_TOKEN;
  }
  return headers;
}

const wireFor = (pid: string): AiRequest => ({
  requestId: `req-${RUN}`,
  intent: 'design-edit',
  prompt: '把标题换成更醒目的那一版',
  modelClass: 'balanced',
  variants: 1,
  context: { projectId: pid, selection: [], recentChanges: [] },
  references: [],
  approvalPolicy: [],
  dryRun: false,
});

/** 把四类余额全部压到 0：先读账（这会触发本月发放），再按差额写一行调整 */
async function drainCredits(): Promise<void> {
  const balances = (await readCredits(userId)).balances;
  for (const [kind, balance] of Object.entries(balances)) {
    if (balance !== 0) {
      await adjustCredits({ userId, kind: kind as keyof typeof balances, delta: -balance, reason: '用例：把这一类压到 0' });
    }
  }
}

async function restoreCredits(): Promise<void> {
  const balances = (await readCredits(userId)).balances;
  for (const [kind, balance] of Object.entries(balances)) {
    if (balance < 100) {
      await adjustCredits({ userId, kind: kind as keyof typeof balances, delta: 100 - balance, reason: '用例：把额度还回去' });
    }
  }
}

async function taskCount(): Promise<number> {
  const rows = await getDb().select({ id: agentTasks.id }).from(agentTasks).where(eq(agentTasks.createdById, userId));
  return rows.length;
}

beforeAll(async () => {
  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({ displayName: `额度门${RUN}`, email: `credits-gate+${RUN}@nexus.test`, handle: `cg${RUN}` })
    .returning({ id: users.id });
  userId = row!.id;
  token = await identityFor(userId);
  projectId = (await createProject(userId, { name: `额度门项目${RUN}`, kind: 'website' })).id;
}, 120_000);

afterAll(async () => {
  const db = getDb();
  await db.delete(agentTasks).where(eq(agentTasks.createdById, userId));
  await db.delete(assets).where(eq(assets.createdById, userId));
  await db.delete(projects).where(eq(projects.ownerId, userId));
  await db.delete(users).where(eq(users.id, userId));
}, 60_000);

describe('§133 generation 那一格：余额为 0 时每一条生成入口都被挡下，且一行任务都不写', () => {
  it('五条入口逐个给出 credits_exhausted / credits，且 agent_tasks 一条都没多', async () => {
    await drainCredits();
    const before = await taskCount();

    // ① 域层那一句本身
    const refusal = await refusalForRun(userId, 'design-edit');
    expect(refusal, 'refusalForRun 该在余额 0 时给一句话').toBeTruthy();
    expect(refusal).toContain('不够');

    // ② 异步提交（/api/ai/jobs 与 /api/ai/tasks/<id>/retry 共用这一份）
    const submitted = await submitClientRequest(wireFor(projectId), userId);
    expect(submitted.ok).toBe(false);
    if (submitted.ok) return;
    expect(submitted.response.status).toBe(429);
    expect((await submitted.response.json() as { error?: string }).error).toBe('credits_exhausted');

    // ③ 编排（POST /api/projects/<id>/agent）
    const orchestrated = await runReadinessCheck({ projectId, actorId: userId, goal: '把首页收拾一遍' });
    expect(orchestrated.ok).toBe(false);
    if (orchestrated.ok) return;
    expect(orchestrated.refusal.code).toBe('credits');
    expect(orchestrated.refusal.status).toBe(429);

    // ④ 同步那一扇门（POST /api/ai/run）
    const synced = await runPost(
      new Request('http://test.local/api/ai/run', {
        method: 'POST',
        headers: asUser(true),
        body: JSON.stringify(wireFor(projectId)),
      }),
    );
    expect(synced.status).toBe(429);
    expect((await synced.json() as { error?: string }).error).toBe('credits_exhausted');

    // ⑤ Image Studio（POST /api/projects/<id>/images 的域层那一半）
    const image = await generateDemoImage({ projectId, userId, prompt: '一张海报', width: 64, height: 64 });
    expect(image.ok).toBe(false);
    if (image.ok) return;
    expect(image.code).toBe('credits_exhausted');

    // ② 门在写任务行之前：五条路一次都没落行
    expect(await taskCount()).toBe(before);
  }, 120_000);

  it('正对照：额度还回去之后同一句门就让路（守卫挡的是余额，不是正常路径）', async () => {
    await restoreCredits();
    await expect(refusalForRun(userId, 'design-edit')).resolves.toBeNull();
    // 生成路径重新能跑：这一条是纯本地合成，不碰 provider
    const image = await generateDemoImage({ projectId, userId, prompt: '一张海报', width: 64, height: 64 });
    expect(image.ok).toBe(true);
  }, 120_000);
});
