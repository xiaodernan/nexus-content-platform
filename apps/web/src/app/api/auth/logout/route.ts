import { NextResponse } from 'next/server';
import { currentSessionToken, revokeCurrentSession } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clearSessionCookie } from '@/server/security/authCookies';
import { jsonError, failure } from '@/server/http';

/** 登出：吊销当前会话行并清 cookie。状态变更，同样过 CSRF。 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  try {
    await revokeCurrentSession(await currentSessionToken());
    return clearSessionCookie(NextResponse.json({ ok: true }));
  } catch (error) {
    return failure(error, 'POST /api/auth/logout');
  }
}
