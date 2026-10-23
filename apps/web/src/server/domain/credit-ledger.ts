/**
 * §134 额度账本的**读写那一半**（规则在 `credits.ts`，那张表是纯的、可单测的）。
 *
 * 三条与库有关的决定：
 * - 余额用 `SUM(delta)` 现算，不存"当前余额"。库里的 `credit_ledger` 也没有可改的一列
 *   （0016 那个触发器把 UPDATE / DELETE 挡了），所以"余额对不上"这类 bug 从结构上就没有落脚点。
 * - 发放是**看账或跑任务之前**确保一次（幂等）。本机没有常驻 cron，把它写成"每月 1 日定时发放"
 *   就等于承诺了一个不存在的东西。
 * - 一次任务只扣一次：靠部分唯一索引 + `onConflictDoNothing`，而不是靠调用方自觉，
 *   因为 `finishTask` 有同步与异步轮询两条路都会走到收尾。
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { assets, creditLedger, projects, users, type CreditLedgerKind } from '../db/schema';
import {
  CREDIT_KINDS,
  GENERATION_COST,
  creditKindForAgentKey,
  isPlanKey,
  monthPeriod,
  pendingGrants,
  refusalFor,
  videoRenderQuota,
  type PlanKey,
  type RenderQuotaView,
} from './credits';

export interface LedgerEntry {
  kind: CreditLedgerKind;
  delta: number;
  reason: string;
  source: string;
  taskId: string | null;
  createdAt: string;
}

export interface CreditSummary {
  plan: PlanKey;
  period: string;
  /** 四类余额，键固定齐全——界面不用处理"某一类没有行"这种情况 */
  balances: Record<CreditLedgerKind, number>;
  entries: LedgerEntry[];
  /** 这一月新发了几行（0 = 早就发过了，第二次看账不该再发） */
  granted: number;
}

/** 这个人属于哪一档。列默认 'free'，所以只有库里被人写成未知值时才会退回 free */
export async function planOf(userId: string): Promise<PlanKey> {
  const [row] = await getDb()
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const stored = row?.plan;
  return isPlanKey(stored) ? stored : 'free';
}

/**
 * 这个人（名下所有项目加起来）已经占了多少存储：`SUM(assets.bytes)`。
 *
 * 与余额同一套纪律——**用量是派生的**，库里没有"已用存储"这一列可以改，
 * 所以"账面上还有空间但传不上去"这类不一致没有落脚点。
 *
 * 两处口径写下来，因为它们直接影响数字：
 * - 软删的项目**仍然算**：字节还躺在存储里，删项目腾不出空间（真腾空间要做资产清理，今天没有）；
 * - 挂在"没有项目"的资产上的字节不算（今天没有这种写入方；头图走 `avatar` 那条独立的表）。
 */
export async function storageUsageBytes(ownerId: string): Promise<number> {
  const [row] = await getDb()
    .select({ total: sql<string | number | null>`coalesce(sum(${assets.bytes}), 0)` })
    .from(assets)
    .innerJoin(projects, eq(projects.id, assets.projectId))
    .where(eq(projects.ownerId, ownerId));
  return Number(row?.total ?? 0);
}

/**
 * 确保这个月这一档该发的都发过了，返回**新写入**的行数。
 * 已有发放记录的类别不再写；并发下重复写由库里的部分唯一索引挡下（`onConflictDoNothing`）。
 */
export async function ensureMonthlyGrants(userId: string, plan: PlanKey, at: Date = new Date()): Promise<number> {
  const period = monthPeriod(at);
  const db = getDb();
  const already = await db
    .select({ kind: creditLedger.kind })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, userId),
        eq(creditLedger.source, 'plan_grant'),
        eq(creditLedger.period, period),
      ),
    );
  const grantedSet = new Set(already.map((r) => r.kind));
  const todo = pendingGrants(plan, period, grantedSet);
  let written = 0;
  for (const grant of todo) {
    const rows = await db
      .insert(creditLedger)
      .values({
        userId,
        kind: grant.kind,
        delta: grant.delta,
        reason: grant.reason,
        source: 'plan_grant',
        period,
      })
      .onConflictDoNothing({
        target: [creditLedger.userId, creditLedger.kind, creditLedger.period],
        where: eq(creditLedger.source, 'plan_grant'),
      })
      .returning({ id: creditLedger.id });
    written += rows.length;
  }
  return written;
}

async function balancesOf(userId: string): Promise<Record<CreditLedgerKind, number>> {
  const rows = await getDb()
    .select({ kind: creditLedger.kind, total: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .groupBy(creditLedger.kind);
  const byKind = new Map(rows.map((r) => [r.kind, r.total]));
  return Object.fromEntries(
    CREDIT_KINDS.map((kind) => [kind, byKind.get(kind) ?? 0]),
  ) as Record<CreditLedgerKind, number>;
}

/** 余额页要的那一份：先确保本月已发，再把四类余额与最近流水一起给出去 */
export async function readCredits(userId: string, at: Date = new Date()): Promise<CreditSummary> {
  const plan = await planOf(userId);
  const granted = await ensureMonthlyGrants(userId, plan, at);
  const balances = await balancesOf(userId);
  const rows = await getDb()
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
    .limit(20);
  return {
    plan,
    period: monthPeriod(at),
    balances,
    granted,
    entries: rows.map((r) => ({
      kind: r.kind,
      delta: r.delta,
      reason: r.reason,
      source: r.source,
      taskId: r.taskId,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * 跑一次生成之前问一句。返回 null = 可以跑；返回一句话 = 拒绝，那句话直接给用户看。
 *
 * 注意它**不预扣**：额度是在任务成功收尾时才扣（`chargeGeneration`），
 * 所以并发下两个人可能同时通过这道检查、把余额跑到负数。这一版接受这个松：
 * 负余额在流水里看得见（SUM 出来就是负的），而"预扣 + 失败退还"要的是可回滚的事务边界，
 * 那需要把 provider 调用整个包进库里的一笔事务——今天没有，写了就是假的。
 */
export async function refusalForRun(userId: string, agentKey: string, at: Date = new Date()): Promise<string | null> {
  const plan = await planOf(userId);
  await ensureMonthlyGrants(userId, plan, at);
  const kind = creditKindForAgentKey(agentKey);
  const balances = await balancesOf(userId);
  return refusalFor({ kind, cost: GENERATION_COST[kind], balance: balances[kind] });
}

/**
 * 成片渲染的额度视图（§133 generation 那一格在 render 链上的呈现，#196）。
 *
 * 与 `refusalForRun` 读同一组数、同样先 `ensureMonthlyGrants`：展示说"还可渲 N 次"
 * 与门实际放不放行，必须来自同一次计算。月度发放是幂等的（部分唯一索引挡重复），
 * 在这里触发与在门那里触发没有第二份真相。
 */
export async function renderQuotaFor(userId: string, at: Date = new Date()): Promise<RenderQuotaView> {
  const plan = await planOf(userId);
  await ensureMonthlyGrants(userId, plan, at);
  const balances = await balancesOf(userId);
  return videoRenderQuota(plan, balances.video);
}

export interface ChargeInput {
  taskId: string;
  userId: string;
  projectId: string | null;
  agentKey: string;
  /**
   * §160：DEMO 模板生成与真模型生成要能分开看，理由里带着它。
   * `unavailable` 与 null 都不冒充：那一行只写"一次 … 生成完成"，不写是谁给的。
   */
  capability: 'real' | 'demo' | 'unavailable' | null;
  at?: Date;
}

export interface ChargeResult {
  kind: CreditLedgerKind;
  cost: number;
  /** false = 这一次任务早就扣过了（另一条收尾路径先到了），没有写第二行 */
  charged: boolean;
}

/** 一次**成功**的任务扣一行。失败的收尾不走到这里——调用方负责只在成功时调用 */
export async function chargeGeneration(input: ChargeInput): Promise<ChargeResult> {
  const kind = creditKindForAgentKey(input.agentKey);
  const cost = GENERATION_COST[kind];
  const at = input.at ?? new Date();
  const rows = await getDb()
    .insert(creditLedger)
    .values({
      userId: input.userId,
      kind,
      delta: -cost,
      reason: `一次${input.capability === 'demo' ? ' DEMO 模板 ' : input.capability === 'real' ? ' 真模型 ' : ' '}${input.agentKey} 生成完成，扣 ${cost} 点`,
      source: 'generation',
      taskId: input.taskId,
      projectId: input.projectId,
      period: monthPeriod(at),
    })
    .onConflictDoNothing({
      target: [creditLedger.taskId, creditLedger.kind],
      where: sql`${creditLedger.taskId} is not null`,
    })
    .returning({ id: creditLedger.id });
  return { kind, cost, charged: rows.length > 0 };
}

/**
 * 服务端代码里的一次额度调整（发放之外的唯一写入口）。
 * **今天没有任何 HTTP 路由调用它**——没有支付，就不该有"点一下加额度"的按钮。
 * 它存在的理由是测试要能造出"余额为 0"这个状态，从而真的走到上面那道拦截。
 */
export async function adjustCredits(input: {
  userId: string;
  kind: CreditLedgerKind;
  delta: number;
  reason: string;
}): Promise<void> {
  await getDb()
    .insert(creditLedger)
    .values({
      userId: input.userId,
      kind: input.kind,
      delta: input.delta,
      reason: input.reason,
      source: 'adjust',
      period: monthPeriod(new Date()),
    });
}
