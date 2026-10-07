/**
 * §133 档位 + §134 额度系统的**规则那一半**（纯函数，不碰库）。
 *
 * 为什么规则要先于表：`credit_ledger` 存的是事实，"这次该扣几点、这个月该发多少"
 * 是决定。决定放在库里而没有界面改它，等于一份没人知道的配置；放在代码里
 * 就有类型、有测试、有"改了没测就红"的门禁。今天改档位的方式是改这里 + 提一次 commit。
 *
 * 三条不能省的纪律：
 * - **余额是派生的**（SUM(delta)），这张表里没有"当前余额"可写；
 * - **每一行消费都要能追到一次真发生过的事**（task_id），追不到的就不该记账；
 * - **没有支付**（§159）。额度只有两个来源：档位按月发放、服务端代码里的一次调整。
 *   界面上不许出现"充值"按钮，因为点了不会有任何真钱进来。
 */

import { CREDIT_LEDGER_KINDS, USER_PLANS, type CreditLedgerKind, type UserPlan } from '../db/schema';

/** 四类额度的名单以库为准（schema 里那份与迁移 0016 的 CHECK 一起钉住），这里只是给它一个域内的名字 */
export const CREDIT_KINDS = CREDIT_LEDGER_KINDS;
export type { CreditLedgerKind };

/** 用户看得见的五类额度（marketplace 消费是第五格，见 §127-128） */
export const CREDIT_KIND_LABELS: Record<CreditLedgerKind, string> = {
  ai: 'AI credits',
  image: 'Image credits',
  video: 'Video credits',
  compute: 'Compute credits',
  marketplace: 'Marketplace credits',
};

export type PlanKey = UserPlan;

/** 五档的名单同样以库为准（`users.plan` 的 CHECK 与它一起改） */
export const PLAN_KEYS = USER_PLANS;

export const PLAN_LABELS: Record<PlanKey, string> = {
  free: 'Free',
  pro: 'Pro',
  creator: 'Creator',
  studio: 'Studio',
  enterprise: 'Enterprise',
};

/**
 * 每档每月发放的额度（幂等：同一月同一类只发一次，见 0016 的部分唯一索引）。
 *
 * 数字怎么来的：按"这一档大概做多少事"给的整数，不是成本核算。
 * 本机没有真 provider key，所有生成走的都是模板（DEMO MODE，§160），
 * 所以任何"这值等于 X 美分成本"的说法都是编的。接上真 provider 之后要改成按 provider 报价算。
 *
 * marketplace 这一格今天不发（购买走的是消费路径，不是发放），给 0 占位。
 */
export const PLAN_MONTHLY_GRANTS: Record<PlanKey, Record<CreditLedgerKind, number>> = {
  free: { ai: 100, image: 20, video: 5, compute: 50, marketplace: 0 },
  pro: { ai: 1000, image: 200, video: 40, compute: 500, marketplace: 0 },
  creator: { ai: 3000, image: 600, video: 120, compute: 1500, marketplace: 0 },
  studio: { ai: 12000, image: 2500, video: 500, compute: 6000, marketplace: 0 },
  enterprise: { ai: 60000, image: 12000, video: 2500, compute: 30000, marketplace: 0 },
};

/**
 * §133 说档位按五件事设计：AI usage / storage / generation / team collaboration / publishing。
 * 今天**有两格有真的拦截方**：AI usage（`refusalFor`，在 `credit-ledger.ts`）与
 * storage（`refusalForStorage`，字节进存储之前问，见 `assets.ts` 的摄取门与 ADR-0018）。
 * 剩下三格记在这里是为了
 * 让界面能说清"哪些是已生效的限制、哪些还只是表格上的字"——把没拦截的上限写成已生效，
 * 是这一份文档里最贵的一种谎。
 */
export const PLAN_LIMITS: Record<
  PlanKey,
  { storageMb: number; teamMembers: number; concurrentPublishes: number }
> = {
  free: { storageMb: 200, teamMembers: 1, concurrentPublishes: 1 },
  pro: { storageMb: 2048, teamMembers: 3, concurrentPublishes: 5 },
  creator: { storageMb: 10240, teamMembers: 10, concurrentPublishes: 20 },
  studio: { storageMb: 51200, teamMembers: 50, concurrentPublishes: 100 },
  enterprise: { storageMb: 204800, teamMembers: 500, concurrentPublishes: 1000 },
};

/** 今天生效的限制有哪几格——界面上那一列"已生效 / 还没拦截方"就读这里 */
export const ENFORCED_PLAN_AXES = ['aiUsage', 'storage'] as const;
export const UNENFORCED_PLAN_AXES = ['generation', 'teamCollaboration', 'publishing'] as const;

/**
 * 一次成功的生成扣几点。
 *
 * 只有跑成功的任务才记账（失败的请求用户没拿到东西，扣点等于罚）；
 * 计量单位是"一次任务"，不是 token 数——本机没有真 provider，拿不到真 token 数，
 * 编一个"这次用了 1234 token"就是 §159 禁止的那种假。
 *
 * marketplace 这一格不用于生成（购买走的是 `purchaseMarketplaceItem`），给 0 占位。
 */
export const GENERATION_COST: Record<CreditLedgerKind, number> = {
  ai: 1,
  image: 2,
  video: 5,
  compute: 1,
  marketplace: 0,
};

/**
 * agentKey → 额度类别。
 *
 * 未登记的 agent 一律按 `ai` 计（一次生成就是 AI 用量），**不去猜**它是图像还是视频：
 * 猜错会把一类额度扣到另一类头上，而余额页上看不出来。
 * 图像/视频那两类的真实消耗方要等 §38/§40 的生成端点落地，今天没有。
 */
export function creditKindForAgentKey(agentKey: string): CreditLedgerKind {
  const key = agentKey.toLowerCase();
  if (key.includes('video') || key.includes('film') || key.includes('storyboard')) return 'video';
  if (key.includes('image') || key.includes('illustr') || key.includes('cover')) return 'image';
  return 'ai';
}

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === 'string' && (PLAN_KEYS as readonly string[]).includes(value);
}

/** 发放与对账用的月份键（UTC）。跨月的账要能一眼看出是哪个月发的 */
export function monthPeriod(at: Date): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** 从流水行算余额：这就是"余额"的全部定义，没有别处存着它 */
export function balanceOf(rows: readonly { kind: CreditLedgerKind; delta: number }[], kind: CreditLedgerKind): number {
  return rows.reduce((sum, r) => (r.kind === kind ? sum + r.delta : sum), 0);
}

export interface GrantPlan {
  kind: CreditLedgerKind;
  /** 本月应发点数；0 表示这一档这一类不发 */
  delta: number;
  reason: string;
}

/**
 * 这个月还欠这个人发多少。已经发过（`alreadyGranted` 为真）就一行都不再写——
 * 幂等性同时靠这里的判断与库里的部分唯一索引，两者不是为了重复而写：
 * 判断让正常路径不产生冲突行，索引挡住两个标签页同时打开余额页的那种并发。
 */
export function pendingGrants(plan: PlanKey, period: string, alreadyGranted: ReadonlySet<CreditLedgerKind>): GrantPlan[] {
  const grants = PLAN_MONTHLY_GRANTS[plan];
  return CREDIT_KINDS.filter((kind) => !alreadyGranted.has(kind))
    .map((kind) => ({
      kind,
      delta: grants[kind],
      reason: `${PLAN_LABELS[plan]} 档位 ${period} 月的 ${CREDIT_KIND_LABELS[kind]} 发放`,
    }))
    .filter((g) => g.delta > 0);
}

export interface BalanceCheck {
  kind: CreditLedgerKind;
  cost: number;
  balance: number;
}

/**
 * 跑之前问一句"还点得起吗"。这一句是 §133 的 AI usage 那一格**唯一真的有拦截方**的地方。
 * 余额为 0 就拒绝，并且拒绝的话里带着数字——"额度不足"与"AI credits 只剩 0 点，这一次要 1 点"
 * 是两种可读性。
 */
export function refusalFor(check: BalanceCheck): string | null {
  if (check.balance >= check.cost) return null;
  return `${CREDIT_KIND_LABELS[check.kind]} 不够：这一次需要 ${check.cost} 点，现在只有 ${check.balance} 点。本月额度会在下个月 1 日（UTC）重新发放，消费明细见「额度」页（/credits）。`;
}

/**
 * §133 的 storage 那一格：写字节之前问一句"还放得下吗"。
 *
 * 与 `refusalFor` 同一条口径——**拒绝的话里必须带数字**。"存储满了"与
 * "Free 档上限 200MB，已用 198MB，这一次还要 4MB"是两种可读性，后者才能让人决定删什么。
 *
 * 今天唯一的拒法是拒绝**新写入**，不做驱逐：已经在库里的素材不会被自动删掉。
 * 把用户的图悄悄删掉是最坏的一种"限额"，腾地方是作者自己的动作。
 */
export function storageLimitBytes(plan: PlanKey): number {
  return PLAN_LIMITS[plan].storageMb * 1024 * 1024;
}

export interface StorageCheck {
  plan: PlanKey;
  /** 这个人名下所有项目加起来已经占的字节（`SUM(assets.bytes)`，派生，不存） */
  usedBytes: number;
  /** 这一次要再写进去的字节数 */
  incomingBytes: number;
}

/** 给人看的字节数，保留一位小数；比较一律用字节本身，别拿这个字符串回去比大小 */
export function humanBytes(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB`;
}

export function refusalForStorage(check: StorageCheck): string | null {
  const limit = storageLimitBytes(check.plan);
  const after = check.usedBytes + check.incomingBytes;
  if (after <= limit) return null;
  return `存储放不下：${PLAN_LABELS[check.plan]} 档上限 ${humanBytes(limit)}，已用 ${humanBytes(check.usedBytes)}，这一次还要 ${humanBytes(check.incomingBytes)}，合计 ${humanBytes(after)}。删掉一些素材再传；今天没有购买流程，加不了空间（§159）。`;
}
