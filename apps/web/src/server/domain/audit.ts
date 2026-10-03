import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { auditEvents, users } from '../db/schema';

/**
 * §80 / §84 的审计事件。`audit_events` 这张表建库起就有，注释写着"含被拒绝的越权尝试"，
 * 但**全库没有一处写它**——也就是说"谁试过做什么、被挡了"这件事一直只存在于服务器的瞬时响应里，
 * 关掉窗口就没证据了。这一片补的就是那个写入方。
 *
 * 三条纪律：
 * - **记的是决定，不是流水账**。只在这几个地方写：一次授权判定（放行 / 拒绝）与一次会改变权限或
 *   内容可见性的动作。把每次读都记下来，表会在几天里变成没人读的噪音，真出事时反而找不到那几行。
 * - **不记凭据与隐私**。detail 里放判定需要的东西（角色、目标、原因码），不放口令、不放邮箱，
 *   失败的登录尝试连"试的是哪个账号"都不记——那张表本身就会变成账号枚举的清单。
 * - **写失败不改变请求结果**。审计是旁证，不是业务前提：让它抛异常等于"日志库抖一下，
 *   审核员就点不动放行"。返回 false 并打到 stderr，让它在服务端日志里看得见。
 */

/**
 * 账号注销之后，公开面上对那个人的称呼（ADR-0025 决定二）。
 *
 * 只有这一处写这串字：审计页、公开作品页与创作者主页都从这里取。同一个意思在四个文件里
 * 各抄一遍，改日换措辞就会变成"有的页面说注销、有的页面还挂着真名"那种不一致。
 * 放在 audit.ts 而不是 account.ts：注销是**写入方**的事，而这一串是**读出来怎么显示**的事，
 * 且 account.ts 要用 recordAudit——反过来 import 就成一个循环。
 */
export const DELETED_USER_LABEL = '已注销的用户';

export interface AuditInput {
  /** 做这件事的人；被拒绝的登录尝试没有身份，是 null */
  actorId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  allowed: boolean;
  detail?: unknown;
  ip?: string | null;
}

export interface AuditEntry {
  id: number;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  allowed: boolean;
  detail: unknown;
  hasIp: boolean;
  createdAt: string;
}

export async function recordAudit(input: AuditInput): Promise<boolean> {
  try {
    await getDb()
      .insert(auditEvents)
      .values({
        actorId: input.actorId,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        allowed: input.allowed,
        detail: (input.detail ?? null) as never,
        ip: input.ip ?? null,
      });
    return true;
  } catch (error) {
    // 审计写不上不影响这次请求的结论，但也不能静默：这一行就是"证据没留下"这件事本身的证据
    console.error('[audit] 写入失败', input.action, error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * 最近的事件。`hasIp` 而不是 ip 本身：这一页给审核员看"谁被挡了"，
 * 精确 IP 是定位滥用才需要的东西，先留在库里而不是默认摊在页面上。
 */
export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  const take = Math.min(Math.max(Math.trunc(limit) || 1, 1), 500);
  const rows = await getDb()
    .select({
      id: auditEvents.id,
      actorId: auditEvents.actorId,
      actorName: users.displayName,
      action: auditEvents.action,
      targetType: auditEvents.targetType,
      targetId: auditEvents.targetId,
      allowed: auditEvents.allowed,
      detail: auditEvents.detail,
      ip: auditEvents.ip,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorId))
    .orderBy(desc(auditEvents.id))
    .limit(take);
  return rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    // 这一格管的是"行读不出来"（归档或硬删），不是"账号注销了"：注销按 ADR-0025 是软删，
    // 名字照旧留在这里——审计要回答的是"这件事是谁做的"，把名字换成一句泛称就答不了了。
    // 公开面上才用 DELETED_USER_LABEL（publish.ts / profile.ts）
    actorName: row.actorName ?? (row.actorId ? DELETED_USER_LABEL : null),
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    allowed: row.allowed,
    detail: row.detail,
    hasIp: row.ip !== null,
    createdAt: row.createdAt.toISOString(),
  }));
}
