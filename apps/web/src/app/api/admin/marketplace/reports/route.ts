import { z } from 'zod';
import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { REPORT_STATUSES, flagSuspiciousActivity, getMarketplaceItem, getReports } from '@/server/domain/marketplace';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, jsonError } from '@/server/http';

/**
 * GET /api/admin/marketplace/reports — 查询举报列表（仅管理员）。
 *
 * 门同审计入口：没有会话 → 401 JSON（`currentUserOrNull`），不是 admin → 403。
 * 此前这里调 `requireUser()`，没有 cookie 时抛错变 500（与审计入口同一个洞）。
 * `status` / `limit` / `offset` 过 zod：名单外与非整数一律 400，
 * 不再让 `parseInt('abc')` 的 NaN 或垃圾 status 直进 SQL 变成 500「查询失败」。
 */
const ReportsQuerySchema = z.object({
  // 名单从域层取：状态列、查询校验、处置正文三处同源，不再各抄一份
  status: z.enum(REPORT_STATUSES).optional(),
  itemId: z.string().uuid().optional(),
  limit: z.coerce.number().int().nonnegative().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

/**
 * POST /api/admin/marketplace/reports — 创建举报（任何登录用户）。
 *
 * `reason` 是 CHECK 约束列（fraud/spam/copyright/inappropriate/other），
 * `item_id` 是 UUID 外键列。正文这两个值此前**原样进库**：
 * 名单外的 reason 撞 CHECK（23514）、非 UUID 撞 22P02、"合法 UUID 但物品不存在"撞外键（23503），
 * 三者都被 catch 成 500「举报失败」——一次坏请求被报成一次服务器故障。
 * 现在正文先过 zod（400），再确认物品存在（404），坏值永远到不了数据库。
 * 举报不是管理员权力，所以这个处理函数只要登录 + CSRF，与 GET 的 admin 门不同。
 */
const ReportSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.enum(['fraud', 'spam', 'copyright', 'inappropriate', 'other']),
  description: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '举报列表只对审核员（role=admin）开放' });
  }

  const { searchParams } = new URL(req.url);
  const parsed = ReportsQuerySchema.safeParse({
    status: searchParams.get('status') ?? undefined,
    itemId: searchParams.get('itemId') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    offset: searchParams.get('offset') ?? undefined,
  });
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`));
  }

  try {
    const reports = await getReports(parsed.data);
    return NextResponse.json(reports);
  } catch (err) {
    console.error('Failed to fetch reports:', err);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await currentUserOrNull();
  if (!user) {
    return jsonError(401, 'unauthenticated', { message: '需要登录' });
  }

  // CSRF 校验：状态变更请求必须双提交 token（SECURITY.md「认证与授权」）
  if (!(await csrfOk(req))) {
    return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  }

  try {
    const body = await req.json().catch(() => null);
    const parsed = ReportSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
    }

    // 物品必须先存在（软删的也算不存在）：下架的商品不该再能挂上新举报
    const item = await getMarketplaceItem(parsed.data.itemId);
    if (!item) {
      return jsonError(404, 'item_not_found', { message: '没有这个物品，举报无从谈起' });
    }

    const result = await flagSuspiciousActivity({
      reporterId: user.id,
      itemId: parsed.data.itemId,
      reason: parsed.data.reason,
      description: parsed.data.description,
    });

    if (result.isDuplicate) {
      return NextResponse.json({ error: '您已经举报过该物品', reportId: result.reportId }, { status: 409 });
    }

    return NextResponse.json({ reportId: result.reportId }, { status: 201 });
  } catch (err) {
    console.error('Failed to create report:', err);
    return NextResponse.json({ error: '举报失败' }, { status: 500 });
  }
}
