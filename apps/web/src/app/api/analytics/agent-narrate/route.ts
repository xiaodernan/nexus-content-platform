import { NextResponse } from 'next/server';
import { z } from 'zod';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { requireUser } from '@/server/domain/session';
import { runCreatorAnalysisGraph } from '@/server/ai/creatorGraph';
import { buildCreatorFact, analyzeCreatorFacts } from '@/server/domain/analytics-agent';
import { buildCreatorDigest } from '@/server/domain/analytics-agent-ai';
import { UNVERIFIED_CREATOR_NOTE } from '@/server/domain/analytics-verify';
import { increment, observe } from '@/server/observability';

/**
 * §169-AI · POST /api/analytics/agent-narrate
 *   —— 创造者数据「大模型解读」：把这一项目里它自己公开出来的数字（§168）整成 digest，
 *      不带任何个人字段；**真 provider** 给一段内容（含平台内部可落地的单一动作）。
 * 纪律：非实名项目不给数据；provider 不通 → 503 原样回真（§159/§160）；10/h IP gate；csrf。
 */
const BodySchema = z.object({
  projectId: z.string().min(1).max(80),
  locale: z.enum(['zh', 'en']).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('analytics/agent-narrate', req);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '解读太快，缓一缓再问', retryAfterMs: gate.retryAfterMs });

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

  const user = await requireUser();
  const fact = await buildCreatorFact(parsed.data.projectId, user.id);
  if (!fact) return jsonError(404, 'not_found', { message: '项目不存在或者不属于你' });
  const findings = analyzeCreatorFacts(fact);
  const digest = buildCreatorDigest(fact, findings);

  // §169-AI-GRAPH：draft → verify → (revise → verify) → finalize 的 StateGraph；digest 进 user，system 不变。
  const result = await runCreatorAnalysisGraph({ digest, locale: parsed.data.locale ?? 'zh' });
  const durationMs = Date.now() - startedAt;

  if (!result.ok) {
    increment('nexus_analytics_narrate_total', { outcome: 'provider-unavailable' });
    const locale = parsed.data.locale ?? 'zh';
    return jsonError(result.status ?? 503, 'provider-unavailable', {
      message: locale === 'zh'
        ? '模型连不上——这里不会假装给分析。'
      : 'Model is unreachable — no fake analysis on this page.',
    });
  }
  // §169-AI-Verify：机检过关才算 grounded；不过关如实标注（答复如实返回，不冒充「已核验」）。
  const verified = result.verdict === 'pass';
  const outcome = verified ? 'answer' : 'answer-unverified';
  increment('nexus_analytics_narrate_total', { outcome });
  observe('nexus_analytics_narrate_latency_ms', durationMs, { outcome });
  return NextResponse.json({
    answer: result.answer,
    capability: result.capability || 'real',
    model: result.model,
    cachedTokens: result.usage.cachedTokens,
    cacheReported: result.usage.cacheReported,
    verified,
    verifyNote: verified ? null : UNVERIFIED_CREATOR_NOTE[parsed.data.locale ?? 'zh'],
    iterations: result.iterations,
    nodesVisited: result.nodesVisited,
  });
}
