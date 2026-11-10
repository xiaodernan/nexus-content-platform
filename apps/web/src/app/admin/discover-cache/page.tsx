import { currentUserOrNull } from '@/server/domain/session';
import { describeDiscoverCache, type DiscoverCacheReadout } from '@/server/domain/discover-cache';
import { AdminNav } from '@/components/AdminNav';
import { DiscoverPanel } from './DiscoverPanel';

export const dynamic = 'force-dynamic';

/**
 * §SC-43：发现页缓存态势页——把 SC-41/SC-42 后端那套"按 viewer 分键缓存 + 跨实例失效总线"
 * 的进程内读数第一次放到运维眼前。此前 `discoverCacheStats()` 全仓零消费者，缓存命中、水位线
 * 单调、总线收发这些"隐私缓存是否真的在工作、跨实例有没有接上"的问题只能读代码或翻日志。
 *
 * 三处诚实与 `/admin/gateway` 同一口径：
 * - 首屏在服务端取一次真读数；取不到不白屏也不画一份全 0 的假账，交给面板说"这次没测到"；
 * - `bus:null` 是"单机/未接总线"，**不是"接了但收发全 0"**——页面上单独一档中性说法（null≠0）；
 * - 这只是**这一台实例**的读数；多实例各算各的，总线是最终一致、不是瞬时强一致，页脚讲清。
 *
 * 门与 `/admin/*` 其余几张一致：没登录与不是 admin 都只说一句拒绝，不外泄内部缓存账。
 */
function initialReadout(): { readout: DiscoverCacheReadout | null; error: string | null } {
  try {
    return { readout: describeDiscoverCache(), error: null };
  } catch (error) {
    return { readout: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function AdminDiscoverCachePage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="anonymous">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">发现页缓存</h1>
        <p className="mt-2 text-13 text-fg-2">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="mx-auto max-w-[860px] px-6 py-16" data-admin-denied="not-admin">
        <h1 className="text-[var(--nexus-font-size-21)] font-semibold">发现页缓存</h1>
        <p className="mt-2 text-13 text-fg-2">
          这个页面对 {user.displayName}（role={user.role}）不开放：缓存读数只对 role=admin 可见。
        </p>
      </main>
    );
  }

  const { readout, error } = initialReadout();

  return (
    <main className="gw-root mx-auto flex max-w-[1180px] flex-col gap-5 px-6 py-10" data-discover-cache-root>
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[var(--nexus-font-size-24)] font-semibold tracking-tight">发现页缓存 · 跨实例失效</h1>
          <p className="text-11 text-fg-3" data-discover-cache-scope>
            按 viewer 分键 · 本机隐私即时失效 · 跨实例经 Redis 最终一致 · 每 4 秒刷新
          </p>
        </div>
        <AdminNav current="discover-cache" />
      </header>

      <DiscoverPanel initial={readout} initialError={error} />
    </main>
  );
}
