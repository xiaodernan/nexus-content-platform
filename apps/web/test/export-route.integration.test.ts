import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { GET as exportProject } from '../src/app/api/projects/[projectId]/export/route';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { getRealtimeBus, channels } from '../src/server/realtime/bus';
import { notifications, projects, sessions, users } from '../src/server/db/schema';

/**
 * §144 导出路由的第一份路由级覆盖（`GET /api/projects/<id>/export`），打真库。
 *
 * 域层的 `buildProjectExport` 已有 export.integration.test.ts 7 条钉着（包里有什么、清单 CRC、
 * 缺资产如实说）；这一片补的是**路由这一格**——它自己有几件域层管不到的事：
 * 1. **401 而不是 500**：`requireUser` 在没有 cookie 时是抛错（翻成 500），路由注释里点名了
 *    这个坑，所以用 `currentUserOrNull` 显式判空——这条得有一条真请求钉住，否则哪天改回去全绿；
 * 2. **404 而不是 403**：不是自己的项目不能泄露"这个 id 存在"（与资产取字节同一口径）；
 * 3. **§163 的 build.status 两帧**：building 先推、ok 后推，订阅项目频道数事件；
 * 4. **§164 Build complete 的真来源**：成功导出后作者收到一条 kind='build' 的通知，
 *    标题按"真的进包的那几档"说（只导代码时不许出现"资产 0 个"）。
 *
 * 失败分支（buildProjectExport 抛错 → 推 failed + 通知 ok:false）没有在这里造：
 * 那要一个"库在、字节坏了"的项目，成本高于它钉的东西（export.integration 已经证了
 * 缺资产如实进 README，failed 那一支的形状与成功支共用同一个 notifyBuildComplete）。
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
  const token = `export-tok-${userId}`;
  await getDb()
    .insert(sessions)
    .values({ userId, tokenHash: await hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) });
  return token;
}

function asUser(token: string | null): Record<string, string> {
  jar.clear();
  if (token) jar.set(SESSION_COOKIE, token);
  return { 'content-type': 'application/json' };
}

const exportUrl = (projectId: string, query = ''): string =>
  `http://test.local/api/projects/${projectId}/export${query}`;

let creator: { id: string };
let stranger: { id: string };
let creatorToken: string;
let projectId: string;
let projectName: string;

beforeAll(async () => {
  const db = getDb();
  const stamp = Date.now();
  const rows = await db
    .insert(users)
    .values([
      { displayName: `导出-作者${stamp}`, email: `expr+creator+${stamp}@nexus.test`, role: 'creator' },
      { displayName: `导出-别人${stamp}`, email: `expr+stranger+${stamp}@nexus.test`, role: 'creator' },
    ])
    .returning({ id: users.id });
  creator = rows[0]!;
  stranger = rows[1]!;
  creatorToken = await identityFor(creator.id);
  await identityFor(stranger.id);

  projectName = `导出-作品${stamp}`;
  projectId = (await createProject(creator.id, { name: projectName, kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  // projects 对 owner 是 restrict，得先摘掉作品；users 的会话才是级联带走
  await db.delete(projects).where(eq(projects.ownerId, creator.id));
  await db.delete(users).where(inArray(users.id, [creator.id, stranger.id]));
});

describe('§144 导出路由：门与状态码翻译', () => {
  it('没登录 → 401 unauthenticated（不是 requireUser 抛错翻成的 500）', async () => {
    asUser(null);
    const res = await exportProject(new Request(exportUrl(projectId)), { params: Promise.resolve({ projectId }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthenticated');
  });

  it('别人的项目 → 404（不泄露"这个 id 存在"，与资产取字节同一口径）', async () => {
    asUser(`export-tok-${stranger.id}`);
    const res = await exportProject(new Request(exportUrl(projectId)), { params: Promise.resolve({ projectId }) });
    expect(res.status).toBe(404);
  });

  it('parts 名单外 → 400 validation_failed（zod 枚举挡在归属判定之前）', async () => {
    asUser(creatorToken);
    const res = await exportProject(new Request(exportUrl(projectId, '?parts=design,bogus')), {
      params: Promise.resolve({ projectId }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('validation_failed');
  });
});

describe('§144/§163/§164 导出成功路径：回执、实时两帧、Build complete 通知', () => {
  it('成功导出 → 200 + zip 回执 + building/ok 两帧 + 一条 build 通知', async () => {
    asUser(creatorToken);
    const bus = getRealtimeBus();
    const frames: { status: string; log?: string }[] = [];
    const unsubscribe = bus.subscribe(channels.project(projectId), (event) => {
      if (event.type === 'build.status') frames.push({ status: event.status, log: event.log });
    });

    const res = await exportProject(new Request(exportUrl(projectId)), { params: Promise.resolve({ projectId }) });

    await new Promise((resolve) => setTimeout(resolve, 50));
    unsubscribe();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/zip');
    const receipt = JSON.parse(res.headers.get('x-nexus-export-receipt') ?? '{}') as {
      counts: { design: number; code: number; assets: number };
      missing: number;
    };
    expect(receipt.counts.design).toBeGreaterThan(0);
    expect(receipt.counts.code).toBeGreaterThan(0);
    expect(receipt.counts.assets).toBe(0);

    // §163：两帧，先 building 后 ok
    expect(frames.map((f) => f.status)).toEqual(['building', 'ok']);
    expect(frames[0]!.log ?? '').toContain('导出');
    expect(frames[1]!.log ?? '').toContain('导出完成');

    // §164：Build complete 的真来源——一行 kind='build' 的通知落在作者名下
    const [row] = await getDb()
      .select({ kind: notifications.kind, title: notifications.title, body: notifications.body })
      .from(notifications)
      .where(and(eq(notifications.userId, creator.id), eq(notifications.kind, 'build')))
      .limit(1);
    expect(row).toBeTruthy();
    expect(row!.title).toContain('导出完成');
    expect(row!.title).toContain(projectName);
    // 只说真的进包的那几档：资产是 0，标题里不许出现"资产"
    expect(row!.title).not.toContain('资产');
  });

  it('只导代码 → 回执 assets 为 0，通知标题同样不提资产（"只说真的进包的那几档"）', async () => {
    asUser(creatorToken);
    const res = await exportProject(new Request(exportUrl(projectId, '?parts=code')), {
      params: Promise.resolve({ projectId }),
    });
    expect(res.status).toBe(200);
    const receipt = JSON.parse(res.headers.get('x-nexus-export-receipt') ?? '{}') as {
      counts: { design: number; code: number; assets: number };
    };
    expect(receipt.counts.design).toBe(0);
    expect(receipt.counts.code).toBeGreaterThan(0);

    // 第二次导出的通知是另一行（dedupe 键挂在每次导出的 exportId 上）
    const rows = await getDb()
      .select({ title: notifications.title })
      .from(notifications)
      .where(and(eq(notifications.userId, creator.id), eq(notifications.kind, 'build')));
    expect(rows.length).toBe(2);
    for (const row of rows) expect(row.title).not.toContain('资产');
  });
});
