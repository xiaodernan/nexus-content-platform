import { AdminNav } from '@/components/AdminNav';
import { currentUserOrNull } from '@/server/domain/session';
import { fetchAiCacheStats, type AiCacheReadout } from '@/server/ai/cache-stats';
import { AiCachePanel } from './AiCachePanel';

export const dynamic = 'force-dynamic';

/**
 * §CACHE-2 `/admin/ai-cache`：把「缓存命中率为什么低」这件事变成三本可以看的账。
 *
 * 起点是用户连着两次问的同一个问题。上一片给了判据（字节前缀复用率）与端点
 * （`/v1/ai/cache-stats`），但**判据没有仪表就只是判据**：运维仍然要 curl 才能知道
 * 这一台现在是什么状态。这一页就是那块仪表。
 *
 * 三处诚实与 `/admin/discover-cache` 同一口径：
 * - 首屏在服务端取一次真读数；取不到不白屏、也不画一份全 0 的假账，交给面板说"这次没测到"；
 * - `appCache:null` 是"缓存没启用"，**不是"启用了但零命中"**——单独一档中性说法（null≠0）；
 * - 这只是**这一台的进程内读数**，重启即清零、不跨实例聚合，页脚讲清。
 *
 * 门与 `/admin/*` 其余几张一致：没登录与不是 admin 都只说一句拒绝，不外泄内部缓存账。
 */
async function initialReadout(): Promise<{ readout: AiCacheReadout | null; error: string | null }> {
  const result = await fetchAiCacheStats();
  return result.ok ? { readout: result.readout, error: null } : { readout: null, error: result.error };
}

export default async function AdminAiCachePage() {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">缓存读数</h1>
        <p className="adm-deniedText">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">缓存读数</h1>
        <p className="adm-deniedText">
          这个页面对 {user.displayName}（role={user.role}）不开放：缓存读数只对 role=admin 可见。
        </p>
      </main>
    );
  }

  const { readout, error } = await initialReadout();

  return (
    <main className="am-shellXl" data-ai-cache-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="am-titleLg">缓存读数 · 三层账</h1>
          <p className="adm-capNote" data-ai-cache-scope>
            前缀复用率（我们自己的字节）· 应用缓存命中 · provider 报账覆盖 · 每 4 秒刷新 · 仅这一台进程
          </p>
        </div>
        <AdminNav current="ai-cache" />
      </header>

      <AiCachePanel initial={readout} initialError={error} />
    </main>
  );
}
