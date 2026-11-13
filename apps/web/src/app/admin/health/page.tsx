import type { ReactElement } from 'react';
import { currentUserOrNull } from '@/server/domain/session';
import { probeAllTiers, type HealthSnapshot, type TierReadout } from '@/server/admin/health-aggregate';
import { AdminNav } from '@/components/AdminNav';

export const dynamic = 'force-dynamic';

/**
 * §SC-81（ADR-0192）：`/admin/health` 健康总览——把"五层（ai/java/gateway/redis/postgres）
 * 此刻是什么状态"一次摆出来。拿不到的一定说"未测到"，而不叫 down；每层独立超时；
 * 只读不可变快照不会伪装成实时流（measuredAt 谁都拿得到手）。
 *
 * 门与 /admin/realtime 同一口径（role=admin）。
 */

const TIER_LABEL: Record<TierReadout['name'], string> = {
  ai: 'AI Service',
  java: 'java-domain-service',
  gateway: 'nexus-gateway',
  redis: 'Redis',
  postgres: 'Postgres',
};

function Overall({ overall, okCount, total }: { overall: HealthSnapshot['overall']; okCount: number; total: number }): ReactElement {
  return (
    <section
      role="status"
      aria-label="健康总览"
      className={overall === 'ok' ? 'hd-overallOk' : 'hd-overallBad'}
      data-health-overall={overall}
    >
      <span>{overall === 'ok' ? '五层全绿' : '至少一层未测到 / 非 UP'}</span>
      <span>
        {okCount}/{total} 绿 · {new Date().toLocaleTimeString('zh-CN', { hour12: false })}
      </span>
    </section>
  );
}

export default async function AdminHealthPage(): Promise<ReactElement> {
  const user = await currentUserOrNull();
  if (!user) {
    return (
      <main className="adm-denied" data-admin-denied="anonymous">
        <h1 className="adm-deniedTitle">健康总览</h1>
        <p className="adm-deniedText">需要先登录才能看。</p>
      </main>
    );
  }
  if (user.role !== 'admin') {
    return (
      <main className="adm-denied" data-admin-denied="not-admin">
        <h1 className="adm-deniedTitle">健康总览</h1>
        <p className="adm-deniedText">
          这个页面对 {user.displayName}（role={user.role}）不开放：健康总览只对 role=admin 可见。
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
          <h1 className="adm-title">健康总览</h1>
          <p className="adm-capNote" data-health-scope>
            这一页汇总五层（ai / java / gateway / redis / postgres）此刻的<strong>权威读数</strong>。拿不到就说未测到，绝不改写成 down（§159）。
          </p>
        </div>
        <AdminNav current="health" />
      </header>
      <Overall overall={snapshot.overall} okCount={okCount} total={snapshot.tiers.length} />
      <section aria-label="五层健康清单">
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
                  {tier.ok ? '健康' : '未测到 / 异常'}
                </span>
              </div>
              <div>
                <p className="hd-detail">{tier.detail}</p>
                <p className="hd-measured">{new Date(tier.measuredAt).toLocaleTimeString('zh-CN', { hour12: false })} 测</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
