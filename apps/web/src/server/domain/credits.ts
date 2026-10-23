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
 * 今天**五格全都有真的拦截方**：AI usage（`refusalFor`，在 `credit-ledger.ts`）、
 * storage（`refusalForStorage`，字节进存储之前问，见 `assets.ts` 的摄取门与 ADR-0018）、
 * generation（成片渲染的门：`refusalForRun` 在 `startTask` 之前问 Video credits，
 * #191 落下的那道门——本机没有视频 provider，"这个月还能渲几版"从此是真会拦的）、
 * publishing（同时公开发布的项目数上限：`refusalForPublishSlot` 在 `publishProject`
 * 落行之前问，#199 落成——换版本不占新名额，收回发布即释放）、
 * teamCollaboration（每个项目除 owner 外的协作者上限：`refusalForTeamSlot` 在
 * `inviteMember` 写邀请之前问，#201 落成——pending 邀请也占名额，撤回/移除即释放）。
 * §133 点名的五件事到此全部有拦截方，`UNENFORCED_PLAN_AXES` 只剩一个空壳——留着它
 * 是因为界面要能说清「哪些是已生效的限制、哪些还只是表格上的字」，把没拦截的上限写成
 * 已生效，是这一份文档里最贵的一种谎。真加了第六件事，先往这两列里放，再落拦截方。
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
export const ENFORCED_PLAN_AXES = ['aiUsage', 'storage', 'generation', 'publishing', 'teamCollaboration'] as const;
/** #201 之后五格全有拦截方。空数组不是漏了一格，是「没有还没拦截方的格子」 */
export const UNENFORCED_PLAN_AXES = [] as const;

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
/**
 * §133 generation 那一格在 render 链上的**呈现**（#196）：这个档每月发几点 Video credits、
 * 一次成片渲染扣几点、当前余额还够渲几版。
 *
 * 纯函数：档位与余额是输入，视图是输出。界面上"本月还可渲 N 次"与渲染门
 * （`refusalForRun` → `refusalFor`）必须读同一组数——展示说还有 3 次、门却早就关了，
 * 那种对不上比不展示更糟（§159）。所以这里不新算一套成本，只转述
 * `PLAN_MONTHLY_GRANTS` 与 `GENERATION_COST`。
 */
export interface RenderQuotaView {
  plan: PlanKey;
  planLabel: string;
  /** 这个档每月发的 Video credits */
  monthlyGrant: number;
  /** 一次成片渲染扣几点（`GENERATION_COST.video`） */
  costPerRender: number;
  /** 当前 Video credits 余额 */
  balance: number;
  /** 余额还够渲几版：向下取整；负数余额（调整扣过头）夹到 0，不显示"-1 次" */
  rendersLeft: number;
}

export function videoRenderQuota(plan: PlanKey, videoBalance: number): RenderQuotaView {
  const costPerRender = GENERATION_COST.video;
  return {
    plan,
    planLabel: PLAN_LABELS[plan],
    monthlyGrant: PLAN_MONTHLY_GRANTS[plan].video,
    costPerRender,
    balance: videoBalance,
    rendersLeft:
      costPerRender > 0 ? Math.max(0, Math.floor(videoBalance / costPerRender)) : Number.POSITIVE_INFINITY,
  };
}

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

/**
 * §133 publishing 那一格：同时公开发布着的项目数上限（#199）。
 *
 * 与 `refusalForStorage` 同一条口径——拒绝的话里带数字。三条边界写下来，因为它们
 * 直接决定谁被拒：
 * - 同一个项目换版本**不占新名额**：published_projects 一条 path 一行，重复发布是 UPDATE；
 * - 收回发布（`unpublishProject` 把 visibility 切 private）**释放名额**；
 * - 软删的项目不占名额（项目没了，公网 URL 也跟着解析不出来——与 storage"软删仍占空间"
 *   的口径不同，那里字节还躺在存储里）。
 */
export interface PublishSlotCheck {
  plan: PlanKey;
  /** 已经处于公开发布状态的项目数，不含本次发布的这一个 */
  activeCount: number;
}

export function concurrentPublishLimit(plan: PlanKey): number {
  return PLAN_LIMITS[plan].concurrentPublishes;
}

export function refusalForPublishSlot(check: PublishSlotCheck): string | null {
  const limit = concurrentPublishLimit(check.plan);
  if (check.activeCount < limit) return null;
  return `发布名额已满：${PLAN_LABELS[check.plan]} 档同时最多公开发 ${limit} 个项目，现在已有 ${check.activeCount} 个挂着。先把其中一个收回发布（切 private）再发；同一个项目换版本不占新名额。`;
}

/**
 * §133 teamCollaboration 那一格：一个项目除 owner 外能拉多少协作者（#201）。
 *
 * 与 `refusalForPublishSlot` 同一条口径，两处不同写下来：
 * - 这里数的是**人**（成员 + 没兑现的邀请），发布门数的是**项目**；
 * - owner 自己不算数：`PLAN_LIMITS.teamMembers` 是"除 owner 外还能拉几个人"，
 *   free=1 就是可以拉一个协作者。把 owner 算进去，free 档连自己都装不下。
 *
 * pending 邀请占名额：否则同一个邮箱可以刷出任意多封邀请，等额度松了再一次性兑现——
 * 门就白拦了。revoked 的邀请释放名额（它的使命结束了）。
 */
export interface TeamSlotCheck {
  plan: PlanKey;
  /** 已接受的成员数 + pending 邀请数，都不含 owner 自己 */
  activeCount: number;
}

export function teamMemberLimit(plan: PlanKey): number {
  return PLAN_LIMITS[plan].teamMembers;
}

export function refusalForTeamSlot(check: TeamSlotCheck): string | null {
  const limit = teamMemberLimit(check.plan);
  if (check.activeCount < limit) return null;
  return `协作名额已满：${PLAN_LABELS[check.plan]} 档每个项目除所有者外最多 ${limit} 人，现在成员加未兑现的邀请已有 ${check.activeCount} 个。先移除一个成员或撤回一封邀请；撤回与移除都立刻释放名额。`;
}
