import { NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUserOrNull } from '@/server/domain/session';
import { recordAudit } from '@/server/domain/audit';
import {
  REPORT_TRANSITION_STATUSES,
  updateReportStatus,
} from '@/server/domain/marketplace';
import type { ReportStatus } from '@/server/domain/marketplace';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * §123 PATCH /api/admin/marketplace/reports/[id] — 审核员处置一个举报工单（#158）。
 *
 * `marketplace_reports.status / admin_notes / resolved_at` 三列建表起就没有写入方：
 * 举报能提交、能列出，却没有任何入口把工单推进一格。`GET ?status=resolved`
 * 因此永远为空——一个只进不出的收件箱。这是那个写入方。
 *
 * 门与裁决台（`/api/admin/moderation/[caseId]`）同一口径，顺序也一样：
 * 401（`currentUserOrNull`，不抛错）→ 限流 429 → 非 admin 403 + 一行拒绝审计 → CSRF 403 → 正文 400。
 * 限流放在 admin 判定之前：这条路任何登录用户都能走到 403，不限流的话
 * 一个非审核员的循环请求就能把审计表刷满。
 *
 * 正文只接受三个推进目标：`reviewing` / `resolved` / `dismissed`。
 * `pending` 是初始态而不是可回退的目标，名单外一律 400；终态不可改写由域层的条件 UPDATE 保证，
 * 并发下后来者拿到 0 行，回 409 而不是覆盖前一位审核员的结论。
 */
const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '待处理',
  reviewing: '复核中',
  resolved: '已结案',
  dismissed: '已驳回',
};

const UpdateReportSchema = z.object({
  // 名单从域层取，不在这里手抄一份（#157 的审计动作就是手抄走样的）
  status: z.enum(REPORT_TRANSITION_STATUSES),
  adminNotes: z.string().max(2000).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });

  const ip = clientIp(req);
  const rl = getRateLimiter().hit(rateKey('admin/marketplace/reports', ip, user.id), 30, 10 * 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '处置太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
  }

  if (user.role !== 'admin') {
    await recordAudit({
      actorId: user.id,
      action: 'marketplace.report.update',
      targetType: 'marketplace_report',
      targetId: id,
      allowed: false,
      detail: { reason: 'not_admin', role: user.role },
      ip,
    });
    return jsonError(403, 'forbidden', { message: '只有审核员（role=admin）能处置举报' });
  }
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });

  const parsed = UpdateReportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }

  const result = await updateReportStatus({
    reportId: id,
    adminId: user.id,
    status: parsed.data.status,
    adminNotes: parsed.data.adminNotes,
    ip,
  });

  if (!result.ok) {
    if (result.reason === 'not_found') {
      // 形状不对的 id 也走这里（域层的 isUuid）：没有这个工单，不是一个服务器故障
      return jsonError(404, 'report_not_found', { message: '没有这个举报工单' });
    }
    return jsonError(409, 'already_closed', {
      message: `这个工单当前是「${STATUS_LABELS[result.status]}」，结案记录不再改写`,
      status: result.status,
    });
  }

  const message =
    result.report.status === 'reviewing'
      ? '已受理：工单进入复核中'
      : result.report.status === 'resolved'
        ? '已结案：举报成立'
        : '已驳回：举报不成立';

  return NextResponse.json({ report: result.report, message });
}
