import { AdminNav } from '@/components/AdminNav';
import { currentUserOrNull } from '@/server/domain/session';
import { fetchAiCacheStats, type AiCacheReadout } from '@/server/ai/cache-stats';
import { AiCachePanel } from './AiCachePanel';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  deniedTitle: string;
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  title: string;
  scopeNote: string;
}> = {
  zh: {
    deniedTitle: '缓存读数',
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：缓存读数只对 role=admin 可见。`,
    title: '缓存读数 · 三层账',
    scopeNote: '前缀复用率（我们自己的字节）· 应用缓存命中 · provider 报账覆盖 · 每 4 秒刷新 · 仅这一台进程',
  },
  en: {
    deniedTitle: 'Cache stats',
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): cache stats are visible only to role=admin.`,
    title: 'Cache stats · three ledgers',
    scopeNote: 'prefix reuse (our own bytes) · app-cache hits · provider reporting coverage · refresh every 4 s · this process only',
  },
};

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
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">{c.deniedTitle}</h1>
        <p className="adm-deniedText">{c.deniedAnonymous}</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">{c.deniedTitle}</h1>
        <p className="adm-deniedText">
          {c.deniedNotAdmin(user.displayName, user.role)}
        </p>
      </main>
    );
  }

  const { readout, error } = await initialReadout();

  return (
    <main className="am-shellXl" data-ai-cache-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="am-titleLg">{c.title}</h1>
          <p className="adm-capNote" data-ai-cache-scope>
            {c.scopeNote}
          </p>
        </div>
        <AdminNav current="ai-cache" />
      </header>

      <AiCachePanel initial={readout} initialError={error} locale={locale} />
    </main>
  );
}
