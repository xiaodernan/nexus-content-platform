import Link from 'next/link';
import { cookies } from 'next/headers';
import { getLocale, type Locale } from '@/lib/i18n';
import { readPulseMetrics, type PulseMetrics } from '@/server/domain/pulse';
import { PULSE_COOKIE } from '@/server/domain/pulse-gate';
import { PulseNarrate } from './PulseNarrate';

export const dynamic = 'force-dynamic';

const COPY: Record<Locale, {
  title: string;
  lockTitle: string;
  lockText: string;
  passwordLabel: string;
  unlock: string;
  wrongPassword: string;
  publicBanner: string;
  snapshotAt: (iso: string) => string;
  usersTitle: string;
  usersCol: [string, string];
  usersRows: (m: PulseMetrics) => Array<[string, string]>;
  trendTitle: string;
  trendCaption: string;
  trendRows: (m: PulseMetrics) => Array<[string, string]>;
  registrationsTitle: string;
  dayCol: [string, string];
  ledgerTitle: string;
  tasksCol: [string, string, string];
  apiCol: [string, string];
  auditCol: [string, string, string];
  auditAllowed: string;
  auditDenied: string;
  emptyLedger: string;
  backHome: string;
}> = {
  zh: {
    title: '公开管理台',
    lockTitle: '口令 123',
    lockText: '这个面板是公开口径（项目主人明令）：口令就是 123，人人都知道，任何人都能进。'
      + '进来后只显示聚合数字——计数、分布、趋势，不含任何人的邮箱、昵称、ID 或 IP。',
    passwordLabel: '口令',
    unlock: '进入公开管理台',
    wrongPassword: '口令不对。',
    publicBanner: '公开面板 · 聚合数字 · 零个人信息 · 现场库快照 · 任何人都能进（口令 123）',
    snapshotAt: (iso) => `快照时间（UTC）：${iso} · 刷新页面即重算`,
    usersTitle: '账号与会话',
    usersCol: ['指标', '数值'],
    usersRows: (m) => [
      ['用户总数（未删除）', String(m.usersTotal)],
      ['— 已认领', String(m.claimedTotal)],
      ['— 未认领 guest', String(m.guestsTotal)],
      ['当前有效会话数', String(m.sessionsActive)],
      ['项目 · 公开', String(m.projectsPublic)],
      ['项目 · 仅链接', String(m.projectsUnlisted)],
      ['项目 · 私有', String(m.projectsPrivate)],
    ],
    trendTitle: '注册趋势（14 天 · 最小二乘外推）',
    trendCaption: '斜率 = 每天新增人数（人/天）；R² 为决定系数，越低代表外推越不可靠。'
      + '14 个点上做 7 天外推，这是统计描述不是预言。',
    trendRows: (m) => [
      ['14 天日均注册', (m.registrationsByDay.reduce((sum, p) => sum + p.count, 0) / Math.max(1, m.registrationsByDay.length)).toFixed(2)],
      ['斜率（人/天）', m.trend.slopePerDay.toFixed(4)],
      ['R²', m.trend.r2.toFixed(4)],
      ['未来 7 天新增（外推）', String(m.trend.projectedNext7d)],
    ],
    registrationsTitle: '最近 14 天注册（UTC）',
    dayCol: ['日期', '数'],
    ledgerTitle: '最近 7 天账本',
    tasksCol: ['状态 / 能力', '条数', '均耗时'],
    apiCol: ['端点', '调用次数'],
    auditCol: ['动作', '结果', '条数'],
    auditAllowed: '放行',
    auditDenied: '拒绝',
    emptyLedger: '这个窗口里没有行。',
    backHome: '返回首页',
  },
  en: {
    title: 'Public admin pulse',
    lockTitle: 'Password 123',
    lockText: 'This panel is public by design (the owner’s explicit call): the password is 123, everyone knows it, anyone can enter. '
      + 'Inside you only see aggregate numbers — counts, breakdowns, trends, no emails, names, ids or IPs.',
    passwordLabel: 'Password',
    unlock: 'Enter the public pulse',
    wrongPassword: 'Wrong password.',
    publicBanner: 'Public panel · Aggregate numbers · Zero personal data · Live DB snapshot · Anyone can enter (password 123)',
    snapshotAt: (iso) => `Snapshot (UTC): ${iso} · refresh to re-read`,
    usersTitle: 'Accounts & sessions',
    usersCol: ['Metric', 'Value'],
    usersRows: (m) => [
      ['Users (not deleted)', String(m.usersTotal)],
      ['— Claimed', String(m.claimedTotal)],
      ['— Unclaimed guests', String(m.guestsTotal)],
      ['Active sessions now', String(m.sessionsActive)],
      ['Projects · public', String(m.projectsPublic)],
      ['Projects · unlisted', String(m.projectsUnlisted)],
      ['Projects · private', String(m.projectsPrivate)],
    ],
    trendTitle: 'Registration trend (14 days · least-squares projection)',
    trendCaption: 'Slope = new sign-ups per day; R² is the coefficient of determination — lower means the projection is less trustworthy. '
      + 'Seven days projected from fourteen points: a statistical description, not a prophecy.',
    trendRows: (m) => [
      ['14-day daily average', (m.registrationsByDay.reduce((sum, p) => sum + p.count, 0) / Math.max(1, m.registrationsByDay.length)).toFixed(2)],
      ['Slope (per day)', m.trend.slopePerDay.toFixed(4)],
      ['R²', m.trend.r2.toFixed(4)],
      ['Next 7 days (projected)', String(m.trend.projectedNext7d)],
    ],
    registrationsTitle: 'Registrations, last 14 days (UTC)',
    dayCol: ['Day', 'Count'],
    ledgerTitle: 'The ledger, last 7 days',
    tasksCol: ['Status / capability', 'Rows', 'Avg'],
    apiCol: ['Endpoint', 'Calls'],
    auditCol: ['Action', 'Result', 'Rows'],
    auditAllowed: 'allow',
    auditDenied: 'deny',
    emptyLedger: 'No rows in this window.',
    backHome: 'Back to home',
  },
};

export default async function AdminPulsePage({ searchParams }: { searchParams?: Promise<{ e?: string }> }) {
  const locale = await getLocale();
  const c = COPY[locale];
  const params = (await searchParams) ?? {};
  const store = await cookies();
  const unlocked = store.get(PULSE_COOKIE)?.value === '1';

  if (!unlocked) {
    return (
      <main className="am-shellGapXl" data-pulse-locked>
        <header className="adm-headBaseline">
          <h1 className="adm-deniedTitle">{c.title}</h1>
          <Link href="/" className="am-linkImplicit" data-pulse-back>{c.backHome}</Link>
        </header>
        <section className="at-panel" data-pulse-unlock-panel>
          <h2 className="am-sectionHeadSm">{c.lockTitle}</h2>
          <p className="adm-capNote">{c.lockText}</p>
          <form method="post" action="/api/admin/pulse/unlock" className="at-formRow" data-pulse-unlock-form>
            <label className="at-label" htmlFor="pulse-password">{c.passwordLabel}</label>
            <input id="pulse-password" name="password" type="password" className="at-input" autoFocus autoComplete="off" data-pulse-password />
            <button type="submit" className="at-btnPrimary" data-pulse-submit>{c.unlock}</button>
          </form>
          {params.e === '1' ? (
            <p className="at-error" data-pulse-wrong>{c.wrongPassword}</p>
          ) : null}
        </section>
      </main>
    );
  }

  let metrics: PulseMetrics | null = null;
  let loadError: string | null = null;
  try {
    metrics = await readPulseMetrics();
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  if (!metrics) {
    return (
      <main className="am-shellGapXl" data-pulse-error>
        <header className="adm-headBaseline">
          <h1 className="adm-deniedTitle">{c.title}</h1>
          <Link href="/" className="am-linkImplicit" data-pulse-back>{c.backHome}</Link>
        </header>
        <section className="at-panel">
          <p className="at-error" data-pulse-load-error>库读数失败：{loadError}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="am-shellGapXl" data-pulse-root>
      <header className="adm-headBaseline">
        <div>
          <h1 className="adm-deniedTitle">{c.title}</h1>
          <p className="adm-capNote" data-pulse-snapshot-at>{c.snapshotAt(metrics.capturedAt)}</p>
        </div>
        <Link href="/" className="am-linkImplicit" data-pulse-back>{c.backHome}</Link>
      </header>

      <p className="adm-capNote" data-pulse-public-banner>{c.publicBanner}</p>

      <section className="am-audit">
        <h2 className="am-sectionHeadSm" data-pulse-users-heading>{c.usersTitle}</h2>
        <div className="tl-tableScroll" role="region" tabIndex={0} aria-label={c.usersTitle}>
          <table className="tl-table">
            <thead className="tl-thRow"><tr>{c.usersCol.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {c.usersRows(metrics).map(([k, v]) => (
                <tr key={k} data-pulse-users-row={k}>
                  <td>{k}</td>
                  <td className="am-monoCell">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="am-audit">
        <h2 className="am-sectionHeadSm" data-pulse-trend-heading>{c.trendTitle}</h2>
        <p className="adm-capNote">{c.trendCaption}</p>
        <div className="tl-tableScroll" role="region" tabIndex={0} aria-label={c.trendTitle}>
          <table className="tl-table">
            <tbody>
              {c.trendRows(metrics).map(([k, v]) => (
                <tr key={k} data-pulse-trend-row={k}>
                  <td>{k}</td>
                  <td className="am-monoCell">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="am-audit">
        <h2 className="am-sectionHeadSm" data-pulse-registrations-heading>{c.registrationsTitle}</h2>
        <div className="tl-tableScroll" role="region" tabIndex={0} aria-label={c.registrationsTitle}>
          <table className="tl-table">
            <thead className="tl-thRow"><tr>{c.dayCol.map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {metrics.registrationsByDay.map((p) => (
                <tr key={p.day} data-pulse-day={p.day}>
                  <td className="am-monoCell">{p.day}</td>
                  <td>{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="am-audit">
        <h2 className="am-sectionHeadSm" data-pulse-ledger-heading>{c.ledgerTitle}</h2>
        {metrics.tasks.length === 0 && metrics.apiCalls.length === 0 && metrics.audit.length === 0 ? (
          <p className="adm-capNote" data-pulse-ledger-empty>{c.emptyLedger}</p>
        ) : (
          <div className="am-ledgerGrid">
            {metrics.tasks.length > 0 ? (
              <div className="am-stack">
                <h3 className="am-ledgerTitle">agent tasks</h3>
                <div className="tl-tableScroll" role="region" tabIndex={0}>
                  <table className="tl-table">
                    <thead className="tl-thRow"><tr>{c.tasksCol.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {metrics.tasks.slice(0, 12).map((t) => (
                        <tr key={`${t.status}-${t.capability ?? '-'}`} data-pulse-task={t.status}>
                          <td>{t.status}{t.capability ? ` / ${t.capability}` : ''}</td>
                          <td className="am-monoCell">{t.n}</td>
                          <td>{t.avgMs === null ? '—' : `${t.avgMs.toFixed(0)} ms`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {metrics.apiCalls.length > 0 ? (
              <div className="am-stack">
                <h3 className="am-ledgerTitle">api access</h3>
                <div className="tl-tableScroll" role="region" tabIndex={0}>
                  <table className="tl-table">
                    <thead className="tl-thRow"><tr>{c.apiCol.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {metrics.apiCalls.slice(0, 12).map((row) => (
                        <tr key={row.endpoint} data-pulse-api={row.endpoint}>
                          <td className="am-monoCell">{row.endpoint}</td>
                          <td>{row.calls}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {metrics.audit.length > 0 ? (
              <div className="am-stack">
                <h3 className="am-ledgerTitle">audit</h3>
                <div className="tl-tableScroll" role="region" tabIndex={0}>
                  <table className="tl-table">
                    <thead className="tl-thRow"><tr>{c.auditCol.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>
                      {metrics.audit.slice(0, 12).map((row) => (
                        <tr key={`${row.action}-${row.allowed}`} data-pulse-audit={row.action}>
                          <td className="am-monoCell">{row.action}</td>
                          <td>{row.allowed ? c.auditAllowed : c.auditDenied}</td>
                          <td>{row.n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>

      <PulseNarrate locale={locale} />
    </main>
  );
}
