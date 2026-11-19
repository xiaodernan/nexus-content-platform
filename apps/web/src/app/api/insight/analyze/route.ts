import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { runInsightAnalysisGraph } from '@/server/ai/insightGraph';
import { collectInsightSnapshot } from '@/server/domain/insight';
import { buildInsightDigest } from '@/server/domain/insightAi';
import { UNVERIFIED_NOTE } from '@/server/domain/insightVerify';
import { leastSquares } from '@/lib/insight-math';
import { increment, observe } from '@/server/observability';

/**
 * §INSIGHT-3 · POST /api/insight/analyze
 *   —— 让真模型（`gpt-6.2-sol`）解读「观察坞」的实时快照。
 * 通道纪律：nexus-insight cookie（密码 123，公开）+ CSRF + IP gate（10/h）+ csrf 双扣；
 * provider 不可用 → 503 原样回真（§159/§160），不演示伪造分析。
 * 聚合摘要是唯一送入模型的上下文：模型永远看不到任何个人字段。
 */
const BodySchema = z.object({ locale: z.enum(['zh', 'en']).default('zh') });

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('insight/analyze', req);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '问太快了，缓一缓再问', retryAfterMs: gate.retryAfterMs });

  const jar = await cookies();
  if (jar.get('nexus-insight')?.value !== '1') {
    return jsonError(403, 'insight_locked', { message: '先打开 /insight 解锁' });
  }

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => i.message));
  const locale = parsed.data.locale;

  const snap = await collectInsightSnapshot();
  const opensFit = leastSquares(snap.series30d.opens);
  const publishFit = leastSquares(snap.series30d.publishes);
  const projectRatio = snap.totals.projects === 0 ? 1 : Math.min(1, snap.totals.published / snap.totals.projects);
  const guestShare = snap.totals.users + snap.totals.guests === 0 ? 0 : snap.totals.guests / (snap.totals.users + snap.totals.guests);
  const interactionRate = snap.opens30d === 0 ? 0 : (snap.likes30d + snap.comments30d) / snap.opens30d;
  const botShare = snap.opens30d === 0 ? 0 : snap.botOpens30d / snap.opens30d;
  const creditBurn = snap.credits30d.granted === 0 ? null : snap.credits30d.consumed / snap.credits30d.granted;

  const digest = buildInsightDigest({
    snapshot: snap,
    ratios: {
      publishRate: projectRatio,
      guestShare,
      interactionRate,
      botShare,
      creditBurn,
    },
    opensSlope: opensFit?.slope ?? null,
    opensR2: opensFit?.r2 ?? null,
    publishSlope: publishFit?.slope ?? null,
    publishR2: publishFit?.r2 ?? null,
    locale,
  });

  // §GRAPH-2：draft → verify → (revise → verify) → finalize 的 StateGraph；digest 进 user，system 不变。
  const result = await runInsightAnalysisGraph({ digest, locale });
  const durationMs = Date.now() - startedAt;

  if (!result.ok) {
    increment('nexus_insight_analyze_total', { outcome: 'provider-unavailable' });
    return jsonError(result.status ?? 503, 'provider-unavailable', {
      message: locale === 'zh' ? '模型连不上——解读不是继续编出来的，先去频道体检。' : 'Model is unreachable — no fake analysis on this page. Check back later.',
    });
  }
  // §INSIGHT-4：机检过关才算 grounded；不过关如实标注（答复如实返回，不冒充「已核验」）。
  const verified = result.verdict === 'pass';
  const outcome = verified ? 'answer' : 'answer-unverified';
  increment('nexus_insight_analyze_total', { outcome });
  observe('nexus_insight_analyze_latency_ms', durationMs, { outcome });
  return NextResponse.json({
    answer: result.answer,
    capability: result.capability || 'real',
    provider: result.provider,
    model: result.model,
    cachedTokens: result.usage.cachedTokens,
    cacheReported: result.usage.cacheReported,
    verified,
    verifyNote: verified ? null : UNVERIFIED_NOTE[locale === 'en' ? 'en' : 'zh'],
    iterations: result.iterations,
    nodesVisited: result.nodesVisited,
  });
}
