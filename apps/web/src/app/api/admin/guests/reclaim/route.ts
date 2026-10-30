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
  /**
   * 点名的那几个人。给了就只碰这些 id（每一个仍要在锁下过同一句判据），
   * 界面上勾了哪几行 = 这一次最多能收哪几行——爆炸半径由这一屏说了算，不由"此刻全库有几个"说了算。
   */
  ids: z.array(z.string().uuid()).max(GUEST_RECLAIM_MAX_BATCH).optional(),
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
  return NextResponse.json({ ok: true, ...payload(result, parsed.data.ids ?? null) });
}

/**
 * 响应里放的是"这一轮看见了什么、做了什么"，逐条与 `docs/adr/0072-*.md` 的口径对得上。
 *
 * 读数那一份整个放在 `scan` 里，不把它摊平成十来个同名字段：面板要换的就是这一份快照，
 * 摊平一次就多一处"改了那边忘了这边"的地方。第三十一片就是在查另一件事时撞见这一格的——
 * 面板写的是 `body?.scan`，而这里从来没给过 `scan`，所以那颗「重新数一遍」在屏幕上什么都没换。
 */
function payload(result: GuestReclaimResult & { ok: true }, named: string[] | null) {
  const { scan } = result;
  return {
    dryRun: result.dryRun,
    /** 这一次是不是按勾出来的那几行走的，以及那句"点名的 N 个里"的 N */
    named: named !== null,
    requested: result.requested,
    reclaimed: result.reclaimed,
    skippedUnderLock: result.skippedUnderLock,
    /** 这一轮的整份读数：面板换 `live` 换的就是它 */
    scan,
    // 那句数必须与库里少掉的行数同源：`requested` 只在点名时出现，不然"收走了 0 个"
    // 会让人以为整份清单被走了一遍，而实际上这一次只碰了勾着的那几行
    message: result.dryRun
      ? `只数了一遍：够格的 ${scan.candidates.length} 个，一条都没写`
      : `${named ? `点名的 ${result.requested} 个里` : ''}收走了 ${result.reclaimed.length} 个${
          result.skippedUnderLock ? `，${result.skippedUnderLock} 个此刻不够格没动` : ''
        }`,
  };
}
