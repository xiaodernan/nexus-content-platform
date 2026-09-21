import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { sessions, users } from '../db/schema';

const SESSION_COOKIE = 'nexus_session';
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CurrentUser {
  id: string;
  displayName: string;
  email: string | null;
  guest: boolean;
}

/**
 * 免注册首次体验（§137）：没有会话时直接建一个 guest 用户，
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

  const [created] = await db
    .insert(users)
    .values({ displayName: 'Guest Creator', guest: true })
    .returning();
  const user = created!;
  await db
    .insert(sessions)
    .values({ userId: user.id, tokenHash, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) })
    .onConflictDoNothing({ target: sessions.tokenHash });
  return toCurrentUser(user);
}

function toCurrentUser(user: typeof users.$inferSelect): CurrentUser {
  return { id: user.id, displayName: user.displayName, email: user.email, guest: user.guest };
}
