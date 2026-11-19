import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { WorldStepStateSchema } from '@nexus/schemas';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { chatWithCharacter } from '@/server/ai/client';
import { getAiCapabilities } from '@/lib/env';
import { buildDigest } from '@/lib/bibleAsk';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';
import { TIDE_DIARY_SYSTEM_PROMPT } from '@/server/domain/tideDiary';
import { increment, observe } from '@/server/observability';

export const dynamic = 'force-dynamic';

/**
 * §TIDE-DIARY · POST /api/tidewatch/diary — 人走的路上那两句潮话
 *   同 /insight 潮家族：口令 123 · CSRF · IP 闸；真 provider，状态按客户端发来的 JSON 描述；
 *   输出恰好两句话；找不到内容不说。
 */
const BodySchema = z.object({
  locale: z.enum(['zh', 'en']).default('zh'),
  state: WorldStepStateSchema,
});

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('ai/tide-diary', req);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '潮手记太勤，稍候再问', retryAfterMs: gate.retryAfterMs });

  const jar = await cookies();
  if (jar.get('nexus-insight')?.value !== '1') {
    return jsonError(403, 'insight_locked', { message: '先打开 /insight（口令 123）解锁' });
  }

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

  const { locale, state } = parsed.data;
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return jsonError(409, 'demo_mode', { message: '潮手记需要接上真 provider —— 当前是 DEMO MODE，不冒充潮的话。' });
  }

  const sysPrefix = [
    TIDE_DIARY_SYSTEM_PROMPT,
    '',
    '='.repeat(72),
    `世界大典篇幅：${BIBLE_CHAPTERS.length} 章正典 + ${BIBLE_ECHOES.length} 篇回响。下面是 digest：`,
    '='.repeat(72),
    buildDigest(BIBLE_CHAPTERS, BIBLE_ECHOES),
  ].join('\n');

  const user = JSON.stringify({ locale, state }, null, 2);

  try {
    const result = await chatWithCharacter(
      {
        requestId: `tide-diary-${Date.now()}`,
        system: sysPrefix,
        user,
        modelClass: 'fast',
      },
      fetch,
      { orchestration: 'stategraph' },
    );
    const durationMs = Date.now() - startedAt;
    if (!result.ok) {
      increment('nexus_tide_diary_total', { outcome: 'provider-unavailable' });
      return jsonError(result.status ?? 503, 'provider-unavailable', {
        message: locale === 'zh' ? '潮现在退了——手记没写上' : 'The tide withdrew — the diary stayed blank.',
      });
    }
    observe('nexus_tide_diary_latency_ms', durationMs, { outcome: 'answer' });
    increment('nexus_tide_diary_total', { outcome: 'answer' });
    const text = (result.response.text ?? '').trim();
    return NextResponse.json(
      {
        summary: text,
        model: result.response.model,
        cachedTokens: result.response.usage?.cachedTokens ?? 0,
        tokensIn: result.response.usage?.tokensIn ?? 0,
        cacheReported: result.response.usage?.cacheReported ?? false,
      },
      { headers: { 'x-nexus-orchestration': result.orchestration ?? 'stategraph' } },
    );
  } catch {
    increment('nexus_tide_diary_total', { outcome: 'error' });
    return jsonError(500, 'internal', {
      message: locale === 'zh' ? '潮见了阻碍，稍后再记' : 'The tide hit a block — try later.',
    });
  }
}
