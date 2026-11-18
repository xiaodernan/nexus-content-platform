import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate } from '@/server/security/rateLimit';
import { badRequest, jsonError, readJson } from '@/server/http';
import { chatWithCharacter } from '@/server/ai/client';
import { getAiCapabilities } from '@/lib/env';
import { buildWitnessPrompt, getFile } from '@/server/domain/whisperCanon';
import { increment, observe } from '@/server/observability';

export const dynamic = 'force-dynamic';

/**
 * §GAME-TIDE-WITNESS · POST /api/game/witness —「潮汐见证」
 *   —典籍室门口坐着的那位，只会就本章说一句话（中文 ≤ 140 字 / EN ≤ 60 words）。
 *
 * 设计原则：
 * - 用户在 /bible/[slug] 阅读章节时被一个比 123 还薄的门挡住（`nexus-insight` Cookie），
 *   就像 insight 台口令——人人可以进去看，但问一个问题会收 10/h-IP 闸（防 provider 额度 被掏空）。
 * - 系统 prompt 是 `buildWitnessPrompt(file, locale)`——同一（文件，语言）逐字节稳定，
 *   provider 的 KV 前缀缓存按字节命中（§CACHE-4/v694）；深问一次即可温到全文件命中。
 * - provider 不可达 → 502（不冒充产出，不出现伪证）
 * - 没有任何形态的账号/信用消耗/写库/通知；这是一次「阅读」，不是一次「作业」。
 *
 * 成功响应体：{ status: 'answered' | 'demo', text, slug, order, titleZh, titleEn, cachedTokens, tokensIn, cacheReported }
 * 失败：403 / 401 / 429 / 400 / 502 / 503 —— 一律原样
 */
const BodySchema = z.object({
  slug: z.string().min(1),
  locale: z.enum(['zh', 'en']).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const gate = await ipWriteGate('bible/q', req);
  if (gate.limited) {
    return jsonError(429, 'rate_limited', { message: '潮汐回响太快了，缓一缓再问', retryAfterMs: gate.retryAfterMs });
  }

  const jar = await cookies();
  if (jar.get('nexus-insight')?.value !== '1') {
    return jsonError(403, 'insight_locked', { message: '解锁 /insight（口令 123）再来问潮汐见证一次' });
  }

  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));

  const { slug, locale = 'zh' } = parsed.data;
  const file = getFile(slug);
  if (!file) {
    return jsonError(404, 'file_not_found', { message: `典籍里没这一卷——检查 slug 是不是「${slug}」` });
  }

  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return jsonError(409, 'demo_mode', { message: '潮汐见证需要接上真 provider——这一格不能冒充' });
  }

  const system = buildWitnessPrompt(file, locale);

  try {
    const result = await chatWithCharacter({
      requestId: `tide-witness-${Date.now()}`,
      system,
      user: locale === 'zh' ? '请为这一章说一句话。' : 'Speak one sentence for this chapter.',
      modelClass: 'balanced',
    });
    const durationMs = Date.now() - startedAt;
    if (!result.ok) {
      increment('nexus_insight_chat_total', { outcome: 'provider-unavailable' });
      return jsonError(result.status ?? 503, 'provider-unavailable', {
        message: locale === 'zh'
          ? '潮时对不上——潮汐见证缝缝漏的，不是典章丢了。'
          : 'Tide’s timing is off — the witness leaks a breath; the chapter is still there.',
      });
    }
    observe('nexus_insight_chat_latency_ms', durationMs, { outcome: 'answer' });
    increment('nexus_bible_ask_total', { outcome: 'answer' });
    const { response } = result;
    return NextResponse.json({
      status: 'answered',
      text: (response.text ?? '').trim(),
      slug,
      order: file.order,
      titleZh: file.titleZh,
      titleEn: file.titleEn,
      model: response.model,
      capability: response.capability,
      provider: response.provider,
      cachedTokens: response.usage?.cachedTokens ?? 0,
      tokensIn: response.usage?.tokensIn ?? 0,
      cacheReported: response.usage?.cacheReported ?? false,
    });
  } catch {
    increment('nexus_bible_ask_total', { outcome: 'error' });
    return jsonError(500, 'internal', {
      message: locale === 'zh' ? '潮汐见证遇到了意外阻碍，稍后再来' : 'The witness hit an unexpected block; try again later.',
    });
  }
}
