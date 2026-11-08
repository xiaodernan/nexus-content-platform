import { NextResponse } from 'next/server';
import { AgentDraftAcceptRequestSchema, StepReportSchema, type StepReport } from '@/lib/agent-runtime';
import { plannedTask } from '@/server/domain/agent-tasks';
import { recordAudit } from '@/server/domain/audit';
import { projectWriteAccess } from '@/server/domain/team';
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
 * - **草稿从库里读，不从请求体里收**。请求体只有 `taskId` 与可选的 `stepId`；那份游戏文档是服务端
 *   从任务行的 `result.steps[].draft` 拿出来的。收整份文档等于让调用方把任意一份设计贴进项目，
 *   而这一片的卖点恰恰是"接受的是这一步真跑出来的那一份"。
 * - **已有游戏就不覆盖**（`saveGame(..., { createOnly: true })`）。接受是"多给一份东西"，
 *   不是"顶掉你正在编辑的那份"；冲掉用户作品一次，之后所有「接受」按钮都没人敢点。
 *
 * 编排本身仍然只读（§112 那几步加 §52 这条链都不碰项目内容），落地只由这一下点击发生。
 * 撤销不走这里——进了项目就是普通的 Game Studio 文档，走 §150 那套 Command。
 */

/**
 * §52 那条链现在有两步会留草稿（game 的原始草稿、combat 调过数值的那一份），
 * 所以这里**不再写死步骤 id**：请求体带 `stepId` 就接那一步，不带就接这份任务里
 * **最后一个留了草稿的步骤**——也就是链末端那份（调过的）。界面上每个草稿各自带自己的
 * stepId，用户点的是哪一步就说得清是哪一步。
 *
 * 两种答案都是"从任务行读草稿"，请求体里永远没有文档本体（ADR-0035 那条线不动）。
 */
function pickDraft(steps: StepReport[], stepId: string | undefined): { step: StepReport | null; available: string[] } {
  const withDraft = steps.filter((step) => step.draft);
  if (stepId === undefined) return { step: withDraft[withDraft.length - 1] ?? null, available: withDraft.map((step) => step.id) };
  return { step: withDraft.find((step) => step.id === stepId) ?? null, available: withDraft.map((step) => step.id) };
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    const writeAccess = await projectWriteAccess(projectId, user.id);
    if (writeAccess === 'not_found') return notFound();
    if (writeAccess === 'read_only') return jsonError(403, 'read_only_role', { message: '查看者（viewer）角色对这个项目只读；写入权限在 owner 与 editor 手里' });
    const rl = await getRateLimiter().hit(rateKey('agent/draft/accept', clientIp(req), user.id), 20, 10 * 60_000);
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
    const picked = steps.success ? pickDraft(steps.data, parsed.data.stepId) : { step: null, available: [] as string[] };
    const draft = picked.step?.draft;
    if (!draft) {
      await recordAudit({
        actorId: user.id,
        action: 'agent.game.accept',
        targetType: 'agent_task',
        targetId: task.taskId,
        allowed: false,
        detail: { reason: 'draft-missing', projectId, stepId: parsed.data.stepId ?? null, available: picked.available },
        ip: clientIp(req),
      });
      const where = parsed.data.stepId ? `步骤「${parsed.data.stepId}」` : '这份任务';
      // 只有真有别的选择时才报清单：写着"还有 0 个"的那句话是在教用户找一个不存在的东西
      const elsewhere = picked.available.length > 0 ? `这份任务里留下草稿的是另外 ${picked.available.length} 步（${picked.available.join('、')}）。` : '';
      return jsonError(409, 'draft_missing', {
        message: steps.success
          ? `${where}没有可读回的草稿——它可能没跑成（被牵连跳过或失败），或者这一行建于草稿落地之前。${elsewhere}` +
            '重新跑一次检查再来接受。'
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
