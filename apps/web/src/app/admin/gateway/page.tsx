import { currentUserOrNull } from '@/server/domain/session';
import { getGatewayStatus, getGatewayClient } from '@/server/gateway';
import type { GatewaySnapshot } from '@/server/gateway/snapshot';
import { AdminNav } from '@/components/AdminNav';
import { GatewayPanel } from './GatewayPanel';

export const dynamic = 'force-dynamic';

/**
 * §SC-40：网关态势页——把网关 `/platform/{routes,services,health}` 三份读数拼成一张运维能读的图。
 *
 * 补的是 `/admin/observability` 看不到的那一半：那里只有 web 自己的进程计数器与库里的账，
 * **网关此刻给哪些前缀路由、注册中心记着谁、每个实例还活不活**，此前只能去 grep 网关日志或直接
 * curl 三个端点再自己在脑子里 join。这一页把三份读数按 service id 对齐，错处（注册了没路由、
 * 路由了没注册、DOWN/UNKNOWN）才是它的价值。
 *
 * 三处诚实与 `/admin/rate-limit`、`/admin/realtime` 同一口径：
 * - 首屏在服务端取一次真读数；取不到不白屏，也不画一份空拓扑——降级成三列 `unavailable`，
 *   由面板如实说"这次没测到"（client 层已保证）。
 * - 每列带 measuredAt 与 state（fresh/cached/stale/unavailable），`null` 渲染成"—（未测）"而非 0。
 * - 三列 measuredAt 不同，页面明说这是三张带各自日期的事实拼的图，不是同一瞬间的原子快照。
 *
 * 门与 `/admin/*` 其余几张一致：没登录与不是 admin 都只说一句拒绝，不外泄拓扑。
 */
async function initialSnapshot(): Promise<{ snapshot: GatewaySnapshot | null; error: string | null }> {
  try {
    return { snapshot: await getGatewayStatus(), error: null };
  } catch (error) {
    return { snapshot: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function AdminGatewayPage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">网关态势</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="not-admin">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">网关态势</h1>
        <p className="mt-2 text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：网关拓扑只对 role=admin 可见。
        </p>
      </main>
    );
  }

  const [{ snapshot, error }, driver] = await Promise.all([initialSnapshot(), Promise.resolve(getGatewayClient().describe())]);

  return (
    <main className="gw-root mx-auto flex max-w-[1180px] flex-col gap-5 px-6 py-10" data-gateway-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-24)] font-semibold tracking-tight">网关态势</h1>
          <p className="text-11 text-fg-3" data-gateway-scope>
            路由 × 注册 × 健康 · 问的是网关此刻读到的真值 · 每 4 秒刷新 · 地址 {driver.baseUrl}
          </p>
        </div>
        <AdminNav current="gateway" />
      </header>

      <GatewayPanel initial={snapshot} initialError={error} driver={driver} />
    </main>
  );
}
