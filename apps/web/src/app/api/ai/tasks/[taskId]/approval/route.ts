import { NextResponse } from 'next/server';
import { AiTaskApprovalRequestSchema, AiTaskApprovalResultSchema } from '@nexus/schemas';
import { decideApproval, readApprovalTask } from '@/server/domain/agent-tasks';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

interface RouteContext {
  params: Promise<{ taskId: string }>;
}

/**
 * §74 的 agent 侧：一份含高危动作的 AI 结果被服务端扣下之后，只有这里能让它离开等待态。
 *
 * 三条设计上的取舍，都写在 `decideApproval` 与 `approvals.ts` 的注释里，这里只记由路由承担的：
 * - **批准交回的是被扣下的那一版**，不是重新跑一次的结果——用户批准的是他看过内容的那个决定，
 *   重新生成就变成"批准 A、拿到 B"。
 * - **不校验补丁还能不能落地**。批准之后补丁交回编辑区，走的仍是那条可撤销的 Command（§149/§150）；
 *   期间节点被删掉的话，那一笔会在应用时报"op 与当前文档不匹配"，界面上看得见。
 *   服务端不替这一步预演，因为预演要再读一次权威文档，而它给不出比"应用时会不会成"更强的保证。
 * - **报文里没有 taskId 之外的自报字段**：任务号在路径上，归属由账本的 `created_by` 判。
 */
export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { taskId } = await ctx.params;
  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = AiTaskApprovalRequestSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    // 30 / 10 分钟：审批不是高频操作，但"点错了一直重试"的人不该被锁死在一条已决定的任务上
    const rl = getRateLimiter().hit(rateKey('ai/approval', clientIp(req), user.id), 30, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '审批太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
    }
    const result = await decideApproval(taskId, user.id, parsed.data.decision, clientIp(req));
    if (!result.ok) {
      if (result.code === 'not_found') return notFound();
      return jsonError(409, 'not_pending', { message: result.message });
    }
    const payload = {
      taskId,
      decision: result.decision,
      status: result.status,
      // 交回与否是这个路由的全部意义，界面上要有一句不靠 HTTP 码推断的说法
      applied: result.decision === 'approve',
      approvals: result.approvals,
      held: result.held,
    };
    // 交回之前再过一次契约：库里的 jsonb 是当初校验过的那一份，但"当初"可能是改格式之前
    const validated = AiTaskApprovalResultSchema.safeParse(payload);
    if (!validated.success) {
      return failure(
        new Error(`审批回执不符合契约：${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`),
        `POST /api/ai/tasks/${taskId}/approval`,
      );
    }
    return NextResponse.json(validated.data, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, `POST /api/ai/tasks/${taskId}/approval`);
  }
}

/**
 * 看一眼这条任务的审批现场（给任务页与重开的工作台用）。
 * 这里**不返回被扣下的补丁**：读出内容不需要决定，而 §74 要的是"决定之前不动工作区"。
 */
export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { taskId } = await ctx.params;
  try {
    const user = await requireUser();
    const task = await readApprovalTask(taskId, user.id);
    if (!task) return notFound();
    return NextResponse.json(task, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, `GET /api/ai/tasks/${taskId}/approval`);
  }
}
