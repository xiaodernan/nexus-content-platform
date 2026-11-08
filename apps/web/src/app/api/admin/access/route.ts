import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError } from '@/server/http';
import { listApiAccessGlobal, parseApiAccessWindowDays } from '@/server/domain/api-tokens';

/**
 * §188 M8 第三片欠的那格：这本账此前只有"按人 / 按枚"的视图——自己看自己名下的凭据。
 * "谁在扫库、哪一枚凭据是热点"要的是**跨全部用户**的那一屏，所以门比签发凭据更硬：
 * `role=admin`（与复核台、实时诊断同一句口径）。
 *
 * `?days=` 只认 1 / 7 / 30，名单外回 400 并列出可选值——窗口是被查询的东西，
 * 悄悄把 "411" 按 30 天算，屏幕上就会是一句与查询者无关的话。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '访问账全局视图只对审核员（role=admin）开放' });
  }
  const days = parseApiAccessWindowDays(new URL(request.url).searchParams.get('days'));
  if (days === null) {
    return jsonError(400, 'bad_window', { message: '窗口只认 1 / 7 / 30 天' });
  }
  return NextResponse.json(await listApiAccessGlobal(days));
}
