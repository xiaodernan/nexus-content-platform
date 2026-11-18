import { AiChatResponseSchema, AiErrorSchema, AiJobAcceptedSchema, AiJobStatusResponseSchema, AiResponseSchema, HealthResponseSchema } from '@nexus/schemas';
import { resolveOrchestrationLane, type OrchestrationLane } from './orchestrationLane';
import type { AiChatRequest, AiChatResponse, AiError, AiJobAccepted, AiJobStatusResponse, AiRequest, AiResponse, HealthResponse } from '@nexus/schemas';

/**
 * web → ai-service 的客户端（docs/ARCHITECTURE.md 边界纪律 2：补丁由 web 应用，service 只产出结果）。
 * 两侧都按 `contracts/*.json` 校验；这里再用 zod 复核一次，契约违约必须当场看见。
 */

const RUN_TIMEOUT_MS = Number(process.env.NEXUS_AI_SERVICE_TIMEOUT_MS ?? 180_000);
const HEALTH_TIMEOUT_MS = 1_500;

/**
 * 开发模式下的缺省地址：端口约定在三处（infra/dev-ai.sh 的 AI_SERVICE_PORT、
 * ai-service config.py 的 port=3200、这里）。少配一处，整条真链路就安静退回确定性 Mock，
 * 而界面只会显示 DEMO MODE——看不出 provider 其实活着。所以开发模式按约定补一个值。
 * 生产不补：没配就是没配，要诚实报未配置（§160），而不是去连一个必然连不上的 127.0.0.1。
 */
const DEV_DEFAULT_PORT = '3200';

export function aiServiceUrl(): string | null {
  const raw = process.env.NEXUS_AI_SERVICE_URL;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed) return trimmed.replace(/\/+$/, '');
  if (process.env.NODE_ENV !== 'development') return null;
  const port = (process.env.AI_SERVICE_PORT ?? '').trim() || DEV_DEFAULT_PORT;
  return `http://127.0.0.1:${port}`;
}

function localError(code: AiError['code'], message: string, hint?: string, retryable = false): AiError {
  return { code, message, ...(hint ? { hint } : {}), retryable };
}

async function readAiError(response: Response, fallbackCode: AiError['code']): Promise<AiError> {
  const text = (await response.text()).slice(0, 2_000);
  try {
    const parsed = AiErrorSchema.safeParse(JSON.parse(text) as unknown);
    if (parsed.success) return parsed.data;
  } catch {
    /* 非 JSON 错误体：下面统一包装 */
  }
  return localError(fallbackCode, `ai-service ${response.status}：${text || '无响应体'}`);
}

export type AiServiceRunResult =
  | { ok: true; response: AiResponse }
  | { ok: false; status: number | null; error: AiError };

export async function runAiService(
  request: AiRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<AiServiceRunResult> {
  const base = aiServiceUrl();
  if (!base) {
    return {
      ok: false,
      status: null,
      error: localError(
        'provider-unavailable',
        '未配置 NEXUS_AI_SERVICE_URL',
        '启动 AI Service（npm run dev:ai）并把地址配到 web 的环境变量里。',
      ),
    };
  }

  let raw: Response;
  try {
    raw = await fetchImpl(`${base}/v1/ai/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown';
    return {
      ok: false,
      status: null,
      error: localError('provider-unavailable', `ai-service 不可达（${reason}）`, `确认 ${base} 是否在运行。`, true),
    };
  }

  if (!raw.ok) {
    return { ok: false, status: raw.status, error: await readAiError(raw, raw.status === 503 ? 'provider-unavailable' : 'provider-failed') };
  }

  let body: unknown;
  try {
    body = await raw.json();
  } catch {
    return { ok: false, status: raw.status, error: localError('internal', 'ai-service 返回了非 JSON 响应') };
  }
  const parsed = AiResponseSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: raw.status,
      error: localError(
        'internal',
        `ai-service 响应不符合契约：${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`,
      ),
    };
  }
  return { ok: true, response: parsed.data };
}

export type AiServiceDesignGraphResult =
  | { ok: true; status: number; orchestration: string | null; response: AiResponse }
  | { ok: false; status: number | null; orchestration: string | null; error: AiError };

/**
 * cont. 169 · `/v1/ai/design-graph`（LangGraph StateGraph 编排）专用客户端。
 *
 * 与 `runAiService` 同一契约（AiRequest → AiResponse，同一 zod 双保险），唯一区别是路径
 * 换成 `/v1/ai/design-graph`，并且**额外读取**响应头 `x-nexus-orchestration`：
 * 它是"这一次走的是状态图路由"的唯一公开标记 —— 图坏掉/超时/503 时，header 照样会如实
 * 返回，页面不替它说话。真实响应由 `apps/ai-service/src/ai_service/stategraph.py` 的
 * 7 个节点产生：validate → check_provider → build_prefix → call_llm → cache_read →
 * parse_and_release → assemble。任一节点失败即条件边直通 END。
 */
export async function runDesignGraph(
  request: AiRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<AiServiceDesignGraphResult> {
  const base = aiServiceUrl();
  if (!base) {
    return {
      ok: false,
      status: null,
      orchestration: null,
      error: localError(
        'provider-unavailable',
        '未配置 NEXUS_AI_SERVICE_URL',
        '先启动 AI Service（npm run dev:ai）或在环境里补上地址。',
      ),
    };
  }

  let raw: Response;
  try {
    raw = await fetchImpl(`${base}/v1/ai/design-graph`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown';
    return {
      ok: false,
      status: null,
      orchestration: null,
      error: localError('provider-unavailable', `ai-service 连不上（${reason}）`, `确认 ${base} 是否在跑。`, true),
    };
  }

  const orchestration = raw.headers.get('x-nexus-orchestration');
  if (!raw.ok) {
    return {
      ok: false,
      status: raw.status,
      orchestration,
      error: await readAiError(raw, raw.status === 503 ? 'provider-unavailable' : 'provider-failed'),
    };
  }

  let body: unknown;
  try {
    body = await raw.json();
  } catch {
    return { ok: false, status: raw.status, orchestration, error: localError('internal', 'ai-service 返回了坏 JSON 响应') };
  }
  const parsed = AiResponseSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: raw.status,
      orchestration,
      error: localError(
        'internal',
        `ai-service 响应不符合契约（${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}）`,
      ),
    };
  }
  return { ok: true, status: raw.status, orchestration, response: parsed.data };
}

/** 就绪面板用：拿不到就返回 null，由调用方回落到本地能力判断，绝不编造状态 */
export async function fetchAiServiceHealth(fetchImpl: typeof fetch = fetch): Promise<HealthResponse | null> {  const base = aiServiceUrl();
  if (!base) return null;
  try {
    const raw = await fetchImpl(`${base}/healthz`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS), cache: 'no-store' });
    if (!raw.ok) return null;
    const parsed = HealthResponseSchema.safeParse(await raw.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * §162 异步作业的两条传输。提交与查询都只做 HTTP + 契约校验，
 * " observed 状态怎么落进账本"在 `domain/ai-jobs.ts`——那部分要碰库，不该混在客户端里。
 *
 * 超时比同步生成短得多是有意的：`POST /v1/ai/jobs` 只是入队，`GET` 只是读一行状态，
 * 两者都不该挂在一等结果上；挂住了就是服务出问题，要立刻让调用方知道，而不是占着一个请求。
 */
const JOB_TIMEOUT_MS = Number(process.env.NEXUS_AI_JOB_TIMEOUT_MS ?? 8_000);

async function jobRequest<T>(
  path: string,
  init: RequestInit,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: unknown } },
  parseFailMessage: string,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; data: T } | { ok: false; status: number | null; error: AiError }> {
  const base = aiServiceUrl();
  if (!base) {
    return { ok: false, status: null, error: localError('provider-unavailable', '未配置 NEXUS_AI_SERVICE_URL', '启动 AI Service（npm run dev:ai）。') };
  }
  let raw: Response;
  try {
    raw = await fetchImpl(`${base}${path}`, { ...init, signal: AbortSignal.timeout(JOB_TIMEOUT_MS), cache: 'no-store' });
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown';
    return { ok: false, status: null, error: localError('provider-unavailable', `ai-service 不可达（${reason}）`, `确认 ${base} 是否在运行。`, true) };
  }
  if (!raw.ok) {
    // 404 要原样带出去：调用方分不清"作业不存在"与"服务没答话"，就没法决定该不该把任务停在 running
    return { ok: false, status: raw.status, error: await readAiError(raw, raw.status === 503 ? 'provider-unavailable' : 'provider-failed') };
  }
  let body: unknown;
  try {
    body = await raw.json();
  } catch {
    return { ok: false, status: raw.status, error: localError('internal', `ai-service ${path} 返回了非 JSON 响应`) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: raw.status, error: localError('internal', `${parseFailMessage}：${String(parsed.error)}`.slice(0, 600)) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * §47 角色对话的传输。与 `runAiService` 同一形状：HTTP + 双端契约复核，
 * 拿不到真实结果时明确报不可用，绝不在这里回落到模板（§159）。
 * 超时给足 60 秒：对话是一次完整生成，不是入队/读状态那种轻查询。
 *
 * cont.254 · 编排车道：与 /api/ai/run 同一口径——默认走 ai-service `/v1/ai/chat-graph`
 * （LangGraph StateGraph：validate → check_provider → build_prefix → call_llm →
 * cache_read → parse_and_release → assemble；与线性通道逐字节同构的 AiChatResponse）。
 * 逃生门：`NEXUS_AI_CHAT_ORCHESTRATION=lane-a`（或请求方传 `options.orchestration: 'lane-a'`）
 * 退回 `/v1/ai/chat`。ai-service 回的 `x-nexus-orchestration` 响应头原样透出在
 * `result.orchestration` 里——页面可以如实展示这一趟走的是哪条车道，不猜。
 */
export type AiChatResult = { ok: true; response: AiChatResponse; orchestration: string | null } | { ok: false; status: number | null; error: AiError; orchestration: string | null };

export async function chatWithCharacter(
  request: AiChatRequest,
  fetchImpl: typeof fetch = fetch,
  options?: { orchestration?: OrchestrationLane | null },
): Promise<AiChatResult> {
  const lane = options?.orchestration ?? resolveOrchestrationLane(null, process.env.NEXUS_AI_CHAT_ORCHESTRATION ?? process.env.NEXUS_AI_ORCHESTRATION);
  const path = lane === 'stategraph' ? '/v1/ai/chat-graph' : '/v1/ai/chat';
  const base = aiServiceUrl();
  if (!base) {
    return {
      orchestration: lane,
      ok: false,
      status: null,
      error: localError(
        'provider-unavailable',
        '未配置 NEXUS_AI_SERVICE_URL',
        '启动 AI Service（npm run dev:ai）并把地址配到 web 的环境变量里。',
      ),
    };
  }

  // §159 诚实边界：provider 5xx 抖动（网关间歇 502/503）→ 800ms 后重试一次；
  // 4xx/429 不重试（参数错或限速是确定性错误，重打只会更难抢容量）；
  // 重试仍失败才把这次失败交还给调用方，让它按自己的取向走 honest/demo/hard-fail。
  const doPost = (): Promise<Response> =>
    fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
      cache: 'no-store',
    });

  let raw: Response;
  try {
    raw = await doPost();
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown';
    return {
      orchestration: lane,
      ok: false,
      status: null,
      error: localError('provider-unavailable', `ai-service 不可达（${reason}）`, `确认 ${base} 是否在运行。`, true),
    };
  }
  if (raw.status >= 500) {
    await new Promise((r) => setTimeout(r, 800));
    try {
      raw = await doPost();
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown';
      return {
        orchestration: lane,
        ok: false,
        status: null,
        error: localError('provider-unavailable', `ai-service 不可达（${reason} after one retry）`, `确认 ${base} 是否在运行。`, true),
      };
    }
  }

  const orchestration = raw.headers.get('x-nexus-orchestration') ?? lane;

  if (!raw.ok) {
    return { orchestration, ok: false, status: raw.status, error: await readAiError(raw, raw.status === 503 ? 'provider-unavailable' : 'provider-failed') };
  }

  let body: unknown;
  try {
    body = await raw.json();
  } catch {
    return { orchestration, ok: false, status: raw.status, error: localError('internal', 'ai-service 返回了非 JSON 响应') };
  }
  const parsed = AiChatResponseSchema.safeParse(body);
  if (!parsed.success) {
    return {
      orchestration,
      ok: false,
      status: raw.status,
      error: localError(
        'internal',
        `ai-service 对话响应不符合契约：${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`,
      ),
    };
  }
  return { orchestration, ok: true, response: parsed.data };
}

export type AiJobAcceptedResult = { ok: true; accepted: AiJobAccepted } | { ok: false; status: number | null; error: AiError };

export async function submitAiJob(request: AiRequest, fetchImpl: typeof fetch = fetch): Promise<AiJobAcceptedResult> {
  const r = await jobRequest(
    '/v1/ai/jobs',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) },
    AiJobAcceptedSchema,
    'ai-service 的作业回执不符合契约',
    fetchImpl,
  );
  return r.ok ? { ok: true, accepted: r.data } : r;
}

export type AiJobStatusResult = { ok: true; status: AiJobStatusResponse } | { ok: false; status: number | null; error: AiError };

export async function fetchAiJobStatus(jobId: string, fetchImpl: typeof fetch = fetch): Promise<AiJobStatusResult> {
  const r = await jobRequest(
    `/v1/ai/jobs/${encodeURIComponent(jobId)}`,
    { method: 'GET' },
    AiJobStatusResponseSchema,
    'ai-service 的作业状态不符合契约',
    fetchImpl,
  );
  return r.ok ? { ok: true, status: r.data } : r;
}

/**
 * §162 取消/重试：受理一次取消。200 不等于"已经停了"——在跑的作业只立了标志，
 * 状态由 worker 在检查点落成 cancelled；所以 200 那份 body 是**受理后的当前状态**（可能仍是 running），
 * 调用方要照实显示"已受理"，不许把它改写成"已取消"。
 * 404（作业不在后端）与 409（已经结束，取消来不及）原样带出，由 web 侧决定怎么回话。
 */
export type AiJobCancelResult = { ok: true; status: AiJobStatusResponse } | { ok: false; status: number | null; error: AiError };

export async function cancelAiJob(jobId: string, fetchImpl: typeof fetch = fetch): Promise<AiJobCancelResult> {
  const r = await jobRequest(
    `/v1/ai/jobs/${encodeURIComponent(jobId)}/cancel`,
    { method: 'POST' },
    AiJobStatusResponseSchema,
    'ai-service 的取消回执不符合契约',
    fetchImpl,
  );
  return r.ok ? { ok: true, status: r.data } : r;
}
