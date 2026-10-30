import { NextResponse } from 'next/server';
import { PublishedVisitRequestSchema } from '@nexus/schemas';
import { findPublicPath } from '@/server/domain/moderation';
import { recordVisit } from '@/server/domain/analytics';
import { classifyVisit } from '@/lib/visit-meter';
import { currentUserOrNull } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * §168 采集端点：一个访客在公开页上的现场（看了多久、滚到哪儿）。
 *
 * 这是**匿名可写**的接口，所以三道边界都要在：
 * - CSRF 双提交照样要（middleware 给每个访客都签了 `nexus_csrf`，不存在"访客没有 token"）；
 * - 只接受能解析到 public / unlisted 快照的 path，private 与已驳回的连一行都不写；
 * - 按 IP + 匿名 key 限流：一个页面每 15 秒一次心跳，一小时 240 次已经用满，
 *   再多就是有人在拿这个接口灌别人的统计。
 *
 * 数字本身不在这里判断真假——上限与截断在 `src/lib/visit-meter.ts`，
 * 被截断过几次会一并入库，创作者页面上要看得见。
 * 疑似爬虫/自动化的判定也在那边（`classifyVisit`：UA 名单 + 客户端自报的 webdriver），
 * 这里只把结论随行入库——可疑的照收，另计不进真人的数。
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const parsed = PublishedVisitRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  const { path, visitorKey, open, visibleMs, completionPct, webdriver } = parsed.data;

  const rl = await getRateLimiter().hit(rateKey('published/visit', clientIp(req), visitorKey), 240, 60 * 60 * 1000);
  if (!rl.allowed) return jsonError(429, 'rate_limited', { message: '上报太频繁', retryAfterMs: rl.retryAfterMs });

  const publication = await findPublicPath(path);
  if (!publication) return jsonError(404, 'not_found', { message: '没有这个公开页面，或它已经不再公开' });

  const viewer = await currentUserOrNull();
  const result = await recordVisit({
    publicationId: publication.id,
    visitorKey,
    userId: viewer?.id ?? null,
    open,
    visibleMs,
    completionPct,
    suspectedBot: classifyVisit(req.headers.get('user-agent'), webdriver),
  });
  if (result === 'rejected') return badRequest(['visitorKey 不合法']);
  return NextResponse.json({ ok: true });
}
