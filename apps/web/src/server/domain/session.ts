import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { sessions, users } from '../db/schema';
import { SESSION_COOKIE } from '../security/cookieNames';

export { SESSION_COOKIE };
export const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 会话 token：32 字节随机数的十六进制，浏览器/中间件与登录流程共用同一形状。 */
export function newSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface CurrentUser {
  id: string;
  displayName: string;
  email: string | null;
  guest: boolean;
  /** §131：谁能做人工裁决。默认拒绝——只有 'admin' 能进审核队列，其余一律 403 */
  role: 'creator' | 'admin';
}

/**
 * 免注册首次体验（§137）：没有有效会话时直接建一个 guest 用户，
 * 让用户先跑通 Create → Design → Publish，注册时再认领（claim）。
 *
 * 渲染期只读 cookie（写 cookie 属于 middleware / Route Handler，Next 会拒绝在
 * Server Component 里改 cookie）。guest 用户按会话 token 稳定，一个浏览器一个身份。
 */
export async function requireUser(): Promise<CurrentUser> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) throw new Error('缺少会话 cookie：middleware 未签发 nexus_session');
  const db = getDb();
  const tokenHash = hashToken(token);

  const [row] = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (row) {
    if (row.session.expiresAt.getTime() <= Date.now()) {
      // 同一浏览器延用同一身份：续期而不是再造一个 guest
      await db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) })
        .where(eq(sessions.id, row.session.id));
    }
    return toCurrentUser(row.user);
  }

  const user = await createUserSession(token);
  return toCurrentUser(user);
}

/** 用给定 token 建 guest 用户 + 会话；返回用户行。 */
async function createUserSession(token: string) {
  const db = getDb();
  const [created] = await db
    .insert(users)
    .values({ displayName: 'Guest Creator', guest: true })
    .returning();
  const user = created!;
  await db
    .insert(sessions)
    .values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) })
    .onConflictDoNothing({ target: sessions.tokenHash });
  return user;
}

/**
 * 轮换会话（§80 会话支持吊销 + 防会话固定）。
 *
 * middleware 用客户端可预知的 cookie 值签发 guest 会话，意味着注册/登录这个
 * 提权时刻若沿用旧 token，攻击者事先种下的已知 token 会变成真实账号的会话。
 * 所以每次身份变化都删除旧 token 的会话行、换发新 token，并返回给调用方写 cookie。
 * 传入 currentToken（当前请求的 cookie 值）以便吊销它。
 */
/**
 * 只读版本的会话解析：**不**替无会话的请求造 guest 身份。
 *
 * requireUser 会自动签发 guest（§137 的首次体验），那正好不该出现在审核入口上——
 * 否则任何人反复探测 /api/admin/* 就能白手造出一堆用户与会话行。
 */
export async function currentUserOrNull(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await getDb()
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  if (row.session.expiresAt.getTime() <= Date.now()) return null;
  return toCurrentUser(row.user);
}

export async function rotateSession(
  userId: string,
  currentToken: string | null,
  meta?: { userAgent?: string | null; ip?: string | null },
): Promise<string> {
  const db = getDb();
  if (currentToken) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(currentToken)));
  const token = newSessionToken();
  await db.insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    userAgent: meta?.userAgent ?? null,
    ip: meta?.ip ?? null,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  return token;
}

/** 吊销当前会话（登出）：删掉当前 token 的会话行。 */
export async function revokeCurrentSession(currentToken: string | null): Promise<void> {
  if (!currentToken) return;
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(currentToken)));
}

/** 当前请求 cookie 里的会话 token（Route Handler 里读，用于轮换/吊销）。 */
export async function currentSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export function toCurrentUser(user: typeof users.$inferSelect): CurrentUser {
  return { id: user.id, displayName: user.displayName, email: user.email, guest: user.guest, role: user.role };
}
