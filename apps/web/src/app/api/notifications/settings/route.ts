import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { getNotificationSettings, updateNotificationSetting, updateNotificationSettings } from '@/server/domain/notifications';
import type { NotificationKind } from '@/lib/notify-plan';
import { NOTIFICATION_KINDS } from '@/lib/notify-plan';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * §164 NotificationSettings API：GET 返回当前用户的所有通知偏好。
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要登录' });

  const settings = await getNotificationSettings(user.id);
  return NextResponse.json({ settings });
}

/**
 * §164 NotificationSettings API：PUT 更新通知偏好。
 *
 * 状态变更照例三件套：**CSRF、登录身份、限流**（与 `notifications/read` 同一道门）。
 *
 * 这一格曾经漏掉 CSRF 与限流，而客户端也没带 CSRF 头——**两边一起漏**：
 * 功能照常能用、集成测试照常绿，因为两边是自洽的。这类洞跑测试发现不了，
 * 只有把同一族端点横向摆在一起看才看得见（`notifications/read` 是这一族的参照实现）。
 * 凭据是会话 cookie，浏览器会自动带上，所以缺 CSRF 的写端点就是一个跨站可写的口子——
 * §80 的双提交 cookie 保护以"服务端真的校验"为前提，不校验就等于没有。
 *
 * 支持两种格式：
 * - 单个：{ kind: 'like', enabled: false }
 * - 批量：{ settings: { like: false, comment: true, ... } }
 */
export async function PUT(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要登录' });
  const rl = getRateLimiter().hit(rateKey('notifications/settings', clientIp(req), user.id), 60, 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '操作太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
  }

  const body = (await req.json().catch(() => null)) as
    | { settings?: unknown; kind?: unknown; enabled?: unknown }
    | null;
  if (!body || typeof body !== 'object') return badRequest(['body: 请求体必须是 JSON 对象']);

  // 批量更新
  if (body.settings && typeof body.settings === 'object') {
    const entries = Object.entries(body.settings as Record<string, unknown>);
    for (const [kind, enabled] of entries) {
      if (!NOTIFICATION_KINDS[kind as NotificationKind]) return badRequest([`未知的通知类型: ${kind}`]);
      if (typeof enabled !== 'boolean') return badRequest([`${kind} 的值必须是布尔值`]);
    }
    await updateNotificationSettings(user.id, body.settings as Partial<Record<NotificationKind, boolean>>);
    const settings = await getNotificationSettings(user.id);
    return NextResponse.json({ settings });
  }

  // 单个更新
  if (typeof body.kind === 'string' && typeof body.enabled === 'boolean') {
    if (!NOTIFICATION_KINDS[body.kind as NotificationKind]) {
      return badRequest([`未知的通知类型: ${body.kind}`]);
    }
    await updateNotificationSetting(user.id, body.kind as NotificationKind, body.enabled);
    const settings = await getNotificationSettings(user.id);
    return NextResponse.json({ settings });
  }

  return badRequest(['请求体必须包含 kind+enabled 或 settings 对象']);
}
