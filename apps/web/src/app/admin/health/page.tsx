import type { ReactElement } from 'react';
import { currentUserOrNull } from '@/server/domain/session';
import { probeAllTiers, type HealthSnapshot, type TierReadout } from '@/server/admin/health-aggregate';
import { AdminNav } from '@/components/AdminNav';
import { getLocale, type Locale } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/**
 * §SC-81（ADR-0192）：`/admin/health` 健康总览——把"五层（ai/java/gateway/redis/postgres）
 * 此刻是什么状态"一次摆出来。拿不到的一定说"未测到"，而不叫 down；每层独立超时；
 * 只读不可变快照不会伪装成实时流（measuredAt 谁都拿得到手）。
 *
 * 门与 /admin/realtime 同一口径（role=admin）。
 *
 * v762：双语（getLocale）；tier.detail（服务端裁定 zh）原文透传（§46 独立切片）。
 */

const TIER_LABEL: Record<TierReadout['name'], string> = {
  ai: 'AI Service',
  java: 'java-domain-service',
  gateway: 'nexus-gateway',
  redis: 'Redis',
  postgres: 'Postgres',
};

const COPY: Record<Locale, {
  deniedTitle: string;
  deniedAnonymous: string;
  deniedNotAdmin: (name: string, role: string) => string;
  overallAria: string;
  overallAllOk: string;
  overallNotOk: string;
  greenCount: (ok: number, total: number) => string;
  pageTitle: string;
  scope: string;
  listAria: string;
  verdictOk: string;
  verdictBad: string;
  measuredSuffix: string;
}> = {
  zh: {
    deniedTitle: '健康总览',
    deniedAnonymous: '需要先登录才能看。',
    deniedNotAdmin: (name, role) => `这个页面对 ${name}（role=${role}）不开放：健康总览只对 role=admin 可见。`,
    overallAria: '健康总览',
    overallAllOk: '五层全绿',
    overallNotOk: '至少一层未测到 / 非 UP',
    greenCount: (ok, total) => `${ok}/${total} 绿 · `,
    pageTitle: '健康总览',
    scope: '这一页汇总五层（ai / java / gateway / redis / postgres）此刻的权威读数。拿不到就说未测到，绝不改写成 down（§159）。',
    listAria: '五层健康清单',
    verdictOk: '健康',
    verdictBad: '未测到 / 异常',
    measuredSuffix: ' 测',
  },
  en: {
    deniedTitle: 'Health',
    deniedAnonymous: 'You must sign in first.',
    deniedNotAdmin: (name, role) => `This page is not open to ${name} (role=${role}): health is visible only to role=admin.`,
    overallAria: 'Health overview',
    overallAllOk: 'All five layers green',
    overallNotOk: 'At least one layer unmeasured / not UP',
    greenCount: (ok, total) => `${ok}/${total} green · `,
    pageTitle: 'Health',
    scope: 'This page aggregates the five layers (ai / java / gateway / redis / postgres) with authority reads. Unreachable means “unmeasured” — never “down” (§159).',
    listAria: 'Five-layer health checklist',
    verdictOk: 'Healthy',
    verdictBad: 'Unmeasured / abnormal',
    measuredSuffix: ' measured',
  },
};

function Overall({ overall, okCount, total, c, locale }: { overall: HealthSnapshot['overall']; okCount: number; total: number; c: (typeof COPY)[Locale]; locale: Locale }): ReactElement {
  return (
    <section
      role="status"
      aria-label={c.overallAria}
      className={overall === 'ok' ? 'hd-overallOk' : 'hd-overallBad'}
      data-health-overall={overall}
    >
      <span>{overall === 'ok' ? c.overallAllOk : c.overallNotOk}</span>
      <span>
        {c.greenCount(okCount, total)}{new Date().toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}
      </span>
    </section>
  );
}

export default async function AdminHealthPage(): Promise<ReactElement> {
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

  const snapshot = await probeAllTiers();
  const okCount = snapshot.tiers.filter((t) => t.ok).length;

  return (
    <main className="adm-shellNarrow" data-health-admin-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="adm-title">{c.pageTitle}</h1>
          <p className="adm-capNote" data-health-scope>
            {c.scope}
          </p>
        </div>
        <AdminNav current="health" />
      </header>
      <Overall overall={snapshot.overall} okCount={okCount} total={snapshot.tiers.length} c={c} locale={locale} />
      <section aria-label={c.listAria}>
        <ul className="hd-list" data-health-list>
          {snapshot.tiers.map((tier) => (
            <li key={tier.name} className="hd-row" data-health-tier={tier.name}>
              <div className="hd-left">
                <span
                  className={'hd-dot ' + (tier.ok ? 'hd-dotOk' : 'hd-dotBad')}
                  aria-hidden="true"
                />
                <span className="hd-name">{TIER_LABEL[tier.name]}</span>
                <span className="hd-verdict" data-health-verdict={tier.name}>
                  {tier.ok ? c.verdictOk : c.verdictBad}
                </span>
              </div>
              <div>
                <p className="hd-detail">{tier.detail}</p>
                <p className="hd-measured">{new Date(tier.measuredAt).toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-CN', { hour12: false })}{c.measuredSuffix}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
