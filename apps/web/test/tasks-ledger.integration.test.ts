import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { TasksLedgerSchema } from '../src/lib/tasksLedger';
import { finishTask, listProjectTasks, recordTaskUsage, startTask } from '../src/server/domain/agent-tasks';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projects, users } from '../src/server/db/schema';

/**
 * 账本读侧打真库的那一半（读接口的 HTTP 层在 e2e 里验：那里才有真会话与真中间件）。
 * 这里钉两句话：
 * - **服务端给的形状一定过 `TasksLedgerSchema`**——路由出口那道 safeParse 不是摆设，
 *   真实行（Date 转字符串、capability 的取值、mine）就是它每天要收的东西；
 * - **归属由 `listProjectTasks` 判**：别人的项目连 null 之外的答案都没有（路由把它翻成 404）。
 */

let owner: string;
let stranger: string;
let projectId: string;

beforeAll(async () => {
  const [a] = await getDb()
    .insert(users)
    .values({ displayName: 'Ledger Owner', email: `ledger+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  const [b] = await getDb()
    .insert(users)
    .values({ displayName: 'Ledger Stranger', email: `ledger-stranger+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  owner = a!.id;
  stranger = b!.id;
  projectId = (await createProject(owner, { name: '账本契约', kind: 'website' })).id;
});

afterAll(async () => {
  await getDb().delete(projects).where(eq(projects.ownerId, owner));
  await getDb().delete(users).where(eq(users.id, owner));
  await getDb().delete(users).where(eq(users.id, stranger));
});

describe('listProjectTasks → TasksLedgerSchema（账本读侧 #10）', () => {
  it('真实的一行过得了契约，自己的行 mine=true、跑完的行 durationMs 是个数', async () => {
    const started = await startTask({
      projectId,
      agentKey: 'design-agent',
      createdById: owner,
      capability: 'demo',
      input: { prompt: '契约那条' },
    });
    const finished = await finishTask(started.id, { ok: true, result: { ok: true } });
    expect(finished.status).toBe('succeeded');

    const result = await listProjectTasks(projectId, owner);
    expect(result).not.toBeNull();
    if (!result) throw new Error('上面已断言');
    const parsed = TasksLedgerSchema.safeParse({ ok: true, projectName: result.projectName, tasks: result.tasks });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('契约咬住了服务端报文：' + JSON.stringify(parsed.error.issues));

    const row = parsed.data.tasks.find((t) => t.id === started.id);
    expect(row).toBeDefined();
    expect(row!.mine).toBe(true);
    expect(row!.status).toBe('succeeded');
    expect(row!.durationMs).toBeTypeOf('number');
    // §75：这一行没记账 ⇒ usage 是 null，不是一份 0 token 的用量
    expect(row!.usage).toBeNull();
    expect(parsed.data.projectName).toBe('账本契约');
  });

  it('别人的项目：null（路由翻成 404，连任务数都不给）', async () => {
    const result = await listProjectTasks(projectId, stranger);
    expect(result).toBeNull();
  });
});

describe('§75 用量记账（真库）', () => {
  const demoUsage = {
    provider: 'mock',
    model: 'nexus-deterministic-v1',
    modelClass: 'balanced',
    tokensIn: 0,
    tokensOut: 0,
    latencyMs: 42,
    costUsd: 0,
    toolCalls: 0,
    demoMode: true,
  };

  it('记进去 → listProjectTasks 原样读出，契约也过得了（DEMO 的 0 token 是被记下来的事实）', async () => {
    const started = await startTask({
      projectId,
      agentKey: 'design-agent',
      createdById: owner,
      capability: 'demo',
      input: { prompt: '用量那条' },
    });
    await finishTask(started.id, { ok: true, result: { ok: true } });
    expect(await recordTaskUsage(started.id, demoUsage)).toBe(true);

    const result = await listProjectTasks(projectId, owner);
    if (!result) throw new Error('项目还在，读不到就是 bug');
    const parsed = TasksLedgerSchema.safeParse({ ok: true, projectName: result.projectName, tasks: result.tasks });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('契约咬住了用量：' + JSON.stringify(parsed.error.issues));
    const row = parsed.data.tasks.find((t) => t.id === started.id);
    expect(row!.usage).toEqual(demoUsage);
  });

  it('坏形状不进库：记不进去（false），读回仍是 null——不拿半截用量冒充记账', async () => {
    const started = await startTask({
      projectId,
      agentKey: 'design-agent',
      createdById: owner,
      capability: 'demo',
      input: { prompt: '坏用量那条' },
    });
    await finishTask(started.id, { ok: true, result: { ok: true } });
    expect(await recordTaskUsage(started.id, { ...demoUsage, tokensIn: -1 })).toBe(false);
    expect(await recordTaskUsage(started.id, { provider: 'mock' })).toBe(false);

    const result = await listProjectTasks(projectId, owner);
    const row = result?.tasks.find((t) => t.id === started.id);
    expect(row!.usage).toBeNull();
  });

  it('一次任务只记一份：第二次换一份用量不会覆盖第一次（CAS 是 usage IS NULL）', async () => {
    const started = await startTask({
      projectId,
      agentKey: 'design-agent',
      createdById: owner,
      capability: 'demo',
      input: { prompt: '不覆盖那条' },
    });
    expect(await recordTaskUsage(started.id, demoUsage)).toBe(true);
    const later = { ...demoUsage, provider: 'someone-else', latencyMs: 999 };
    expect(await recordTaskUsage(started.id, later)).toBe(false);

    const result = await listProjectTasks(projectId, owner);
    const row = result?.tasks.find((t) => t.id === started.id);
    expect(row!.usage).toEqual(demoUsage);
  });
});
