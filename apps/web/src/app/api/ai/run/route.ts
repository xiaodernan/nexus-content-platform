import { NextResponse } from 'next/server';
import { AiRequestSchema, AiResponseSchema, type AiResponse } from '@nexus/schemas';
import { getAiCapabilities } from '@/lib/env';
import { assembleAiRequest } from '@/server/ai/assemble';
import { gateResponse, heldRecord, nodeNamer, WEB_APPROVAL_POLICY, DESIGN_PATCH } from '@/server/ai/approvals';
import { mockProvider } from '@/server/ai/mock';
import { runAiService } from '@/server/ai/client';
import { requireUser } from '@/server/domain/session';
import { agentLedgerFields, mentionNote } from '@/server/domain/agents';
import { finishTask, holdForApproval, recordCapabilityRefusal, recordTaskUsage, startTask, type TaskCapability } from '@/server/domain/agent-tasks';
import { refusalForRun } from '@/server/domain/credit-ledger';
import { clientIp, ipWriteGate } from '@/server/security/rateLimit';
import { increment, observe } from '@/server/observability';
import { emit } from '@/server/domain/notifications';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError } from '@/server/http';

/**
 * 请求体上限：上下文里的整份文档已经不让客户端发了（§68），剩下的体积大头是
 * `references[].dataUrl`（参考图的 base64），所以这个上限是为它留的，不是为文档留的。
 */
const MAX_BODY_BYTES = 6 * 1024 * 1024;

/** 任务号与这一轮的 Agent 从响应头走：AiResponse 是 web ↔ ai-service 的契约报文，不该被 web 侧的账本字段污染 */
function taskHeader(id: string, agentKey?: string | null, note?: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'x-nexus-task': id };
  if (agentKey) headers['x-nexus-agent'] = agentKey;
  // 提及没解析成 Agent 时的那一句（点名点错了 / 名册没播种）。HTTP 头只能是 ASCII，所以编码一次
  if (note) headers['x-nexus-agent-note'] = encodeURIComponent(note);
  return headers;
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
  // §137 的 guest 自动签发：无会话客户端的 user.id 每请求都是新的，按身份限流对它空转。
  // 所以这道按 IP 的闸必须放在 requireUser() 之前——被挡住的请求一个 guest 都不该建。
  const gate = await ipWriteGate('ai/run', req, 60, 3600000);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '生成请求太频繁了，稍后再试', retryAfterMs: gate.retryAfterMs });
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
  /**
   * 这一行账挂在谁名下：§112 解析出的 Agent，没人被点名时退回这次请求的意图类别。
   * 在 try 外面声明，所以装配之前就失败的请求也有一条可读的归属可记。
   */
  let agentKey: string | null = null;
  /** 提及没解析成 Agent 时的那一句（点名点错了 / 名册没播种），在响应头里带给界面 */
  let agentNote: string | null = null;
  const startedAt = Date.now();

  const settle = async (ok: boolean, detail: string | null): Promise<void> => {
    /**
     * 计数放在 `if (!taskId …) return` **之前**：taskId 还没建就失败的那几次也是"这次请求走到终态了"，
     * 漏掉它们会让这条曲线在最需要看的时候（装配之前就炸）恰好是平的。
     * 同一个 `durationMs` 喂给指标和 §164 的通知——两处各算一次时间，就会有两个数，
     * 而"面板说 1.2 秒、通知说 1.9 秒"这种事没人能解释。
     */
    const durationMs = Date.now() - startedAt;
    increment('nexus_ai_runs_total', { capability, outcome: ok ? 'ok' : 'failed' });
    observe('nexus_ai_run_duration_ms', durationMs, { capability, outcome: ok ? 'ok' : 'failed' });
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
      agentKey: agentKey ?? parsed.data.intent,
      capability,
      ok,
      durationMs,
      detail,
    });
  };

  /**
   * 一次 HTTP 200 不等于这次生成做成了什么。provider 可以带着 `error` 返回 200
   * （DEMO Mock 遇到没实现的指令就是这样），而账本与 §164 的通知要的是**这次请求的终态**：
   * 一个补丁都没落地的请求记成"完成"，那条"Generation complete"就成指着的假事件。
   */
  const settleFromResponse = async (response: AiResponse): Promise<void> => {
    const softFailure = response.error ?? null;
    await settle(!softFailure, softFailure ? `${softFailure.code}：${softFailure.message}` : summaryOf(response));
  };

  try {
    const user = await requireUser();
    requesterId = user.id;
    const assembled = await assembleAiRequest(parsed.data, user.id);
    if (!assembled.ok) return jsonError(assembled.status, assembled.code, { message: assembled.message });

    const caps = await getAiCapabilities();
    capability = caps.text === 'real' ? 'real' : 'demo';
    // §112：这一轮交给谁，由服务端按名册解析（客户端只能提名）。没人被点名时 agentKey 留 null，
    // 账本那一行就退回意图类别——它比"design-agent"这种万能名字更能说明跑的是哪条路。
    const resolved = assembled.agent;
    const ledgerFields = agentLedgerFields(resolved, { askedAgentKey: parsed.data.agentKey, fallbackKey: parsed.data.intent });
    agentKey = resolved.agent?.key ?? null;
    agentNote = mentionNote(ledgerFields);
    // §133/§134：额度用尽时这一句就是全部后果——任务行不写、provider 不调、通知不发。
    // 放在 startTask 之前：扣点只记在**成功**的任务上，一条从没跑起来的请求如果先落了 running 行，
    // 它就成了任务列表里一条"在跑然后失败了"的假账。
    const refusal = await refusalForRun(user.id, ledgerFields.agentKey);
    if (refusal) return jsonError(429, 'credits_exhausted', { message: refusal });
    const started = await startTask({
      projectId: parsed.data.context.projectId,
      agentKey: ledgerFields.agentKey,
      createdById: user.id,
      capability,
      input: {
        prompt: parsed.data.prompt.slice(0, 500),
        modelClass: parsed.data.modelClass,
        variants: parsed.data.variants,
        // §74：事后看得清"这一行是被哪份规矩管着的"——策略是服务端定的，不是客户端报的
        approvalPolicy: WEB_APPROVAL_POLICY,
        // §111/§112：点了谁、名册里没有谁、还点了但这一轮不由它们做谁。
        // 后两样必须留痕：只记"成功的那一个"的话，一次被 @fy 拼错的请求事后看起来就像"没人点过"
        ...ledgerFields,
      },
    });
    taskId = started.id;
    projectName = started.projectName;
    const nameOf = nodeNamer(assembled.toolDocument);

    /**
     * §74 的门在这里：过不了门的补丁不会离开服务端。两条 provider 路（真服务 / DEMO Mock）
     * 走同一个 `deliver`，所以"接上第 N 家 provider 就有第 N 种审批口径"这件事不会发生。
     * §73 的那半（被点名的 Agent 有没有 design.patch）也在同一个函数里判——同一个道理：
     * 一条路管一条路，就等于两条路各有一套规矩。
     */
    const deliver = async (response: AiResponse, id: string): Promise<NextResponse> => {
      // §75：provider 已经跑过，用量先落账——审批挂起与越权拒收只决定"补丁交不交回"，
      // 不会退还已经烧掉的 token。记在门之前，是因为门之后的 `delivered` 是改写过的报文
      //（挂起时补丁被抽走），而 usage 属于"那次调用本身"。
      await recordTaskUsage(id, response.usage);
      const gate = gateResponse(response, WEB_APPROVAL_POLICY, nameOf, resolved.agent);
      if (gate.approvals.length > 0) {
        // 挂起：终态不写、§164 通知不发——"Generation complete"替一次还没人决定的事签字就是假事件
        await holdForApproval(id, heldRecord(gate, WEB_APPROVAL_POLICY));
        return NextResponse.json(gate.delivered, { headers: taskHeader(id, agentKey, agentNote) });
      }
      if (gate.refused && resolved.agent) {
        // §73 的后半句："越权调用直接失败**并记录审计事件**"。不写这一行的话，
        // "QA 试过改画布"这件事只剩界面上一句提示，关掉窗口就没有证据了
        await recordCapabilityRefusal({
          taskId: id,
          actorId: requesterId,
          projectId: parsed.data.context.projectId,
          agentKey: resolved.agent.key,
          agentName: gate.refused.agent,
          missing: DESIGN_PATCH,
          opCount: gate.refused.opCount,
          ip: clientIp(req),
        });
      }
      // 未挂起时 `delivered` 就是 `response` 本身；被拒收时它是"补丁已抽走 + permission-denied"那一份，
      // 而终态要记的正是交回客户端的那一份说了什么——记成原始 response 就成了账本与界面两套话
      await settleFromResponse(gate.delivered);
      return NextResponse.json(gate.delivered, { headers: taskHeader(id, agentKey, agentNote) });
    };

    if (caps.text === 'real') {
      // ai-service /healthz 报告其 llm provider 就绪：交给它调真模型；拿不到服务就明确报不可用，绝不拿 Mock 冒充（§159）
      // 注意发出去的是 assembled.wire：带目录、不带整份文档（§68）
      const result = await runAiService(assembled.wire);
      if (!result.ok) {
        await settle(false, result.error.message);
        return NextResponse.json(result.error, { status: result.status ?? 503, headers: taskHeader(taskId, agentKey, agentNote) });
      }
      return deliver(result.response, taskId);
    }

    const response = await mockProvider.run(assembled.wire, { document: assembled.toolDocument });
    const validated = AiResponseSchema.safeParse(response);
    if (!validated.success) {
      const reason = `provider 输出不符合契约：${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`;
      await settle(false, reason);
      return failure(new Error(reason), 'POST /api/ai/run');
    }
    return deliver(validated.data, taskId);
  } catch (error) {
    // 走到这里通常是 provider 抛了：任务行不能停在 running，否则列表里永远有一条"在跑"的假象
    if (taskId) {
      const message = error instanceof Error ? error.message : String(error);
      await finishTask(taskId, { ok: false, error: message }).catch(() => undefined);
    }
    return failure(error, 'POST /api/ai/run');
  }
}
