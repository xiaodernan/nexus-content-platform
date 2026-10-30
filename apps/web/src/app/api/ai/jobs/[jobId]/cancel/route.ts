import { NextResponse } from 'next/server';
import { cancelJob } from '@/server/domain/ai-jobs';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { failure, jsonError } from '@/server/http';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

/**
 * §162 取消/重试：受理一次取消。领域逻辑（先让队列立标志、后 CAS 账本行、
 * 三种不受理各说各的）在 `domain/ai-jobs.ts` 的 `cancelJob`，这里只做门面：
 * CSRF、归属、限流、回话。
 *
 * 200 的 body 是**受理后的诚实状态**：`jobStatus` 可能仍是 `running`（只立了标志），
 * 但 `taskStatus` 已经落成 `cancelled`——界面要把"已受理"与"已取消"分开说。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { jobId } = await ctx.params;
  try {
    const user = await requireUser();
    const rl = await getRateLimiter().hit(rateKey('ai/jobs/cancel', clientIp(req), user.id), 30, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '取消太频繁，稍后再试', retryAfterMs: rl.retryAfterMs });
    }
    const outcome = await cancelJob(jobId, user.id, clientIp(req));
    if (!outcome.ok) {
      return jsonError(outcome.status, outcome.error.code, {
        message: outcome.error.message,
        ...(outcome.error.hint ? { hint: outcome.error.hint } : {}),
        retryable: outcome.error.retryable,
      });
    }
    return NextResponse.json(outcome, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, `POST /api/ai/jobs/${jobId}/cancel`);
  }
}
