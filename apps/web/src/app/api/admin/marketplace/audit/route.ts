import { z } from 'zod';
import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { AUDIT_ACTIONS, getAuditLog } from '@/server/domain/marketplace';
import { badRequest, jsonError } from '@/server/http';

/**
 * GET /api/admin/marketplace/audit — 查询市场交易审计日志（仅管理员）。
 *
 * 门与复核台、访问账同一句口径：没有会话 → 401 JSON（`currentUserOrNull`），
 * 不是 role=admin → 403。这里此前调 `requireUser()`：没有 cookie 时它**抛错**，
 * 未经 catch 就变成 500——同一句"没登录"，别处回 401，这里回 500。
 *
 * 查询参数全部过 zod：`itemId` / `actorId` 必须是 UUID，`action` 在名单内，
 * `limit` / `offset` 是非负整数（limit 封顶 500），日期必须能解析。名单外一律 400——
 * 这些值原样进 SQL 时，`limit=abc`（NaN）、`itemId=not-a-uuid`（22P02）、
 * 垃圾日期（Invalid Date）都会被 Postgres 报成 500「查询失败」，
 * 等于把一次坏查询报成一次服务器故障（与裁决入口 8a6528c 同一个形状）。
 */
const AuditQuerySchema = z.object({
  itemId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  /**
   * 动作名单从域层的 `AUDIT_ACTIONS` 取，不在这里手抄：迁移 0033 加了
   * `suspicious_purchase`，手抄的那份六项名单会让管理员按新动作筛时吃 400。
   */
  action: z.enum(AUDIT_ACTIONS).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().nonnegative().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

export async function GET(req: Request) {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '市场审计日志只对审核员（role=admin）开放' });
  }

  const { searchParams } = new URL(req.url);
  const parsed = AuditQuerySchema.safeParse({
    itemId: searchParams.get('itemId') ?? undefined,
    actorId: searchParams.get('actorId') ?? undefined,
    action: searchParams.get('action') ?? undefined,
    startDate: searchParams.get('startDate') ?? undefined,
    endDate: searchParams.get('endDate') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    offset: searchParams.get('offset') ?? undefined,
  });
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`));
  }

  try {
    const entries = await getAuditLog(parsed.data);
    return NextResponse.json(entries);
  } catch (err) {
    console.error('Failed to fetch audit log:', err);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}
