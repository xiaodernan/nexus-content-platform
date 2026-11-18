import { z } from 'zod';
import { NextResponse } from 'next/server';
import { readJson, badRequest, jsonError } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { files, getFile, buildPersonaSystemPrompt, type WhisperFile } from '@/server/domain/whisperCanon';

const Body = z.object({
  slug: z.string().min(1),
  question: z.string().min(1).max(500),
  locale: z.enum(['zh', 'en']),
});

/**
 * §BIBLE-WHISPER `/api/bible/whisper` POST：任何人都能问一本正典一条问题——
 * 保证回答的内容只来自该正典摘录，不成功就 409（不冒充 AI 产生答案）。
 *
 * 限制：IP + userId 限流 20 次/10 分钟（防机器人掏光 provider 额度）；
 * 没有可用 provider → 原样 409 不落任何补丁（§159：不发明假答案）。
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return await jsonError(409, 'demo_mode', { message: 'AI 答问者需要接上真 provider；当前是 DEMO MODE 模式，不冒充答案。' });
  }

  const userIp = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('bible-whisper', userIp, 'anon'), 20, 10 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', { message: '问太频繁了——歇十分钟吧', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { slug, question, locale } = parsed.data;
  const file = getFile(slug);
  if (!file) return await jsonError(404, 'file_not_found', { message: '典籍里没有这一卷——检查 slug 是否正确。' });

  const system = buildPersonaSystemPrompt(file, locale);
  const reqId = `whisper_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user: question, modelClass: 'balanced' });
  if (!chat.ok) {
    const status = chat.status ?? 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  return NextResponse.json(
    { answer: chat.response.text, slug, file: { order: file.order, titleZh: file.titleZh, titleEn: file.titleEn } },
    { headers: { 'cache-control': 'no-store' } },
  );
}

/** 暴露下列者——以便客户端调 /api/bible/whisper/files 拿到目录 */
export const FILE_LIST: readonly WhisperFile[] = files;
