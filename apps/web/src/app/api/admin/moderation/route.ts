import { NextResponse } from 'next/server';
import { listReviewQueue, MODERATION_LIMITS, MODERATION_RULES_VERSION } from '@/server/domain/moderation';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError } from '@/server/http';

/**
 * §131 人工复核队列。这是仓库里第一个按 role 门控的端点：
 * `users.role` 早就有 'admin' 这个取值，但此前没有任何代码读过它——
 * 没有人的入口，机检就永远只能"挂起"而没人能"下结论"。
 *
 * 谁是 admin：目前只能由运维直接改数据库（docs/SECURITY.md 记着这条边界），
 * 平台没有自助提权的路径。默认拒绝：不是 admin 一律 403，连项目名都不回。
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '人工复核队列只对审核员（role=admin）开放' });
  }
  const cases = await listReviewQueue();
  return NextResponse.json({
    rulesVersion: MODERATION_RULES_VERSION,
    count: cases.length,
    cases,
    // 队列本身也要说清机检挡不住什么，否则"队列里没案子"会被读成"平台内容是干净的"
    limits: MODERATION_LIMITS,
  });
}
