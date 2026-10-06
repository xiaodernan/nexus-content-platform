import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { getNotificationSettings, updateNotificationSetting, updateNotificationSettings } from '@/server/domain/notifications';
import type { NotificationKind } from '@/lib/notify-plan';
import { NOTIFICATION_KINDS } from '@/lib/notify-plan';

/**
 * §164 NotificationSettings API：GET 返回当前用户的所有通知偏好。
 */
export async function GET() {
  const user = await currentUserOrNull();
  if (!user) return NextResponse.json({ error: '需要登录' }, { status: 401 });

  const settings = await getNotificationSettings(user.id);
  return NextResponse.json({ settings });
}

/**
 * §164 NotificationSettings API：PUT 更新通知偏好。
 *
 * 支持两种格式：
 * - 单个：{ kind: 'like', enabled: false }
 * - 批量：{ settings: { like: false, comment: true, ... } }
 */
export async function PUT(req: Request) {
  const user = await currentUserOrNull();
  if (!user) return NextResponse.json({ error: '需要登录' }, { status: 401 });

  const body = await req.json();

  // 批量更新
  if (body.settings && typeof body.settings === 'object') {
    const entries = Object.entries(body.settings);
    for (const [kind, enabled] of entries) {
      if (!NOTIFICATION_KINDS[kind as NotificationKind]) {
        return NextResponse.json({ error: `未知的通知类型: ${kind}` }, { status: 400 });
      }
      if (typeof enabled !== 'boolean') {
        return NextResponse.json({ error: `${kind} 的值必须是布尔值` }, { status: 400 });
      }
    }
    await updateNotificationSettings(user.id, body.settings as Partial<Record<NotificationKind, boolean>>);
    const settings = await getNotificationSettings(user.id);
    return NextResponse.json({ settings });
  }

  // 单个更新
  if (body.kind && typeof body.enabled === 'boolean') {
    if (!NOTIFICATION_KINDS[body.kind as NotificationKind]) {
      return NextResponse.json({ error: `未知的通知类型: ${body.kind}` }, { status: 400 });
    }
    await updateNotificationSetting(user.id, body.kind as NotificationKind, body.enabled);
    const settings = await getNotificationSettings(user.id);
    return NextResponse.json({ settings });
  }

  return NextResponse.json({ error: '请求体必须包含 kind+enabled 或 settings 对象' }, { status: 400 });
}
