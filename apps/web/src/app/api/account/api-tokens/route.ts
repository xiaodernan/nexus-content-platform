import { NextResponse } from 'next/server';
import { ApiAccountTokensSchema, ApiTokenCreateRequestSchema, ApiTokenIssuedSchema } from '@nexus/schemas';
import { issueApiToken, listApiAccessSummary, listApiTokens } from '@/server/domain/api-tokens';
import { requireUser } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { ipWriteGate } from '@/server/security/rateLimit';
import { badRequest, failure, jsonError } from '@/server/http';

/**
 * §188：账号侧的凭据管理。这一条走**会话 cookie**（浏览器里的人），与 `/api/v1/*` 那一条
 * 走 Bearer（平台外的程序）是两种身份，不共用一套判定：cookie 凭据能被 CSRF 打到，
 * Bearer 不会自动被浏览器带上——所以这里的写请求要过 CSRF，而 v1 那一条（含第二片的 PATCH）不需要：
 * 它的凭据必须人贴进请求头，跨站的表单打不出这一格。
 */

export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const tokens = await listApiTokens(user.id);
    // 凭据本身 + 每一枚最近读过什么（§188 第三片）。两件事一起给，是因为分开看就答不出
    // "这把 hint 很眼熟的凭据到底动了哪个项目"
    const body = { tokens, access: await listApiAccessSummary(user.id) };
    // 出口也按契约过一遍：这一格是把"读过什么"摊给人看的第一处，报文得自己说得出给的是哪几本账
    const checked = ApiAccountTokensSchema.safeParse(body);
    if (!checked.success) return failure(new Error('凭据列表不符合契约'), 'GET /api/account/api-tokens');
    return NextResponse.json(checked.data, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return failure(error, 'GET /api/account/api-tokens');
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  // §137 的 guest 自动签发：无会话客户端的 user.id 每请求都是新的，按身份限流对它空转。
  // 所以这道按 IP 的闸必须放在 requireUser() 之前——被挡住的请求一个 guest 都不该建。
  const gate = ipWriteGate('account/api-tokens', req, 10, 3600000);
  if (gate.limited) return jsonError(429, 'rate_limited', { message: '建凭据太频繁了，稍后再试', retryAfterMs: gate.retryAfterMs });
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
