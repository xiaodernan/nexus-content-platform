import { z } from 'zod';
import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError, readJson, badRequest } from '@/server/http';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { chatWithCharacter } from '@/server/ai/client';
import {
  REVIEW_SYSTEM,
  buildReviewPrompt,
  MAX_CANDIDATE_CHARS,
  type ReviewKind,
} from '@/server/domain/canonReview';

export const dynamic = 'force-dynamic';

const Body = z.object({
  text: z.string().min(40).max(MAX_CANDIDATE_CHARS),
  kind: z.enum(['echo', 'chapter']).default('echo'),
});

/**
 * §CANON-REVIEW · 管理员用真模型评审一篇候选正典。
 *
 * 只读：模型只产出评审文本，不改写候选、不落库、不写正典。
 * 限流 10 次/10 分钟/管理员——每次评审要带全部既有锚句（约 60KB 前缀），
 * 不设闸就等于给 provider 账单开一个无底洞。
 */
export async function POST(req: Request): Promise<Response> {
  const user = await currentUserOrNull();
  if (!user) return await jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return await jsonError(403, 'forbidden', { message: '正典评审只对审核员（role=admin）开放' });
  }

  const rl = await getRateLimiter().hit(rateKey('canon-review', clientIp(req), user.id), 10, 10 * 60 * 1000);
  if (!rl.allowed) {
    return await jsonError(429, 'rate_limited', {
      message: '评审太频繁了——歇十分钟再试（每次评审要带全部既有锚句）',
      retryAfterMs: rl.retryAfterMs,
    });
  }

  const parsed = Body.safeParse(await readJson(req));
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { text, kind } = parsed.data;

  const requestId = `canon-review_${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({
    requestId,
    system: REVIEW_SYSTEM,
    user: buildReviewPrompt(text, kind as ReviewKind),
    modelClass: 'reasoning',
    // 同一管理员反复评审同一批稿子时复用前缀缓存；按 (评审, 角色) 分车道，不按稿件分——
    // 稿件正文在 user 里，不影响前缀命中。
    cacheLane: 'canon-review',
  });

  if (!chat.ok) {
    const status = chat.status ?? 503;
    return await jsonError(status, chat.error.code, { message: chat.error.message });
  }

  return NextResponse.json(
    {
      review: chat.response.text,
      model: chat.response.model,
      usage: chat.response.usage,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
