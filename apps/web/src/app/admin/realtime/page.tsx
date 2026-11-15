import { currentUserOrNull } from '@/server/domain/session';
import { RealtimeStatsPanel } from './StatsPanel';
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
    deniedTitle: '实时总线状态',
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：实时总线状态只对 role=admin 可见。`,
    title: '实时总线状态',
    summary: '驱动是谁、跨实例线路接上没有、这台实例断过几帧、本进程有几个人在听（§163 诊断入口）',
    scope: '这里记的是这台实例的线路：多实例部署下每台各算各的，回答这次请求的那台会说话，别台不会。实时通道是加速器不是权威来源——失败的帧不补发，界面上每个数字都按这个口径读。下半区是 Java 生产者（domain-service）那一侧的计数：没接上时明写"没拿到"，不画成零。',
  },
  en: {
    deniedTitle: 'Realtime bus',
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): the realtime bus view is visible only to role=admin.`,
    title: 'Realtime bus',
    summary: 'which driver, whether the cross-instance wire is up, how many frames this instance dropped, how many listeners this process has (§163 diagnostics)',
    scope: 'Everything here records this instance’s wire: every machine counts for itself in multi-instance deployments — the one answering this request speaks, the others do not. The realtime channel is an accelerator, not an authority — failed frames are never resent; every number on this page is read with that in mind. The lower section counts the Java producer (domain-service): if it is unreachable it says so, it never paints a zero.',
  },
};

/**
 * §163 的诊断入口（ADR-0028 那一片"明确不做的第三件"）：`wireErrorCount` / `ready`
 * 在此之前只住在 stderr 与测试里——界面上看不见"这台实例掉了几帧"。
 *
 * 三句限度写在页面上，因为它们各自都能被误读：
 * - 问的是**这台实例**（多实例部署下每台各算各的；回答这次请求的那台会说话，别台不会）；
 * - 进程内驱动没有线路，那两格是"不适用"不是 0；
 * - 失败的帧不补发（ADR-0028 的语义选择，补发要另立 ADR），权威状态永远在库里。
 *
 * v767：双语（getLocale）。
 */
export default async function AdminRealtimePage() {
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
    <main className="adm-shellNarrow" data-realtime-admin-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="adm-deniedTitle">{c.title}</h1>
          <p className="adm-capNote" data-realtime-summary>
            {c.summary}
          </p>
        </div>
        <AdminNav current="realtime" />
      </header>

      <p className="adm-capNote" data-realtime-scope>
        {c.scope}
      </p>

      <RealtimeStatsPanel locale={locale} />
    </main>
  );
}
