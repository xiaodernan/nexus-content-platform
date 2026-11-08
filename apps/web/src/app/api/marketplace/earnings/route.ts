import { NextResponse } from 'next/server';
import { getCreatorEarnings } from '@/server/domain/marketplace';
import { currentUserOrNull } from '@/server/domain/session';
import { failure, jsonError } from '@/server/http';

/**
 * §128 创作者收益明细：一次购买后创作者分成（`marketplace_splits`）的聚合视图。
 *
 * 聚合逻辑在 domain 的 `getCreatorEarnings`（按天分组、降序、支持日期范围）——
 * 这里此前自己内联重算了一遍同样的聚合。"同一件事只有一处实现"：
 * 两处迟早漂（一处改了分组口径另一处没改），而收益数是创作者真会看的钱。
 */
export async function GET() {
  const user = await currentUserOrNull();
  if (!user) {
    // 全站统一：`error` 装机器可读的码、人话在 `message` 里。
    // 这里原来是 `NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`——
    // 那个字段装的是一句英文人话，客户端拿不到可判别的码（与下载端点那次是同一类问题）。
    return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  }

  try {
    const summary = await getCreatorEarnings({ creatorId: user.id });
    return NextResponse.json(summary);
  } catch (error) {
    return failure(error, 'GET /api/marketplace/earnings');
  }
}
