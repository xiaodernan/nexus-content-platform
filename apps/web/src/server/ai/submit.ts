import { NextResponse } from 'next/server';
import type { AiRequest } from '@nexus/schemas';
import { getAiCapabilities } from '@/lib/env';
import { assembleAiRequest } from './assemble';
import { agentLedgerFields, mentionNote } from '@/server/domain/agents';
import { submitJob, type JobSubmitResult } from '@/server/domain/ai-jobs';
import { refusalForRun } from '@/server/domain/credit-ledger';
import { jsonError } from '@/server/http';

/**
 * §162 取消/重试：把"提交一次异步作业"的整条流水线收成**一个**函数。
 *
 * 两扇门共用它：`POST /api/ai/jobs`（客户端带着自己的原话来）与
 * `POST /api/ai/tasks/<id>/retry`（服务端从上一行的 `input.request` 里取回原话）。
 * 各写一遍的代价是两条路各有一套口径——额度门少一次、策略栏少一格、
 * 或者重试那份忘了存请求，这些都只会在其中一扇门上露头。
 *
 * 这里不做归属与状态的判定（那两样是重试那扇门自己的事），只负责：
 * 装配 → §112 名册 → §134 额度门 → 入队落账 → 回执与报文头。
 */
export type AsyncSubmitOutcome =
  | { ok: true; body: Extract<JobSubmitResult, { ok: true }>; headers: Record<string, string> }
  | { ok: false; response: NextResponse };

export async function submitClientRequest(
  request: AiRequest,
  userId: string,
  opts?: { retry?: { of: string; attempt: number } },
): Promise<AsyncSubmitOutcome> {
  const assembled = await assembleAiRequest(request, userId);
  if (!assembled.ok) {
    return { ok: false, response: jsonError(assembled.status, assembled.code, { message: assembled.message }) };
  }

  const caps = await getAiCapabilities();
  const isDemo = caps.text !== 'real';

  // §112：这一轮归谁由服务端按名册解析，异步这条路与 /api/ai/run 同一份口径
  const fields = agentLedgerFields(assembled.agent, { askedAgentKey: request.agentKey, fallbackKey: request.intent });
  // §134：同一道额度门。放在提交之前而不是收尾之后——作业交给队列就收不回来了
  const refusal = await refusalForRun(userId, fields.agentKey);
  if (refusal) return { ok: false, response: jsonError(429, 'credits_exhausted', { message: refusal }) };

  const submitted = await submitJob({
    wire: assembled.wire,
    document: assembled.toolDocument,
    request,
    projectId: request.context.projectId,
    createdById: userId,
    agent: assembled.agent,
    fallbackAgentKey: request.intent,
    capability: isDemo ? 'demo' : 'real',
    isDemo,
    ...(opts?.retry ? { retry: opts.retry } : {}),
  });
  if (!submitted.ok) {
    return {
      ok: false,
      response: jsonError(submitted.status ?? 503, submitted.error.code, {
        message: submitted.error.message,
        retryable: submitted.error.retryable,
      }),
    };
  }

  const headers: Record<string, string> = { 'x-nexus-task': submitted.taskId };
  if (fields.agent) headers['x-nexus-agent'] = fields.agent.key;
  const note = mentionNote(fields);
  if (note) headers['x-nexus-agent-note'] = encodeURIComponent(note);
  if (opts?.retry) headers['x-nexus-retry-of'] = opts.retry.of;
  return { ok: true, body: submitted, headers };
}
