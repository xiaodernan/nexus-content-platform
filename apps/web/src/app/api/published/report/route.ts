import { NextResponse } from 'next/server';
import { AbuseReportRequestSchema } from '@nexus/schemas';
import { requireUser } from '@/server/domain/session';
import { fileReport, findPublicPath } from '@/server/domain/moderation';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * §132 举报：公开页上真能提交，提交后真会动东西。
 *
 * 两条不能含糊的边界：
 * - 举报**不撤下内容**。机检与举报都只能把案子挂到人工队列，撤下是人的裁决（§131）；
 * - 命中三条硬红线（未成年人 / 非自愿亲密影像 / 冒充）的举报会自动立案进队列，
 *   其余类别只记录。回复里说清是哪一种，不让用户以为"已经处理了"。
 */
const ReportSchema = AbuseReportRequestSchema;

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const parsed = ReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }

  const user = await requireUser();
  // 举报是被别人点开的入口，必须限流：同一身份 + IP 每小时 10 次
  const rl = getRateLimiter().hit(rateKey('published/report', clientIp(req), user.id), 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', {
      message: `举报太频繁，请 ${Math.ceil(rl.retryAfterMs / 60_000)} 分钟后再试`,
      retryAfterMs: rl.retryAfterMs,
    });
  }

  const publication = await findPublicPath(parsed.data.path);
  if (!publication) return jsonError(404, 'not_found', { message: '没有这个公开页面，或它已经不再公开' });

  const report = await fileReport({
    publicationId: publication.id,
    path: parsed.data.path,
    reason: parsed.data.reason,
    detail: parsed.data.detail,
    reporterId: user.id,
  });

  return NextResponse.json({
    ok: true,
    reportId: report.id,
    escalated: report.escalated,
    // 说清接下来会发生什么：内容还在，裁决要等人
    message: report.escalated
      ? '举报已记录，并已挂进人工复核队列。内容在下结论前仍然可访问。'
      : '举报已记录。它不会自动撤下内容：需要人看完再决定。',
  });
}
