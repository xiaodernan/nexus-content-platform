import { NextResponse } from 'next/server';
import { AiRequestSchema } from '@nexus/schemas';
import { getAiCapabilities } from '@/lib/env';
import { assembleAiRequest } from '@/server/ai/assemble';
import { agentLedgerFields, mentionNote } from '@/server/domain/agents';
import { submitJob } from '@/server/domain/ai-jobs';
import { refusalForRun } from '@/server/domain/credit-ledger';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, failure, jsonError } from '@/server/http';
import { enqueueDemoJob, startDemoWorker } from '@/server/ai/mock-jobs';

/**
 * §162：把一次生成交给队列，而不是挂在一个 HTTP 请求上等结果。
 *
 * 两条路由：
 * - 真 provider：转发给 ai-service（MemoryJobStore / RedisJobStore），返回 jobId + backend
 * - DEMO MODE：本地内存队列（mock-jobs.ts），返回 jobId + backend=demo-memory
 *
 * 两者的账本都是 `agent_tasks`，区别只在后端标识与结果来源（capability: real | demo）。
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
    const assembled = await assembleAiRequest(parsed.data, user.id);
    if (!assembled.ok) return jsonError(assembled.status, assembled.code, { message: assembled.message });

    const caps = await getAiCapabilities();
    const isDemo = caps.text !== 'real';

    // §112：这一轮归谁由服务端按名册解析，异步这条路与 /api/ai/run 同一份口径
    const fields = agentLedgerFields(assembled.agent, { askedAgentKey: parsed.data.agentKey, fallbackKey: parsed.data.intent });
    // §134：同一道额度门。放在提交之前而不是收尾之后——作业交给队列就收不回来了
    const refusal = await refusalForRun(user.id, fields.agentKey);
    if (refusal) return jsonError(429, 'credits_exhausted', { message: refusal });

    if (isDemo) {
      // DEMO MODE：走本地内存队列（mock-jobs.ts），不挂外部 ai-service
      startDemoWorker();
      const job = await enqueueDemoJob({
        ...assembled.wire,
        context: {
          ...assembled.wire.context,
          projectId: parsed.data.context.projectId,
        },
        requestId: parsed.data.requestId,
      });
      // 落任务行（capability: demo）
      const { startTask } = await import('@/server/domain/agent-tasks');
      const started = await startTask({
        projectId: parsed.data.context.projectId,
        agentKey: fields.agent?.key ?? parsed.data.intent,
        createdById: user.id,
        capability: 'demo',
        input: {
          prompt: parsed.data.prompt.slice(0, 500),
          modelClass: parsed.data.modelClass,
          variants: parsed.data.variants,
          async: true,
          approvalPolicy: (await import('@/server/ai/approvals')).WEB_APPROVAL_POLICY,
          ...fields,
        },
      });
      await (await import('@/server/domain/agent-tasks')).attachJob(started.id, job.id);
      const accepted = {
        jobId: job.id,
        taskId: started.id,
        requestId: job.requestId,
        status: 'queued' as const,
        backend: 'demo-memory' as const,
        note: 'DEMO MODE：作业存在 web 进程内存中，刷新页面、重启即失',
        capacity: 1,
      };
      return NextResponse.json(accepted, { status: 202, headers: { 'x-nexus-task': started.id } });
    } else {
      // 真 provider：转发给 ai-service
      const submitResult = await submitJob({
        wire: assembled.wire,
        projectId: parsed.data.context.projectId,
        createdById: user.id,
        agent: assembled.agent,
        fallbackAgentKey: parsed.data.intent,
        capability: 'real',
      });
      if (!submitResult.ok) {
        return jsonError(submitResult.status ?? 503, submitResult.error.code, { message: submitResult.error.message, retryable: submitResult.error.retryable });
      }
      const headers: Record<string, string> = { 'x-nexus-task': submitResult.taskId };
      if (fields.agent) headers['x-nexus-agent'] = fields.agent.key;
      const note = mentionNote(fields);
      if (note) headers['x-nexus-agent-note'] = encodeURIComponent(note);
      return NextResponse.json(submitResult, { status: 202, headers });
    }
  } catch (error) {
    return failure(error, 'POST /api/ai/jobs');
  }
}