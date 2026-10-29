import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  GUEST_RECLAIM_MAX_BATCH,
  reclaimExpiredGuests,
  type GuestReclaimResult,
} from '@/server/domain/guest-reclaim';
import { currentUserOrNull } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * 过期访客回收的入口（ADR-0072）。判定全部在 `domain/guest-reclaim.ts`，
 * 这里只做四件路由自己的事：CSRF、登录、报文、限流，然后把结果翻译成 HTTP。
 *
 * 两条写在这里而不是写在域里的约定：
 * - **`dryRun` 默认 true**。一个不带 body 的 `POST` 最安全的解释是"先数一遍"：
 *   默认值写成 false 的话，任何一次手滑的 curl 都是一次批量删除。
 * - **读会话用 `currentUserOrNull()`**。`requireUser()` 会替没有会话的请求现造一个 guest，
 *   而这个端点恰恰是拿 guest 开刀的——让人探测一次就白得一个身份，等于给清扫自己造待收的料。
 */
const Schema = z.object({
  dryRun: z.boolean().default(true),
  graceDays: z.number().int().min(1).max(365).optional(),
  batch: z.number().int().min(1).max(GUEST_RECLAIM_MAX_BATCH).optional(),
});

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body ?? {});
  if (!parsed.success) {
    return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  // 收的是身份与会话，不是改一个字段：一次误点就该被看见，所以按人限得比改角色更紧
  const rl = getRateLimiter().hit(rateKey('admin/guests/reclaim', clientIp(req), user.id), 6, 10 * 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '回收操作太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
  }

  const result = await reclaimExpiredGuests({ actorId: user.id, ...parsed.data });
  if (!result.ok) return jsonError(result.status, result.code, { message: result.reason });
  return NextResponse.json({ ok: true, ...payload(result) });
}

/** 响应里放的是"这一轮看见了什么、做了什么"，逐条与 `docs/adr/0072-*.md` 的口径对得上 */
function payload(result: GuestReclaimResult & { ok: true }) {
  const { scan } = result;
  return {
    dryRun: result.dryRun,
    graceDays: scan.graceDays,
    now: scan.now,
    cutoff: scan.cutoff,
    /** 沉默到线的 guest 总数（含下面两类被排除的） */
    stale: scan.stale,
    skippedPublished: scan.skippedPublished,
    skippedLiveToken: scan.skippedLiveToken,
    /** 这一轮点名要收的（dry run 时就是"真按会收这些"） */
    found: scan.candidates.length,
    candidates: scan.candidates,
    moreThanBatch: scan.moreThanBatch,
    scanTruncated: scan.scanTruncated,
    reclaimed: result.reclaimed,
    skippedUnderLock: result.skippedUnderLock,
    message: result.dryRun
      ? `只数了一遍：够格的 ${scan.candidates.length} 个，一条都没写`
      : `收走了 ${result.reclaimed.length} 个${result.skippedUnderLock ? `，锁上再判时跳过 ${result.skippedUnderLock} 个` : ''}`,
  };
}
