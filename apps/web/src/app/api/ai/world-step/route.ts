import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { WorldStepStateSchema } from '@nexus/schemas';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { worldStepWithTide } from '@/server/ai/worldStep';
import { getAiCapabilities } from '@/lib/env';
import { increment, observe } from '@/server/observability';

export const dynamic = 'force-dynamic';

/**
 * §WS-1 · POST /api/ai/world-step — 潮候步进：LLM 作为世界状态流转的分析层。
 *
 * 一步 = 一张编译后的 StateGraph：analyze（真 LLM · 读局 · 微小前缀）→ retrieve（本地锚句检索，0 token）
 * → narrate（真 LLM · canon digest 稳定前缀）→ canon_guard（逐字核验）→ assemble。
 * 状态权威在客户端（localStorage nexus-tidewatch-v1）；本路由不写库、不记账，只做一次分析与转发。
 * 纪律与整座「潮」家族一致：口令 123（nexus-insight=1）· CSRF 双提交 · IP 10/h · provider 不可用 → 如实 5xx。
 */
const BodySchema = z.object({
  locale: z.enum(['zh', 'en']).default('zh'),
  state: WorldStepStateSchema,
  move: z.string().min(1).max(600),
});

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('ai/world-step', req);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '潮走得太快——缓一步再来', retryAfterMs: gate.retryAfterMs });

  const jar = await cookies();
  if (jar.get('nexus-insight')?.value !== '1') {
    return jsonError(403, 'insight_locked', { message: '先打开 /insight（口令 123）解锁，再让潮记你这一步' });
  }

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

  const { locale, state, move } = parsed.data;
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return jsonError(409, 'demo_mode', { message: '潮候步进需要接上真 provider —— 当前是 DEMO MODE，不冒充潮的账。' });
  }

  const requestId = `tidewatch-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  try {
    const result = await worldStepWithTide({
      requestId,
      locale,
      state,
      move,
      modelClass: 'balanced',
    });
    const durationMs = Date.now() - startedAt;
    if (!result.ok) {
      increment('nexus_world_step_total', { outcome: 'provider-unavailable' });
      return jsonError(result.status ?? 503, 'provider-unavailable', {
        message: locale === 'zh'
          ? '潮现在退了——这一步没有被记下，等潮再回来再记一次。'
          : 'The tide withdrew — this step was not recorded. Try again when the water returns.',
      });
    }
    observe('nexus_world_step_latency_ms', durationMs, { outcome: 'step' });
    increment('nexus_world_step_total', { outcome: 'step' });
    const { response } = result;
    return NextResponse.json(
      {
        narration: response.narration,
        delta: response.delta,
        citations: response.citations,
        model: response.model,
        cachedTokens: response.usage.cachedTokens,
        tokensIn: response.usage.tokensIn,
        cacheReported: response.usage.cacheReported,
        latencyMs: durationMs,
      },
      { headers: { 'x-nexus-orchestration': result.orchestration ?? 'stategraph' } },
    );
  } catch {
    increment('nexus_world_step_total', { outcome: 'error' });
    return jsonError(500, 'internal', {
      message: locale === 'zh' ? '潮见了阻碍，稍后再试' : 'The tide met a block — try later.',
    });
  }
}
