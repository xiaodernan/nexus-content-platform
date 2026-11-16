import { currentUserOrNull } from '@/server/domain/session';
import { AdminNav } from '@/components/AdminNav';
import { BehaviorSimPanel } from './BehaviorSimPanel';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  title: string;
  scopeNote: string;
  panelTitle: string;
  ariaLabel: string;
}> = {
  zh: {
    deniedAnonymous: '需要先登录才能看',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：行为演练只对 role=admin 可见。`,
    title: '行为演练 · 真实用户模拟',
    scopeNote: '这是把一批模拟的人·天写进 publication_visits（suspectedBot=true），用来演练「没耐心就关掉/乱点/深读者」的行为分布对流量仪表盘的影响；不是真实流量，爬虫口径同源统计、清楚标注。',
    panelTitle: '发布一次演练 · 看仪表盘接住它',
    ariaLabel: '行为演练面板',
  },
  en: {
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): the behavior testbed is visible only to role=admin.`,
    title: 'Behavior testbed · simulated real-user traffic',
    scopeNote: 'This pumps simulated person-days into publication_visits (suspectedBot=true) to observe how no-patience / click-spam / deep-reader distributions move the metrics you see elsewhere. Not real traffic — tallied as bots, labeled clearly, and excluded from "human" counters.',
    panelTitle: 'Run a drill · see the dashboard catch it',
    ariaLabel: 'Behavior drill panel',
  },
};

export default async function AdminBehaviorSimPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">{c.deniedAnonymous}</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">{c.deniedNotAdmin(user.displayName, user.role)}</p>
      </main>
    );
  }

  return (
    <main className="am-shellGapXl" data-behavior-sim-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="am-titleLg">{c.title}</h1>
          <p className="adm-capNote" data-behavior-sim-scope>
            {c.scopeNote}
          </p>
        </div>
        <AdminNav current="behavior-sim" />
      </header>

      <BehaviorSimPanel locale={locale} panelTitle={c.panelTitle} ariaLabel={c.ariaLabel} />
    </main>
  );
}
