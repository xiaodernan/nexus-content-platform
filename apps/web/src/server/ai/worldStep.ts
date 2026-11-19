import { AiWorldStepResponseSchema } from '@nexus/schemas';
import type { AiError, AiWorldStepRequest, AiWorldStepResponse } from '@nexus/schemas';
import { aiServiceUrl, localError, readAiError } from './client';

/**
 * §WS-1 潮候步进：POST /v1/ai/world-step —— LLM 作为世界状态流转的分析层。
 * 编排固定 stategraph（一步世界 = 一张编译后的图：analyze → retrieve → narrate → canon_guard → assemble），
 * 回执带 `x-nexus-orchestration: stategraph` 头。失败语义与 chat 车道一致：
 * 5xx 抖动 800ms 后重试一次；失败如实交还调用方，不冒充潮的话。
 */
export type AiWorldStepResult =
  | { ok: true; response: AiWorldStepResponse; orchestration: string | null }
  | { ok: false; status: number | null; error: AiError; orchestration: string | null };

const RUN_TIMEOUT_MS = Number(process.env.NEXUS_AI_SERVICE_TIMEOUT_MS ?? 180_000);

export async function worldStepWithTide(
  request: AiWorldStepRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<AiWorldStepResult> {
  const base = aiServiceUrl();
  if (!base) {
    return {
      orchestration: 'stategraph',
      ok: false,
      status: null,
      error: localError(
        'provider-unavailable',
        '未配置 NEXUS_AI_SERVICE_URL',
        '启动 AI Service（npm run dev:ai）并把地址配到 web 的环境变量里。',
      ),
    };
  }
  const doPost = (): Promise<Response> =>
    fetchImpl(`${base}/v1/ai/world-step`, {
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
      orchestration: 'stategraph',
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
        orchestration: 'stategraph',
        ok: false,
        status: null,
        error: localError('provider-unavailable', `ai-service 不可达（${reason} after one retry）`, `确认 ${base} 是否在运行。`, true),
      };
    }
  }

  const orchestration = raw.headers.get('x-nexus-orchestration') ?? 'stategraph';
  if (!raw.ok) {
    return {
      orchestration,
      ok: false,
      status: raw.status,
      error: await readAiError(raw, raw.status === 503 ? 'provider-unavailable' : 'provider-failed'),
    };
  }

  let body: unknown;
  try {
    body = await raw.json();
  } catch {
    return {
      orchestration,
      ok: false,
      status: raw.status,
      error: localError('internal', 'ai-service 返回了非 JSON 响应'),
    };
  }
  const parsed = AiWorldStepResponseSchema.safeParse(body);
  if (!parsed.success) {
    return {
      orchestration,
      ok: false,
      status: raw.status,
      error: localError(
        'internal',
        `ai-service 潮候步进响应不符合契约：${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`,
      ),
    };
  }
  return { orchestration, ok: true, response: parsed.data };
}
