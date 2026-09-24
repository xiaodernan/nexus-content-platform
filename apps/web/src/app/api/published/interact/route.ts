import { NextResponse } from 'next/server';
import { requireUser } from '@/server/domain/session';
import { addComment, publicRefByPath, remixPublication, toggleLike } from '@/server/domain/social';
import { toggleSave } from '@/server/domain/profile';
import { csrfOk } from '@/server/security/csrf';
import { emit } from '@/server/domain/notifications';
import { clientIp, getRateLimiter, rateKey } from '@/server/security/rateLimit';
import { jsonError } from '@/server/http';

/**
 * §59 作品页上的动作：Like / Comment / Remix / Save 走同一个入口。
 *
 * 合成一个而不是三个，是因为这三件事共享同一条边界：必须是登录身份 + 必须过 CSRF +
 * 必须限流（公开页的互动是匿名访客最容易刷的东西）。分开写三份，早晚有一份忘了限流。
 *
 * Share 没有服务端动作（就是把链接复制走），Save 需要一张收藏表——两件事都如实记在 ROADMAP 里，
 * 不在这里假装"支持"。
 */
const ACTIONS = ['like', 'comment', 'remix', 'save'] as const;

/** 每个身份每分钟最多 20 次互动；评论更严：每小时 30 条 */
const RATE_PER_MINUTE = 20;
const COMMENT_PER_HOUR = 30;

export async function POST(req: Request): Promise<NextResponse> {
  if (!(await csrfOk(req))) return jsonError(403, 'csrf_failed', { message: 'CSRF 校验未通过' });
  const body = (await req.json().catch(() => null)) as { path?: unknown; action?: unknown; text?: unknown } | null;
  const action = typeof body?.action === 'string' ? body.action : '';
  const path = typeof body?.path === 'string' ? body.path : '';
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) return jsonError(400, 'bad_action', { message: 'action 必须是 like / comment / remix' });
  if (!path.startsWith('/n/')) return jsonError(400, 'bad_path', { message: 'path 必须是一个公开作品地址' });

  const user = await requireUser();
  const rl = getRateLimiter().hit(rateKey(`published/${action}`, clientIp(req), user.id), RATE_PER_MINUTE, 60_000);
  if (!rl.allowed) {
    return jsonError(429, 'rate_limited', { message: '操作太频繁了，稍后再试', retryAfterMs: rl.retryAfterMs });
  }

  const ref = await publicRefByPath(path);
  if (!ref) return jsonError(404, 'not_found', { message: '这个作品现在不公开' });

  if (action === 'save') {
    // Save 不发通知：收藏是作者看不见、也不该看见的动作（§59 把它设计成私人书架）
    const state = await toggleSave(user.id, ref.publicationId);
    return NextResponse.json({ ok: true, action, ...state });
  }

  if (action === 'like') {
    const state = await toggleLike(user.id, ref.publicationId);
    // §164：只有"真的点赞了"才通知；取消点赞不补一条"某人取消了点赞"，那是噪音不是事件
    if (state.liked) {
      await emit({
        kind: 'like',
        recipientId: ref.ownerId,
        actorId: user.id,
        actorName: user.displayName,
        projectId: ref.projectId,
        publicationId: ref.publicationId,
        path: ref.path,
        projectName: ref.projectName,
      });
    }
    return NextResponse.json({ ok: true, action, ...state });
  }

  if (action === 'comment') {
    const crl = getRateLimiter().hit(rateKey('published/comment', clientIp(req), user.id), COMMENT_PER_HOUR, 60 * 60_000);
    if (!crl.allowed) {
      return jsonError(429, 'rate_limited', { message: '评论太频繁了，一小时后再试', retryAfterMs: crl.retryAfterMs });
    }
    const result = await addComment(user.id, ref.publicationId, typeof body?.text === 'string' ? body.text : '');
    if (!result.ok) {
      // 机检挡下不是错误状态码：它是"这条没发出去，原因在这里"的正常回话
      return NextResponse.json({ ok: false, action, reason: result.reason, rule: result.rule ?? null }, { status: result.rule ? 200 : 400 });
    }
    // 通知挂在评论 id 上：同一条评论重试只留一条，两次真评论留两条
    await emit({
      kind: 'comment',
      recipientId: ref.ownerId,
      actorId: user.id,
      actorName: user.displayName,
      projectId: ref.projectId,
      publicationId: ref.publicationId,
      path: ref.path,
      projectName: ref.projectName,
      commentId: result.comment.id,
      text: result.comment.body,
    });
    return NextResponse.json({ ok: true, action, comment: result.comment, notice: result.notice });
  }

  const remix = await remixPublication(user.id, ref.publicationId);
  if (!remix.ok) return jsonError(409, 'cannot_remix', { message: remix.reason });
  await emit({
    kind: 'remix',
    recipientId: ref.ownerId,
    actorId: user.id,
    actorName: user.displayName,
    projectId: ref.projectId,
    publicationId: ref.publicationId,
    path: ref.path,
    projectName: ref.projectName,
    forkedProjectId: remix.projectId,
  });
  return NextResponse.json({ ok: true, action, projectId: remix.projectId, name: remix.name });
}
