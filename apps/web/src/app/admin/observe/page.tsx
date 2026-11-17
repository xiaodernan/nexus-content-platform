import Link from 'next/link';
import { cookies } from 'next/headers';
import { currentUserOrNull } from '@/server/domain/session';
import { getLocale, type Locale } from '@/lib/i18n';
import { OBSERVER_COOKIE, OBSERVER_COOKIE_VALUE } from '@/app/api/admin/observer/route';
import { AdminNav } from '@/components/AdminNav';
import { PasswordForm } from './PasswordForm';
import { ObserverDeepRead } from '@/components/ObserverDeepRead';
import { readObserverMetrics, buildObserverAdvice, type ObserverMetrics } from '@/server/admin/observer';

export const dynamic = 'force-dynamic';

/**
 * 只读观察站（§ADMIN-13 · 2026-11-17）
 *
 * 用途：检测、分析、查看、观察平台上所有用户的真实行为——
 * 用户数、注册趋势、浏览/点赞/评论/收藏/关注、7 天打开趋势、任务状态、
 * 套餐分布、最热的公开作品、完成度、以及**规则引擎**（非 AI）给出的下一步建议。
 *
 * 准入：role=admin 直接进；任何人通过「口令 123」（公开共享口令）进入只读视图。
 * 纪律：这里没有一个按钮能改任何东西——全部数字来自实库、按下即刷新。
 */
export const metadata = { title: '只读观察站 · Read-only observer — NEXUS Admin' };

const COPY: Record<Locale, {
  kicker: string;
  title: string;
  lede: string;
  gateTitle: string;
  gateNote: string;
  gateFoot: string;
  unitUsers: string;
  unitUsersGuests: string;
  unitNew7d: string;
  unitNew30d: string;
  unitPublishes: string;
  unitPublishesApproved: string;
  unitViews: string;
  unitLikes: string;
  unitComments: string;
  unitSaves: string;
  unitFollows: string;
  opened7d: string;
  opened30d: string;
  visibleMin7d: (mins: number) => string;
  completionAvg: (pct: number | null) => string;
  botsNote: (n: number) => string;
  tasksTitle: string;
  tasksQueued: string;
  tasksRunning: string;
  tasksAwaiting: string;
  tasksSucceeded: string;
  tasksFailed: string;
  plansTitle: string;
  planUnknown: string;
  trendTitle: string;
  trendAria: string;
  topTitle: string;
  topHead: [string, string, string, string];
  topEmpty: string;
  adviceTitle: string;
  adviceFoot: string;
  footer: string;
  completionFoot: string;
}> = {
  zh: {
    kicker: 'admin · read-only · 口令 123',
    title: '只读观察站',
    lede: '这里摆的是平台上**所有用户的真实行为**——注册、打开、点赞、评论、收藏、关注、任务结局，以及最热的公开作品。数字来自实库，按下即刷新；本页没有任何能修改数据的按钮。',
    gateTitle: '口令是公开的：123',
    gateNote: '输入 123 就能进来看。它不是鉴权秘密——它是一扇只读的窗：你能看见每一个数字，你什么也改不了。急不得的事实就那么多，不需要谁批准。',
    gateFoot: '这不是敏感数据（公开作品与公开计数）。如果你找到漏洞，请告诉我，而不是拿它干别的。',
    unitUsers: '注册用户（非游客）',
    unitUsersGuests: '游客（未认领）',
    unitNew7d: '7 天新注册',
    unitNew30d: '30 天新注册',
    unitPublishes: '发布总数',
    unitPublishesApproved: '公开已过审',
    unitViews: '总浏览 / 发布',
    unitLikes: '总点赞',
    unitComments: '总评论',
    unitSaves: '总收藏',
    unitFollows: '总关注',
    opened7d: '近 7 天有效打开',
    opened30d: '近 30 天有效打开',
    visibleMin7d: (mins: number) => `近 7 天累计可见 ${mins} 分钟`,
    completionAvg: (pct: number | null) => (pct === null ? '完成度：还没有数据' : `近 30 天平均完成度 ${pct.toFixed(1)}%`),
    botsNote: (n: number) => (n > 0 ? `近 7 天疑似机器人打开 ${n} 次（不进趋势）` : '近 7 天没有可疑机器人流量'),
    tasksTitle: '任务状态（全部历史）',
    tasksQueued: '排队 / 规划中',
    tasksRunning: '执行中',
    tasksAwaiting: '等你批准',
    tasksSucceeded: '已完成',
    tasksFailed: '失败',
    plansTitle: '套餐分布',
    planUnknown: '未知档',
    trendTitle: '近 7 天有效打开（按天）',
    trendAria: '近 7 天有效打开趋势柱状图',
    topTitle: '最热的公开作品',
    topHead: ['作品', '浏览', '点赞', '路径'],
    topEmpty: '还没有通过审核的公开作品。',
    adviceTitle: '深度优化建议（规则引擎 · 非 AI）',
    adviceFoot: '每条建议都带可复核的阈值——超出什么线，才触发什么话；不是模型在编。想接 AI 深读，再加一颗按钮，永远比规则晚一眼。',
    footer: '只读观察站 · 数字来自实库（本实例时） · 口令 123 · 本页没有改数据的能力',
    completionFoot: '完成度按 publication_visits 的 completion_pct 聚合（剔除 suspectedBot）。',
  },
  en: {
    kicker: 'admin · read-only · pass 123',
    title: 'Read-only observer',
    lede: 'This page lays out **what every real user on this platform actually does** — signups, opens, likes, comments, saves, follows, task outcomes, and the hottest public works. Numbers come from the real database and refresh on every load; this page has no button that changes anything.',
    gateTitle: 'The password is public: 123',
    gateNote: 'Type 123 to walk in. It is not a secret — it is a read-only window: you see every number, you change none. None of this needed anyone’s permission.',
    gateFoot: 'Nothing here is sensitive (public works and public counters). Found a hole? Tell me — don’t use it.',
    unitUsers: 'Registered users (non-guest)',
    unitUsersGuests: 'Guests (unclaimed)',
    unitNew7d: 'New in 7 days',
    unitNew30d: 'New in 30 days',
    unitPublishes: 'Total publishes',
    unitPublishesApproved: 'Public & approved',
    unitViews: 'Total views',
    unitLikes: 'Total likes',
    unitComments: 'Total comments',
    unitSaves: 'Total saves',
    unitFollows: 'Total follows',
    opened7d: 'Opens, last 7d',
    opened30d: 'Opens, last 30d',
    visibleMin7d: (mins: number) => `Total visible time 7d: ${mins} min`,
    completionAvg: (pct: number | null) => (pct === null ? 'Completion: no data yet' : `Avg completion, 30d: ${pct.toFixed(1)}%`),
    botsNote: (n: number) => (n > 0 ? `Suspected bot opens 7d: ${n} (excluded from trend)` : 'No suspected-bot traffic 7d'),
    tasksTitle: 'Task states (all-time)',
    tasksQueued: 'Queued / planning',
    tasksRunning: 'Running',
    tasksAwaiting: 'Awaiting approval',
    tasksSucceeded: 'Succeeded',
    tasksFailed: 'Failed',
    plansTitle: 'Plan distribution',
    planUnknown: 'unknown',
    trendTitle: 'Effective opens, last 7 days (by day)',
    trendAria: 'Bar chart of effective opens over the last 7 days',
    topTitle: 'Hottest public works',
    topHead: ['Work', 'Views', 'Likes', 'Path'],
    topEmpty: 'No approved public works yet.',
    adviceTitle: 'Optimization advice (rule engine · not AI)',
    adviceFoot: 'Every suggestion ships with the threshold that triggered it — cross the line, get the sentence; nothing here is a model improvising. An AI deep-read can join this panel later, always behind its own button.',
    footer: 'Read-only observer · numbers from the real database (as of this instance) · pass 123 · no write capability on this page',
    completionFoot: 'Completion is aggregated from publication_visits.completion_pct (bots excluded).',
  },
};

async function isObserverAllowed(): Promise<boolean> {
  const user = await currentUserOrNull();
  if (user?.role === 'admin') return true;
  const store = await cookies();
  return store.get(OBSERVER_COOKIE)?.value === OBSERVER_COOKIE_VALUE;
}

export default async function ObserverPage() {
  const locale = await getLocale();
  const c = COPY[locale];
  const allowed = await isObserverAllowed();

  if (!allowed) {
    return (
      <main className="adm-denied" data-observer-denied>
        <h1 className="adm-deniedTitle">{c.title}</h1>
        <p className="adm-deniedText">{c.gateNote}</p>
        <PasswordForm locale={locale} />
        <p className="obs-gateFoot">{c.gateFoot}</p>
        <p className="obs-gateBack">
          <Link href="/admin" className="obs-gateBackLink">← {locale === 'zh' ? '返回管理台' : 'Back to admin console'}</Link>
        </p>
      </main>
    );
  }

  const m = await readObserverMetrics();
  const advice = buildObserverAdvice(m);
  const maxOpens = Math.max(1, ...m.daily.map((d) => d.opens));
  const fmt = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US');

  return (
    <main className="adm-shell" data-observer-root>
      <header className="adm-head">
        <div>
          <p className="adm-kicker" data-observer-kicker>{c.kicker}</p>
          <h1 className="adm-title">{c.title}</h1>
          <p className="adm-lede">{c.lede}</p>
        </div>
        <AdminNav current="observe" />
      </header>

      <section className="obs-grid" aria-label={locale === 'zh' ? '关键指标' : 'Key metrics'}>
        {([
          ['users', m.usersTotal, c.unitUsers],
          ['guests', m.usersGuests, c.unitUsersGuests],
          ['new7d', m.usersNew7d, c.unitNew7d],
          ['new30d', m.usersNew30d, c.unitNew30d],
          ['publishes', m.publishesTotal, c.unitPublishes],
          ['publishesApproved', m.publishesPublicApproved, c.unitPublishesApproved],
          ['views', m.viewsTotal, c.unitViews],
          ['likes', m.likesTotal, c.unitLikes],
          ['comments', m.commentsTotal, c.unitComments],
          ['saves', m.savesTotal, c.unitSaves],
          ['follows', m.followsTotal, c.unitFollows],
        ] as const).map(([key, value, label]) => (
          <div className="obs-metric" key={key} data-observer-metric={key}>
            <span className="obs-num">{fmt.format(value)}</span>
            <span className="obs-label">{label}</span>
          </div>
        ))}
      </section>

      <section className="obs-band" aria-label={locale === 'zh' ? '近 7 天打开趋势' : 'Opens, last 7 days'}>
        <h2 className="obs-sectionTitle">{c.trendTitle}</h2>
        <p className="obs-subline">
          {c.opened7d}: <strong>{fmt.format(m.opens7d)}</strong>
          {' · '}
          {c.opened30d}: <strong>{fmt.format(m.opens30d)}</strong>
          {' · '}
          {c.visibleMin7d(Math.round(m.visibleMs7d / 60000))}
        </p>
        <div className="obs-bars" role="img" aria-label={c.trendAria} data-observer-trend>
          {m.daily.map((d) => (
            <div className="obs-barCol" key={d.day}>
              <div
                className="obs-bar"
                style={{ height: `${Math.max(2, Math.round((d.opens / maxOpens) * 100))}%` }}
                title={`${d.day} · ${d.opens}`}
              />
              <span className="obs-barDay">{d.day.slice(5)}</span>
              <span className="obs-barValue">{d.opens}</span>
            </div>
          ))}
        </div>
        <p className="obs-subnote">
          {c.completionAvg(m.completionPctAvg30d)}
          {' · '}
          {m.completionsGame + m.completionsWork > 0
            ? `${locale === 'zh' ? '走到了终点的访客' : 'Visitors who reached an end'}: ${fmt.format(m.completionsGame + m.completionsWork)}`
            : locale === 'zh' ? '还没有人走到过终点' : 'No one has reached an end yet'}
          {' · '}
          {c.botsNote(m.suspectedBots7d)}
        </p>
        <p className="obs-subnote">{c.completionFoot}</p>
      </section>

      <section className="obs-band" aria-label={c.tasksTitle}>
        <h2 className="obs-sectionTitle">{c.tasksTitle}</h2>
        <div className="obs-tasks" data-observer-tasks>
          {([
            [c.tasksQueued, m.tasks.queued],
            [c.tasksRunning, m.tasks.running],
            [c.tasksAwaiting, m.tasks.awaitingApproval],
            [c.tasksSucceeded, m.tasks.succeeded],
            [c.tasksFailed, m.tasks.failed],
          ] as const).map(([label, value]) => (
            <div className="obs-taskCell" key={label}>
              <span className="obs-num">{fmt.format(value)}</span>
              <span className="obs-label">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="obs-band" aria-label={c.plansTitle}>
        <h2 className="obs-sectionTitle">{c.plansTitle}</h2>
        <div className="obs-plans" data-observer-plans>
          {m.plans.map((p) => (
            <span className="obs-planChip" key={p.plan}>
              {p.plan || c.planUnknown} <b>{fmt.format(p.count)}</b>
            </span>
          ))}
        </div>
      </section>

      <section className="obs-band" aria-label={c.topTitle}>
        <h2 className="obs-sectionTitle">{c.topTitle}</h2>
        {m.topWorks.length === 0 ? (
          <p className="obs-subnote">{c.topEmpty}</p>
        ) : (
          <table className="obs-table" data-observer-top>
            <thead>
              <tr>
                {c.topHead.map((h) => <th key={h}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {m.topWorks.map((w) => (
                <tr key={w.path}>
                  <td>{w.name}</td>
                  <td>{fmt.format(w.views)}</td>
                  <td>{fmt.format(w.likes)}</td>
                  <td><code>{w.path}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="obs-band" aria-label={c.adviceTitle}>
        <h2 className="obs-sectionTitle">{c.adviceTitle}</h2>
        <ul className="obs-adviceList" data-observer-advice>
          {advice.map((a, i) => (
            <li key={i} className={a.severity === 'good' ? 'obs-advice obs-advice-good' : a.severity === 'bad' ? 'obs-advice obs-advice-bad' : 'obs-advice obs-advice-warn'}>
              <span className="obs-adviceDot" aria-hidden="true" />
              <span>{locale === 'zh' ? a.textZh : a.textEn}</span>
            </li>
          ))}
        </ul>
        <p className="obs-subnote">{c.adviceFoot}</p>
        <ObserverDeepRead locale={locale} />
      </section>

      <footer className="adm-foot">
        <p>
          {c.footer}
          {' '}
          <a className="obs-inlineLink" href="/pulse">{locale === 'zh' ? '全平台聚合匿名统计 → /pulse 观测大厅' : 'Platform-wide anonymous aggregates → /pulse'}</a>
        </p>
      </footer>
    </main>
  );
}
