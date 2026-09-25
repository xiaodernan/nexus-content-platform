import { AiErrorSchema, AiJobAcceptedSchema, AiJobStatusResponseSchema, AiResponseSchema, HealthResponseSchema } from '@nexus/schemas';
import type { AiError, AiJobAccepted, AiJobStatusResponse, AiRequest, AiResponse, HealthResponse } from '@nexus/schemas';

/**
 * web → ai-service 的客户端（docs/ARCHITECTURE.md 边界纪律 2：补丁由 web 应用，service 只产出结果）。
 * 两侧都按 `contracts/*.json` 校验；这里再用 zod 复核一次，契约违约必须当场看见。
 */

const RUN_TIMEOUT_MS = Number(process.env.NEXUS_AI_SERVICE_TIMEOUT_MS ?? 60_000);
const HEALTH_TIMEOUT_MS = 1_500;

export function aiServiceUrl(): string | null {
  const raw = process.env.NEXUS_AI_SERVICE_URL;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed ? trimmed.replace(/\/+$/, '') : null;
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
