/**
 * Stage D — ops：审计条目与举报的客户端类型（预设计，受 ADR 0018 阻塞）。
 *
 * 纯前端，不引入 fetch、localStorage、session。所有字段均由服务端下发，客户端只读、只展示，
 * 不自行判定状态，不生成审计记录。
 *
 * v556 — **「预设计」这个词只对一半**：这个文件里的**词表**（`AUDIT_ACTIONS`/`REPORT_STATUSES`/
 * `REPORT_REASONS`）已经被真面板读了——`trail.ts` 用动词表建标签与筛选按钮、`Toolbar.tsx` 用它铺出
 * 审计轨迹的九个筛选、`reportBar.ts`/`ReportComposer.tsx` 用它铺出举报下拉的来由。v541 把词表对齐到
 * 服务端，却没人发现这个文件在整棵树里**只有一个 import 者：它自己的测试**——一道门给一份没人渲染的
 * 抄本发证书，用户在屏上看到的仍是别处手抄的词。行形状（`AuditEntry`/`Report`）仍按上面的规矩：只读、
 * 只展示。
 *
 * 与 ADR 0018 §60 一致：无 signedIn 徽章、无会话、无 cookie；消费者按 `assurance`
 * 自行判定数据价值，不凭客户端注释信任。
 */

import type { AccountId } from './community';
import type { Assurance } from './assurance';

/**
 * v556 — 服务端**已经记录**的九个动词，一张表，顺序就是 `AuditService.ACTIONS` 的声明顺序。
 *
 * 为什么写成数组而不是只写进类型：审计轨迹要把这些动词**铺成筛选按钮**（`Toolbar.tsx` 现在就是这么建的），
 * 而 `.map()` 运行时也得读得到词表——类型会被擦除。与 `REPORT_STATUSES` 同一个理由（v541）。
 *
 * 词表 keyed 的标签表一律用 `(typeof AUDIT_ACTIONS)[number]`（下面的 `AuditedAction`）作键，**不带**
 * `string` 臂：一旦带上，`Record<那个联合, X>` 就塌缩成字符串索引签名，缺一个标签照样编译通过——
 * 这正是 v541 那道 `TypeError` 能活三个版本的原因。
 */
export const AUDIT_ACTIONS = [
  'publish',
  'unpublish',
  'like',
  'unlike',
  'comment',
  'uncomment',
  'report',
  'withdraw-report',
  'acknowledge',
] as const;

/** 一个服务端已经记录的动词。所有按动词铺开的表都用它作键，于是缺词是**编译错误**而不是运行时漏出。 */
export type AuditedAction = (typeof AUDIT_ACTIONS)[number];

/**
 * What a verb can be.
 *
 * The KNOWN verbs are the union the product designs for; the `string & Record<never, never>` arm says the wire
 * may carry a verb this build has never heard of, and keeps the editor's completion for the known ones. That is
 * not speculation: the service is a SEPARATE deployable, so a verb can be added there before this client is
 * rebuilt, and a client that rejected the answer would show a gap instead of the event.
 *
 * v541 — the known set is the SERVICE's nine (`AuditService.ACTIONS`, v385) plus the three verbs this client
 * still designs for (`remix`/`follow`/`tip`), not the seven the Stage D pre-design happened to guess. The union
 * already ACCEPTED the other five through its unknown arm, which is why nothing failed to compile: the cost of
 * the short list was paid in the label table below, where five verbs the service records today had no words.
 * `docs/evidence/m9/audit-contract-proof.mjs` §8 now reads the nine out of `AuditService.java` and refuses a
 * client whose known set stops covering them.
 *
 * v556 — the nine上面那张表**是**这九个的来源：这里写 `(typeof AUDIT_ACTIONS)[number]`，不再是九个手抄的
 * 字面量。门（§8）改读那张表；读一个类型联合只能证明「抄本此刻与 Java 相等」，读表才能证明面板铺出来的
 * 就是这张表。
 */
export type AuditAction =
  | AuditedAction
  // 下面三个是**客户端还在设计、服务端尚未记录**的动词（v541 按 `AuditService.ACTIONS` 实测区分）。
  | 'remix'
  | 'follow'
  | 'tip'
  // 一个**这个版本还不认识的**动词。`Record<never, never>` 与 `string` 相交，编辑器仍然为上面那些
  // 已知动词给出补全，但类型上不排斥别的字符串。
  | (string & Record<never, never>);

/**
 * v384 — 审计条目的目标"种类"：account / plan / publication。
 *
 * 服务端只接受这三个（闭集，`AuditService` 在写入时按名字拒绝第四个），所以线上永远只会出现这三个值；
 * `string & Record<never, never>` 那一臂与 `AuditAction` 同理——服务端是独立部署的，一个更早就加了
 * 新种类的服务端不能让整个客户端编译不过。客户端只读、只展示，不自行判定。
 */
export type AuditTargetType =
  | 'account'
  | 'plan'
  | 'publication'
  | (string & Record<never, never>);

/** 审计条目：由服务端写入并下发，客户端只做只读展示。 */
export interface AuditEntry {
  id: string;
  action: AuditAction;
  /**
   * 谁做的。**可空**：匿名发布没有人名，服务端如实记录"没有人"而不是编一个（v271）。
   *
   * 这个类型以前写的是 `AccountId`（非空），那是客户端的愿望而不是线格式的事实——服务端不会为了
   * 迎合一个类型而伪造 actor，所以该改的是类型（v273）。
   */
  actorId: AccountId | null;
  targetId: string;
  /**
   * v384 — 这条条目发生在什么"种类"的东西上：账号、plan 还是作品。
   *
   * **不可空**，与 `actorId`/`assurance` 相反：服务端在写入时就要求声明种类（闭集之外的按名字拒绝），
   * 线上每一条都带。客户端把它声明成可空就是在声明一个服务端从不会发送的形状——v273 的对称规则：
   * 服务端总是发送的字段，客户端没有权利当它可选。
   */
  targetType: AuditTargetType;
  createdAt: number;
  /**
   * 这一条值多少。**可空**，理由同 `actorId`：没有 actor 就没有 claim，也就没有 assurance 可说。
   */
  assurance: Assurance | null;
}

/**
 * v541 — 举报的"状态"闭集：照抄服务端 `ReportDtos` 的 STATUS_*，顺序也是它声明的顺序。
 *
 * 这个数组是客户端唯一的词表来源：下面的 `reportsByStatus`/`reportStatsText` 用它建桶，
 * `docs/evidence/m9/audit-contract-proof.mjs` §8 把它和 Java 里的常量逐一对账。写成数组而不是只写进类型，
 * 是因为"分桶必须对每个值都存在"这条规则需要运行时也读得到词表——类型层做不到（见下）。
 *
 * `reviewed`/`resolved` 在服务端只是**声明**：`ReportDtos` 的 javadoc 说它们是"管理员的词汇，而这个版本
 * 没有管理员，所以是有意不可达"。客户端仍然给它们留桶——一个更早就加了管理员的服务端要能落进来，
 * 而丢掉一个服务端已经命名的词正是 v541 要修的缺陷。
 */
export const REPORT_STATUSES = ['open', 'reviewed', 'resolved', 'rejected', 'acknowledged'] as const;

/**
 * 举报的"原因"闭集：服务端 `ReportDtos` 的 REASON_* 四个。
 *
 * v556 — 这里**只有一份**：`reportBar.ts` 以前自己也声明了一个同样四个词的 `REPORT_REASONS`，而用户点的那个
 * 下拉是从**那一份**铺出来的（`ReportComposer.tsx`）。§8 与 Java 对账的是这一份，所以门给一份没人读的抄本发
 * 证书，另一份随便改都不会红。现在 `ReportComposer.tsx` 与 `reportBar.ts` 都从这里读。
 */
export const REPORT_REASONS = ['spam', 'harassment', 'illegal', 'other'] as const;

/**
 * 状态：服务端声明的五个，加上一个**这个版本还不认识的**字符串臂。
 *
 * 字符串臂不是宽容，是事实：服务端是独立部署的。但它也是这个缺陷能被编译期藏起来的原因——
 * `Record<Report['status'], …>` 在这种联合上塌缩成一个字符串索引签名，于是
 * `out[r.status].push(r)` 类型检查通过、运行时在 `acknowledged`（v304 起真的会下发）上抛
 * `TypeError`。所以分桶的返回类型明写 `Record<string, …>`，由代码自己保证桶一定在。
 */
export type ReportStatus = (typeof REPORT_STATUSES)[number] | (string & Record<never, never>);

/** 原因：与服务端同名的四个，加上同一个未知臂。今天四个都是可达的（`ReportController` 按闭集拒绝第四个之外的）。 */
export type ReportReason = (typeof REPORT_REASONS)[number] | (string & Record<never, never>);

/** 举报：reporterId/targetId/createdAt 由客户端填写并发给服务端；status 由服务端更新下发。 */
export interface Report {
  id: string;
  reporterId: AccountId;
  targetId: string;
  reason: ReportReason;
  detail: string;
  status: ReportStatus;
  createdAt: number;
}

/**
 * v586 — 「线上没有给状态」是第六种情况，它**不是**服务端那五个词里的任何一个。
 *
 * 修之前 `reportBar.ts` 与 `moderation.ts` 各写了一份 `typeof r.status === 'string' && r.status.length > 0 ? r.status : 'open'`：
 * 一条状态字段缺失的举报被折进服务端**声明过**的 `open`。在 HEAD 字节上跑真的行构造函数（`v586-prefix.out`），
 * 三个读者同时说错话——`statusText` 打印 "not acknowledged yet"（替属主宣布他还没看过），`open: true` 让属主的桌上
 * **长出一个 Acknowledge 按钮**（`ModerationService.acknowledge` 对非 `open` 的行返回 `moved=false`，客户端却邀请
 * 读者去按），`Toolbar.tsx` 的撤回按钮以 `status === 'open'` 为条件，而 `data-desk-status=""` 变成了 `="open"`。
 *
 * 它必须是**空串**而不是任何一个词：`REPORT_STATUSES` 里没有值等于它，所以任何「按声明状态统计」的桶都不会替服务端
 * 认领这条行；`reportStatusText` 对它另有一句话。
 */
export const REPORT_STATUS_NOT_GIVEN = '';

/**
 * v586 — 每个声明状态在读者嘴里的说法，**整个客户端只有这一份**。
 *
 * 键是 `(typeof REPORT_STATUSES)[number]`，**不带**未知字符串臂——与 `reportsByStatus` 的返回类型故意相反：
 * 这里要的是「少一个词就编译不过」，那里要的是「线上来了个新词也不崩」（v541 的教训是同一枚硬币的两面）。
 *
 * `reviewed`/`resolved` 的措辞点名了「moderator」，因为 `ReportDtos` 自己就是这么定义它们的（"a MODERATOR's
 * vocabulary, and this build has no moderator"）：这两个词今天不可达，而一个不可达的状态被读到的时候，读者
 * 应当看到服务端赋予它的动作方，而不是 `reviewed` 这个标识符本身——§9 早就按这条判过 ops 屏（"an ops screen
 * shows an identifier where it means a word"），只是那条判据一直只评到没人渲染的那一份。
 */
const REPORT_STATUS_WORDS: Record<(typeof REPORT_STATUSES)[number], string> = {
  open: 'not acknowledged yet',
  reviewed: 'a moderator has looked at it',
  resolved: 'a moderator settled it',
  rejected: 'withdrawn by the reporter',
  acknowledged: 'the owner has seen it',
};

/**
 * 服务端**还肯对它动手**的状态。修之前这里是**两份客户端口味**：`reportOpenCount` 数 `open`+`reviewed`，
 * 属主桌的 `open` 只数 `open`——同一个字面词在同一个客户端里有两个意思，而其中一个直接和线上的数字冲突
 * （`ModerationService.tallyOf` 的 `open` 是 `byStatus.getOrDefault(ReportDtos.STATUS_OPEN, 0L)`）。
 *
 * 现在按服务端定：`acknowledge` 和 `withdraw` 都写 `if (!ReportDtos.STATUS_OPEN.equals(row.getStatus()))` 就
 * 不动手，所以「还站着」恰好是 `open` 一个。`docs/evidence/m9/audit-contract-proof.mjs` §11.11 把这三处 Java
 * 读出来、RUN 下面的谓词，要求真值集合恰好等于 Java 里出现过的那些 `STATUS_*`——加一个词上去、或者少一个，
 * 都会红，而不是等下一次面板长错按钮。
 */
export const REPORT_STATUSES_STANDING: readonly string[] = ['open'];

/** 这条举报**还站着**：服务端仍然肯按它动手。属主桌上的 Acknowledge、reporter 的撤回入口都以它为前提。 */
export function reportStanding(status: string): boolean {
  return REPORT_STATUSES_STANDING.includes(status);
}

/** 这条举报是被**举报人自己收回**的——`ReportEntry.markRejected` 是唯一走到这里的写者。 */
export function reportWithdrawn(status: string): boolean {
  return status === 'rejected';
}

/**
 * v586 — 一窗行里**读不出立场**的那些，被数出来、被点名。
 *
 * <p>拒绝把缺状态折进 `open`（`REPORT_STATUS_NOT_GIVEN`）之后，多出一个客户端以前没法说的事实：读者眼前
 * 有几行**没有可读的立场**。把它们算进 `open` 是原来那个谎；把它们**悄悄不算**是同一个谎的反面——一个
 * 摘要数字如果既不数它也不说它，读者就被告知「其余都可读」。所以缺口要**数**，也要**说**。
 *
 * <p>`unknown` 是这一窗里出现过的、本客户端词表没有声明过的状态词（去重、按到达顺序）：一个更新的线上
 * 发了一个这个词表没听过的词时，读者要能看到**那个词本身**，而不是一个邻居的名字——§9 对未知值的
 * 「原样透出、不认领」规则在同一次读数里的披露版本。
 */
export interface StatusGaps {
  /** 这一窗里 `status` 完全没给的行数（即 `REPORT_STATUS_NOT_GIVEN`）。 */
  notGiven: number;
  /** 这一窗里出现的、本客户端词表没声明的状态词（去重，按到达顺序）。 */
  unknown: string[];
  /** 这一窗一共几行——句子要说的是「这些行里」的缺口。 */
  shown: number;
}

/** 数出一窗行里读不出立场的那些。词表取自**本模块自己**的 `REPORT_STATUSES`，读者不必抄第二份。 */
export function statusGaps(rows: ReadonlyArray<{ status: string }>): StatusGaps {
  let notGiven = 0;
  const unknown: string[] = [];
  for (const row of rows) {
    if (row.status === REPORT_STATUS_NOT_GIVEN) {
      notGiven += 1;
      continue;
    }
    if ((REPORT_STATUSES as readonly string[]).includes(row.status)) continue;
    if (!unknown.includes(row.status)) unknown.push(row.status);
  }
  return { notGiven, unknown, shown: rows.length };
}

/**
 * 缺口的读者措辞；**没有缺口时返回空串**，那时面板可以什么都不印。
 *
 * <p>措辞按**窗口**限定（v377 的教训）：「1 report has no status」是关于整张桌子的主张，而这份计数只看得见
 * 屏幕上这些行。空答案不是「关于缺口的沉默」——它是「没有缺口」这句陈述，也是面板唯一可以完全不说任何话的情形。
 */
export function statusGapText(gaps: StatusGaps): string {
  if (gaps.notGiven === 0 && gaps.unknown.length === 0) return '';
  const parts: string[] = [];
  if (gaps.notGiven > 0) parts.push(`${gaps.notGiven} arrived with no status at all`);
  if (gaps.unknown.length > 0) {
    parts.push(`${gaps.unknown.length} carry a status this build does not know (${gaps.unknown.join(', ')})`);
  }
  return `of these ${gaps.shown} rows: ${parts.join(' · ')}`;
}

/**
 * 举报状态的读者措辞，供客户端卡片/详情页直接使用。**这个客户端唯一的词面**（v586）。
 *
 * <p>修之前有两个同名导出：这里，和 `reportBar.ts` 的 `reportStatusText`。§8/§9 逐字对账的是**这一份**——
 * 而这一份在整棵树里只有一个读者（它自己的测试），面板真正画出去的那一份没人评分：在 HEAD 字节上两面对
 * 五个声明状态**全部不一致**（"Open" 对 "not acknowledged yet"）。v586 把词面收成一份，`reportBar.ts` 与
 * `moderation.ts` 都改成 import 这里，§11.7 再按「每个词面只有一个声明位」评分。
 *
 * <p>三条回答，各有各的依据：
 * <ul>
 *   <li><b>声明过的词</b>：读者措辞，绝不把 wire token 原样吐回去（§9 的规则，现在评到渲染面）。</li>
 *   <li><b>没听见的词</b>：原样传出，不折进任何邻居——折进去就是替服务端宣布它没宣布过的处置结果。</li>
 *   <li><b>线上没给的</b>（`REPORT_STATUS_NOT_GIVEN`）：说「没给」，不替服务端认领任何一个状态。</li>
 * </ul>
 */
export function reportStatusText(status: string): string {
  if (status === REPORT_STATUS_NOT_GIVEN) return 'the service gave no status';
  // 类型 `ReportStatus` 带未知字符串臂，编译器据此认为任何字符串都可能是声明过的词；运行时按词表判。
  if (!(REPORT_STATUSES as readonly string[]).includes(status)) return status;
  return REPORT_STATUS_WORDS[status as (typeof REPORT_STATUSES)[number]];
}

/**
 * 判断举报是否已终结（resolved/rejected），纯判断，供客户端决定是否显示“再举报”入口。
 *
 * v541 — `acknowledged` **不算终结**，这是服务端自己的区分：`ReportDtos` 的 javadoc 说“属主能如实说的
 * 只是他看到了——这是一个比 review 小得多的主张”。一条被确认看到的举报仍然站着，仍然可以撤销，
 * 所以“再举报”入口必须继续出现。
 */
export function isReportClosed(report: Report): boolean {
  return report.status === 'resolved' || report.status === 'rejected';
}

/** 把审计条目按目标过滤，并按 createdAt 降序（新→旧）返回。不改原数组。 */
export function auditEntriesForTarget(
  entries: ReadonlyArray<AuditEntry>,
  targetId: string,
): AuditEntry[] {
  return entries
    .filter((e) => e.targetId === targetId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** 把审计条目按 since（epoch ms）过滤，只保留 createdAt >= since 的，按 createdAt 降序返回。不改原数组。 */
export function auditEntriesSince(
  entries: ReadonlyArray<AuditEntry>,
  since: number,
): AuditEntry[] {
  return entries
    .filter((e) => e.createdAt >= since)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 按状态统计举报，例如 "open: 2, resolved: 1, rejected: 1"，供客户端摘要栏展示。
 *
 * v541 — 原来这张表是手抄的四个状态，`counts[r.status] += 1` 在服务端真会下发的 `acknowledged` 上
 * 读出 `undefined + 1 = NaN`，而 `NaN > 0` 是假，于是那一行**既不报错也不出现**：一条确认看到的举报
 * 会让摘要栏说 "No reports"。现在计数按到达的值开，声明过的五个排在前面（服务端的声明顺序），
 * 没见过的值追加在后面——一个词表更新过的服务端不会让任何一行消失。
 */
export function reportStatsText(reports: ReadonlyArray<Report>): string {
  const counts = new Map<string, number>();
  for (const status of REPORT_STATUSES) counts.set(status, 0);
  for (const r of reports) {
    const status = String(r.status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .filter(([, c]) => c > 0)
    .map(([s, c]) => `${s}: ${c}`);
  return parts.length ? parts.join(', ') : 'No reports';
}

/**
 * 还在等人处理的举报数量——按**服务端的**「还站着」数（`reportStanding`），供客户端摘要栏展示。
 *
 * <p>v586 — 修之前这里是 `open`+`reviewed`，而属主桌的同一个词只数 `open`，线上 `ModerationService.tallyOf`
 * 的 `open` 也只数 `ReportDtos.STATUS_OPEN`：客户端的摘要栏因此比它对接的服务端多算一个词，两面屏
 * 并排放着就是两个「还有多少要处理」的数字。`reviewed` 是 moderator 的词、这个构建没有 moderator，
 * 而且即便出现了也不是「没人动过」——有人已经看过了。
 *
 * v541 — `acknowledged` **两个计数都不算**，这是有意的：`reportOpenCount` 说“还没人动过”，
 * `reportResolvedCount` 说“已经处置完”，而属主确认看到既不是前者也不是后者（服务端原话：那是一个比
 * resolution 小得多的主张）。要让摘要栏一行都不丢，读 `reportStatsText`——它对整张词表是全覆盖的。
 */
export function reportOpenCount(reports: ReadonlyArray<Report>): number {
  return reports.filter((r) => reportStanding(String(r.status))).length;
}

/** 已处置举报数量（resolved/rejected），供客户端摘要栏展示。理由见 `reportOpenCount`。 */
export function reportResolvedCount(reports: ReadonlyArray<Report>): number {
  return reports.filter((r) => r.status === 'resolved' || r.status === 'rejected').length;
}

/**
 * 把审计动作映射为中文展示标签，供客户端卡片/列表直接使用。
 *
 * v541 — 补上服务端 v385 已经记录的五个动词。修之前线上每一条 `unlike`/`uncomment`/`report`/
 * `withdraw-report`/`acknowledge` 都被原样吐出英文 token（`default: return action`），而三个尚未被记录的
 * 动词倒是有标签——**标签表比词表宽，这是能测出来的**：`audit-contract-proof.mjs` §10 逐个动词断言
 * 标签不等于原 token，并把这个"客户端先标签、服务端后记录"的剩余差集原样打印出来。
 */
export function auditEntryLabel(action: AuditEntry['action']): string {
  switch (action) {
    case 'publish':
      return '发布';
    case 'unpublish':
      return '下架';
    case 'like':
      return '点赞';
    case 'unlike':
      return '取消点赞';
    case 'comment':
      return '评论';
    case 'uncomment':
      return '取消评论';
    case 'report':
      return '举报';
    case 'withdraw-report':
      return '撤销举报';
    case 'acknowledge':
      return '确认已阅';
    // 以下三个：客户端在设计，服务端还没有记录（v541 实测差集，见函数注释）。
    case 'remix':
      return '混改';
    case 'follow':
      return '关注';
    case 'tip':
      return '打赏';
    default:
      return action;
  }
}

/** 判断审计条目是否由给定账号产生，供客户端决定是否显示“撤销/申诉”入口。 */
export function isAuditEntryOwnedBy(entry: AuditEntry, actorId: AccountId | null): boolean {
  if (!actorId) return false;
  // v273 — 一条**匿名**条目没有 actor，所以它不属于任何人。把它算成“属于”某个账号会凭空造出一个
  // 主人，而审计轨迹的价值恰恰在于它不编造（v271）。
  if (entry.actorId === null) return false;
  return entry.actorId === actorId;
}

/**
 * 匿名条目的分桶键：一个**保留键**，不可能与真实账号 id 相同。
 *
 * 账号 id 由 `createAccountId` 生成，形如 `acct-<base36>`，永远不以 `__` 开头，所以这个键不可能撞上
 * 一个真人（v273）。
 */
export const ANONYMOUS_ACTOR = '__anonymous__';

/** 把审计条目按发起人分组，供客户端按代理/用户分栏展示。不改原数组。 */
export function auditEntriesByActor(entries: ReadonlyArray<AuditEntry>): Record<string, AuditEntry[]> {
  const out: Record<string, AuditEntry[]> = {};
  for (const e of entries) {
    // v273 — 匿名条目单独成桶。丢掉它们等于丢掉“有人做了事但没留名”这一事实；把它们塞进某个具名
    // 账号的桶里则是伪造归属。
    const key = e.actorId ?? ANONYMOUS_ACTOR;
    const bucket = out[key];
    if (bucket) {
      bucket.push(e);
    } else {
      out[key] = [e];
    }
  }
  return out;
}

/** 把审计条目按动作类型筛选，并按 createdAt 降序（新→旧）返回。不改原数组。 */
export function auditEntriesByAction(
  entries: ReadonlyArray<AuditEntry>,
  action: AuditEntry['action'],
): AuditEntry[] {
  return entries
    .filter((e) => e.action === action)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 把举报按原因分组，供客户端按原因分栏展示。不改原数组。
 *
 * v541 — 返回类型明写 `Record<string, …>`：原因联合带未知字符串臂时，`Record<Report['reason'], …>` 会塌缩
 * 成索引签名，于是 `out[r.reason].push(r)` 编译得过、遇到一个更新的词表就在运行时抛 `TypeError`。
 * 声明过的四个桶一定在（哪怕没有行），没见过的值自己成桶，不丢。
 */
export function reportsByReason(reports: ReadonlyArray<Report>): Record<string, Report[]> {
  return bucketReportsBy(reports, REPORT_REASONS, (r) => String(r.reason));
}

/**
 * 把举报按状态分组，供客户端按状态分栏展示（与 reportsByReason 对称）。不改原数组。
 *
 * v541 — 这条是今天就能撞上的：`ReportEntry.markAcknowledged`（v304）真的会把 `acknowledged` 发到线上，
 * 而修之前的桶表只有四个名字，`out['acknowledged'].push` 抛 `TypeError: Cannot read properties of undefined`。
 */
export function reportsByStatus(reports: ReadonlyArray<Report>): Record<string, Report[]> {
  return bucketReportsBy(reports, REPORT_STATUSES, (r) => String(r.status));
}

/**
 * 分桶：先按声明顺序把整张词表摆出来（读者要能看到“这个状态一条也没有”这一事实），再把没见过的值
 * 追加在末尾，按到达顺序。两个分组函数共用，规则只写一遍。
 */
function bucketReportsBy(
  reports: ReadonlyArray<Report>,
  vocabulary: readonly string[],
  key: (report: Report) => string,
): Record<string, Report[]> {
  const out: Record<string, Report[]> = {};
  for (const name of vocabulary) out[name] = [];
  for (const r of reports) {
    const k = key(r);
    const bucket = out[k];
    if (bucket) {
      bucket.push(r);
    } else {
      out[k] = [r];
    }
  }
  return out;
}