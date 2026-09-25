import { NextResponse } from 'next/server';
import { AiJobObservationSchema } from '@nexus/schemas';
import { observeJob } from '@/server/domain/ai-jobs';
import { requireUser } from '@/server/domain/session';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { failure, jsonError, notFound } from '@/server/http';

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

/**
 * §162：问一次作业。每次都是现场去 ai-service 问，web 不缓存、也不"根据上一次推一次"——
 * 状态的真值在那一侧。三种"问不到"给的答案不一样，而且各自说清差在哪：
 * 这个作业号不是你的（404，与"没有这个作业"同一个答案，不透露存在性）、
 * ai-service 没答话（200，但 `jobStatus` 是 null、原因写在 `notes` 里：任务行不动，下一次再问）、
 * 作业在那一侧已经不存在（同样是 200 + notes，但任务行落成 failed——查不到就是它的终态，
 * 一条永远转圈的"正在生成"比一句"我找不到它了"更骗人）。
 *
 * 限流比别处宽是按轮询算的：一个跑 5 分钟的作业、每 2 秒问一次是 150 次，
 * 卡太紧界面就会自己把作业"问丢"。
 */
export async function GET(req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { jobId } = await ctx.params;
  try {
    const user = await requireUser();
    const rl = getRateLimiter().hit(rateKey('ai/jobs/status', clientIp(req), user.id), 600, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '查询太频繁，稍后再试', retryAfterMs: rl.retryAfterMs });
    }
    const observed = await observeJob(jobId, user.id);
    if (!observed) return notFound();
    /**
     * §6：跨端报文只有 `packages/schemas` 那一份定义。这里现在装着 provider 生成的
     * `AiResponse`（可能是真模型写的），所以出口先校验一次再发——
     * 校验不过就是 500，而不是把一条形状没人认的报文交给界面去猜。
     */
    const validated = AiJobObservationSchema.safeParse(observed);
    if (!validated.success) {
      return failure(
        new Error(`作业观察不符合契约：${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`),
        `GET /api/ai/jobs/${jobId}`,
      );
    }
    return NextResponse.json(validated.data, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, `GET /api/ai/jobs/${jobId}`);
  }
}
