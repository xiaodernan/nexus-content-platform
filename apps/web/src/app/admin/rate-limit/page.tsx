import { currentUserOrNull } from '@/server/domain/session';
import { RateLimitStatsPanel } from './StatsPanel';
import { AdminNav } from '@/components/AdminNav';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  deniedTitle: string;
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  title: string;
  summary: string;
  scope: string;
}> = {
  zh: {
    deniedTitle: '限流闸状态',
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：限流闸状态只对 role=admin 可见。`,
    title: '限流闸状态',
    summary: '装的哪个驱动、窗口是共享还是每台各数、桶的上界与现数、有没有判定正由本机窗口代判（§64 / §SEC 诊断入口）',
    scope: '这里记的是这台实例的装法与账：多实例部署下每台各算各的，回答这次请求的那台会说话，别台不会。限额的口径看第一、二格——驱动是进程内或线路不在时，“多少次”那句就是每台各数各的，这不是闸没挡，是同一句话换了主语。',
  },
  en: {
    deniedTitle: 'Rate-limit gate',
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): the rate-limit view is visible only to role=admin.`,
    title: 'Rate-limit gate',
    summary: 'which driver is loaded, whether the window is shared or per-instance, the bucket ceiling and current count, and whether any verdict is being adjudicated by a local window right now (§64 / §SEC diagnostics)',
    scope: 'This page records how this instance is wired and its counts — in multi-instance deployments every machine counts for itself, and only the one answering this request will speak. The first two cells define the quota’s unit — with an in-process driver or a broken wire, “how many times” literally means “each instance counts its own”. That is not the gate failing to block, it is the same sentence with a different subject.',
  },
};

/**
 * §SEC 第三十五片的诊断入口：这道闸**现在**装的是哪个驱动、名额钉在几、有没有正在退回。
 *
 * 这一页补的是三个 ADR 挂了同久的同一句"仍欠"。它不新造任何读数——每个数字都已经在
 * 启动日志、那两个 counter 或驱动的自述字段里；这一格的价值是"部署里看得见的人不用去 grep stdout"，
 * 而"不设 `NEXUS_REDIS_URL` 时 `10 次/15 分钟/邮箱` 逐字变成每台 10 次"这句代价从此有个落点。
 *
 * 页面上写死三句限度，因为它们都能被单独读反：
 * - 问的是**这台实例**：多实例部署下每台各算各的，回答这次请求的那台会说话，别台不会；
 * - "驱动=Redis"不等于"此刻在共享"：线路不在或名额用完时，那一条由本机窗口判（`docs/adr/0076` 后果 1、
 *   `docs/adr/0081` 的取向），所以退回到本机窗口的次数与原因和线路状态是同一块表盘上的两格；
 * - `bucketsTracked` 不是权威键数：Redis 那半读的是这台最近一次判定带回的名册条数，
 *   权威永远是那台的 `ZCARD`（`docs/adr/0081` 的观测一节）。
 *
 * v768：双语（getLocale）。
 */
export default async function AdminRateLimitPage() {
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

  return (
    <main className="adm-shellNarrow" data-ratelimit-admin-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="adm-deniedTitle">{c.title}</h1>
          <p className="adm-capNote" data-ratelimit-summary>
            {c.summary}
          </p>
        </div>
        <AdminNav current="rate-limit" />
      </header>

      <p className="adm-capNote" data-ratelimit-scope>
        {c.scope}
      </p>

      <RateLimitStatsPanel locale={locale} />
    </main>
  );
}
