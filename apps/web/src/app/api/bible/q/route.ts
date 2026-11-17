import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, ipWriteGate, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { chatWithCharacter } from '@/server/ai/client';
import { SYSTEM_PROMPT } from '@/lib/bibleAsk';
import { increment, observe } from '@/server/observability';

/**
 * §BIBLE-4 · POST /api/bible/q —— 问典：正典 Q&A。
 *
 * 规则：
 * - 只接受已登录用户（密钥扛不住匿名流量，§137/§160）；
 * - csrf + 按人 5 次/5 分钟限流 + 按 IP 的入口 gate 三层；
 * - provider 不可用 → 503 原样回真，不演示 AI 瞎编的答案（§159）；
 * - question 400 字以内；system 是字节级稳定的 SYSTEM_PROMPT（KV 前缀复用，§CACHE-4）；
 * - 不写库、不写 usage、不扣 credit（这是一次阅读，不是一次生成作业）。
 */
const AskBodySchema = z.object({
  question: z.string().min(1).max(400),
  locale: z.enum(['zh', 'en']).optional(),
});

const RATE_PER_5_MIN = 5;

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('bible/q', req);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '问典太快了，缓一缓再问', retryAfterMs: gate.retryAfterMs });

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = AskBodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

  const user = await requireUser();
  const rl = await getRateLimiter().hit(rateKey('bible/q', clientIp(req), user.id), RATE_PER_5_MIN, 5 * 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '问典太快了，五分钟后见', retryAfterMs: rl.retryAfterMs });
  }

  const { question } = parsed.data;
  // 用英文前缀把语言钉在 user 侧（zh/en 分别带固定标签，system 永远不变 → KV 前缀稳定）
  const wrapped = `Question language: ${parsed.data.locale === 'zh' ? 'zh' : 'en'}\nQuestion: ${question}`;
  try {
    const result = await chatWithCharacter({
      requestId: `bible-ask-${user.id.slice(0, 8)}-${Date.now()}`,
      system: SYSTEM_PROMPT,
      user: wrapped,
      modelClass: 'fast',
    });
    const durationMs = Date.now() - startedAt;
    if (!result.ok) {
      increment('nexus_bible_ask_total', { outcome: 'provider-unavailable' });
      // 真相原样透出：潮汐还没到，不是潮汐假装到了（§159/§160）。
      return jsonError(result.status ?? 503, 'provider-unavailable', {
        message: '潮汐现在不走 —— 正典问答暂时不可用，请稍后再来。',
      });
    }
    observe('nexus_bible_ask_latency_ms', durationMs, { outcome: 'answer' });
    increment('nexus_bible_ask_total', { outcome: 'answer' });
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
      costBasis: 'usage',
    });
  } catch (error) {
    increment('nexus_bible_ask_total', { outcome: 'error' });
    return jsonError(500, 'internal', { message: '问典遇到意外错误，稍后再问' });
  }
}
