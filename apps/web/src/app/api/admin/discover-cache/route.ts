import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError } from '@/server/http';
import { describeDiscoverCache } from '@/server/domain/discover-cache';

/**
 * §SC-43：发现页缓存与跨实例失效总线的读数入口（`/admin/discover-cache` 面板轮询这一条）。
 *
 * 门与 `/admin/*` 其余几张同一句口径（默认拒绝，`role=admin`）：交出的是**这一台实例**
 * 的缓存命中六账、单调水位线、以及跨实例总线的四账。这不是公开状态页——一台实例内部
 * 缓存了多少 viewer 的键、总线收发了多少失效帧，属于运维拓扑，不该对所有人开放。
 *
 * 两个诚实决定，与 `/api/admin/gateway` 同构：
 * - **`no-store`**：这份答案带 measuredAt，是"此刻这一台"的事实；网络层缓存它等于把旧读数
 *   冒充此刻。面板每 4 秒轮询，浏览器再缓存一层只会制造第三个时间点。
 * - **原样端出、不二次加工**：`describeDiscoverCache()` 的读数直接 JSON 化。加工一层就多一处
 *   把 `bus:null`（单机/未接）抹成四账全 0 的机会——那正是这一整片在防的谎（null≠0）。
 *
 * **不打库**：`discoverCacheStats()` 是同步的进程内读数，问的是本实例自己的内存账，
 * 因此这里没有依赖故障分支；读不到只可能是取数本身抛错。
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '缓存读数只对审核员（role=admin）开放' });
  }
  try {
    return NextResponse.json(describeDiscoverCache(), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[admin/discover-cache] 读数失败: ${message}`);
    return jsonError(503, 'readout_unavailable', { message: '这次没测到缓存读数，请稍后再看' });
  }
}
