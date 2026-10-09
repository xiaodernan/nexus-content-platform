import { NextResponse } from 'next/server';
import { submitClientRequest } from '@/server/ai/submit';
import { readRetryableTask } from '@/server/domain/agent-tasks';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { failure, jsonError } from '@/server/http';

interface RouteContext {
  params: Promise<{ taskId: string }>;
}

/**
 * §162 取消/重试：把失败（或被取消）的那一次**再跑一遍**。
 *
 * 重试是**新的一行**，不是把旧行改回 running：
 * - 历史不抹。失败的那次还在列表里，`attempt` 列写出"这是第几次"，`input.retryOf` 把两行接起来；
 * - 扣点有唯一索引兜着。改旧行重跑，第二次成功会与第一次撞 `credit_ledger_task_kind_key`；
 * - 账本行与 provider 作业一一对应。旧行的作业号、活动游标都属于那次，覆盖就是伪造历史。
 *
 * 四道门住在 `readRetryableTask`（那边有单测钉着每句拒绝话），这里只做：
 * CSRF、归属、限流，然后把取回的原话交给与 `POST /api/ai/jobs` **同一条**流水线——
 * 装配、名册、额度门、策略栏一样不少：重试不是"绕过提交那道门的后门"。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { taskId } = await ctx.params;
  try {
    const user = await requireUser();
    const rl = getRateLimiter().hit(rateKey('ai/tasks/retry', clientIp(req), user.id), 20, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '重试太频繁，稍后再试', retryAfterMs: rl.retryAfterMs });
    }

    const check = await readRetryableTask(taskId, user.id);
    if (!check.ok) {
      return jsonError(check.status, check.status === 404 ? 'not_found' : 'validation_failed', { message: check.message });
    }

    const outcome = await submitClientRequest(check.request, user.id, {
      retry: { of: check.task.id, attempt: check.task.attempt + 1 },
    });
    if (!outcome.ok) return outcome.response;
    return NextResponse.json(outcome.body, { status: 202, headers: outcome.headers });
  } catch (error) {
    return failure(error, `POST /api/ai/tasks/${taskId}/retry`);
  }
}
