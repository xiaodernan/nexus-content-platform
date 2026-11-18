import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { AiRequest } from '@nexus/schemas';
import { POST as runPost } from '../src/app/api/ai/run/route';
import { createProject } from '../src/server/domain/projects';
import { CSRF_COOKIE, CSRF_HEADER } from '../src/server/security/csrf';
import { SESSION_COOKIE } from '../src/server/domain/session';
import { getDb } from '../src/server/db/client';
import { agentTasks, projects, sessions, users } from '../src/server/db/schema';

/**
 * cont. 170 · /api/ai/run 的编排车道回声（x-nexus-orchestration）集成测试。
 *
 * 验证的不是「走哪条 provider」（测试环境无 provider，走 demo），而是 web 层的分流纪律：
 *   - 请求头 x-nexus-orchestration: stategraph → 响应头如实回声 stategraph（并记 lane 计数）
 *   - 不传 → 如实回声 stategraph（cont. 222 起默认车道 = 状态图；缺省不再猜、也不偷偷换回旧通路）
 *   - 乱传 → 回落 stategraph（一个拼写错误绝不能把流量悄悄换回 lane-a）
 *   - 显式逃生门：x-nexus-orchestration: lane-a（或 env NEXUS_AI_ORCHESTRATION=lane-a）
 * 真两车道（/v1/ai/run vs /v1/ai/design-graph）的字节同构由 ai-service 侧的
 * test_stategraph.py + live probe（2026-11-17，两车道皆 200 实测）保证。
 */

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
  }),
}));

const CSRF_TOKEN = 'a1b2c3d4e5f60718';
const RUN = Date.now();

let userId = '';
let projectId = '';
let token = '';

async function identityFor(id: string): Promise<string> {
  const value = `lane-tok-${id}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const tokenHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  await getDb().insert(sessions).values({ userId: id, tokenHash, expiresAt: new Date(Date.now() + 86_400_000) });
  return value;
}

function asUser(withLane: string | null): Record<string, string> {
  jar.clear();
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  jar.set(SESSION_COOKIE, token);
  headers.cookie = `${SESSION_COOKIE}=${token}`;
  jar.set(CSRF_COOKIE, CSRF_TOKEN);
  headers[CSRF_HEADER] = CSRF_TOKEN;
  if (withLane !== null) headers['x-nexus-orchestration'] = withLane;
  return headers;
}

const wireFor = (pid: string): AiRequest => ({
  requestId: `req-lane-${RUN}`,
  intent: 'design-edit',
  prompt: '调整这个按钮',
  modelClass: 'balanced',
  variants: 1,
  context: { projectId: pid, selection: [], recentChanges: [] },
  references: [],
  approvalPolicy: [],
  dryRun: false,
});

beforeAll(async () => {
  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({ displayName: `车道用户${RUN}`, email: `lane+${RUN}@nexus.test`, handle: `lane${RUN}` })
    .returning({ id: users.id });
  userId = row!.id;
  token = await identityFor(userId);
  projectId = (await createProject(userId, { name: `车道项目${RUN}`, kind: 'website' })).id;
}, 120_000);

afterAll(async () => {
  await getDb().delete(agentTasks).where(eq(agentTasks.createdById, userId));
  await getDb().delete(projects).where(eq(projects.ownerId, userId));
  await getDb().delete(users).where(eq(users.id, userId));
}, 60_000);

describe('cont. 170 · POST /api/ai/run 编排车道回声', () => {
  it('请求头 x-nexus-orchestration: stategraph → 响应头回声 stategraph', async () => {
    const res = await runPost(
      new Request('http://test.local/api/ai/run', {
        method: 'POST',
        headers: asUser('stategraph'),
        body: JSON.stringify(wireFor(projectId)),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-nexus-orchestration')).toBe('stategraph');
    expect(res.headers.get('x-nexus-task')).toBeTruthy();
  }, 60_000);

  it('不传请求头 → 回声 stategraph（cont. 222：默认车道 = 状态图）', async () => {
    const res = await runPost(
      new Request('http://test.local/api/ai/run', {
        method: 'POST',
        headers: asUser(null),
        body: JSON.stringify(wireFor(projectId)),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-nexus-orchestration')).toBe('stategraph');
  }, 60_000);

  it('乱传请求头 → 回落 stategraph（拼写错误不给旧通路留门）', async () => {
    const res = await runPost(
      new Request('http://test.local/api/ai/run', {
        method: 'POST',
        headers: asUser('stategrap'),
        body: JSON.stringify(wireFor(projectId)),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-nexus-orchestration')).toBe('stategraph');
  }, 60_000);

  it('显式逃生门：x-nexus-orchestration: lane-a → 回声 lane-a', async () => {
    const res = await runPost(
      new Request('http://test.local/api/ai/run', {
        method: 'POST',
        headers: asUser('lane-a'),
        body: JSON.stringify(wireFor(projectId)),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('x-nexus-orchestration')).toBe('lane-a');
  }, 60_000);
});
