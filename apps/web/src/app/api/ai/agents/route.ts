import { NextResponse } from 'next/server';
import { AgentRosterSchema } from '@nexus/schemas';
import { loadRoster } from '@/server/domain/agents';
import { requireUser } from '@/server/domain/session';
import { failure } from '@/server/http';

/**
 * §112 的名册入口：Studio 的"交给哪个 Agent"选择器读这一份。
 *
 * 为什么要有这条路由而不是在前端写死 13 个名字：名册的真值在库里（`scripts/db-seed.mts` 播种），
 * 抄一份到浏览器就是两处写、迟早漂移——漂移的结果是界面上能选到一个名册里已经没有的 Agent。
 *
 * 出去之前先过一次自己的契约（`AgentRosterSchema.parse`）：这一条读起来像多余的，
 * 但服务端"以为自己发的是名册、实际发了半份"这种情况，只有出参校验看得见。
 */
export async function GET(): Promise<NextResponse> {
  try {
    await requireUser();
    const roster = await loadRoster();
    return NextResponse.json(AgentRosterSchema.parse({ agents: roster }), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'GET /api/ai/agents');
  }
}
