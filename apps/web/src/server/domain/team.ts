import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { isUuid } from './ids';
import { getDb } from '../db/client';
import { projectInvites, projectMembers, projects, users } from '../db/schema';
import { teamSlotRefusalFor } from './credit-ledger';
import { emit } from './notifications';

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

/** 成员角色只有两种（owner 是 `projects.ownerId` 的事实，不在成员行里授予） */
export type MemberRole = 'editor' | 'viewer';

/** 邀请有效期（天）。与迁移 0041 的 `now() + interval '7 days'` 是同一个数：改这里要连迁移一起改 */
export const INVITE_TTL_DAYS = 7;
const INVITE_TTL_MS = INVITE_TTL_DAYS * 86_400_000;

export interface ProjectInviteView {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  acceptedAt: string | null;
  /** 有效期截止（ISO） */
  expiresAt: string;
  /** `status==='pending' && expiresAt<=now` 的**计算值**——不是第四种 status（见迁移 0041 的注释） */
  expired: boolean;
}

type InviteRow = typeof projectInvites.$inferSelect;

/** 行 → 视图：`expired` 只在这里算一次，list / invite / 名册三处不各算一套 */
function inviteView(row: InviteRow, now = Date.now()): ProjectInviteView {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt ? row.acceptedAt.toISOString() : null,
    expiresAt: row.expiresAt.toISOString(),
    expired: row.status === 'pending' && row.expiresAt.getTime() <= now,
  };
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
  // 与 projects.ts 的 projectBelongsTo 同一道形状门：路径参数形状不对时
  // 根本不去碰数据库——非 UUID 的 eq() 会撞 22P02 把 404 变 500（id-shape 测试钉着）
  if (!isUuid(projectId)) return null;
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

/**
 * 写路径的三态门（#206）：owner 与 editor 写得，viewer 只读，陌生人当作不存在。
 *
 * 为什么不是 projectVisibleTo 那样的布尔：viewer 是名册上的人，给他 404"项目不存在"
 * 是假话；而陌生人必须继续 404（不泄露项目存在性，与全站同一口径）。editor/viewer 的
 * 差别到这一片才落地——#201-#205 里 role 只是名册上的档案标签，写着玩的不算数。
 * 形状门在 ownerOf 里（非 UUID 直接 not_found），这里不重复。
 */
export async function projectWriteAccess(
  projectId: string,
  userId: string,
): Promise<'ok' | 'read_only' | 'not_found'> {
  const ownerId = await ownerOf(projectId);
  if (!ownerId) return 'not_found';
  if (ownerId === userId) return 'ok';
  const [row] = await getDb()
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  if (!row) return 'not_found';
  return row.role === 'viewer' ? 'read_only' : 'ok';
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
  return rows.map((r) => inviteView(r));
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
  input: { email: string; role: MemberRole },
): Promise<InviteResult> {
  const ownerId = await ownerOf(projectId);
  if (!ownerId || ownerId !== actorId) {
    return { ok: false, reason: '项目不在你名下，或已经不存在了' };
  }
  const email = input.email.trim().toLowerCase();
  const [existing] = await getDb()
    .select()
    .from(projectInvites)
    .where(
      and(
        eq(projectInvites.projectId, projectId),
        eq(projectInvites.email, email),
        eq(projectInvites.status, 'pending'),
        // 过期的那封不算「同一封」：它收不了，也不占名额（见 teamSlotRefusalFor）。
        // 不排掉它，重新邀请同一个人会拿到一封已经失效的邀请。
        gt(projectInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (existing) {
    return { ok: true, invite: inviteView(existing) };
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
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning();
  if (!row) return { ok: false, reason: '邀请没写进去' };
  return {
    ok: true,
    invite: inviteView(row),
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
  const [user] = await db.select({ email: users.email, displayName: users.displayName }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.email || user.email.toLowerCase() !== invite.email.toLowerCase()) {
    return { ok: false, reason: '这枚邀请不是发给你的邮箱的' };
  }
  if (invite.status === 'accepted') return { ok: true, projectId: invite.projectId };
  // 过期检查放在 accepted 之后：已经兑现的邀请不该因为"后来过期了"而被说成失败（幂等优先）。
  if (invite.expiresAt.getTime() <= Date.now()) {
    return {
      ok: false,
      reason: `这枚邀请已过期（有效期 ${INVITE_TTL_DAYS} 天），请让邀请人重新发一封`,
    };
  }
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
  // §164 × §133：邀请兑现是「有人进了你的项目」的终态。发出 / 撤回 / 过期都不发，
  // 幂等重放早在上面就返回了，所以刷新接受页不会把收件箱再点亮一次。
  // 收件人按 projects.ownerId 现取：邀请行上的 invitedById 只是「当时谁发的」。
  const ownerId = await ownerOf(invite.projectId);
  if (ownerId && ownerId !== userId) {
    const [project] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(eq(projects.id, invite.projectId))
      .limit(1);
    if (project) {
      await emit({
        kind: 'team',
        recipientId: ownerId,
        actorId: userId,
        actorName: user.displayName ?? user.email,
        projectId: invite.projectId,
        projectName: project.name,
        role: invite.role,
      });
    }
  }
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

/** 改角色的结果：404 的两种来源分开，路由才能说清"是项目不在你名下"还是"这个人不在名册上" */
export type ChangeRoleResult = 'ok' | 'not_owner' | 'not_member';

/**
 * 变更一个协作者的角色：owner only，立刻生效。
 *
 * 选的不是"踢掉再邀"：那要对方重新点链接接受，中间这段时间他既进不去、也没人知道他为什么进不去。
 * 角色存在成员行上，而 `projectWriteAccess` 每次写请求都现读这一行——所以降级不需要让会话失效，
 * 下一次写就会被 403 挡住；升级也不需要新的邀请。这与"名额"无关，改角色不占新位置。
 */
export async function changeMemberRole(
  projectId: string,
  memberUserId: string,
  actorId: string,
  role: MemberRole,
): Promise<ChangeRoleResult> {
  const ownerId = await ownerOf(projectId);
  if (!ownerId || ownerId !== actorId) return 'not_owner';
  const updated = await getDb()
    .update(projectMembers)
    .set({ role })
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId)))
    .returning({ id: projectMembers.id });
  return updated.length > 0 ? 'ok' : 'not_member';
}
