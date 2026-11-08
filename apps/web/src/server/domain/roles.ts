import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { users } from '../db/schema';
import { recordAudit } from './audit';
import { isUuid } from './ids';

/**
 * §131 那条"谁是 admin 目前只能由运维改库"的收口：把提权 / 降权变成一个有判定的动作。
 *
 * 三条规则都写在判定里而不是只写在界面上（界面会被人绕过，这一层不会）：
 * - **不能改自己的角色**。自己提权是"拿到这个会话的人就能变成审核员"的最短路径；
 *   自己降权则让"还有谁能提权"变成没有答案。两条都不给走。
 * - **guest 不给提权**。guest 身份是"新开一个浏览器就有"（§137），没有任何东西把它拴到一个人身上；
 *   把它提成 admin 等于把撤下内容的权力发给一个匿名会话，之后谁在那个浏览器上注册谁就接手。
 *   要提谁，先让他认领成有邮箱、有口令的账号。
 * - **改别人的前提是你此刻是 admin**，而且这一条在写库之前问，不靠前端把按钮藏起来。
 * - **每一次尝试都进审计**，成功和被拒都记。被拒绝的提权尝试恰恰是最该留下痕迹的那一类。
 * 顺带一条推论：不需要"最后一个 admin 不能降权"这种规则——能改别人的只有 admin，
 * 而 admin 改自己被挡住，所以"一个 admin 都不剩"从这条路径根本进不去（见 setUserRole 里那段注释）。
 */

export type Role = 'creator' | 'admin';
const ROLES: readonly Role[] = ['creator', 'admin'];

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}

export interface AccountRow {
  id: string;
  name: string;
  handle: string | null;
  role: Role;
  /** 当前档位（§133）。列在账号行上：改档位的入口就在同一行，读的人不用再点进去看 */
  plan: 'free' | 'pro' | 'creator' | 'studio' | 'enterprise';
  createdAt: string;
  /** 免注册首次体验的 guest 也列出来：提权事故最可能的来源就是"随手建的身份没被认领" */
  guest: boolean;
}

export async function isAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const [row] = await getDb().select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.role === 'admin';
}

export async function countAdmins(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.deletedAt)));
  return row?.n ?? 0;
}

export async function listAccounts(limit = 200): Promise<AccountRow[]> {
  const take = Math.min(Math.max(Math.trunc(limit) || 1, 1), 500);
  const rows = await getDb()
    .select({
      id: users.id,
      name: users.displayName,
      handle: users.handle,
      role: users.role,
      plan: users.plan,
      createdAt: users.createdAt,
      guest: users.guest,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))
    .limit(take);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    handle: row.handle,
    role: row.role as Role,
    plan: row.plan,
    createdAt: row.createdAt.toISOString(),
    guest: row.guest,
  }));
}

export type RoleResult =
  | { ok: true; targetId: string; previous: Role; role: Role; admins: number }
  | { ok: false; status: 403 | 404 | 400; code: string; reason: string };

/** 改一个账号的角色。所有判定都在这里，路由只负责把结果翻译成 HTTP 状态 */
export async function setUserRole(actorId: string, targetId: string, role: Role): Promise<RoleResult> {
  const db = getDb();
  const [actor] = await db.select({ role: users.role }).from(users).where(eq(users.id, actorId)).limit(1);
  if (actor?.role !== 'admin') {
    await recordAudit({
      actorId,
      action: 'user.role.change',
      targetType: 'user',
      targetId,
      allowed: false,
      detail: { reason: 'not_admin', wanted: role },
    });
    return { ok: false, status: 403, code: 'forbidden', reason: '只有审核员能改角色' };
  }
  if (targetId === actorId) {
    await recordAudit({
      actorId,
      action: 'user.role.change',
      targetType: 'user',
      targetId,
      allowed: false,
      detail: { reason: 'self_change', wanted: role },
    });
    return { ok: false, status: 400, code: 'self_change', reason: '不能改自己的角色：自己提权等于给会话被盗留了后门' };
  }
  // 形状不对的 id 按"没有这个账号"处理：eq(users.id, …) 会撞 22P02 变 500（domain/ids.ts）。
  // 与合法 UUID 但查不到是同一条答案——不给"存在但不给你看"留侧信道。
  if (!isUuid(targetId)) return { ok: false, status: 404, code: 'not_found', reason: '没有这个账号' };
  const [target] = await db
    .select({ role: users.role, guest: users.guest })
    .from(users)
    .where(eq(users.id, targetId))
    .limit(1);
  if (!target) return { ok: false, status: 404, code: 'not_found', reason: '没有这个账号' };
  if (target.guest && role === 'admin') {
    await recordAudit({
      actorId,
      action: 'user.role.change',
      targetType: 'user',
      targetId,
      allowed: false,
      detail: { reason: 'guest_target', wanted: role },
    });
    return {
      ok: false,
      status: 400,
      code: 'guest_unclaimed',
      reason: '这是未认领的 guest 身份：先让他注册认领，再谈提权',
    };
  }

  const previous = target.role as Role;
  // 这里刻意**没有**"最后一个 admin 不能被降权"那条规则——它是够不着的：
  // 能改别人角色的只有 admin，而 admin 改自己已经被上面的 self_change 挡住，
  // 所以"系统里一个 admin 都不剩"这个状态从这条路径进不去。
  // 写下这条不执行的分支只会让人以为它在工作（§159 的反面：给不存在的保护留一段代码）。
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, targetId));
  await recordAudit({
    actorId,
    action: 'user.role.change',
    targetType: 'user',
    targetId,
    allowed: true,
    detail: { from: previous, to: role },
  });
  return { ok: true, targetId, previous, role, admins: await countAdmins() };
}
