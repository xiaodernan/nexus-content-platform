import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql as rawSql } from 'drizzle-orm';
import { finishTask, startTask } from '../src/server/domain/agent-tasks';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { agentTasks, creditLedger, projects, users } from '../src/server/db/schema';
import {
  adjustCredits,
  chargeGeneration,
  ensureMonthlyGrants,
  planOf,
  readCredits,
  refusalForRun,
} from '../src/server/domain/credit-ledger';
import { GENERATION_COST, PLAN_MONTHLY_GRANTS } from '../src/server/domain/credits';

/**
 * §133/§134 第一片的真库集成测试。
 *
 * 为什么必须有这一份而纯规则那份不够：规则层能证明"表算得对"，证明不了四件只有库知道的事——
 * 发放的幂等键真的建在库上、一次任务真的只落一行消费、流水改不动（触发器）、
 * 以及"跑一次生成 → 余额少 1 点"这条链路真的接在 `finishTask` 上而不是只接在测试里。
 */

let ownerId: string;
let projectId: string;

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  const stamp = Date.now().toString(36);
  const rows = await db
    .insert(users)
    .values([{ displayName: '账本人', email: `cr-a+${Date.now()}@nexus.test`, handle: `cra${stamp}` }])
    .returning({ id: users.id });
  ownerId = rows[0]!.id;
  projectId = (await createProject(ownerId, { name: '额度账本', kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(inArray(projects.ownerId, [ownerId]));
  await db.delete(users).where(inArray(users.id, [ownerId]));
});

const balance = async (kind: 'ai' | 'image' | 'video' | 'compute'): Promise<number> => {
  const [row] = await getDb()
    .select({ total: rawSql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
    .from(creditLedger)
    .where(and(eq(creditLedger.userId, ownerId), eq(creditLedger.kind, kind)));
  return row?.total ?? 0;
};

describe('§134 发放：幂等、按档位、跨月会再发一次', () => {
  it('第一次看账把 free 档四类都发下来，第二次一行都不多发', async () => {
    expect(await planOf(ownerId)).toBe('free');
    const first = await readCredits(ownerId);
    expect(first.granted).toBe(4);
    expect(first.balances).toEqual({ ...PLAN_MONTHLY_GRANTS.free });

    const second = await readCredits(ownerId);
    // 反向对照：改变的是"看过几次"，不被改变的是余额——一个每次都插入的实现对第一行也绿
    expect(second.granted).toBe(0);
    expect(second.balances).toEqual(first.balances);
  });

  it('换个月份键就再发一轮（证明幂等键真的是月份，而不是"有没有发过"）', async () => {
    const before = await balance('ai');
    const lastMonth = new Date(Date.UTC(2026, 6, 15));
    expect(await ensureMonthlyGrants(ownerId, 'free', lastMonth)).toBe(4);
    expect(await balance('ai')).toBe(before + PLAN_MONTHLY_GRANTS.free.ai);
    // 同一个月再调用一次：一行都不许多
    expect(await ensureMonthlyGrants(ownerId, 'free', new Date(Date.UTC(2026, 6, 20)))).toBe(0);
    expect(await balance('ai')).toBe(before + PLAN_MONTHLY_GRANTS.free.ai);
  });
});

describe('§134 消费：一次成功的任务只扣一行', () => {
  it('跑完一次真任务 → AI 额度少 1 点，流水那行指着那次任务', async () => {
    const before = await balance('ai');
    const started = await startTask({
      projectId,
      agentKey: 'design-edit',
      createdById: ownerId,
      capability: 'demo',
      input: { prompt: '把首屏换成三方案' },
    });
    const done = await finishTask(started.id, { ok: true, result: { operations: [] } });
    expect(done.status).toBe('succeeded');
    expect(await balance('ai')).toBe(before - GENERATION_COST.ai);

    const [row] = await getDb()
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.userId, ownerId), eq(creditLedger.source, 'generation')))
      .orderBy(rawSql`created_at desc`)
      .limit(1);
    expect(row?.taskId).toBe(started.id);
    expect(row?.kind).toBe('ai');
    // §160：DEMO 模板生成的那行必须自己写着 DEMO，看账的人不用猜这次是不是模型跑的
    expect(row?.reason).toContain('DEMO');
  });

  it('同一次任务再收尾一遍不会扣第二行（同步与异步轮询是同一条账）', async () => {
    const started = await startTask({
      projectId,
      agentKey: 'design-edit',
      createdById: ownerId,
      capability: 'demo',
      input: { prompt: '再来一次' },
    });
    await finishTask(started.id, { ok: true, result: { operations: [] } });
    const before = await balance('ai');
    const again = await chargeGeneration({
      taskId: started.id,
      userId: ownerId,
      projectId,
      agentKey: 'design-edit',
      capability: 'demo',
    });
    expect(again.charged).toBe(false);
    expect(await balance('ai')).toBe(before);
    // 反向对照：换一次任务号就必须扣得动——否则上面那句"没扣"可能只是函数坏在恒不扣
    const other = await startTask({
      projectId,
      agentKey: 'design-edit',
      createdById: ownerId,
      capability: 'real',
      input: { prompt: '另一件事' },
    });
    const fresh = await chargeGeneration({
      taskId: other.id,
      userId: ownerId,
      projectId,
      agentKey: 'design-edit',
      capability: 'real',
    });
    expect(fresh.charged).toBe(true);
    expect(await balance('ai')).toBe(before - GENERATION_COST.ai);
    const [realRow] = await getDb()
      .select()
      .from(creditLedger)
      .where(eq(creditLedger.taskId, other.id))
      .limit(1);
    expect(realRow?.reason).toContain('真模型');
  });

  it('失败的那一次不扣点', async () => {
    const before = await balance('ai');
    const started = await startTask({
      projectId,
      agentKey: 'design-edit',
      createdById: ownerId,
      capability: 'demo',
      input: { prompt: '会失败的一次' },
    });
    await finishTask(started.id, { ok: false, error: 'provider 超时' });
    expect(await balance('ai')).toBe(before);
    const rows = await getDb()
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.taskId, started.id));
    expect(rows.length).toBe(0);
  });
});

describe('§133 唯一生效的那一格：额度见底就挡', () => {
  it('余额为 0 时拒绝，补 1 点之后放行（同一次检查、只差那一个数）', async () => {
    const now = await balance('ai');
    await adjustCredits({ userId: ownerId, kind: 'ai', delta: -now, reason: '测试：把余额清零' });
    expect(await balance('ai')).toBe(0);
    const refusal = await refusalForRun(ownerId, 'design-edit');
    expect(refusal).not.toBeNull();
    expect(refusal).toContain('0 点');

    await adjustCredits({ userId: ownerId, kind: 'ai', delta: 1, reason: '测试：补回一次的钱' });
    expect(await refusalForRun(ownerId, 'design-edit')).toBeNull();
  });
});

describe('§134 这张账本的库级形状', () => {
  /**
   * drizzle 把库的错误包成 "Failed query: ..."，Postgres 自己那句话在 `cause` 里。
   * 只看 `message` 的断言会挑不出"红的是别的错"——这条 helper 把两层都拼进来读。
   */
  const errorText = async (run: () => Promise<unknown>): Promise<string> => {
    try {
      await run();
      return '';
    } catch (e) {
      const err = e as { message?: string; cause?: { message?: string } };
      return `${err.message ?? ''} ${err.cause?.message ?? ''}`;
    }
  };

  it('流水只追加：改一行与删一行都被触发器挡下', async () => {
    const [row] = await getDb()
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.userId, ownerId))
      .limit(1);
    expect(row).toBeTruthy();
    expect(await errorText(() => getDb().execute(rawSql`update credit_ledger set delta = 999999 where id = ${row!.id}`))).toMatch(/只追加/);
    expect(await errorText(() => getDb().execute(rawSql`delete from credit_ledger where id = ${row!.id}`))).toMatch(/只追加/);
    // 反向对照：同一张表的 INSERT 必须仍然走得通，否则上面的红只是"这张表写坏了"
    await adjustCredits({ userId: ownerId, kind: 'compute', delta: -1, reason: '测试：写入仍然放行' });
    expect(await balance('compute')).toBeLessThan(PLAN_MONTHLY_GRANTS.free.compute + PLAN_MONTHLY_GRANTS.free.compute);
  });

  /**
   * 这条是上面那条的另一半：触发器如果把 Postgres 自己的引用完整性动作也挡了，
   * 全库就再没人删得掉一行任务（`delete from agent_tasks` 会撞上 SET NULL）。
   * 第一次跑这套用例时就是这里红的——放行必须是被测过的，不是注释里说的。
   */
  it('任务行被删掉时，账留下、指针摘掉：外键动作走得住，直接改同样的一列走不住', async () => {
    const started = await startTask({ projectId, agentKey: 'design-edit', createdById: ownerId, capability: 'demo', input: {} });
    await finishTask(started.id, { ok: true, result: { detail: '1 处补丁 · 0 份方案' } });
    const before = await balance('ai');
    const [charged] = await getDb()
      .select({ id: creditLedger.id })
      .from(creditLedger)
      .where(eq(creditLedger.taskId, started.id))
      .limit(1);
    expect(charged).toBeTruthy();

    // 直接发的那条"同样的改动"（depth=1）必须被挡：放行的是外键动作，不是"置空 task_id"这个形状
    expect(
      await errorText(() => getDb().execute(rawSql`update credit_ledger set task_id = null where id = ${charged!.id}`)),
    ).toMatch(/只追加/);

    await getDb().delete(agentTasks).where(eq(agentTasks.id, started.id));
    const [after] = await getDb()
      .select({ taskId: creditLedger.taskId, delta: creditLedger.delta })
      .from(creditLedger)
      .where(eq(creditLedger.id, charged!.id))
      .limit(1);
    expect(after?.taskId).toBeNull();
    expect(after?.delta).toBe(-1);
    // 被删掉的任务不能悄悄改动点数：余额还是删之前那个数
    expect(await balance('ai')).toBe(before);
  });

  it('未知类别、空的 reason、说不清来源的行都进不了库', async () => {
    const db = getDb();
    await expect(
      db.insert(creditLedger).values({ userId: ownerId, kind: 'storage' as never, delta: 1, reason: 'x', source: 'adjust' }),
    ).rejects.toThrow();
    await expect(
      db.insert(creditLedger).values({ userId: ownerId, kind: 'ai', delta: 1, reason: '   ', source: 'adjust' }),
    ).rejects.toThrow();
    await expect(
      db.insert(creditLedger).values({ userId: ownerId, kind: 'ai', delta: 0, reason: '零', source: 'adjust' }),
    ).rejects.toThrow();
    // 消费行必须指着一次任务：没有 task_id 的 generation 行是一种"有人扣了钱但说不出为什么"
    expect(
      await errorText(() => db.insert(creditLedger).values({ userId: ownerId, kind: 'ai', delta: -1, reason: '没有任务', source: 'generation' })),
    ).toMatch(/必须指着一次真任务/);
    // 反向对照：完全同样的字段，只是把 source 换成 adjust，就该写得进去
    await expect(
      db.insert(creditLedger).values({ userId: ownerId, kind: 'ai', delta: -1, reason: '没有任务', source: 'adjust' }),
    ).resolves.toBeTruthy();
    // 反向对照之二：补上 task_id 的同一行也写得进去——挡的是"说不清来源"，不是 generation 这一类
    const [aTask] = await db
      .insert(agentTasks)
      .values({ projectId, agentKey: 'design-edit', createdById: ownerId, capability: 'demo', input: {}, status: 'running' })
      .returning({ id: agentTasks.id });
    await expect(
      db.insert(creditLedger).values({ userId: ownerId, kind: 'ai', delta: -1, reason: '有任务', source: 'generation', taskId: aTask!.id }),
    ).resolves.toBeTruthy();
  });

  it('档位存在 users 那一列，档位值本身由库挡着非法输入', async () => {
    const db = getDb();
    await db.update(users).set({ plan: 'pro' }).where(eq(users.id, ownerId));
    expect(await planOf(ownerId)).toBe('pro');
    // 非法档位写不进去：这条 CHECK 就是"读出来的字符串一定是五档之一"的那份保证
    await expect(db.update(users).set({ plan: 'ultra' as never }).where(eq(users.id, ownerId))).rejects.toThrow();
    await db.update(users).set({ plan: 'free' }).where(eq(users.id, ownerId));
    // 查不到的人不是"没有档位"，是这套东西不该替他记账：退回 free 且不写任何流水
    expect(await planOf('00000000-0000-0000-0000-000000000000')).toBe('free');
  });
});

afterAll(async () => {
  await getDb().delete(agentTasks).where(inArray(agentTasks.createdById, [ownerId]));
});
