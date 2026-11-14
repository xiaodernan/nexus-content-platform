import { NextResponse } from 'next/server';
import { currentUserOrNull } from '@/server/domain/session';
import { jsonError } from '@/server/http';
import { getGatewayClient, getGatewayStatus } from '@/server/gateway';

/**
 * §SC-40：网关态势读数的对外入口（`/admin/gateway` 面板轮询这一条）。
 *
 * 门与 `/admin/*` 其余几张**同一句口径**（默认拒绝，`role=admin`）：交出的是网关此刻的路由表、
 * 注册中心名册、逐实例健康，以及"哪几列没测到、哪几列是旧的"——这是运维 topology，不是公开状态页，
 * 一张"哪些后端在跑、哪些没注册"的图不该对所有人开放。
 *
 * 两个诚实决定，与网关自己的 `/platform/*` 注释对齐：
 * - **`no-store`**：这份答案带 measuredAt，是一张带日期的事实；浏览器/中间层缓存它等于把旧拓扑
 *   冒充此刻。面板每 4 秒轮询、服务端另有 TTL 缓存，网络层再缓存一层只会制造第三个时间点。
 * - **不做二次加工**：`getGatewayStatus()` 的 join 结果与 `client.describe()` 原样端出。加工一层
 *   就多一处把 `null`（没测到）抹成 0 的机会——那正是这一整片在防的谎。
 *
 * 这一条**不打真库**（与 admin/realtime、admin/rate-limit 的纯诊断入口同类）；它问的是网关，
 * 失败由 client 降级成 `unavailable` 列，因此这里几乎没有 500 分支——除非 join 本身抛错。
 */
export async function GET(): Promise<NextResponse> {
  const user = await currentUserOrNull();
  if (!user) return jsonError(401, 'unauthenticated', { message: '需要先登录' });
  if (user.role !== 'admin') {
    return jsonError(403, 'forbidden', { message: '网关态势只对审核员（role=admin）开放' });
  }
  try {
    const [snapshot, driver] = await Promise.all([getGatewayStatus(), Promise.resolve(getGatewayClient().describe())]);
    return NextResponse.json(
      { ...snapshot, driver },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (error) {
    // join 意外抛错才走到这：不说"平台不健康"（那是网关的事），只说这次读数没答上。
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[admin/gateway] 读数失败: ${message}`);
    return jsonError(503, 'readout_unavailable', { message: '这次没测到网关态势，请稍后再看' });
  }
}
