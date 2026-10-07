import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { flagSuspiciousActivity, getReports } from '@/server/domain/marketplace';
import { csrfOk } from '@/server/security/csrf';
import { jsonError } from '@/server/http';

/**
 * GET /api/admin/marketplace/reports — 查询举报列表（仅管理员）。
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = (searchParams.get('status') as any) ?? undefined;
  const itemId = searchParams.get('itemId') ?? undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
  const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;

  try {
    const reports = await getReports({
      status,
      itemId,
      limit,
      offset,
    });

    return NextResponse.json(reports);
  } catch (err) {
    console.error('Failed to fetch reports:', err);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}

/**
 * POST /api/admin/marketplace/reports — 创建举报（任何登录用户）。
 */
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return jsonError(401, 'unauthorized', { message: '需要登录' });
  }

  // CSRF 校验
  if (!(await csrfOk(req))) {
    return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  }

  try {
    const body = (await req.json()) as {
      itemId: string;
      reason: 'fraud' | 'spam' | 'copyright' | 'inappropriate' | 'other';
      description?: string;
    };

    if (!body.itemId || !body.reason) {
      return NextResponse.json({ error: '缺少必要字段' }, { status: 400 });
    }

    const result = await flagSuspiciousActivity({
      reporterId: user.id,
      itemId: body.itemId,
      reason: body.reason,
      description: body.description,
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
