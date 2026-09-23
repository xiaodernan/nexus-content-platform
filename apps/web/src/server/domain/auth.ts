import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { projects, users } from '../db/schema';
import { hashPassword, verifyPassword } from './password';
import { rotateSession, toCurrentUser, type CurrentUser } from './session';

/**
 * 注册 / 登录 / 认领 的领域逻辑（§137 免注册首次体验的后半段）。
 *
 * 认领用「就地升级」：guest 的项目、快照、资产全部挂在这个 user id 下，
 * 注册时把同一行从 guest 改成真实账号（写 email / password_hash / claimed_at、
 * guest=false），归属一条都不用搬，自然不会漏。若当前会话已经是真实账号，
 * 直接拒绝，不覆盖已有邮箱。
 */

export type AuthError =
  | { code: 'email_taken'; status: 409 }
  | { code: 'already_registered'; status: 409 }
  | { code: 'invalid_credentials'; status: 401 }
  | { code: 'no_identity'; status: 400 };

export interface Authenticated {
  user: CurrentUser;
  /** 轮换出的新会话 token，调用方负责写进 cookie。 */
  sessionToken: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findByEmail(email: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${email}`, isNull(users.deletedAt)))
    .limit(1);
  return row ?? null;
}

async function countProjects(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projects)
    .where(and(eq(projects.ownerId, userId), isNull(projects.deletedAt)));
  return row?.n ?? 0;
}

/**
 * 注册：把当前 guest 会话就地升级为真实账号。
 * guest 通过 requireUser 由调用方传入（Route Handler 已解析）。
 * 返回新会话 token（已轮换，防会话固定）与被认领的项目数。
 */
export async function register(
  current: CurrentUser,
  input: { email: string; password: string; displayName?: string },
  meta?: { currentToken?: string | null; userAgent?: string | null; ip?: string | null },
): Promise<AuthError | (Authenticated & { claimedProjects: number })> {
  if (!current.guest) return { code: 'already_registered', status: 409 };
  const email = normalizeEmail(input.email);
  if (await findByEmail(email)) return { code: 'email_taken', status: 409 };

  const passwordHash = await hashPassword(input.password);
  const db = getDb();
  const [updated] = await db
    .update(users)
    .set({
      email,
      passwordHash,
      displayName: input.displayName?.trim() || current.displayName,
      guest: false,
      claimedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(users.id, current.id))
    .returning();
  if (!updated) return { code: 'no_identity', status: 400 };

  // 提权时刻轮换会话：删掉旧 token 会话、发新 token，杜绝事先种下的固定会话。
  const sessionToken = await rotateSession(updated.id, meta?.currentToken ?? null, meta);
  return { user: toCurrentUser(updated), sessionToken, claimedProjects: await countProjects(updated.id) };
}

/** 登录：校验邮箱 + 口令，成功则轮换新会话（不认领历史 guest 项目，归属不搬）。 */
export async function login(
  input: { email: string; password: string },
  meta?: { currentToken?: string | null; userAgent?: string | null; ip?: string | null },
): Promise<AuthError | Authenticated> {
  const email = normalizeEmail(input.email);
  const user = await findByEmail(email);
  // 用户不存在也要跑一次 verifyPassword（内部有 dummy hash）以对齐时序，避免枚举邮箱。
  const ok = await verifyPassword(input.password, user?.passwordHash ?? null);
  if (!user || !ok) return { code: 'invalid_credentials', status: 401 };
  const sessionToken = await rotateSession(user.id, meta?.currentToken ?? null, meta);
  return { user: toCurrentUser(user), sessionToken };
}

export { countProjects };
