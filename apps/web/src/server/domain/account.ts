import { and, desc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { apiTokens, projects, publishedProjects, sessions, users } from '../db/schema';
import { channels, getRealtimeBus } from '../realtime/bus';
import { recordAudit } from './audit';

/**
 * §144 的最后一格：注销账号。决定、理由与那六件事的完整清单在
 * `docs/adr/0025-account-deletion-closes-the-door.md`，这里只做，不重新论证。
 *
 * 四件 shaping 了下面写法的事实：
 * - **软删，不硬删**。`projects.ownerId` 是 `onDelete: 'restrict'`，硬删会被库挡住；
 *   而就算先把项目清掉，也会让别人的赞、评论与 Remix 血缘失去主语。`deletedAt` 打上一个时间戳，
 *   `email` 与 `handle` 原样留着——审计里那句"这个人做过什么"要指得到人，
 *   代价是同一个邮箱此后不能再注册一个新身份（ADR 决定一，刻意的）。
 * - **确认词是服务端判定的**，与 `softDeleteProject` 同一口径：不逐字匹配就一条都不写。
 * - **六件事是一个事务**。会话吊销了而用户行没写上，或者反过来，都比整个不做更糟
 *   （ADR 后果最后一条）。审计与停推送放在提交之后：一次回滚不该留下一行"注销成功"。
 * - **已发布的作品不跟着人走**。注销说的是"我不用这个平台了"，不是"让所有看过它的人再也看不到"；
 *   公开页继续可达，只有作者名换成"已注销的用户"（`publish.ts` / `profile.ts` 那两处读路径）。
 */

/**
 * 逐字比对的那一串是什么。ADR 写的是 handle，但 handle 到今天仍在**首次发布时**才生成
 * （`users.handle` 可空，界面上"你还没有可用于主页的地址"就是这一格），
 * 所以发布过的账号用 handle，没发布过的用展示名——两者都是界面上原样显示给用户的那串字，
 * 规则的形状没变（逐字输入属于自己的那个标识），变的只是取哪一列。
 */
export type ConfirmField = 'handle' | 'display_name';

/** 预览里最多列几个草稿名。数字只管界面长度，不管 `privateProjects` 那个数——后者永远是全量 */
export const DRAFT_PREVIEW_LIMIT = 12;

export interface DeletionPreview {
  confirmField: ConfirmField;
  confirmWord: string;
  /** 会被一起软删的私有草稿数（没有发布记录的那些） */
  privateProjects: number;
  /**
   * 会被软删的草稿，最多列 `DRAFT_PREVIEW_LIMIT` 个（带名字与 id，供界面上的导出入口用）。
   * ADR-0025 第二节第 2 件事说的是"在入口旁边提供导出，但不强制"：
   * 光有一个数字，人还得自己回项目列表一个个找，那就是把"顺手带走"变成了"自己想办法"。
   */
  drafts: { id: string; name: string }[];
  /** 上面那截是不是被切过——切过时界面要说"只列了前 N 个，一共 M 个"，不能让人以为那就是全部 */
  draftsTruncated: boolean;
  /** 留在原地的已发布作品数（按项目数，不是按版本数） */
  publishedWorks: number;
  liveSessions: number;
  liveApiTokens: number;
}

export interface DeletionCounts {
  privateProjectsSoftDeleted: number;
  publishedWorksKept: number;
  sessionsRevoked: number;
  apiTokensRevoked: number;
}

export type AccountDeletionOutcome =
  | { ok: true; counts: DeletionCounts }
  | { ok: false; code: 'not_found' }
  | { ok: false; code: 'already_deleted' }
  | { ok: false; code: 'approval_required'; confirmField: ConfirmField };

/** `getDb().transaction()` 回调里那个事务句柄（与 `domain/projects.ts` 同一写法，不另造一套类型） */
type AccountTx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/** 并发下有人先把这个人注销了：整个事务回滚，这次调用改口说"已经注销过了" */
class ConcurrentlyDeleted extends Error {}

interface Person {
  handle: string | null;
  displayName: string;
  deletedAt: Date | null;
}

async function personRow(userId: string): Promise<Person | undefined> {
  const [row] = await getDb()
    .select({ handle: users.handle, displayName: users.displayName, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row;
}

function confirmWordOf(person: Person): { field: ConfirmField; word: string } {
  return person.handle
    ? { field: 'handle', word: person.handle }
    : { field: 'display_name', word: person.displayName };
}

/**
 * "这条项目有没有发布过"的唯一说法：`published_projects` 里存在它的行。
 *
 * 预览的计数与真正执行的那条 UPDATE 必须共用这一句——两边口径不一致时，
 * 界面上写"会收起 3 个"而实际收起 4 个，那句预览本身就成了假话（§159）。
 * 子查询不带 owner 条件：外层已经按 `owner_id` 收窄，多带一个 join 只会让
 * 内层的 `projects` 别名挡住外层的同名引用，读的人要多想一步才知道谁是谁。
 */
const publishedProjectIds = () => getDb().select({ id: publishedProjects.projectId }).from(publishedProjects);

/** 会被软删的那一半：还在（没进过回收站）且从没发布过 */
const unpublishedLiveProjects = (userId: string) =>
  and(eq(projects.ownerId, userId), isNull(projects.deletedAt), notInArray(projects.id, publishedProjectIds()));

/** 留在原地的那一半：还在且发布过。两个数加起来正好是"他名下还活着的项目" */
export async function accountDeletionSummary(userId: string): Promise<DeletionPreview | null> {
  const person = await personRow(userId);
  if (!person || person.deletedAt) return null;
  const db = getDb();
  const [privateRows, publishedRows, sessionRows, tokenRows] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(unpublishedLiveProjects(userId))
      .orderBy(desc(projects.updatedAt)),
    db
      .select({ n: sql<number>`count(distinct ${publishedProjects.projectId})::int` })
      .from(publishedProjects)
      .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
      .where(and(eq(projects.ownerId, userId), isNull(projects.deletedAt)))
      .then((rows) => rows[0]?.n ?? 0),
    db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).then((rows) => rows.length),
    db
      .select({ id: apiTokens.id })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
      .then((rows) => rows.length),
  ]);
  const { field, word } = confirmWordOf(person);
  return {
    confirmField: field,
    confirmWord: word,
    privateProjects: privateRows.length,
    drafts: privateRows.slice(0, DRAFT_PREVIEW_LIMIT),
    draftsTruncated: privateRows.length > DRAFT_PREVIEW_LIMIT,
    publishedWorks: publishedRows,
    liveSessions: sessionRows,
    liveApiTokens: tokenRows,
  };
}

/**
 * ADR-0025 那六件事的**执行体**：收起私有草稿、数清留下的已发布作品、吊销全部会话与 API 令牌、
 * 最后给 `users.deletedAt` 打时间戳。它只执行，不判定——"凭什么做这件事"永远是调用方的事：
 * 自助注销那条路先要逐字确认串（`deleteAccount`），平台代做的那条路（过期访客回收，ADR-0072）
 * 要的是审核员身份加一条审计。抽出来而不是复制一份，是因为两边各自漏掉一件都会留下
 * "会话没了、人还在"那种比整个不做更糟的半截；复制的第二份尤其容易只写四件。
 *
 * 事务由调用方开着：批量回收要把一批人放在一个事务里（回滚就一起回滚，
 * 界面上那句"这一轮收走了 N 个"才与库里的样子对得上）。
 */
export async function runAccountDeletion(tx: AccountTx, userId: string, at: Date): Promise<DeletionCounts> {
  // 先收起私有草稿：这一步与下面的"留在原地"共用同一句判定，写序不影响两个数的和
  const softDeleted = await tx
    .update(projects)
    .set({ deletedAt: at })
    .where(unpublishedLiveProjects(userId))
    .returning({ id: projects.id });
  const [kept] = await tx
    .select({ n: sql<number>`count(distinct ${publishedProjects.projectId})::int` })
    .from(publishedProjects)
    .innerJoin(projects, eq(projects.id, publishedProjects.projectId))
    .where(and(eq(projects.ownerId, userId), isNull(projects.deletedAt)));
  // 会话只存哈希（§80），删行就是吊销；这一档是"全部"，不是登出那一个
  const revokedSessions = await tx.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
  const revokedTokens = await tx
    .update(apiTokens)
    .set({ revokedAt: at })
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .returning({ id: apiTokens.id });
  // 最后一步才写用户行，且把"还没被人注销过"写在谓词里：并发点到两次时，
  // 后一次在这里拿到 0 行并抛出去，整个事务回滚——而不是留下"会话没了、人还在"的半截
  const claimed = await tx
    .update(users)
    .set({ deletedAt: at, updatedAt: at })
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .returning({ id: users.id });
  if (!claimed.length) throw new ConcurrentlyDeleted();
  return {
    privateProjectsSoftDeleted: softDeleted.length,
    publishedWorksKept: kept?.n ?? 0,
    sessionsRevoked: revokedSessions.length,
    apiTokensRevoked: revokedTokens.length,
  };
}

/**
 * 注销这件事本身。返回的四个计数就是审计 detail 里的那四个数——
 * 读审计的人不该再去翻当时的代码才知道"到底带走了几个、留下了几个"。
 */
export async function deleteAccount(userId: string, confirmWord: string): Promise<AccountDeletionOutcome> {
  const person = await personRow(userId);
  if (!person) return { ok: false, code: 'not_found' };
  if (person.deletedAt) return { ok: false, code: 'already_deleted' };

  const { field, word } = confirmWordOf(person);
  if (word !== confirmWord.trim()) {
    await recordAudit({
      actorId: userId,
      action: 'user.delete',
      targetType: 'user',
      targetId: userId,
      allowed: false,
      detail: { reason: 'confirm_mismatch', field },
    });
    return { ok: false, code: 'approval_required', confirmField: field };
  }

  const at = new Date();
  let counts: DeletionCounts;
  try {
    counts = await getDb().transaction((tx) => runAccountDeletion(tx, userId, at));
  } catch (error) {
    if (error instanceof ConcurrentlyDeleted) return { ok: false, code: 'already_deleted' };
    throw error;
  }

  await recordAudit({
    actorId: userId,
    action: 'user.delete',
    targetType: 'user',
    targetId: userId,
    allowed: true,
    detail: { ...counts, field },
  });
  // 第六件：这个人还开着的连接不该再收到推送。停的是推送，不是那条 HTTP 连接本身
  // （今天没有从服务端掐断长连接的原语，限度写在 `realtime/bus.ts` 那一格的注释里）。
  getRealtimeBus().closeChannel(channels.user(userId));
  return { ok: true, counts };
}
