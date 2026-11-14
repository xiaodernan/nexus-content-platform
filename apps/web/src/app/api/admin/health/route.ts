import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError } from '@/server/http';
import { probeAllTiers } from '@/server/admin/health-aggregate';

/**
 * §SC-81 · `/admin/health` 的聚合端点（§SC-81 / ADR-0192）：
 * ai / java / gateway / redis / postgres 五层探针一次成，失败或拿不到留原名不改写（§159）。
 *
 * 门与 `/admin/realtime` 同一口径：role=admin。这条线路只出计数与 up/down，不出 token、不出文件——
 * probe 结果本身不够当账，但 role=admin 该能被看见。
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '健康总览只对审核员（role=admin）开放' });
  }
  const snapshot = await probeAllTiers();
  return NextResponse.json(snapshot, { headers: { 'cache-control': 'no-store' } });
}
