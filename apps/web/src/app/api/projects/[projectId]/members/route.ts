import { NextResponse } from 'next/server';
import { ApiTeamRosterSchema } from '@nexus/schemas';
import { requireUser } from '@/server/domain/session';
import { planOf } from '@/server/domain/credit-ledger';
import { teamMemberLimit } from '@/server/domain/credits';
import { listInvites, listMembers, ownerOf, projectVisibleTo } from '@/server/domain/team';
import { failure, notFound } from '@/server/http';

/**
 * §133 teamCollaboration（#201）：项目名册。GET 只读，owner 与协作者都能看——
 * "被拉进一个项目"的最低语义是看得见同伴。邀请/撤回/移除外写在各自的路由，
 * 那里是 owner only（team.ts 的三个写函数各自检查）。
 */

export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectVisibleTo(projectId, user.id))) return notFound();
    const [members, invites] = await Promise.all([listMembers(projectId), listInvites(projectId)]);
    // 名额上限跟名册一起回：界面要说得出"3/5"，不能只罗列人名
    const plan = await planOf((await ownerOf(projectId)) ?? user.id);
    return NextResponse.json(
      ApiTeamRosterSchema.parse({ projectId, members, invites, teamLimit: teamMemberLimit(plan) }),
    );
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/members`);
  }
}
