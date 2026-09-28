import { NextResponse } from 'next/server';
import { ApiTokenCreateRequestSchema, ApiTokenIssuedSchema } from '@nexus/schemas';
import { issueApiToken, listApiTokens } from '@/server/domain/api-tokens';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { badRequest, failure, jsonError } from '@/server/http';

/**
 * §188：账号侧的凭据管理。这一条走**会话 cookie**（浏览器里的人），与 `/api/v1/*` 那一条
 * 走 Bearer（平台外的程序）是两种身份，不共用一套判定：cookie 凭据能被 CSRF 打到，
 * Bearer 不会自动被浏览器带上——所以这里的写请求要过 CSRF，而 v1 只有读、没有写。
 */

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const tokens = await listApiTokens(user.id);
    return NextResponse.json({ tokens }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'GET /api/account/api-tokens');
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const parsed = ApiTokenCreateRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  try {
    const user = await requireUser();
    const issued = await issueApiToken({ userId: user.id, ...parsed.data });
    // 出口也按契约过一遍：明文只该出现在这一份报文里，别处多一份就是泄露
    const checked = ApiTokenIssuedSchema.safeParse(issued);
    if (!checked.success) return failure(new Error('签发报文不符合契约'), 'POST /api/account/api-tokens');
    return NextResponse.json(issued, { status: 201, headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('scope') || message.includes('名称')) return badRequest([message]);
    return failure(error, 'POST /api/account/api-tokens');
  }
}
