import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError } from '@/server/http';
import { exportApiAccessGlobal, parseApiAccessWindowDays } from '@/server/domain/api-tokens';

/**
 * 访问账的 CSV 出口（M8 第三片"也没有导出"那半）。与视图同一本账、同一窗口，
 * 但**不截断**——只导出前 20 名等于让人拿着残账对账。
 *
 * 两个参数都白名单：`days` 同视图，`kind` 只认 tokens / endpoints。
 * GET 且只读，所以没有 CSRF 这一格（凭据不会被浏览器自动带上，这里连 Bearer 都没有，
 * 走的是浏览器会话 + role 门）。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '访问账导出只对审核员（role=admin）开放' });
  }
  const params = new URL(request.url).searchParams;
  const days = parseApiAccessWindowDays(params.get('days'));
  if (days === null) {
    return jsonError(400, 'bad_window', { message: '窗口只认 1 / 7 / 30 天' });
  }
  const kindRaw = params.get('kind');
  const kind = kindRaw === null || kindRaw === '' ? 'tokens' : kindRaw;
  if (kind !== 'tokens' && kind !== 'endpoints') {
    return jsonError(400, 'bad_kind', { message: 'kind 只认 tokens（凭据榜）/ endpoints（端点榜）' });
  }
  const csv = await exportApiAccessGlobal(days, kind);
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      // 窗口与榜别进文件名：拿到文件的人不必开文件就知道它装的是哪一屏的账
      'content-disposition': `attachment; filename="api-access-${kind}-${days}d-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
