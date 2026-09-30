import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, gte, inArray, sql as rawSql } from 'drizzle-orm';
import { listAudit } from '../src/server/domain/audit';
import { setUserPlan } from '../src/server/domain/plan-admin';
import { PLAN_KEYS, PLAN_LIMITS, PLAN_MONTHLY_GRANTS, storageLimitBytes } from '../src/server/domain/credits';
import { getDb } from '../src/server/db/client';
import { auditEvents, users } from '../src/server/db/schema';

/**
 * §133 的"改档位"入口。ADR-0014 那一版把改档位留在服务端代码里（"今天没有界面"），
 * 这一片补的就是那个入口的判定。
 *
 * 每条负面断言都配一个同一次运行里的正向对照：一个"永远返回 ok"的 setUserPlan 会让
 * "非 admin 被拒"和"admin 能改"一起通过吗？不会——后者要求库里那一行真的变了，
 * 前者要求它真的没变。档位与角色最大的不同是**允许改自己**，所以这一条要有两个方向：
 * 自己改自己必须过，非 admin 改别人必须被拒（否则"谁都能改"也能通过前一条）。
 */

let adminId: string;
let creatorId: string;
const stamp = Date.now().toString(36);

// 一个格式合法但库里不存在的 id：用来量"目标是空的"这条路
const NOBODY = '00000000-0000-4000-8000-0000000000ff';

const planOf = async (id: string): Promise<string | undefined> => {
  const [row] = await getDb().select({ plan: users.plan }).from(users).where(eq(users.id, id)).limit(1);
  return row?.plan;
};

/** 这个 actor 最近的审计行；每条断言前先清一次，免得读到上一条用例留下的 */
const mine = async () =>
  (
    await getDb()
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(
        and(
          inArray(auditEvents.actorId, [adminId, creatorId]),
          gte(auditEvents.createdAt, new Date(Date.now() - 60_000)),
        ),
      )
  ).map((r) => r.id);

const clearMine = async () => {
  const ids = await mine();
  if (ids.length > 0) await getDb().delete(auditEvents).where(inArray(auditEvents.id, ids));
};

const planEvents = async () =>
  (await listAudit(50)).filter((event) => event.action === 'user.plan.change');

beforeAll(async () => {
  const db = getDb();
  await db.execute(rawSql`select 1 as ok`);
  await db.delete(users).where(rawSql`handle like ${'pla%'}`);
  const rows = await db
    .insert(users)
    .values([
      { displayName: 'Plan Admin', email: `pla-a+${Date.now()}@nexus.test`, handle: `plaa${stamp}`, role: 'admin' },
      { displayName: 'Plan Creator', email: `pla-c+${Date.now()}@nexus.test`, handle: `plac${stamp}`, role: 'creator' },
    ])
    .returning({ id: users.id });
  adminId = rows[0]!.id;
  creatorId = rows[1]!.id;
});

afterAll(async () => {
  const db = getDb();
  const ids = [adminId, creatorId];
  await db.delete(auditEvents).where(inArray(auditEvents.actorId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

describe('改档位：谁能改', () => {
  it('非审核员改别人的档位：403，库里的档位不动，被拒的那一次留在审计里', async () => {
    await clearMine();
    const result = await setUserPlan(creatorId, adminId, 'enterprise');
    expect(result).toMatchObject({ ok: false, status: 403, code: 'forbidden' });
    // 正向对照：同一次运行里 admin 改得动（下一条用例），所以"档位没变"不是因为它本来就改不动
    expect(await planOf(adminId)).toBe('free');
    const denied = (await planEvents()).find((event) => event.actorId === creatorId);
    expect(denied?.allowed).toBe(false);
    expect(JSON.stringify(denied?.detail)).toContain('not_admin');
    await clearMine();
  });

  it('越权的人随手带个错档位：记的还是 not_admin，不是 unknown_plan', async () => {
    // 判序：先判权限再判报文。反过来的话，能探测这个端点的脚本只要故意送个垃圾档位，
    // 审计里就只剩一片 unknown_plan，看不出有人在越权试
    await clearMine();
    const result = await setUserPlan(creatorId, adminId, '不可能的一档');
    expect(result).toMatchObject({ ok: false, status: 403, code: 'forbidden' });
    const denied = (await planEvents()).find((event) => event.actorId === creatorId);
    expect(JSON.stringify(denied?.detail)).toContain('not_admin');
    await clearMine();
  });

  it('允许改自己的档位，与改角色相反：ADMIN 把自己升上去，库里真的变了', async () => {
    await clearMine();
    const result = await setUserPlan(adminId, adminId, 'studio');
    expect(result).toMatchObject({ ok: true, previous: 'free', plan: 'studio' });
    expect(await planOf(adminId)).toBe('studio');
    const event = (await planEvents()).find((item) => item.allowed === true && item.targetId === adminId);
    const detail = event?.detail as { self?: boolean; changed?: boolean; from?: string; to?: string } | undefined;
    expect(detail?.self).toBe(true);
    expect(detail?.changed).toBe(true);
    expect(`${detail?.from}->${detail?.to}`).toBe('free->studio');
    // 反向对照：角色那一路是不允许改自己的（`self_change`），两处的差别是刻意的
    await clearMine();
  });

  it('审核员改别人的档位：允许，审计里 self 是 false', async () => {
    await clearMine();
    const result = await setUserPlan(adminId, creatorId, 'creator');
    expect(result).toMatchObject({ ok: true, previous: 'free', plan: 'creator' });
    expect(await planOf(creatorId)).toBe('creator');
    const event = (await planEvents()).find((item) => item.targetId === creatorId && item.allowed === true);
    expect((event?.detail as { self?: boolean } | undefined)?.self).toBe(false);
    await clearMine();
  });
});

describe('改档位：报文与目标', () => {
  it('五档之外的档位：400，且库里不留痕', async () => {
    await clearMine();
    const before = await planOf(creatorId);
    const result = await setUserPlan(adminId, creatorId, 'ultra');
    expect(result).toMatchObject({ ok: false, status: 400, code: 'unknown_plan' });
    // 拒的理由要把五档写出来，不能只说"不合法"
    expect(result.ok === false && result.reason).toContain(PLAN_KEYS.join(' / '));
    expect(await planOf(creatorId)).toBe(before);
    const denied = (await planEvents()).find((event) => event.allowed === false && event.actorId === adminId);
    expect(JSON.stringify(denied?.detail)).toContain('unknown_plan');
    await clearMine();
  });

  it('目标不存在：404，而且不为一次没发生的事写审计', async () => {
    await clearMine();
    const result = await setUserPlan(adminId, NOBODY, 'pro');
    expect(result).toMatchObject({ ok: false, status: 404, code: 'not_found' });
    // 与 setUserRole 同一条口径：目标都找不到，就没有"谁对谁做了什么"可记
    expect((await planEvents()).some((event) => event.targetId === NOBODY)).toBe(false);
    await clearMine();
  });

  it('选的还是原来那一档：返回 ok，但审计里 changed 是 false', async () => {
    await clearMine();
    const result = await setUserPlan(adminId, creatorId, 'creator');
    expect(result).toMatchObject({ ok: true, previous: 'creator', plan: 'creator' });
    expect(await planOf(creatorId)).toBe('creator');
    // 同档位重复提交也落一行：这是"有人在拿这个端点当探针扫"的信号，不是一次改档
    const event = (await planEvents()).find((item) => item.targetId === creatorId && item.allowed === true);
    expect((event?.detail as { changed?: boolean } | undefined)?.changed).toBe(false);
    await clearMine();
  });

  it('审计把这一次改了什么写全：额度与存储上限都在 detail 里', async () => {
    await clearMine();
    expect(await setUserPlan(adminId, creatorId, 'enterprise')).toMatchObject({ ok: true });
    const event = (await planEvents()).find((item) => item.targetId === creatorId && item.allowed === true);
    const detail = event?.detail as { grants?: unknown; storageMb?: number } | undefined;
    // 事后读审计的人不用回去翻当时的代码才知道这一档意味着什么
    expect(detail?.grants).toEqual(PLAN_MONTHLY_GRANTS.enterprise);
    expect(detail?.storageMb).toBe(PLAN_LIMITS.enterprise.storageMb);
    expect(storageLimitBytes('enterprise')).toBe(PLAN_LIMITS.enterprise.storageMb * 1024 * 1024);
    await clearMine();
  });
});

describe('库里的第五种值', () => {
  it('CHECK 是最后一道墙：绕过 domain 直接写库也进不去', async () => {
    // domain 那一层带得上一句话（"五档是 …"），这一层只负责"就是写不进去"。
    // 两层都要有：domain 那层是给人看的，这一层是给未来某个忘了走 domain 的人看的
    // drizzle 把 pg 的原文包在 `cause` 里，外层只有一句 "Failed query"——只看 message 会以为
    // "报错了"就够，其实要确认报的是**哪一条**约束（别的原因也会抛）
    const failure = await getDb()
      .execute(rawSql`update users set plan = 'ultra' where id = ${creatorId}`)
      .then(
        () => null,
        (error: unknown) => error as { cause?: { code?: string; constraint_name?: string } },
      );
    expect(failure?.cause?.code).toBe('23514');
    expect(failure?.cause?.constraint_name).toBe('users_plan');
    expect(await planOf(creatorId)).toBe('enterprise');
  });
});
