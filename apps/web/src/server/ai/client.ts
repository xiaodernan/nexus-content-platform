import { AiErrorSchema, AiResponseSchema, HealthResponseSchema } from '@nexus/schemas';
import type { AiError, AiRequest, AiResponse, HealthResponse } from '@nexus/schemas';

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
export async function fetchAiServiceHealth(fetchImpl: typeof fetch = fetch): Promise<HealthResponse | null> {
  const base = aiServiceUrl();
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
