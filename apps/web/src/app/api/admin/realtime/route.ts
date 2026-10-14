import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError } from '@/server/http';
import { getRealtimeBus } from '@/server/realtime/bus';

/**
 * §163 诊断入口：`wireErrorCount` / `ready` 在此之前只住在 stderr 与测试里，
 * 界面上"这台实例掉了几帧"根本看不见（ADR-0028 那一片明确不做的第三件）。
 *
 * 门与复核台同一句口径（`role=admin`，默认拒绝）：这份账回答的是"整台实例的线路怎么样"，
 * 不是"你自己的连接"——不是每个人机密，但也不是每个人的事。
 *
 * 报文形状由总线自报（`RealtimeBusStats`），这个端点不做二次加工：
 * 加工一层就多一处把 `null` 改成 `0` 的机会（那两格的 null 是"不适用"，0 是"没有失败"）。
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '实时总线状态只对审核员（role=admin）开放' });
  }
  return NextResponse.json(getRealtimeBus().stats());
}
