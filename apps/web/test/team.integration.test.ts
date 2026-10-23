import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql as rawSql } from 'drizzle-orm';
import {
  acceptInvite,
  inviteMember,
  listInvites,
  listMembers,
  removeMember,
  revokeInvite,
} from '../src/server/domain/team';
import { createProject } from '../src/server/domain/projects';
import { getDb } from '../src/server/db/client';
import { projectInvites, projects, users } from '../src/server/db/schema';

/**
 * §133 teamCollaboration（#201）：协作者与邀请，打真实 Postgres。
 *
 * 要证的不是"函数能返回 ok"，而是五件只有在真库里才成立的事：
 * ① 邀请 → 接受 → 成员行真的落下来，且同一枚邀请再接受一次不会插出两行
 *    （unique(projectId, userId) 挡两个标签页同时点接受）；
 * ② 同一邮箱的 pending 邀请去重：再邀一次返回的还是那一封，不是第二封；
 * ③ 名额门按 owner 档位数（free=1）：拉第二个就被拒且话里带数字；撤回立刻释放名额；
 * ④ 只有 owner 能拉人/踢人：协作者之间互相拉人，团队就会自己长大；
 * ⑤ 邮箱对不上的邀请收不了：链接可以转交，"发给谁的邮箱"这一格在库里拦着。
 */

let ownerId: string;
let editorId: string;
let strangerId: string;
/** free 档名额门的专用项目（与成员用例的项目分开，互不占名额） */
let memberProject: string;
/** free 档名额门的专用项目（与成员用例的项目分开，互不占名额） */
let slotProjectId: string;

beforeAll(async () => {
  const db = getDb();
  const probe = await db.execute(rawSql`select 1 as ok`);
  if (!probe) throw new Error('数据库不可用');
  const [owner] = await db
    .insert(users)
    .values({ displayName: '团队 Owner', email: `team-owner+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  const [editor] = await db
    .insert(users)
    .values({ displayName: '团队 Editor', email: `team-editor+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  const [stranger] = await db
    .insert(users)
    .values({ displayName: '团队路人', email: `team-stranger+${Date.now()}@nexus.test` })
    .returning({ id: users.id });
  ownerId = owner!.id;
  editorId = editor!.id;
  strangerId = stranger!.id;
  // members 用例用的项目
  memberProject = (await createProject(ownerId, { name: '成员用例项目', kind: 'website' })).id;
  slotProjectId = (await createProject(ownerId, { name: '名额门用例项目', kind: 'website' })).id;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(projects).where(eq(projects.ownerId, ownerId));
  await db.delete(users).where(eq(users.id, ownerId));
  await db.delete(users).where(eq(users.id, editorId));
  await db.delete(users).where(eq(users.id, strangerId));
});

const emailOf = async (userId: string): Promise<string> => {
  const [row] = await getDb().select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return row!.email!;
};

/** token 是邀请链接的 secret，不进回执；测试打真库，直接反查（与生产同样的表） */
const tokenOf = async (inviteId: string): Promise<string> => {
  const [row] = await getDb()
    .select({ token: projectInvites.token })
    .from(projectInvites)
    .where(eq(projectInvites.id, inviteId))
    .limit(1);
  return row!.token;
};

describe('§133 协作者与邀请（真实数据库）', () => {
  it('① 邀请 → 接受 → 成员落库；同一枚邀请再接受一次不会插出两行', async () => {
    const invited = await inviteMember(memberProject, ownerId, { email: await emailOf(editorId), role: 'editor' });
    expect(invited.ok).toBe(true);
    expect(invited.invite?.status).toBe('pending');
    // 回执里不出现 token：secret 不该从任何接口漏出去
    expect(JSON.stringify(invited)).not.toContain(await tokenOf(invited.invite!.id));

    const accepted = await acceptInvite(await tokenOf(invited.invite!.id), editorId);
    expect(accepted.ok).toBe(true);
    expect(accepted.projectId).toBe(memberProject);

    const members = await listMembers(memberProject);
    expect(members.length).toBe(1);
    expect(members[0]!.userId).toBe(editorId);
    expect(members[0]!.role).toBe('editor');

    // 幂等：同一枚 token 再接受一次，成员还是一行，邀请还是 accepted
    const second = await acceptInvite(await tokenOf(invited.invite!.id), editorId);
    expect(second.ok).toBe(true);
    expect((await listMembers(memberProject)).length).toBe(1);
    const invites = await listInvites(memberProject);
    expect(invites.find((i) => i.id === invited.invite!.id)?.status).toBe('accepted');
    expect(invites.find((i) => i.id === invited.invite!.id)?.acceptedAt).not.toBeNull();
  });

  it('② 同一邮箱的 pending 邀请去重：再邀一次返回同一封，不产生第二封', async () => {
    // ① 结束时 editor 是正式成员，占着 free 档那 1 个名额——先移除，给这条用例腾地方
    expect(await removeMember(memberProject, editorId, ownerId)).toBe(true);
    const first = await inviteMember(memberProject, ownerId, { email: await emailOf(strangerId), role: 'viewer' });
    expect(first.ok).toBe(true);
    const second = await inviteMember(memberProject, ownerId, { email: await emailOf(strangerId), role: 'viewer' });
    expect(second.ok).toBe(true);
    expect(second.invite?.id).toBe(first.invite!.id);
    const strangerEmail = await emailOf(strangerId);
    const pending = (await listInvites(memberProject)).filter((i) => i.status === 'pending' && i.email === strangerEmail);
    expect(pending.length).toBe(1);
  });

  it('③ 名额门：free 档拉第二个被拒且话里带数字；撤回后释放名额', async () => {
    const first = await inviteMember(slotProjectId, ownerId, { email: await emailOf(editorId), role: 'editor' });
    expect(first.ok).toBe(true);
    const refused = await inviteMember(slotProjectId, ownerId, { email: await emailOf(strangerId), role: 'viewer' });
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('协作名额已满');
    expect(refused.reason).toContain('Free 档每个项目除所有者外最多 1 人');
    // 被拒时库里没有第二封 pending
    expect((await listInvites(slotProjectId)).length).toBe(1);

    // 撤回第一封 → 名额释放 → 再邀成功
    expect(await revokeInvite(slotProjectId, first.invite!.id, ownerId)).toBe(true);
    const afterRevoke = await inviteMember(slotProjectId, ownerId, { email: await emailOf(strangerId), role: 'viewer' });
    expect(afterRevoke.ok).toBe(true);

    // 移除成员也释放名额：先让 stranger 兑现，再移除，然后还能再拉一个
    expect((await acceptInvite(await tokenOf(afterRevoke.invite!.id), strangerId)).ok).toBe(true);
    expect(await removeMember(slotProjectId, strangerId, ownerId)).toBe(true);
    const third = await inviteMember(slotProjectId, ownerId, { email: `slot-third+${Date.now()}@nexus.test`, role: 'viewer' });
    expect(third.ok).toBe(true);
  });

  it('④ 只有 owner 能拉人/踢人：协作者与路人的邀请、撤回、移除全部失败', async () => {
    // editor 在 memberProject 上已是成员（① 里接受的）——他拉人必须被拒
    const byEditor = await inviteMember(memberProject, editorId, { email: `intruder+${Date.now()}@nexus.test`, role: 'viewer' });
    expect(byEditor.ok).toBe(false);
    expect(byEditor.reason).toContain('不在你名下');
    // 撤回与移除同样 owner only
    const anyInvite = (await listInvites(memberProject))[0]!;
    expect(await revokeInvite(memberProject, anyInvite.id, editorId)).toBe(false);
    expect(await removeMember(memberProject, editorId, strangerId)).toBe(false);
    // owner 移除成员的那一面在 ③ 里钉过（stranger 接受后被 owner 移除），这里不重复
  });

  it('⑤ 邮箱对不上的邀请收不了；不存在的 token 与已撤回的邀请都说清理由', async () => {
    // ② 留下了一封 stranger 的 pending 邀请占着名额——先撤回，给这条用例腾地方
    const leftover = (await listInvites(memberProject)).find((i) => i.status === 'pending');
    if (leftover) expect(await revokeInvite(memberProject, leftover.id, ownerId)).toBe(true);
    const invited = await inviteMember(memberProject, ownerId, { email: await emailOf(editorId), role: 'editor' });
    expect(invited.ok).toBe(true);
    const token = await tokenOf(invited.invite!.id);

    // 路人的邮箱对不上这枚邀请
    const wrongUser = await acceptInvite(token, strangerId);
    expect(wrongUser.ok).toBe(false);
    expect(wrongUser.reason).toContain('不是发给你的邮箱');

    // 撤回之后再拿这枚 token 接受：说清"已被撤回"
    expect(await revokeInvite(memberProject, invited.invite!.id, ownerId)).toBe(true);
    const revoked = await acceptInvite(token, editorId);
    expect(revoked.ok).toBe(false);
    expect(revoked.reason).toContain('已被撤回');

    // 凭空捏造的 token
    const ghost = await acceptInvite('00000000-0000-4000-8000-000000000000', editorId);
    expect(ghost.ok).toBe(false);
    expect(ghost.reason).toContain('不存在');
  });
});
