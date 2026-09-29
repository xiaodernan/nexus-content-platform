import { NextResponse } from 'next/server';
import { AgentPlanSchema } from '@nexus/schemas';
import {
  AgentRunRequestSchema,
  ReadinessReportSchema,
  StepReportSchema,
  type AgentRunView,
} from '@/lib/agent-runtime';
import { convergeStaleRun, latestPlannedTask, type PlannedTaskView } from '@/server/domain/agent-tasks';
import { projectBelongsTo } from '@/server/domain/projects';
import { requireUser } from '@/server/domain/session';
import { runReadinessCheck } from '@/server/agent/runtime';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';
import { csrfOk } from '@/server/security/csrf';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * §112「上架前检查」这一条作业的入口。
 *
 * - `GET`：这个项目最近一次编排（计划 + 逐步结论）。界面刷新后靠它拿权威状态——
 *   实时事件只是加速器、断线不补发（ADR-0010 后果第 4 条），所以刷新必须能自证。
 * - `POST`：跑一次。**同步跑完**（今天这四步都是本机读数，不调 provider），返回的仍然是
 *   "读回库里的那一行"，而不是另拼一份响应体：两个入口读同一条路径，就不会出现
 *   "提交时看到的与刷新后看到的不一样"。
 *
 * 归属判定与项目里其他路由同一口径：不是你的项目一律 404，连"有没有过作业"都不给。
 */

/** 库里的那一行 → 界面用的那一份。计划与逐步结论都要过合同校验；读不出来就给 null / 空数组，界面照实说"读不到" */
function viewOf(task: PlannedTaskView): AgentRunView {
  const stored = (task.result ?? {}) as { steps?: unknown; report?: unknown };
  const plan = task.plan === null ? null : AgentPlanSchema.safeParse(task.plan);
  const steps = StepReportSchema.array().safeParse(stored.steps ?? []);
  const report = ReadinessReportSchema.safeParse(stored.report ?? null);
  return {
    taskId: task.taskId,
    projectId: task.projectId,
    projectName: task.projectName,
    status: task.status,
    capability: task.capability,
    error: task.error,
    plan: plan?.success ? plan.data : null,
    steps: steps.success ? steps.data : [],
    report: report.success ? report.data : null,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    createdAt: task.createdAt,
  };
}

const NO_STORE = { 'cache-control': 'no-store' } as const;

export async function GET(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    let task = await latestPlannedTask(projectId, user.id);
    if (!task) return NextResponse.json({ ok: true, run: null }, { headers: NO_STORE });
    // 断在半路的那一行：读的时候收敛（§162 / ADR-0011 同一口径），收敛之后重新读一次，
    // 免得把收敛前的旧快照交给界面
    if (await convergeStaleRun(task.taskId)) task = (await latestPlannedTask(projectId, user.id)) ?? task;
    return NextResponse.json({ ok: true, run: viewOf(task) }, { headers: NO_STORE });
  } catch (error) {
    return failure(error, `GET /api/projects/${projectId}/agent`);
  }
}

export async function POST(req: Request, ctx: RouteContext): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const { projectId } = await ctx.params;
  try {
    const user = await requireUser();
    if (!(await projectBelongsTo(projectId, user.id))) return notFound();
    const parsed = AgentRunRequestSchema.safeParse((await readJson(req)) ?? {});
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`));
    }
    const result = await runReadinessCheck({ projectId, actorId: user.id, goal: parsed.data.goal });
    if (!result.ok) return jsonError(result.refusal.status, result.refusal.code, { message: result.refusal.message });
    const task = await latestPlannedTask(projectId, user.id);
    if (!task) return failure(new Error('编排跑完了但读不回那一行任务'), `POST /api/projects/${projectId}/agent`);
    return NextResponse.json({ ok: true, run: viewOf(task) }, { headers: NO_STORE });
  } catch (error) {
    return failure(error, `POST /api/projects/${projectId}/agent`);
  }
}
