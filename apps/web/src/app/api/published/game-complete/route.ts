import { NextResponse } from 'next/server';
import { PublishedGameCompleteRequestSchema } from '@nexus/schemas';
import { findPublicPath } from '@/server/domain/moderation';
import { recordGameCompletion } from '@/server/domain/analytics';
import { classifyVisit } from '@/lib/visit-meter';
import { currentUserOrNull } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * §168：**游戏侧的 completion 事件**——玩家在公开可玩页上玩到了结局。
 *
 * 与 `/api/published/visit` 是**两个口径**，不是同一个数的两种写法：
 * 那边报的是"这一页滚到哪儿"（滚动比例），这边报的是"玩通了"（一个事件）
 * ⇒ 两处分开存、分开读。拿滚动完成度冒充通关是 §159 禁止的那种假数据。
 *
 * 边界与访客现场同款（这是**匿名可写**的接口）：
 * - CSRF 双提交照样要（middleware 给每个访客都签了 `nexus_csrf`）；
 * - 只接受能解析到 public / unlisted 快照的 path，private 与已驳回的连一行都不写；
 * - 按 IP + 匿名 key 限流：通关是低频事件（一个人玩一遍记一次），一小时 30 次已经用满。
 *
 * 计数是"**通关过多少人**"（一个访客在一个版本上只记一次）⇒ 重复上报返回 duplicate，不加一。
 * 疑似爬虫/自动化的判定沿用 `classifyVisit`（UA 名单 + 客户端自报的 webdriver）：
 * 可疑的行照收（"被爬过"要留得下痕迹），但不进真人那一格。
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  try {
    const parsed = PublishedGameCompleteRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
    }
    const { path, visitorKey, webdriver } = parsed.data;

    const rl = getRateLimiter().hit(rateKey('published/game-complete', clientIp(req), visitorKey), 30, 60 * 60 * 1000);
    if (!rl.allowed) return jsonError(429, 'rate_limited', { message: '上报太频繁', retryAfterMs: rl.retryAfterMs });

    const publication = await findPublicPath(path);
    if (!publication) return jsonError(404, 'not_found', { message: '没有这个公开页面，或它已经不再公开' });

    const viewer = await currentUserOrNull();
    const result = await recordGameCompletion({
      publicationId: publication.id,
      visitorKey,
      userId: viewer?.id ?? null,
      suspectedBot: classifyVisit(req.headers.get('user-agent'), webdriver),
    });
    if (result === 'rejected') return badRequest(['visitorKey 不合法']);
    // duplicate 也算成功：这一次没有新增，但"已经记过了"不是错误
    return NextResponse.json({ ok: true, recorded: result === 'recorded' });
  } catch (error) {
    // 这一格是**匿名可写**的入口：崩了不能只留一个 500 白页，
    // 要把原因说出来（否则排查时只剩"服务器错误"四个字）。
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(500, 'game_complete_failed', { message: `记这一次通关失败：${message}` });
  }
}
