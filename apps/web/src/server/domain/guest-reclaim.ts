import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { apiTokens, projects, publishedProjects, sessions, users } from '../db/schema';
import { channels, getRealtimeBus } from '../realtime/bus';
import { recordAudit } from './audit';
import { runAccountDeletion, type DeletionCounts } from './account';
import { isAdmin } from './roles';

/**
 * 过期访客身份的回收（ADR-0072）。要回答的是第二十六片留在 ROADMAP 上的那句
 * "库里现存的 guest 行——谁来扫、留多久、怎么不误伤正在用的浏览器会话"。
 *
 * 三件事 shaping 了下面的写法，逐条的理由都在 ADR 里，这里只留口径：
 *
 * - **留多久 = 60 天沉默，不是 30 天**。会话本身活 30 天（`SESSION_DAYS`），而且人一回来看都没看
 *   就被 `requireUser()` 续期（滑窗）。所以真正判据是"最后一条会话过期**再往后** grace 天"，
 *   今天的默认值是 30 + 30。界面上说"两个月"而不是"30 天"，因为后者是让人误算的。
 * - **软删，走 ADR-0025 那六件事**，与自助注销同一个执行体（`runAccountDeletion`）。
 *   硬删会撞 40 处外键，也会让别人的赞、评论与 Remix 血缘失去主语。
 * - **不判定"该不该做"，只判定"这个人算不算过期访客"**。授权在调用方：管理端点是审核员 + CSRF，
 *   运维脚本是"能碰库的人"。这里不放确认串那一关——确认串证明的是"坐在键盘前的人认得自己的标识"，
 *   而被回收的那个人根本不存在。用程序算出来的确认串去满足那道检查是假装有门（§159）。
 */

/** 沉默多久才算"这个人不会回来了"。单位是日，与会话寿命同量级，理由见上面第二条 */
export const GUEST_RECLAIM_GRACE_DAYS = 30;
/** 一次最多收走几个。数字管的是"一次点击别把库锁住太久"，不是策略 */
export const GUEST_RECLAIM_DEFAULT_BATCH = 50;
export const GUEST_RECLAIM_MAX_BATCH = 200;
/** 一趟最多看多少个沉默身份。撞到这个数时界面上要说"只数了前 N 个"，不能报全量 */
const SCAN_LIMIT = 1000;

export type GuestStaleReason =
  /** 有过会话，最后一条已经过期到线 */
  | 'expired'
  /** 一条会话都不曾有过：多半是建身份那两步之间断掉的，或会话被别处清了 */
  | 'orphan';

export interface GuestReclaimCandidate {
  id: string;
  name: string;
  handle: string | null;
  createdAt: string;
  /** 最后一条会话的到期时刻；`orphan` 那一种是 null */
  lastExpiry: string | null;
  reason: GuestStaleReason;
  /** 会被一起软删的私有草稿数——口径与 `accountDeletionSummary.privateProjects` 同一句判定 */
  drafts: number;
}

export interface GuestReclaimScan {
  now: string;
  /** 时间线：`now - graceDays`。会话过期时刻与账龄都比着它判 */
  cutoff: string;
  graceDays: number;
  batch: number;
  /** 沉默到线的 guest 一共几个（**含**下面两类被排除的） */
  stale: number;
  /** 其中发布过作品的：这一轮不碰，理由见 `ownsPublishedWork` */
  skippedPublished: number;
  /** 其中还握着有效 API 令牌的：有人拿脚本在用这个身份，不当它是过期访客 */
  skippedLiveToken: number;
  /** 真正够格的，最多 `batch` 个 */
  candidates: GuestReclaimCandidate[];
  /** 够格的比 batch 多（下一轮再收剩下的） */
  moreThanBatch: boolean;
  /** 够格的比 SCAN_LIMIT 多——那时上面几个数都只 covering 前 SCAN_LIMIT 个 */
  scanTruncated: boolean;
}

export interface GuestReclaimOutcome {
  scan: GuestReclaimScan;
  dryRun: boolean;
  /** 真的收走了的那些人，一个一个带计数 */
  reclaimed: { id: string; name: string; counts: DeletionCounts }[];
  /** 锁上再判一次之后发现不算了（并发里有人回来了 / 刚发布过东西）：这一轮跳过的人数 */
  skippedUnderLock: number;
}

/** 与 `setUserRole` 同一形状：状态码与原因码都在域里定，路由只把它翻译成 HTTP */
export type GuestReclaimResult =
  | ({ ok: true } & GuestReclaimOutcome)
  | { ok: false; status: 403; code: 'forbidden'; reason: string };

/**
 * 会话链上的三句判定，抽出来是因为扫描与"锁上再判一次"必须是同一句，抄两遍迟早漂。
 *
 * 两处写法上的约束，都不是审美：
 * - 外层那个 `users` 主键写成限定名。drizzle 在 **select 清单**里会把 `${users.id}` 落成不带表名的
 *   `"id"`，而关联子查询里那正是"子查询自己那张表的 id"——数出来的草稿会成别人的。`toSQL()` 可查。
 * - 时间参数传 ISO 字符串而不是 `Date`。裸 `sql` 片段不做列类型序列化，`Date` 会一路撞到
 *   postgres.js 的 `Bind` 才炸（列上的比较，比如 `lt(users.createdAt, …)`，走 drizzle 的序列化，没事）。
 */
const outerUserId = sql`"users"."id"`;
const stamp = (value: Date): string => value.toISOString();

const noLiveSession = (now: Date) =>
  sql`not exists (select 1 from ${sessions} s where s.user_id = ${outerUserId} and s.expires_at > ${stamp(now)})`;

const lastExpiry = sql`(select max(s.expires_at) from ${sessions} s where s.user_id = ${outerUserId})`;

/** 沉默：从没有过会话，或者最后一条在 cutoff 之前就烂在那儿了 */
const staleFor = (cutoff: Date) => sql`(${lastExpiry} is null or ${lastExpiry} < ${stamp(cutoff)})`;

/**
 * 名下有已发布作品。这一条把人在候选里**剔出去**而不是照常收走：
 * 注销是本人决定的时候，"作品留下、作者名换成已注销的用户"是 ADR-0025 决定二；
 * 但自动回收不是他的决定，让一个没登录过的匿名身份把公开页上的作者名换成"已注销的用户"，
 * 是替读者做了一件没人授权的事。这一格宁可不收，也要留给一个能负责的人。
 */
const ownsPublishedWork = sql`exists (
  select 1 from ${publishedProjects} pp join ${projects} p on p.id = pp.project_id where p.owner_id = ${outerUserId}
)`;

/** 还有效的 API 令牌：guest 也能建令牌，那说明这个身份正在被脚本用，"过期"这话不成立 */
const holdsLiveToken = (now: Date) => sql`exists (
  select 1 from ${apiTokens} t
  where t.user_id = ${outerUserId} and t.revoked_at is null and (t.expires_at is null or t.expires_at > ${stamp(now)})
)`;

/**
 * 候选谓词。四条都在库里判，不留给调用方自觉：
 * - `guest` 为真：认领过的账号（`auth.ts` 那一步把 `guest` 置回 false 并写 `claimedAt`）
 *   从这一条起就与回收无关，注册这个动作本身就是护身符；
 * - `role = 'creator'`：万一有人手改过库把 guest 提成了审核员，那行不该被一个清扫收走；
 * - 账龄过线：`created_at < cutoff`。这一条看着多余（没有会话的判据已经含在里面），
 *   它挡的是 `createUserSession()` 那两步之间——插入用户行与插入会话行不在一个事务里，
 *   一个刚出生的 guest 在中间那一瞬正是"零会话"的形状；
 * - 没注销过。已经软删的人不需要再收一次。
 */
function staleGuestWhere(now: Date, cutoff: Date) {
  return and(
    eq(users.guest, true),
    isNull(users.deletedAt),
    eq(users.role, 'creator'),
    lt(users.createdAt, cutoff),
    noLiveSession(now),
    staleFor(cutoff),
  );
}

export function guestReclaimCutoff(now: Date, graceDays: number): Date {
  return new Date(now.getTime() - graceDays * 86_400_000);
}

/**
 * 数一遍：谁沉默够了、谁被排除在外。**一个字都不写**。
 *
 * 界面先要能问这个问题，才谈得上按那个按钮。第二十七片的教训也在这儿：
 * 读数只算这一趟自己点名的行，`reclaimed` 里每一个 id 都是这趟列出来的，
 * 不与"库里此刻有几个 guest"混着说。
 */
export async function scanGuestReclaimCandidates(input?: {
  now?: Date;
  graceDays?: number;
  batch?: number;
}): Promise<GuestReclaimScan> {
  const now = input?.now ?? new Date();
  const graceDays = Math.max(1, Math.trunc(input?.graceDays ?? GUEST_RECLAIM_GRACE_DAYS));
  const batch = clampBatch(input?.batch);
  const cutoff = guestReclaimCutoff(now, graceDays);

  const rows = await getDb()
    .select({
      id: users.id,
      name: users.displayName,
      handle: users.handle,
      createdAt: users.createdAt,
      lastExpiry: sql<Date | null>`(select max(s.expires_at) from ${sessions} s where s.user_id = ${outerUserId})`,
      published: sql<boolean>`${ownsPublishedWork}`,
      liveToken: sql<boolean>`${holdsLiveToken(now)}`,
      drafts: sql<number>`(
        select count(*) from ${projects} p
        where p.owner_id = ${outerUserId} and p.deleted_at is null
          and p.id not in (select project_id from ${publishedProjects})
      )::int`,
    })
    .from(users)
    .where(staleGuestWhere(now, cutoff))
    .orderBy(asc(users.createdAt))
    .limit(SCAN_LIMIT);

  const skippedPublished = rows.filter((r) => r.published).length;
  const skippedLiveToken = rows.filter((r) => !r.published && r.liveToken).length;
  const eligible = rows.filter((r) => !r.published && !r.liveToken);

  return {
    now: now.toISOString(),
    cutoff: cutoff.toISOString(),
    graceDays,
    batch,
    stale: rows.length,
    skippedPublished,
    skippedLiveToken,
    candidates: eligible.slice(0, batch).map((r) => ({
      id: r.id,
      name: r.name,
      handle: r.handle,
      createdAt: r.createdAt.toISOString(),
      lastExpiry: r.lastExpiry ? new Date(r.lastExpiry).toISOString() : null,
      reason: r.lastExpiry ? 'expired' : 'orphan',
      drafts: r.drafts,
    })),
    moreThanBatch: eligible.length > batch,
    scanTruncated: rows.length >= SCAN_LIMIT,
  };
}

function clampBatch(value: number | undefined): number {
  const n = Math.trunc(value ?? GUEST_RECLAIM_DEFAULT_BATCH);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, GUEST_RECLAIM_MAX_BATCH);
}

/**
 * 执行。`dryRun` 为真时只数不写（与 `scanGuestReclaimCandidates` 同一份谓词，所以两次的数不会打架）。
 *
 * 一批一个事务：中途任何一次失败，这一批一条都不写，界面拿到的"收走了几个"就是库里真的少了几个。
 * 每个人在写之前都要**锁上自己那一行再判一次**（`stillReclaimable`）——扫描与执行之间隔着几毫秒到
 * 几秒，那里面够一个浏览器回来了。
 *
 * 授权判在这里而不是判在路由里（与 `setUserRole` 同一口径）：下一个入口——CLI、批量导入、
 * 别人临时写的那支脚本——照抄这条才不会被漏掉。
 */
export async function reclaimExpiredGuests(input: {
  /** 谁按的这个按钮。审计里的那个主语，不是可省的装饰 */
  actorId: string | null;
  now?: Date;
  graceDays?: number;
  batch?: number;
  dryRun?: boolean;
}): Promise<GuestReclaimResult> {
  if (!(await isAdmin(input.actorId))) {
    // 被拒绝的那一次才最需要留下痕迹（audit.ts 第二条纪律）。没有身份就不记：
    // 一个连会话都没有的探测不该往审计表里堆行——那是账号枚举的清单。
    if (input.actorId) {
      await recordAudit({
        actorId: input.actorId,
        action: 'user.reclaim',
        targetType: 'user',
        targetId: null,
        allowed: false,
        detail: { reason: 'not_admin', dryRun: Boolean(input.dryRun) },
      });
    }
    return { ok: false, status: 403, code: 'forbidden', reason: '只有审核员能回收过期访客' };
  }

  const now = input.now ?? new Date();
  const graceDays = Math.max(1, Math.trunc(input.graceDays ?? GUEST_RECLAIM_GRACE_DAYS));
  const scan = await scanGuestReclaimCandidates({ now, graceDays, batch: input.batch });
  if (input.dryRun || !scan.candidates.length) {
    return { ok: true, scan, dryRun: Boolean(input.dryRun), reclaimed: [], skippedUnderLock: 0 };
  }

  const at = new Date();
  const cutoff = guestReclaimCutoff(now, graceDays);
  const ids = scan.candidates.map((c) => c.id);
  const nameOf = new Map(scan.candidates.map((c) => [c.id, c.name]));

  const written = await getDb().transaction(async (tx) => {
    const done: { id: string; counts: DeletionCounts }[] = [];
    let skippedUnderLock = 0;
    for (const id of ids) {
      if (!(await stillReclaimable(tx, id, now, cutoff))) {
        skippedUnderLock += 1;
        continue;
      }
      done.push({ id, counts: await runAccountDeletion(tx, id, at) });
    }
    return { done, skippedUnderLock };
  });

  // 审计与停推送都在提交之后：一次回滚不该留下一行"收走了"（与 deleteAccount 同一序）
  for (const row of written.done) {
    await recordAudit({
      actorId: input.actorId,
      action: 'user.reclaim',
      targetType: 'user',
      targetId: row.id,
      allowed: true,
      detail: { ...row.counts, graceDays, dryRun: false, sweep: true },
    });
    getRealtimeBus().closeChannel(channels.user(row.id));
  }

  return {
    ok: true,
    scan,
    dryRun: false,
    reclaimed: written.done.map((row) => ({ id: row.id, name: nameOf.get(row.id) ?? '', counts: row.counts })),
    skippedUnderLock: written.skippedUnderLock,
  };
}

/**
 * 锁上再判一次。`for update` 锁的是 `users` 那一行：并发的会话写入要在这把锁后面排队，
 * 于是"扫描时没人、写的时候有人回来了"这个窗口是**关在库里**的，不是靠两边的时间戳对齐。
 *
 * 拿不到行 = 此刻不算了。这一轮跳过它，下一轮再判；不抛错，因为一个回来的浏览器不该让整批回滚。
 */
async function stillReclaimable(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0],
  id: string,
  now: Date,
  cutoff: Date,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), staleGuestWhere(now, cutoff), sql`not ${ownsPublishedWork}`, sql`not ${holdsLiveToken(now)}`))
    .limit(1)
    .for('update');
  return Boolean(row);
}
