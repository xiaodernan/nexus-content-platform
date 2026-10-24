import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb } from '../db/client';
import { projectInvites, projectMembers, projects, users } from '../db/schema';
import { teamSlotRefusalFor } from './credit-ledger';

/**
 * §133 teamCollaboration 那一格的领域逻辑（#201）：协作者与邀请。
 *
 * 三件事在这里，别处不重写：
 * - **只有 owner 能拉人 / 踢人**：邀请、撤回、移除都以 `projects.ownerId === actorId` 为前提。
 *   协作者（editor/viewer）之间不能互相拉人——否则"团队"会自己长大，名额门形同虚设；
 * - **名额门在写邀请之前问**（`teamSlotRefusalFor`，与 render / publish 的门同一家族）：
 *   成员与 pending 邀请都占名额，拒绝话里带数字；
 * - **接受邀请是幂等的**：同一枚 token 连点两次，第二次看到的是 accepted，
 *   unique(projectId, userId) 再挡一层——两个标签页同时接受不会插出两行成员。
 *
 * 邮箱匹配：邀请是"发到某个邮箱"的承诺，接受者的邮箱必须与邀请上的相同。
 * 本机没有发信，链接由邀请人自己转交；但"谁的邮箱对不上谁的邀请"这件事在库里拦着，
 * 不靠"链接 secret 猜不到"当唯一防线（§159：秘密不是安全模型）。
 */

export interface ProjectMemberView {
  id: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  role: string;
  createdAt: string;
}

export interface ProjectInviteView {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
}

export interface InviteResult {
  ok: boolean;
  reason?: string;
  invite?: ProjectInviteView;
  /**
   * 邀请链接的 secret，**只在新建这一下返回**。roster（GET）永远不给它——
  一个常驻可读的 token 等于没有 secret；撤回再邀会拿到新的一枚。
   * 命中 pending 去重时**不返回**：那一封的 token 在它创建时已经展示过。
   */
  token?: string;
}

/** 这个项目的 owner 是谁；项目不存在（含已软删）返回 null */
export async function ownerOf(projectId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ ownerId: projects.ownerId })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  return row?.ownerId ?? null;
}

/**
 * 这个人能不能看到这个项目的名册：owner，或名册上的一员。
 * 协作者能看名册是团队功能的最低语义（不然"被拉进一个项目"连同伴都看不到）；
 * 但**看**不等于**管**——邀请/撤回/移除仍然 owner only（见那三个函数）。
 */
export async function projectVisibleTo(projectId: string, userId: string): Promise<boolean> {
  const ownerId = await ownerOf(projectId);
  if (!ownerId) return false;
  if (ownerId === userId) return true;
  const [row] = await getDb()
    .select({ id: projectMembers.id })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function listMembers(projectId: string): Promise<ProjectMemberView[]> {
  const rows = await getDb()
    .select({
      id: projectMembers.id,
      userId: projectMembers.userId,
      displayName: users.displayName,
      email: users.email,
      role: projectMembers.role,
      createdAt: projectMembers.createdAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId))
    .orderBy(projectMembers.createdAt);
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    displayName: r.displayName,
    email: r.email,
    role: r.role,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function listInvites(projectId: string): Promise<ProjectInviteView[]> {
  const rows = await getDb()
    .select()
    .from(projectInvites)
    .where(eq(projectInvites.projectId, projectId))
    .orderBy(desc(projectInvites.createdAt));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: r.role,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
  }));
}

/**
 * 拉一个人进项目。三步，顺序不能换：
 * 1. actor 必须是 owner（项目不存在与不是 owner 给同一个 404 口径的答案，不泄露存在性）；
 * 2. 同一邮箱已有 pending 邀请 → 如实返回那一封，不重复发；
 * 3. 名额门（成员 + pending 邀请一起数）。
 * 顺序理由：重复邀请同一封不是"拉第二个人"，它不新占名额——先过门会把
 * "再发一次同一封邀请"这个合法操作误伤成超额。
 */
export async function inviteMember(
  projectId: string,
  actorId: string,
  input: { email: string; role: 'editor' | 'viewer' },
): Promise<InviteResult> {
  const ownerId = await ownerOf(projectId);
  if (!ownerId || ownerId !== actorId) {
    return { ok: false, reason: '项目不在你名下，或已经不存在了' };
  }
  const email = input.email.trim().toLowerCase();
  const [existing] = await getDb()
    .select()
    .from(projectInvites)
    .where(and(eq(projectInvites.projectId, projectId), eq(projectInvites.email, email), eq(projectInvites.status, 'pending')))
    .limit(1);
  if (existing) {
    return {
      ok: true,
      invite: {
        id: existing.id,
        email: existing.email,
        role: existing.role,
        status: existing.status,
        createdAt: existing.createdAt.toISOString(),
        acceptedAt: existing.acceptedAt ? existing.acceptedAt.toISOString() : null,
      },
    };
  }
  const refusal = await teamSlotRefusalFor(ownerId, projectId);
  if (refusal) return { ok: false, reason: refusal };
  const [row] = await getDb()
    .insert(projectInvites)
    .values({
      projectId,
      email,
      role: input.role,
      token: randomUUID(),
      invitedById: actorId,
    })
    .returning();
  if (!row) return { ok: false, reason: '邀请没写进去' };
  return {
    ok: true,
    invite: {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      acceptedAt: null,
    },
    token: row.token,
  };
}

/**
 * 兑现一枚邀请。三个"不"：
 * - token 不存在 / 已 revoked → 拒（话说清，不假装成功）；
 * - 已 accepted → 幂等成功：成员行本来就在（unique 挡着），再报一次成功不算说谎；
 * - **接受者的邮箱必须与邀请上的相同**：链接可以转交，但"谁的邮箱"这一格对不上就是拒。
 */
export async function acceptInvite(token: string, userId: string): Promise<{ ok: boolean; reason?: string; projectId?: string }> {
  const db = getDb();
  const [invite] = await db
    .select()
    .from(projectInvites)
    .where(eq(projectInvites.token, token))
    .limit(1);
  if (!invite) return { ok: false, reason: '这枚邀请不存在' };
  if (invite.status === 'revoked') return { ok: false, reason: '这枚邀请已被撤回' };
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.email || user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return { ok: false, reason: '这枚邀请不是发给你的邮箱的' };
  }
  if (invite.status === 'accepted') return { ok: true, projectId: invite.projectId };
  // 成员行与邀请状态同一个事务：成员写进去而邀请还 pending，下次接受会再走一遍
  // （unique 挡住重复行，但"这枚邀请兑现了"这件事必须一起落）
  await db.transaction(async (tx) => {
    await tx
      .insert(projectMembers)
      .values({ projectId: invite.projectId, userId, role: invite.role, invitedById: invite.invitedById })
      .onConflictDoNothing();
    await tx
      .update(projectInvites)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(eq(projectInvites.id, invite.id));
  });
  return { ok: true, projectId: invite.projectId };
}

/** 撤回一封 pending 邀请：owner only；已 accepted / 已 revoked 的如实返回 false（没有新事情发生） */
export async function revokeInvite(projectId: string, inviteId: string, actorId: string): Promise<boolean> {
  const ownerId = await ownerOf(projectId);
  if (!ownerId || ownerId !== actorId) return false;
  const stopped = await getDb()
    .update(projectInvites)
    .set({ status: 'revoked' })
    .where(and(eq(projectInvites.id, inviteId), eq(projectInvites.projectId, projectId), eq(projectInvites.status, 'pending')))
    .returning({ id: projectInvites.id });
  return stopped.length > 0;
}

/** 移除一个成员：owner only；移除 owner 自己的行也允许（他本来就是 owner，不靠成员行活着） */
export async function removeMember(projectId: string, memberUserId: string, actorId: string): Promise<boolean> {
  const ownerId = await ownerOf(projectId);
  if (!ownerId || ownerId !== actorId) return false;
  const removed = await getDb()
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId)))
    .returning({ id: projectMembers.id });
  return removed.length > 0;
}
