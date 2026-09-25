import { NextResponse } from 'next/server';
import { AiRequestSchema, AiResponseSchema } from '@nexus/schemas';
import { getAiCapabilities } from '@/lib/env';
import { assembleAiRequest } from '@/server/ai/assemble';
import { mockProvider } from '@/server/ai/mock';
import { runAiService } from '@/server/ai/client';
import { requireUser } from '@/server/domain/session';
import { finishTask, startTask, type TaskCapability } from '@/server/domain/agent-tasks';
import { emit } from '@/server/domain/notifications';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError } from '@/server/http';

/**
 * 请求体上限：上下文里的整份文档已经不让客户端发了（§68），剩下的体积大头是
 * `references[].dataUrl`（参考图的 base64），所以这个上限是为它留的，不是为文档留的。
 */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

/** 任务号从响应头走：AiResponse 是 web ↔ ai-service 的契约报文，不该被 web 侧的账本字段污染 */
function taskHeader(id: string): Record<string, string> {
  return { 'x-nexus-task': id };
}

/** 通知正文用的摘要：只说真有的东西（补丁数 / 方案数），没有就 null，不编一句"生成顺利" */
function summaryOf(response: { patches?: unknown; plans?: unknown }): string | null {
  const patches = Array.isArray(response.patches) ? response.patches.length : 0;
  const plans = Array.isArray(response.plans) ? response.plans.length : 0;
  if (!patches && !plans) return null;
  return `${patches} 处补丁 · ${plans} 份方案`;
}

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
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }

  // §112 / §164：一次 AI 请求 = 一行 agent_tasks。下面这几样在 try 外面声明，
  // 是为了让"失败也要落行"这条路（外层 catch）还能看见它们
  let taskId: string | null = null;
  let requesterId: string | null = null;
  let projectName: string | null = null;
  let capability: TaskCapability = 'demo';
  const startedAt = Date.now();

  const settle = async (ok: boolean, detail: string | null): Promise<void> => {
    if (!taskId || !requesterId) return;
    await finishTask(taskId, ok ? { ok, result: { detail } } : { ok, error: detail ?? '执行失败，没有给出原因' });
    // 今天生成是同步回话，这条通知几乎紧跟着响应到达；但它记的是"这件事真的结束了"，
    // 接上 §162 的异步队列之后，同一份代码就是那类作业的真事件——不是为通知编的样板
    await emit({
      kind: 'generation',
      recipientId: requesterId,
      projectId: parsed.data.context.projectId,
      projectName: projectName ?? '未命名项目',
      taskId,
      agentKey: parsed.data.intent,
      capability,
      ok,
      durationMs: Date.now() - startedAt,
      detail,
    });
  };

  try {
    const user = await requireUser();
    requesterId = user.id;
    const assembled = await assembleAiRequest(parsed.data, user.id);
    if (!assembled.ok) return jsonError(assembled.status, assembled.code, { message: assembled.message });

    const caps = await getAiCapabilities();
    capability = caps.text === 'real' ? 'real' : 'demo';
    const started = await startTask({
      projectId: parsed.data.context.projectId,
      // agentKey 用这次请求的意图类别：它比"design-agent"这种万能名字更能说明跑的是哪条路
      agentKey: parsed.data.intent,
      createdById: user.id,
      capability,
      input: { prompt: parsed.data.prompt.slice(0, 500), modelClass: parsed.data.modelClass, variants: parsed.data.variants },
    });
    taskId = started.id;
    projectName = started.projectName;

    if (caps.text === 'real') {
      // ai-service /healthz 报告其 llm provider 就绪：交给它调真模型；拿不到服务就明确报不可用，绝不拿 Mock 冒充（§159）
      // 注意发出去的是 assembled.wire：带目录、不带整份文档（§68）
      const result = await runAiService(assembled.wire);
      if (!result.ok) {
        await settle(false, result.error.message);
        return NextResponse.json(result.error, { status: result.status ?? 503, headers: taskHeader(taskId) });
      }
      await settle(true, summaryOf(result.response));
      return NextResponse.json(result.response, { headers: taskHeader(taskId) });
    }

    const response = await mockProvider.run(assembled.wire, { document: assembled.toolDocument });
    const validated = AiResponseSchema.safeParse(response);
    if (!validated.success) {
      const reason = `provider 输出不符合契约：${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`;
      await settle(false, reason);
      return failure(new Error(reason), 'POST /api/ai/run');
    }
    await settle(true, summaryOf(validated.data));
    return NextResponse.json(validated.data, { headers: taskHeader(taskId) });
  } catch (error) {
    // 走到这里通常是 provider 抛了：任务行不能停在 running，否则列表里永远有一条"在跑"的假象
    if (taskId) {
      const message = error instanceof Error ? error.message : String(error);
      await finishTask(taskId, { ok: false, error: message }).catch(() => undefined);
    }
    return failure(error, 'POST /api/ai/run');
  }
}
