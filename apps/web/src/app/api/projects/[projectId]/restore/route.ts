import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { restoreProject } from '@/server/domain/projects';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §74 回收站的另一半：软删之所以敢是软的，是因为"恢复"这条路真的存在。
 * 只有被标了 `deletedAt` 的行会动，所以对一个没删过的项目打这里是 404，
 * 而不是返回一个"恢复成功"但其实什么都没发生的 200——那种回话会让界面显示一句假话。
 *
 * 不需要请求体：恢复哪个项目写在 URL 上，也没有需要用户逐字确认的第二个字段
 * （恢复不是破坏性动作，§74 的审批门只管"删"那一侧）。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    const rl = getRateLimiter().hit(rateKey('projects/restore', clientIp(req), user.id), 60, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '恢复太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
    }
    const restored = await restoreProject(user.id, projectId);
    if (!restored) return notFound();
    return NextResponse.json({ ok: true, projectId, name: restored.name, restored: true });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/restore`);
  }
}
