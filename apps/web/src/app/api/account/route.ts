import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser } from '@/server/domain/session';
import { updateProfile } from '@/server/domain/profile';
import { scanTextForRedlines } from '@/server/domain/moderation';
import { accountDeletionSummary, deleteAccount } from '@/server/domain/account';
import { clearSessionCookie } from '@/server/security/authCookies';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, failure, jsonError, notFound, readJson } from '@/server/http';

/**
 * §60：改自己的主页（显示名与简介）。
 *
 * 简介会出现在公开主页上，所以它走的是发布机检同一份红线词表（§129）：
 * 命中就不保存。这不是"审核通过"，只是"这段话我们不能替你公开"。
 */
const PatchSchema = z.object({
  bio: z.string().max(500).optional(),
  displayName: z.string().min(1).max(60).optional(),
});

export async function PATCH(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  if (parsed.data.bio && scanTextForRedlines(parsed.data.bio).length) {
    return jsonError(400, 'bio_rejected', { message: '这段简介被机检挡下，没有保存' });
  }
  const user = await requireUser();
  const saved = await updateProfile(user.id, parsed.data);
  return NextResponse.json({ ok: true, ...saved });
}

/**
 * §144 的最后一格：这个账号注销会发生什么（ADR-0025）。
 *
 * 界面上那几个数从这里来，不是客户端自己数的："会收起几个私有草稿、留下几个已发布作品"
 * 要说的是**点下按钮那一刻**的库状态，客户端拿不到、也不该靠猜（§159）。
 * 账号已经注销过就没有"会发生什么"可预览，那时给 404 而不是 0 个 0 个——
 * 一排零看着像"你名下什么都没有"，那是另一句假话。
 */
export async function GET(): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const preview = await accountDeletionSummary(user.id);
    if (!preview) return notFound();
    return NextResponse.json({ ok: true, ...preview });
  } catch (error) {
    return failure(error, 'GET /api/account');
  }
}

/**
 * 确认词的形状与删项目那一条一样：去掉首尾空白之后必须非空，长到 2000 字以内。
 * 这个文件上面的 `PatchSchema` 就住在本地，所以这一条也留在本地——它只在本机这一侧被读。
 */
const DeleteSchema = z.object({ confirm: z.string().trim().min(1).max(2000) });

/**
 * 注销账号（§144 / ADR-0025）。判定全在 `domain/account.ts`，这一格只做入参与状态码翻译。
 *
 * 三条与 `DELETE /api/projects/<id>` 同一口径的做法：审批门在服务端（打错字一条都不写，
 * 只留一行 `allowed:false` 的审计）、限流照抄（这是一次不可逆动作，不能被人循环点）、
 * cookie 在会话行删掉之后一起摘走（登出那一路用的同一个 `clearSessionCookie`）。
 */
export async function DELETE(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const body = await readJson(req);
  if (!body) return badRequest(['请求体必须是 JSON']);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  try {
    const user = await requireUser();
    const rl = await getRateLimiter().hit(rateKey('account/delete', clientIp(req), user.id), 5, 10 * 60_000);
    if (!rl.allowed) {
      return jsonError(429, 'rate_limited', { message: '注销尝试太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
    }
    const result = await deleteAccount(user.id, parsed.data.confirm);
    if (!result.ok) {
      if (result.code === 'approval_required') {
        // 措辞与面板上那句"逐字输入你的……"用同一名目，别让人对着两个不同的词猜是同一件事
        const named = result.confirmField === 'handle' ? '主页地址（handle）' : '展示名';
        return jsonError(400, 'approval_required', { message: `确认词与你的${named}不一致，这个账号一个字都没动` });
      }
      if (result.code === 'already_deleted') {
        return jsonError(410, 'already_deleted', { message: '这个账号先前已经注销过了' });
      }
      return notFound();
    }
    // 会话行已经在事务里全删了，cookie 留着只是让浏览器多带一个指向空处的值
    return clearSessionCookie(NextResponse.json({ ok: true, ...result.counts }));
  } catch (error) {
    return failure(error, 'DELETE /api/account');
  }
}
