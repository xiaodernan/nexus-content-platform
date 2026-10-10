import { NextResponse } from 'next/server';
import { AgentDraftAcceptRequestSchema, StepReportSchema } from '@/lib/agent-runtime';
import { plannedTask } from '@/server/domain/agent-tasks';
import { recordAudit } from '@/server/domain/audit';
import { projectBelongsTo } from '@/server/domain/projects';
import { requireUser } from '@/server/domain/session';
import { saveGame } from '@/server/domain/games';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §52 的落地入口：把编排里那一步的**游戏草稿**接受进项目。
 *
 * 为什么要有这一格：§52 的原话是"Game Agent 生成游戏草稿"，而草稿如果只存在于步骤结论的
 * 文字里，它就不是产物而是描述。这一格给它一个真去处，同时守住两条线（见 ADR-0035）：
 * - **草稿从库里读，不从请求体里收**。请求体只有 `taskId`；那份游戏文档是服务端从任务行的
 *   `result.steps[].draft` 拿出来的。收整份文档等于让调用方把任意一份设计贴进项目，
 *   而这一片的卖点恰恰是"接受的是这一步真跑出来的那一份"。
 * - **已有游戏就不覆盖**（`saveGame(..., { createOnly: true })`）。接受是"多给一份东西"，
 *   不是"顶掉你正在编辑的那份"；冲掉用户作品一次，之后所有「接受」按钮都没人敢点。
 *
 * 编排本身仍然只读（§112 那四步 + 这一步都不碰项目内容），落地只由这一下点击发生。
 * 撤销不走这里——进了项目就是普通的 Game Studio 文档，走 §150 那套 Command。
 */

/** 计划里那一步的 id 就是配方里的 kind（`buildReadinessPlan` 用 spec.kind 当 id） */
const GAME_STEP_ID = 'game';

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const rl = getRateLimiter().hit(rateKey('agent/draft/accept', clientIp(req), user.id), 20, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '接受太频繁，稍后再试', retryAfterMs: rl.retryAfterMs });
    }

    const parsed = AgentDraftAcceptRequestSchema.safeParse(await readJson(req));
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`));
    }

    const task = await plannedTask(parsed.data.taskId, user.id);
    // 别人的任务、不存在的任务、挂在别的项目上的任务给同一个答案：这一行里存着提示词摘要与草稿，
    // "存在但不给你"本身就是信息（与 readRetryableTask / decideApproval 同一口径）
    const NOT_MINE = { message: '这一步的草稿读不回来：任务不存在、不属于你，或者不属于这个项目。' };
    if (!task || task.projectId !== projectId) return jsonError(404, 'not_found', NOT_MINE);

    const steps = StepReportSchema.array().safeParse((task.result as { steps?: unknown } | null)?.steps ?? []);
    const draft = steps.success ? steps.data.find((step) => step.id === GAME_STEP_ID)?.draft : undefined;
    if (!draft) {
      await recordAudit({
        actorId: user.id,
        action: 'agent.game.accept',
        targetType: 'agent_task',
        targetId: task.taskId,
        allowed: false,
        detail: { reason: 'draft-missing', projectId },
        ip: clientIp(req),
      });
      return jsonError(409, 'draft_missing', {
        message: steps.success
          ? '这一步没有留下可读回的草稿——它可能没跑成（被牵连跳过或失败），或者这一行建于草稿落地之前。重新跑一次检查再来接受。'
          : '这一步的结论读不回来（报文不合契约），所以没有东西可接受。',
      });
    }

    const result = await saveGame(projectId, user.id, draft, { createOnly: true });
    if (!result.ok) {
      await recordAudit({
        actorId: user.id,
        action: 'agent.game.accept',
        targetType: 'agent_task',
        targetId: task.taskId,
        allowed: false,
        detail: { reason: 'refused', message: result.reason, projectId },
        ip: clientIp(req),
      });
      return jsonError(409, 'accept_refused', { message: result.reason });
    }

    await recordAudit({
      actorId: user.id,
      action: 'agent.game.accept',
      targetType: 'game',
      targetId: result.document.id,
      allowed: true,
      detail: { taskId: task.taskId, projectId, entities: result.document.entities.length },
      ip: clientIp(req),
    });
    return NextResponse.json({ ok: true, document: result.document }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/agent/draft`);
  }
}
