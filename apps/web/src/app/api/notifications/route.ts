import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { inbox } from '@/server/domain/notifications';

/**
 * §164 顶栏铃铛要的那一份：未读数 + 最近几条。
 *
 * 收件箱主界面是服务端渲染的（/notifications），这个接口只为铃铛存在——
 * 铃铛挂在各页的头部里，头部是服务端渲染的，但**不能为了一个未读数把每页都变成动态页**，
 * 所以它在自己挂载时取一次。这里没有轮询：通知不是秒级产品，刷新页面就能看到新的。
 */
export async function GET(req: Request): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return NextResponse.json({ ok: false, reason: '没有登录' }, { status: 401 });
  const url = new URL(req.url);
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '6', 10);
  const page = await inbox(user.id, Number.isFinite(limit) ? limit : 6);
  return NextResponse.json({
    ok: true,
    unread: page.unread,
    total: page.total,
    items: page.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      link: item.link,
      unavailable: item.unavailable,
      read: item.read,
    })),
  });
}
