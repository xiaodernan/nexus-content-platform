import { z } from 'zod';
import { NextResponse } from 'next/server';
import { getRateLimiter, rateKey, clientIp } from '@/server/security/rateLimit';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, jsonError, readJson } from '@/server/http';
import { currentUserOrNull } from '@/server/domain/session';
import { listReviewQueue } from '@/server/domain/moderation';
import { getAiCapabilities } from '@/lib/env';
import { chatWithCharacter } from '@/server/ai/client';
import { MODERATION_ASSIST_SYSTEM_PROMPT_EN, MODERATION_ASSIST_SYSTEM_PROMPT_ZH } from '@/server/domain/moderationAssist';
import { increment, observe } from '@/server/observability';

export const dynamic = 'force-dynamic';

/**
 * §MODERATION-ASSIST · POST /api/admin/moderation/assist { caseId, locale }
 *
 * 给人工复核员的「AI 帮我读一眼」——绝不替审核员下结论、绝不写库、绝不撤内容。
 * 规则：
 *  1. 只有 role=admin 能打（队列本来就只对 admin 开放）；
 *  2. CSRF + 每 IP+admin 30/小时限流（防止脚本把复核队列刷成 provider 账单）；
 *  3. provider 不可用 → 409 DEMO MODE（不冒充建议）；
 *  4. system 前缀按 locale 逐字节稳定（§CACHE-4 前缀复用）；最近案子不缓存（每起案情不同）。
 */
const Body = z.object({
  caseId: z.string().min(1).max(64),
  locale: z.enum(['zh', 'en']).default('zh'),
});

export async function POST(req: Request): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user || user.role !== 'admin') {
    return await jsonError(403, 'forbidden', { message: '复核助理只对审核员开放' });
  }
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });

  const ip = clientIp(req);
  const rl = await getRateLimiter().hit(rateKey('moderation-assist', ip, user.id), 30, 60 * 60 * 1000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '读太快了，缓一缓', retryAfterMs: rl.retryAfterMs });
  }

  const raw = await readJson(req).catch(() => null);
  const parsed = Body.safeParse(raw ?? {});
  if (!parsed.success) {
    return await badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const { caseId, locale } = parsed.data;

  // 机检列表页同一来源——审核员看到什么，助理就知道什么（不看更多隐私）
  const queue = await listReviewQueue(50);
  const entry = queue.find((c) => c.caseId === caseId);
  if (!entry) {
    return jsonError(404, 'case_not_found', { message: '这一案已经被裁决或不存在了——队列里没它' });
  }

  const caps = await getAiCapabilities();
  if (caps.text !== 'real') {
    return jsonError(409, 'demo_mode', { message: 'provider 未就绪——现在 DEMO MODE，不冒充建议' });
  }

  const system = locale === 'en' ? MODERATION_ASSIST_SYSTEM_PROMPT_EN : MODERATION_ASSIST_SYSTEM_PROMPT_ZH;
  const userText = JSON.stringify({
    project: entry.projectName,
    owner: entry.ownerName,
    visibility: entry.visibility,
    version: entry.publicationVersion,
    decision: entry.decision,
    reportCount: entry.reportCount,
    findings: entry.findings.map((f) => ({ rule: f.rule, why: f.why, where: f.where, quote: f.quote })),
  });

  const reqId = `moderation-assist-${Date.now().toString(36)}`;
  const chat = await chatWithCharacter({ requestId: reqId, system, user: userText, modelClass: 'balanced' });
  if (!chat.ok) {
    increment('nexus_moderation_assist_total', { outcome: 'provider-unavailable' });
    return jsonError(chat.status ?? 503, 'provider-unavailable', {
      message: locale === 'zh' ? 'provider 现在说不了话——不冒充建议' : 'The provider will not speak right now — not fabricated aid',
    });
  }

  const advice = (chat.response.text ?? '').trim();
  if (advice.length < 12) {
    return jsonError(502, 'provider_failed', {
      message: locale === 'zh' ? '模型没产出可参考的摘要——不展示' : 'The model gave no usable brief — not shown',
    });
  }
  observe('nexus_moderation_assist_latency_ms', chat.response.usage?.latencyMs ?? 0, { outcome: 'answer' });
  increment('nexus_moderation_assist_total', { outcome: 'answer' });

  return NextResponse.json({
    advice: advice.slice(0, 1200),
    model: chat.response.model,
    cachedTokens: chat.response.usage?.cachedTokens ?? 0,
    tokensIn: chat.response.usage?.tokensIn ?? 0,
    cacheReported: chat.response.usage?.cacheReported ?? false,
  });
}
