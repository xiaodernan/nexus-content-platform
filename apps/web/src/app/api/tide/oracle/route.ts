import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { chatWithCharacter } from '@/server/ai/client';
import { resolveOrchestrationLane } from '@/server/ai/orchestrationLane';
import { verifyAnchorCitation } from '@/server/domain/oracleCitation';
import { getAiCapabilities } from '@/lib/env';
import { buildDigest } from '@/lib/bibleAsk';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';
import { TIDE_ORACLE_SYSTEM_PROMPT } from '@/server/domain/tideOracle';
import { increment, observe } from '@/server/observability';

export const dynamic = 'force-dynamic';

/**
 * §TIDE-ORACLE · POST /api/tide/oracle — 潮语 · 潮汐预言
 *   读者问一个问题，潮汐模型从 canon digest 里读出两句潮语。
 *
 * 设计原则：
 * - 与整座「潮」家族一致：解锁要口令 123（`nexus-insight=1`）、CSRF 双提交、IP 60/h 闸；
 * - system prompt = `TIDE_ORACLE_SYSTEM_PROMPT + digest`，整段逐字节稳定（§CACHE-4/v694），
 *   预热之后 provider 会优先复用 KV 前缀；digest 变化只在 canon 快照重生成时发生一次；
 * - provider 不可用 → 诚实回原状，不冒充潮的话（§159/§160）；
 * - 不写库、不动账号/信用/通知系统；这是一次阅读，不是一次作业。
 */
const BodySchema = z.object({
  question: z.string().min(1).max(200),
  locale: z.enum(['zh', 'en']).default('zh'),
});

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('bible/q', req);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '潮答太频繁，缓一缓再问', retryAfterMs: gate.retryAfterMs });

  const jar = await cookies();
  if (jar.get('nexus-insight')?.value !== '1') {
    return jsonError(403, 'insight_locked', { message: '解锁 /insight（口令 123）再来向潮问话' });
  }

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

  const { question, locale } = parsed.data;
  // cont.254 · 编排车道：潮汐预言走对话状态图（默认 stategraph；header 或 NEXUS_AI_CHAT_ORCHESTRATION=lane-a 可退回顺序通道）
  const lane = resolveOrchestrationLane(req.headers.get('x-nexus-orchestration'), process.env.NEXUS_AI_CHAT_ORCHESTRATION ?? process.env.NEXUS_AI_ORCHESTRATION);
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return jsonError(409, 'demo_mode', { message: '潮 oracle 需要接上真 provider — 当前是 DEMO MODE，不冒充潮的话。' });
  }

  // 完整 canon 的 system 前缀（≈4.3 万 tokens，canon 桶常驻）—— system 自身即底线，
  // 用户只问问，不重复 digest。这样 provider 前缀 KV 缓存跨用户复用一次可摊销。
  const prompt = [
    TIDE_ORACLE_SYSTEM_PROMPT,
    '',
    '='.repeat(72),
    `世界大典篇幅：${BIBLE_CHAPTERS.length} 章正典 + ${BIBLE_ECHOES.length} 篇回响。下为 digest：`,
    '='.repeat(72),
    buildDigest(BIBLE_CHAPTERS, BIBLE_ECHOES),
  ].join('\n');

  try {
    increment('nexus_chat_lane_total', { lane });
    const result = await chatWithCharacter({
      requestId: `tide-oracle-${Date.now()}`,
      system: prompt,
      user: `locale: ${locale}\n问：${question}\n潮语：`,
      modelClass: 'fast',
    }, fetch, { orchestration: lane });
    const durationMs = Date.now() - startedAt;
    if (!result.ok) {
      increment('nexus_bible_ask_total', { outcome: 'provider-unavailable' });
      return jsonError(result.status ?? 503, 'provider-unavailable', {
        message: locale === 'zh' ? '潮现在退了——再回来问一次。' : 'The tide receded — try again.',
      });
    }
    observe('nexus_bible_ask_latency_ms', durationMs, { outcome: 'answer' });
    increment('nexus_bible_ask_total', { outcome: 'answer' });
    const { response } = result;
    const answerText = (response.text ?? '').trim();
    // §TIDE-ORACLE-VERIFY · provider 的回答有没有逐字引典，由确定性字符串对齐机检——
    // 引了 → cited（带条数）/ 正典没写的诚实拒答 → declined / 其他 → not-cited（如实，不伪造引经据典）
    const citation = verifyAnchorCitation(answerText);
    const citationState = citation.clause === 'cited' ? 'cited' : citation.clause;
    increment('nexus_oracle_citation_total', { state: citationState });
    return NextResponse.json(
      {
        answer: answerText,
        model: response.model,
        cachedTokens: response.usage?.cachedTokens ?? 0,
        tokensIn: response.usage?.tokensIn ?? 0,
        cacheReported: response.usage?.cacheReported ?? false,
        citation: citation.clause === 'cited'
          ? { state: 'cited' as const, anchorsCited: citation.anchors.length }
          : { state: citation.clause },
      },
      { headers: { 'x-nexus-orchestration': result.orchestration ?? lane } },
    );
  } catch {
    increment('nexus_bible_ask_total', { outcome: 'error' });
    return jsonError(500, 'internal', {
      message: locale === 'zh' ? '潮见了阻碍，稍后再问' : 'The tide hit a block — ask again.',
    });
  }
}
