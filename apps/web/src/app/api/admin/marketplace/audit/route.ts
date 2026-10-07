import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { getAuditLog } from '@/server/domain/marketplace';

/**
 * GET /api/admin/marketplace/audit — 查询市场交易审计日志（仅管理员）。
 */
export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('itemId') ?? undefined;
  const actorId = searchParams.get('actorId') ?? undefined;
  const action = (searchParams.get('action') as any) ?? undefined;
  const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
  const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
  const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined;

  try {
    const entries = await getAuditLog({
      itemId,
      actorId,
      action,
      startDate,
      endDate,
      limit,
      offset,
    });

    return NextResponse.json(entries);
  } catch (err) {
    console.error('Failed to fetch audit log:', err);
    return NextResponse.json({ error: '查询失败' }, { status: 500 });
  }
}
