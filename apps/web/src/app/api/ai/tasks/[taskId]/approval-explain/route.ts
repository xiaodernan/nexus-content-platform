import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readApprovalTask } from '@/server/domain/agent-tasks';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { chatWithCharacter } from '@/server/ai/client';
import { AGENT_EXPLAIN_SYSTEM_PROMPT, buildApprovalDigest } from '@/server/domain/agent-explain';
import { increment, observe } from '@/server/observability';

/**
 * §73-AI · POST /api/ai/tasks/[taskId]/approval-explain
 *   —— 挂起的式子上：把这次 approvals 交给真模型读一眼，让审批人先听它说一遍接下来要发生什么。
 * 纪律：`readApprovalTask` 之后只有 awaiting 式子才喂 provider；provider 不可用 → 503 原话不伪造；
 *    只给模型结构事实（agentKey / heldOpCount / action / reason），不给模型任何载荷内容；
 *    模型不得指挥批准/拒绝——句子只能描述，不能代劳 §74 的判断。
 */
const BodySchema = z.object({ locale: z.enum(['zh', 'en']).default('zh') });

export async function POST(req: Request, { params }: { params: Promise<{ taskId: string }> }): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('ai/explain', req);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '问太快了，缓一缓再问', retryAfterMs: gate.retryAfterMs });

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message));
  const locale = parsed.data.locale;

  const { taskId } = await params;
  const user = await requireUser();
  const task = await readApprovalTask(taskId, user.id);
  if (!task) return jsonError(404, 'not_found', { message: '这条任务不存在，或者不属于你' });
  if (task.status !== 'awaiting_approval') {
    return jsonError(409, 'not_pending', { message: '这条任务现在不在等审批' });
  }
  const digest = buildApprovalDigest(task, locale);

  const result = await chatWithCharacter({
    requestId: `approval-ai-${Date.now()}`,
    system: AGENT_EXPLAIN_SYSTEM_PROMPT,
    user: digest.user,
    modelClass: 'fast',
  });
  const durationMs = Date.now() - startedAt;

  if (!result.ok) {
    increment('nexus_agent_explain_total', { outcome: 'provider-unavailable' });
    return jsonError(result.status ?? 503, 'provider-unavailable', {
      message: locale === 'zh' ? '模型连不上——审批照常，只是没有模型帮你读一遍' : 'Model is unreachable — approval still works; the AI read is just unavailable.',
    });
  }
  increment('nexus_agent_explain_total', { outcome: 'answer' });
  observe('nexus_agent_explain_latency_ms', durationMs, { outcome: 'answer' });
  return NextResponse.json({
    answer: (result.response.text ?? '').trim(),
    capability: result.response.capability,
    model: result.response.model,
    cachedTokens: result.response.usage?.cachedTokens ?? 0,
    cacheReported: result.response.usage?.cacheReported ?? false,
  });
}
