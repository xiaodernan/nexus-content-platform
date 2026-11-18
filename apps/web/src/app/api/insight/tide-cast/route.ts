import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { chatWithCharacter } from '@/server/ai/client';
import { collectInsightSnapshot } from '@/server/domain/insight';
import { leastSquares } from '@/lib/insight-math';
import { TIDE_CAST_SYSTEM_PROMPT, buildTideCastPrompt } from '@/server/domain/tideCast';
import { increment, observe } from '@/server/observability';

export const dynamic = 'force-dynamic';

/**
 * §INSIGHT-TIDE-CAST · POST /api/insight/tide-cast — 潮汐签
 *   把 /insight 那张数字表让真模型用「潮」的口吻讲两句，只见聚合，不见个人。
 * 纪律：nexus-insight cookie · CSRF 双提交 · 按 IP 10/h · provider 不可达 → 502 原样 —— 不伪造、不假冒。
 */
const BodySchema = z.object({ locale: z.enum(['zh', 'en']).default('zh') });

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('insight/analyze', req);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '潮签太频繁了，缓一会儿再问', retryAfterMs: gate.retryAfterMs });

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

  const prompt = buildTideCastPrompt({
    snapshot: snap,
    ratios: {
      publishRate: projectRatio,
      guestShare,
      interactionRate,
      botShare,
      creditBurn: null,
    },
    opensSlope: opensFit?.slope ?? null,
    opensR2: opensFit?.r2 ?? null,
    publishSlope: publishFit?.slope ?? null,
    publishR2: publishFit?.r2 ?? null,
    locale,
  });

  const result = await chatWithCharacter({
    requestId: `tide-cast-${Date.now()}`,
    system: TIDE_CAST_SYSTEM_PROMPT,
    user: prompt,
    modelClass: 'balanced',
  });
  const durationMs = Date.now() - startedAt;

  if (!result.ok) {
    increment('nexus_insight_chat_total', { outcome: 'provider-unavailable' });
    return jsonError(result.status ?? 503, 'provider-unavailable', {
      message: locale === 'zh'
        ? '潮现在退了——潮签没念出来。等潮再涨再问。'
        : 'The tide retreated — no cast was read. Ask again when the water rises.',
    });
  }
  observe('nexus_insight_chat_latency_ms', durationMs, { outcome: 'answer' });
  increment('nexus_insight_chat_total', { outcome: 'answer' });
  const { response } = result;
  return NextResponse.json({
    oracle: (response.text ?? '').trim(),
    model: response.model,
    cachedTokens: response.usage?.cachedTokens ?? 0,
    tokensIn: response.usage?.tokensIn ?? 0,
    cacheReported: response.usage?.cacheReported ?? false,
  });
}
