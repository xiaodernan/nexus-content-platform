import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray, sql as rawSql } from 'drizzle-orm';
import {
  cancelTask,
  finishTask,
  getTask,
  listProjectTasks,
  startTask,
} from '../src/server/domain/agent-tasks';
import { emit, inbox } from '../src/server/domain/notifications';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { agentTasks, creditLedger, projects, users } from '../src/server/db/schema';

/**
 * §112 的账本 + §164 的 Generation complete 真来源。
 * `agentTasks` 这张表建库以来没被写过，所以这里的重点不是"能不能 insert"，
 * 而是三件以前无处可查的事：失败会不会留行、别人的项目会不会被列出来、
 * 一次任务会不会只对应一条通知。
 */

let ownerId: string;
let otherId: string;
let projectId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const stamp = Date.now().toString(36);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Owner', email: `at-a+${Date.now()}@nexus.test`, handle: `ata${stamp}` },
      { displayName: 'Other', email: `at-b+${Date.now()}@nexus.test`, handle: `atb${stamp}` },
    ])
    .returning({ id: users.id });
  ownerId = rows[0]!.id;
  otherId = rows[1]!.id;
  projectId = (await createProject(ownerId, { name: '任务账本', kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId, otherId]));
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]));
});

const gen = (taskId: string, over: Partial<Parameters<typeof emit>[0]> = {}) =>
  ({
    kind: 'generation',
    recipientId: ownerId,
    projectId,
    projectName: '任务账本',
    taskId,
    agentKey: 'design-edit',
    capability: 'demo',
    ok: true,
    durationMs: 900,
    detail: '2 处补丁 · 1 份方案',
    ...over,
  }) as Parameters<typeof emit>[0];

describe('任务行的一生', () => {
  it('开始是 running，成功落 succeeded 并算得出用时；不存在的 id 不会被说成改好了', async () => {
    const started = await startTask({
      projectId,
      agentKey: 'design-edit',
      createdById: ownerId,
      capability: 'demo',
      input: { prompt: '把主视觉调暗一点' },
    });
    expect(started.projectName).toBe('任务账本');
    const running = await getTask(started.id);
    expect(running?.status).toBe('running');
    // 没跑完就没有时长——拿"到现在为止"冒充耗时是另一种谎
    expect(running?.durationMs).toBe(null);

    const done = await finishTask(started.id, { ok: true, result: { patches: 2 } });
    expect(done).toEqual({ status: 'succeeded', updated: true });
    const after = await getTask(started.id);
    expect(after?.status).toBe('succeeded');
    expect(after?.durationMs).not.toBeNull();
    expect((after?.durationMs ?? -1) >= 0).toBe(true);

    const ghost = await finishTask('00000000-0000-4000-8000-000000000000', { ok: true });
    expect(ghost.updated).toBe(false);
  });

  it('取消了的任务不会被晚到的收尾改写：终态只落一次，取消了不扣点（#169）', async () => {
    const started = await startTask({
      projectId,
      agentKey: 'design-edit',
      createdById: ownerId,
      capability: 'demo',
      input: { prompt: '取消之后 worker 才报完成' },
    });
    // 观察路"只写在跑的行"只是预检：它读到 running 之后、finishTask 落到库里之前，
    // 用户的取消完全可能插进来。这一条把那个顺序钉死——取消先落，收尾后到。
    expect(await cancelTask(started.id, '用户取消')).toBe(true);
    const late = await finishTask(started.id, { ok: true, result: { detail: 'worker 也跑完了' } });
    expect(late.updated, '取消之后还被收尾覆盖 → 状态倒回 succeeded，而且白扣一点').toBe(false);
    const [row] = await getDb()
      .select({ status: agentTasks.status })
      .from(agentTasks)
      .where(eq(agentTasks.id, started.id));
    expect(row?.status).toBe('cancelled');
    const [charge] = await getDb()
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.taskId, started.id));
    expect(charge, '取消了却扣了点').toBeUndefined();
  });

  it('失败也留行，而且带得上那句原因；没给原因时用兜底文案而不是留空', async () => {
    const withReason = await startTask({ projectId, agentKey: 'research', createdById: ownerId, capability: 'real', input: {} });
    await finishTask(withReason.id, { ok: false, error: 'provider 不可达' });
    expect((await getTask(withReason.id))?.error).toBe('provider 不可达');
    expect((await getTask(withReason.id))?.capability).toBe('real');

    const bare = await startTask({ projectId, agentKey: 'research', createdById: ownerId, capability: 'demo', input: {} });
    await finishTask(bare.id, { ok: false });
    expect((await getTask(bare.id))?.error).toBe('执行失败，没有给出原因');
  });

  it('没有归属项目的请求照样记账，但不替它编一个项目名', async () => {
    const started = await startTask({
      projectId: null,
      agentKey: 'freeform',
      createdById: ownerId,
      capability: 'demo',
      input: {},
    });
    expect(started.projectName).toBe(null);
    expect((await getTask(started.id))?.projectName).toBe(null);
    // 反向对照：FK 是真的在挡——挂一个不存在的项目 id 会被数据库拒绝，
    // 也就是说"projectName 为 null"只可能是"确实没有归属项目"，不是查丢了
    await expect(
      startTask({ projectId: '00000000-0000-4000-8000-000000000001', agentKey: 'freeform', createdById: ownerId, capability: 'demo', input: {} }),
    ).rejects.toThrow();
    await getDb().delete(agentTasks).where(eq(agentTasks.id, started.id));
  });
});

describe('谁能看到这些行', () => {
  it('别人的项目一个字都不给（连任务数都不报）；自己的项目带项目名', async () => {
    await startTask({ projectId, agentKey: 'design-edit', createdById: ownerId, capability: 'demo', input: {} });
    const mine = await listProjectTasks(projectId, ownerId);
    expect(mine?.projectName).toBe('任务账本');
    expect(mine?.tasks.length ?? 0).toBeGreaterThan(0);
    // 反向对照：同一条项目，换个人查就是查不到
    expect(await listProjectTasks(projectId, otherId)).toBe(null);
  });
});

describe('一次任务一条通知（§164 的 Generation complete）', () => {
  it('同一任务重复发只留一条；换任务号是另一件事', async () => {
    const started = await startTask({ projectId, agentKey: 'design-edit', createdById: ownerId, capability: 'demo', input: {} });
    await finishTask(started.id, { ok: true });
    expect(await emit(gen(started.id))).toBe('created');
    expect(await emit(gen(started.id))).toBe('duplicate');
    expect(await emit(gen(started.id, { taskId: 'other-task' }))).toBe('created');

    const box = await inbox(ownerId);
    const mine = box.items.filter((item) => item.kind === 'generation');
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.some((item) => item.title.includes('DEMO 模板生成完成'))).toBe(true);
    expect(mine[0]?.link).toBe(`/studio/${projectId}`);
    // 反向对照：kind 不认识的值不会回落到某一类已知类型显示（收件箱读的是真 kind）
    expect(box.items.every((item) => item.kind !== 'publish' || item.title.includes('发布'))).toBe(true);
  });
});
