import { NextResponse } from 'next/server';
import { AiRequestSchema } from '@nexus/schemas';
import { submitClientRequest } from '@/server/ai/submit';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, failure, jsonError } from '@/server/http';

/**
 * §162：把一次生成交给队列，而不是挂在一个 HTTP 请求上等结果。
 *
 * 两条路由（在 `server/ai/submit.ts` 合流，那边一次说完）：
 * - 真 provider：转发给 ai-service（MemoryJobStore / RedisJobStore），返回 jobId + backend
 * - DEMO MODE：本地内存队列（mock-jobs.ts），返回 jobId + backend=demo-memory
 *
 * 两者的账本都是 `agent_tasks`，区别只在后端标识与结果来源（capability: real | demo）。
 * 重试那扇门（同一份流水线，请求从上一行取回）在 `POST /api/ai/tasks/<id>/retry`。
 */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return jsonError(413, 'payload_too_large', { message: `请求体超过 ${MAX_BODY_BYTES / 1024 / 1024}MB 上限` });
    raw = JSON.parse(text) as unknown;
  } catch {
    return badRequest(['请求体必须是 JSON']);
  }
  const parsed = AiRequestSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));

  try {
    const user = await requireUser();
    const rl = getRateLimiter().hit(rateKey('ai/jobs', clientIp(req), user.id), 20, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '提交作业太频繁，稍后再试', retryAfterMs: rl.retryAfterMs });
    }
    const outcome = await submitClientRequest(parsed.data, user.id);
    if (!outcome.ok) return outcome.response;
    return NextResponse.json(outcome.body, { status: 202, headers: outcome.headers });
  } catch (error) {
    return failure(error, 'POST /api/ai/jobs');
  }
}
