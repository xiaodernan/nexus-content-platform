import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate, rateKey, getRateLimiter, clientIp } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { chatWithCharacter } from '@/server/ai/client';
import { SYSTEM_PROMPT } from '@/lib/bibleAsk';
import { increment, observe } from '@/server/observability';

/**
 * §INSIGHT-4 · POST /api/insight/chat —「正典深问」
 *   —口令 123 的「观察坞」公开问答，直接打真·大模型（`gpt-6.2-sol`）。
 *
 * 与 `/api/bible/q` 同一条大典管线（同一个 `SYSTEM_PROMPT` 字节前缀）：
 *   - system 前缀 = 低语诸王世界大典 digest（≈4.3 万 tokens，字节恒定）；
 *     命中 provider 前缀 KV 缓存，多轮问、多人问共享同一份热缓存；
 *   - 问的人换话题、换会话，system 一字不动 —— 缓存不丢（codex 式）。
 *   - 正典没有的问题，模型必须说「典籍里没有」，绝不编造（§159）。
 *
 * 通道纪律：nexus-insight cookie（口令 123，公开）+ CSRF 双提交 + 按 IP 限流。
 * 聚合约束：模型能看到的就是正典 digest + 这句问题——看不到任何个人字段（§INSIGHT 口径不变）。
 */
const AskBodySchema = z.object({
  question: z.string().min(2).max(400),
  locale: z.enum(['zh', 'en']).optional(),
});

const RATE_PER_5_MIN = 20;

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('insight/chat', req);
  if (gate.limited) {
    return jsonError(429, 'rate_limited', { message: '问得太快了，缓一缓再来', retryAfterMs: gate.retryAfterMs });
  }

  const jar = await cookies();
  if (jar.get('nexus-insight')?.value !== '1') {
    return jsonError(403, 'insight_locked', { message: '先打开 /insight 解锁（口令 123）' });
  }

  const rl = await getRateLimiter().hit(rateKey('insight/chat', clientIp(req)), RATE_PER_5_MIN, 5 * 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '五分钟内问得太多了，歇一会儿', retryAfterMs: rl.retryAfterMs });
  }

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = AskBodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

  const { question, locale } = parsed.data;
  // 语言钉在 user 侧问句里（zh/en 带固定标签），system 永远不变 → KV 前缀稳定（§CACHE-4）
  const wrapped = `Question language: ${locale === 'zh' ? 'zh' : 'en'}\nQuestion: ${question}`;

  try {
    const result = await chatWithCharacter({
      requestId: `insight-chat-${Date.now()}`,
      system: SYSTEM_PROMPT,
      user: wrapped,
      modelClass: 'fast',
    });
    const durationMs = Date.now() - startedAt;
    if (!result.ok) {
      increment('nexus_insight_chat_total', { outcome: 'provider-unavailable' });
      return jsonError(result.status ?? 503, 'provider-unavailable', {
        message:
          locale === 'zh'
            ? '潮汐现在不走——正典暂时连不上，不是我回答不了，是模型通道没拨通。稍后再来。'
            : 'The tide is out — canon is unreachable right now. Not a fake answer; try again later.',
      });
    }
    observe('nexus_insight_chat_latency_ms', durationMs, { outcome: 'answer' });
    increment('nexus_insight_chat_total', { outcome: 'answer' });
    const { response } = result;
    return NextResponse.json({
      answer: (response.text ?? '').trim(),
      capability: response.capability,
      provider: response.provider,
      model: response.model,
      cachedTokens: response.usage?.cachedTokens ?? 0,
      tokensIn: response.usage?.tokensIn ?? 0,
      tokensOut: response.usage?.tokensOut ?? 0,
      cacheReported: response.usage?.cacheReported ?? false,
      costUsd: response.usage?.costUsd ?? 0,
      // §COST-2：透传 provider 报的那一档；没有 usage 就说 unknown，不自造字面量。
      // 'usage' 曾经写在这里，而它不在契约的 enum 值域内（packages/schemas 的 UsageSchema）。
      costBasis: response.usage?.costBasis ?? 'unknown',
    });
  } catch {
    increment('nexus_insight_chat_total', { outcome: 'error' });
    return jsonError(500, 'internal', {
      message: locale === 'zh' ? '深问遇到意外错误，稍后再试' : 'Deep-ask hit an unexpected error; try again later.',
    });
  }
}
