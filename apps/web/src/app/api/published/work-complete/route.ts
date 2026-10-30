import { NextResponse } from 'next/server';
import { isTerminalInteractivePage } from '@nexus/design-model';
import { PublishedWorkCompleteRequestSchema } from '@nexus/schemas';
import { recordWorkCompletion } from '@/server/domain/analytics';
import { resolvePublishedPath } from '@/server/domain/publish';
import { classifyVisit } from '@/lib/visit-meter';
import { currentUserOrNull } from '@/server/domain/session';
import { csrfOk } from '@/server/security/csrf';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { badRequest, jsonError } from '@/server/http';

/**
 * §167/§168：**互动作品侧的 completion 事件**——访客在公开的设计稿页上点着跳页，
 * 走到了一个没有出路的终点页。
 *
 * 与游戏那条 `/api/published/game-complete` 是并列的两格，不是同一条换了个名字：
 * 那边判"玩到了结局"（游戏投影里的结局段），这边判"这一版设计稿真的有一条可走通的
 * 点击流程，且到达的页确实是终点"。两处各自落表、各自计数
 * ⇒ 「通关过」与「互动完成」在分析页上是两个数，混着说就谁也不说了（§159）。
 *
 * 验证用的是**发布那一刻钉住的快照**（`resolvePublishedPath`），不是作者手上的工作稿：
 * 作者之后改稿不会让一条旧链接开始"能走通"，也不会让一个已发的版本停止计数。
 *
 * 边界与访客现场、游戏通关同款（这是**匿名可写**的接口）：
 * - CSRF 双提交照样要；只认 public / unlisted（private 与已驳回一律 404）；
 * - 按 IP + 匿名 key 限流，一小时 30 次；
 * - 一个人在一个版本上只记一次（唯一索引）⇒ 重复上报返回 duplicate，不加一；
 * - 爬虫照收但另计（`classifyVisit`），不进真人那一格。
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  try {
    const parsed = PublishedWorkCompleteRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return badRequest(parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
    }
    const { path, visitorKey, pageId, webdriver } = parsed.data;

    const rl = await getRateLimiter().hit(rateKey('published/work-complete', clientIp(req), visitorKey), 30, 60 * 60 * 1000);
    if (!rl.allowed) return jsonError(429, 'rate_limited', { message: '上报太频繁', retryAfterMs: rl.retryAfterMs });

    const found = await resolvePublishedPath(path);
    if (!found) return jsonError(404, 'not_found', { message: '没有这个公开页面，或它已经不再公开' });

    // 这一版确实有可走通的点击流程、且这一页确实是终点，才记。
    // 客户端说什么都不算：它可以把 pageId 随意填，判定只按钉住的那份文档。
    if (!isTerminalInteractivePage(found.document, pageId)) {
      return badRequest(['pageId 不是这一版的互动终点页（或这一版没有可走通的点击流程）']);
    }

    const viewer = await currentUserOrNull();
    const result = await recordWorkCompletion({
      publicationId: found.publication.id,
      visitorKey,
      userId: viewer?.id ?? null,
      pageId,
      suspectedBot: classifyVisit(req.headers.get('user-agent'), webdriver),
    });
    if (result === 'rejected') return badRequest(['visitorKey 不合法']);
    // duplicate 也算成功：这一次没有新增，但"已经记过了"不是错误
    return NextResponse.json({ ok: true, recorded: result === 'recorded' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(500, 'work_complete_failed', { message: `记这一次互动完成失败：${message}` });
  }
}
