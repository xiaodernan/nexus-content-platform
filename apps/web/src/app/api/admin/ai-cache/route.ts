import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { fetchAiCacheStats } from '@/server/ai/cache-stats';
import { jsonError } from '@/server/http';

/**
 * §CACHE-2：三层缓存读数的入口（`/admin/ai-cache` 面板轮询这一条）。
 *
 * 门与 `/admin/*` 其余几张同一句口径（默认拒绝，`role=admin`）。交出去的是
 * **这一台 ai-service** 的前缀复用率、应用缓存命中与 provider 报账覆盖度——
 * 这些是运维拓扑，不是公开状态页。
 *
 * 两个决定与 `/api/admin/discover-cache` 同构：
 * - **`no-store`**：读数带 measuredAt，是"此刻这一台"的事实；网络层缓存它等于拿旧账冒充。
 * - **失败要说清是哪一种失败**（没配地址 / 连不上 / 形状不认识）：三者对运维的含义不同，
 *   合并成一句"读取失败"等于让人从零开始查。具体句子由 `fetchAiCacheStats` 给出，
 *   这里原样端出去，不做二次加工。
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '缓存读数只对审核员（role=admin）开放' });
  }
  const result = await fetchAiCacheStats();
  if (!result.ok) {
    console.error(`[admin/ai-cache] ${result.error}`);
    return jsonError(503, 'readout_unavailable', { message: result.error });
  }
  return NextResponse.json(result.readout, { headers: { 'cache-control': 'no-store' } });
}
