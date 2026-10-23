import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { planStoryboard } from '@nexus/video-model';
import { POST } from '../src/app/api/projects/[projectId]/storyboard/render/route';
import { adjustCredits, readCredits } from '../src/server/domain/credit-ledger';
import { createProject } from '../src/server/domain/projects';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { saveStoryboard } from '../src/server/domain/storyboards';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { getDb } from '../src/server/db/client';
import { agentTasks, assets, creditLedger, projects, sessions, users } from '../src/server/db/schema';
import { resetStorageForTests } from '../src/server/storage/config';

/**
 * §40 最后一格的**路由层**：`POST /api/projects/[projectId]/storyboard/render`。
 *
 * 域层的四条顺序纪律（额度门在 startTask 之前、参考帧归属、超时 kill、摄入门）
 * 在 `storyboard-render.integration.test.ts` 用真 ffmpeg 钉过。这一格只钉
 * **路由上才说得清**的四件事：
 *
 * 1. **CSRF 双提交**：写请求，没有令牌就是 403，且一条任务行都不落；
 * 2. **404 与 403 不泄露存在性**：不是你的项目统一 404（与其它路由同一口径）；
 * 3. **三种拒绝三个状态码**：没有分镜/排不出帧 → 400；额度用尽 → 429；
 *    成片 → 201，且 `demoMode` 在 genMeta 里、warnings/notes 原样带回；
 * 4. **回给前端的东西够显示**：渲染耗时、每一句交代、没做到的事——界面不许静默（§159/§160）。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'a1b2c3d4e5f60718';
const dir = mkdtempSync(join(tmpdir(), 'nexus-render-route-'));
const storeDir = join(dir, 'store');

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

let me: string;
let meToken: string;
let theyId: string;
let theyToken: string;
const createdProjects: string[] = [];

beforeAll(async () => {
  resetStorageForTests({ NEXUS_STORAGE_LOCAL_DIR: storeDir });
  const db = getDb();
  const [a] = await db
    .insert(users)
    .values({ displayName: 'Render Router', email: `render-route+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  const [b] = await db
    .insert(users)
    .values({ displayName: 'Render Router Stranger', email: `render-route-stranger+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  me = a!.id;
  theyId = b!.id;
  // 令牌每轮唯一：固定字符串会撞上历史运行残留的 sessions 行（token_hash 有唯一约束）
  const stamp = Date.now();
  theyToken = `tok-stranger-${stamp}`;
  meToken = `tok-me-${stamp}`;
  await db.insert(sessions).values({ userId: me, tokenHash: await hashToken(meToken), expiresAt: new Date(Date.now() + 86_400_000) });
  await db.insert(sessions).values({ userId: theyId, tokenHash: await hashToken(theyToken), expiresAt: new Date(Date.now() + 86_400_000) });
});

afterAll(async () => {
  const db = getDb();
  for (const id of createdProjects) await db.delete(projects).where(eq(projects.id, id));
  await db.delete(sessions).where(inArray(sessions.userId, [me, theyId]));
  await db.delete(users).where(inArray(users.id, [me, theyId]));
  resetStorageForTests();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* 目录可能不存在，忽略 */
  }
});

async function newProject(name: string): Promise<string> {
  const doc = await createProject(me, { name, kind: 'website' });
  createdProjects.push(doc.id);
  return doc.id;
}

/** 存一份三镜分镜（色卡镜头即可：路由层不挑像素来源，那件事域层测） */
async function saveBoard(projectId: string, title = '路由渲染的分镜'): Promise<void> {
  const board = planStoryboard('夜色里的港口，一台旧起重机慢慢转身，猫跳上缆绳', { title });
  const saved = await saveStoryboard(projectId, me, { document: board });
  if (!saved.ok) throw new Error(saved.reason);
}

function call(projectId: string, as: string, withCsrf = true): Promise<Response> {
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
  return POST(
    new Request(`http://localhost:3100/api/projects/${projectId}/storyboard/render`, { method: 'POST', headers }),
    { params: Promise.resolve({ projectId }) },
  );
}

describe('POST /api/projects/[projectId]/storyboard/render 的入口形状', () => {
  it('写请求先过 CSRF：没有双提交令牌就是 403，一行任务都不落', async () => {
    const projectId = await newProject('Render Route CSRF');
    await saveBoard(projectId);

    const res = await call(projectId, meToken, false);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('csrf_failed');
    const tasks = await getDb().select({ id: agentTasks.id }).from(agentTasks).where(eq(agentTasks.projectId, projectId));
    expect(tasks).toHaveLength(0);
  });

  it('不是你的项目：404，且不告诉别人这个 id 存在', async () => {
    const projectId = await newProject('Render Route Foreign');
    await saveBoard(projectId);

    const res = await call(projectId, theyToken);
    expect(res.status).toBe(404);
    const tasks = await getDb().select({ id: agentTasks.id }).from(agentTasks).where(eq(agentTasks.projectId, projectId));
    expect(tasks).toHaveLength(0);
  });

  it('没有分镜 / 空分镜：400，错误码说清是哪一种', async () => {
    const empty = await newProject('Render Route No Board');
    const res1 = await call(empty, meToken);
    expect(res1.status).toBe(400);
    expect((await res1.json()).error).toBe('no_storyboard');

    const blank = await newProject('Render Route Empty Board');
    const saved = await saveStoryboard(blank, me, { document: { id: 'sb-blank', title: '空分镜', source: { arrow: 'text-to-video', prompt: '' }, shots: [], notes: [] } });
    if (!saved.ok) throw new Error(saved.reason);
    const res2 = await call(blank, meToken);
    expect(res2.status).toBe(400);
    expect((await res2.json()).error).toBe('not_renderable');
  });

  it('快乐路径：201，成片是 kind=video 资产，demoMode 在 genMeta 里，交代原样带回', async () => {
    const projectId = await newProject('Render Route Happy');
    await saveBoard(projectId);
    await ensureVideoCredits();

    const res = await call(projectId, meToken);
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      asset: { id: string; kind: string; mimeType: string };
      taskId: string;
      warnings: string[];
      notes: string[];
      renderMs: number;
    };
    expect(body.ok).toBe(true);
    expect(body.asset.kind).toBe('video');
    expect(body.asset.mimeType).toBe('video/mp4');
    expect(typeof body.renderMs).toBe('number');
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(Array.isArray(body.notes)).toBe(true);

    const [task] = await getDb().select().from(agentTasks).where(eq(agentTasks.id, body.taskId));
    expect(task!.status).toBe('succeeded');

    const [row] = await getDb().select().from(assets).where(eq(assets.id, body.asset.id));
    const genMeta = row!.genMeta as Record<string, unknown>;
    expect(genMeta.demoMode).toBe(true);
    expect(genMeta.provider).toBe('local-ffmpeg');
  });

  it('额度用尽：429（不是 400——"这个月没了"和"你写错了"是两件事）', async () => {
    const projectId = await newProject('Render Route No Credits');
    await saveBoard(projectId);
    const balance = (await readCredits(me)).balances.video;
    // 库里 credit_ledger_delta_nonzero 挡着 delta=0：本来就是 0 就没什么可扣的
    if (balance > 0) {
      await adjustCredits({ userId: me, kind: 'video', delta: -balance, reason: '用例：把 video 桶扣到 0' });
    }
    expect((await readCredits(me)).balances.video).toBe(0);

    const tasksBefore = (await getDb().select({ id: agentTasks.id }).from(agentTasks).where(eq(agentTasks.projectId, projectId))).length;
    const ledgerBefore = (await getDb().select({ id: creditLedger.id }).from(creditLedger).where(eq(creditLedger.userId, me))).length;
    const assetsBefore = (await getDb().select({ id: assets.id }).from(assets).where(eq(assets.projectId, projectId))).length;

    const res = await call(projectId, meToken);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('credits_exhausted');

    expect((await getDb().select({ id: agentTasks.id }).from(agentTasks).where(eq(agentTasks.projectId, projectId))).length).toBe(tasksBefore);
    expect((await getDb().select({ id: creditLedger.id }).from(creditLedger).where(eq(creditLedger.userId, me))).length).toBe(ledgerBefore);
    expect((await getDb().select({ id: assets.id }).from(assets).where(eq(assets.projectId, projectId))).length).toBe(assetsBefore);

    // 还回去：这条用例把桶抽干了，后面的运行（或下一次跑）还要用
    await adjustCredits({ userId: me, kind: 'video', delta: 10, reason: '用例：渲染路由用例结束后还回额度' });
  });
});

/** 免费档每月只发 5 点 video，一次渲染就见底：快乐路径开跑前先兜到 10 */
async function ensureVideoCredits(): Promise<void> {
  const balance = (await readCredits(me)).balances.video;
  if (balance < 10) {
    await adjustCredits({ userId: me, kind: 'video', delta: 10 - balance, reason: '用例：补足渲染路由需要的额度' });
  }
}
