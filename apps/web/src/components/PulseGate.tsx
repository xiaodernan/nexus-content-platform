'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * §PULSE `/pulse` 观测大厅
 *
 * 纪律：
 * - 这里的钥匙（`123`）是**公开的**，不是安全边界——这一页本来就是给所有用户围观的透明窗口。
 * - 页面只有聚合数字；围观者能看见"平台热度有多少"和"爬虫占了多少"，看不见任何具体的人。
 * - mock（"演示模式"）不在这一页出现：库炸就写失败态，绝不拿别的数换算冒充。
 */

interface PulseBody {
  users: number;
  admins: number;
  publishedVersions: number;
  opens: number;
  opensToday: number;
  visitors: number;
  visitorsToday: number;
  visitorDays: number;
  visibleMs: number;
  gameClears: number;
  workCompletions: number;
  likes: number;
  comments: number;
  remixes: number;
  follows: number;
  trend: {
    days: number;
    points: { day: string; opens: number; visitorDays: number }[];
    opensDelta: number | null;
    visitorDaysDelta: number | null;
  };
  recommendations: { zh: string; en: string; basis: string }[];
  warnings: { kind: string; zh: string; en: string; basis: string }[];
  hot: {
    publicationId: string;
    projectName: string;
    path: string;
    opensCurr: number;
    opensPrev: number;
    velocityPct: number;
  }[];
  generatedAt: string;
}

const COPY = {
  zh: {
    kicker: 'public observatory',
    title: '观测大厅',
    lede: '这是全平台的聚合读数，公开放映、匿名统计——密码是 123，谁都可以进来围观；没有个人信息（没有邮箱、没有 ID，统计口径是「人 × 天」的行）。',
    gateTitle: '进门的纸条',
    gateLede: '弱口令，故意用的：这里的目的从来不是把人挡在外面，是提醒你"欣赏完就走"。看板上没有任何你解锁以后才能看的东西——前端锁没上，API 本来就是开的。',
    gateLabel: '门口的纸条：口令（123）',
    gateButton: '进来看看',
    gateError: '纸条不对——口令是 123（本站统一定式）。',
    loading: '聚合中……',
    loadError: '大厅坏了（数据库没应答）——这里是诚实 503，不是装睡：不买数据凑数。',
    retry: '再看一次',
    opens: '打开',
    opensToday: '今日打开',
    visitors: '访客（累计去重）',
    visitorsToday: '今日访客',
    visitorDays: '人·天行数',
    published: '公开发布版本',
    gameClears: '游戏通关',
    workCompletions: '互动稿走完终点',
    likes: '点赞',
    comments: '评论',
    remixes: '改编',
    follows: '关注',
    users: '账号数（含管理员）',
    vol: '可见时长（小时）',
    trendTitle: '最近 14 天',
    opensDelta: '打开数 半窗口对比',
    visitorDaysDelta: '人·天 半窗口对比',
    unavailableDelta: '历史不足',
    recommendations: '读数在动的方向——下一步优化建议',
    recommendationBasis: '触发依据',
    recommendationNote: '规则写在前台（不装"AI"）：每一条都标注了触发它的那条读数。',
    warningsTitle: '需要留意',
    warnBasis: '触发依据',
    warningsCalm: '这一窗口没有危险信号——流量、来源、人·天都在安全线上。',
    hotTitle: '谁在变热',
    hotDelta: '速度',
    hotEmpty: '最近没有速度翻倍的作品——推广没回路，自然不会起量。',
    footNote: '数字全部聚合匿名：不含邮箱、不含名称、不含 id、不按副本/实例拆开。人·天 = 一个访客在一天内被计为一行（不叫"活着的用户数"）。',
    generatedAt: '聚合生成于',
    hour: '小时',
  },
  en: {
    kicker: 'public observatory',
    title: 'The observatory hall',
    lede: 'This is the platform-wide aggregate, shown in public and counted anonymously — the password is 123, anyone can walk in and look. No personal information (no emails, no IDs; counts are per person-day).',
    gateTitle: 'The door note',
    gateLede: 'A deliberately weak passphrase: the point was never to keep anyone out — it is a reminder to look, then leave. The dashboard hides nothing behind the gate — the frontend lock isn\'t set at all; the API is open by design.',
    gateLabel: 'Door note: passphrase (123)',
    gateButton: 'Walk in',
    gateError: 'Wrong note — the passphrase is 123 (community-wide standing).',
    loading: 'Aggregating…',
    loadError: 'The hall is down (the database did not answer) — this is an honest 503, not a snooze; no bought numbers fill the gap.',
    retry: 'Look again',
    opens: 'Opens',
    opensToday: "Today's opens",
    visitors: 'Visitors (all-time unique)',
    visitorsToday: "Today's visitors",
    visitorDays: 'Person-day rows',
    published: 'Public versions',
    gameClears: 'Game clears',
    workCompletions: 'Interactive completions',
    likes: 'Likes',
    comments: 'Comments',
    remixes: 'Remixes',
    follows: 'Follows',
    users: 'Accounts (admins incl.)',
    vol: 'Visible time (hours)',
    trendTitle: 'Last 14 days',
    opensDelta: 'Opens, half-window comparison',
    visitorDaysDelta: 'Person-days, half-window comparison',
    unavailableDelta: 'Not enough history',
    recommendations: 'Where the numbers are moving — the next optimizations',
    recommendationBasis: 'triggered by',
    recommendationNote: 'The rules live in the open (no "AI" costume): each suggestion cites the readout that triggers it.',
    warningsTitle: 'Watch out',
    warnBasis: 'triggered by',
    warningsCalm: 'No danger signals in this window — flow, sources, person-days all on safe ground.',
    hotTitle: 'Warming up',
    hotDelta: 'velocity',
    hotEmpty: 'Nothing doubled its speed recently — no distribution loop, no lift.',
    footNote: 'Everything shown is aggregated and anonymous: no emails, no names, no ids, nothing per replica. Person-day = one anonymous visitor counted once per day — not an estimate of active users.',
    generatedAt: 'aggregated at',
    hour: 'hrs',
  },
} as const;

const PASS_KEY = 'nexus.pulse.passphrase';
const PASSPHRASE = '123';

function formatInteger(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN').format(value);
}

function hoursOf(ms: number): string {
  return (ms / 3_600_000).toFixed(1);
}

function deltaText(value: number | null, locale: Locale, unavailable: string): string {
  if (value === null) return unavailable;
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value}%`;
}

function maxOpens(points: PulseBody['trend']['points']): number {
  return points.reduce((acc, point) => Math.max(acc, point.opens), 1);
}

export function PulseGate({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const [pass, setPass] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [gateError, setGateError] = useState(false);
  const [body, setBody] = useState<PulseBody | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(PASS_KEY) === PASSPHRASE) setUnlocked(true);
    } catch {
      /* sessionStorage 被浏览器禁了，每次现输 */
    }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    let alive = true;
    setLoading(true);
    setLoadError(false);
    fetch('/api/pulse', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return (await res.json()) as PulseBody;
      })
      .then((json) => {
        if (alive) setBody(json);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [unlocked]);

  const maxOpensToday = body ? maxOpens(body.trend.points) : 1;
  const kpis = useMemo(() => {
    if (!body) return [];
    return [
      { label: c.opens, value: formatInteger(body.opens, locale) },
      { label: c.opensToday, value: formatInteger(body.opensToday, locale) },
      { label: c.visitors, value: formatInteger(body.visitors, locale) },
      { label: c.visitorsToday, value: formatInteger(body.visitorsToday, locale) },
      { label: c.visitorDays, value: formatInteger(body.visitorDays, locale) },
      { label: c.published, value: formatInteger(body.publishedVersions, locale) },
      { label: c.gameClears, value: formatInteger(body.gameClears, locale) },
      { label: c.workCompletions, value: formatInteger(body.workCompletions, locale) },
      { label: c.likes, value: formatInteger(body.likes, locale) },
      { label: c.comments, value: formatInteger(body.comments, locale) },
      { label: c.remixes, value: formatInteger(body.remixes, locale) },
      { label: c.follows, value: formatInteger(body.follows, locale) },
      { label: c.users, value: `${formatInteger(body.users, locale)}（admin ${body.admins}）` },
      { label: c.vol, value: `${hoursOf(body.visibleMs)} ${c.hour}` },
    ];
  }, [body, c, locale]);

  const submitPassphrase = () => {
    if (pass.trim() === PASSPHRASE) {
      try {
        window.sessionStorage.setItem(PASS_KEY, PASSPHRASE);
      } catch {
        /* ignore */
      }
      setGateError(false);
      setUnlocked(true);
      return;
    }
    setGateError(true);
  };

  if (!unlocked) {
    return (
      <section className="pl-gate" data-pl-gate>
        <div className="pl-gatePanel">
          <p className="pl-kicker" data-pl-kicker>{c.kicker}</p>
          <h1 className="pl-title" data-pl-title>{c.title}</h1>
          <p className="pl-lede">{c.gateLede}</p>
          <label className="pl-gateLabel" htmlFor="pl-passphrase">{c.gateLabel}</label>
          <div className="pl-gateRow">
            <input
              id="pl-passphrase"
              type="password"
              autoComplete="off"
              className="pl-gateInput"
              value={pass}
              data-pl-passphrase
              onChange={(event) => {
                setPass(event.target.value);
                setGateError(false);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitPassphrase();
              }}
            />
            <button type="button" className="pl-gateButton" data-pl-enter onClick={submitPassphrase}>
              {c.gateButton}
            </button>
          </div>
          {gateError ? <p className="pl-gateError" role="alert" data-pl-error>{c.gateError}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="pl-root" data-pulse-root data-pl-unlocked>
      <header className="pl-head">
        <p className="pl-kicker">{c.kicker}</p>
        <h1 className="pl-title">{c.title}</h1>
        <p className="pl-lede">{c.lede}</p>
      </header>

      {loading && !body ? <p className="pl-state" data-pl-loading>{c.loading}</p> : null}

      {loadError ? (
        <div className="pl-state" role="alert" data-pl-error-load>
          <p>{c.loadError}</p>
          <button
            type="button"
            className="pl-gateButton"
            data-pl-retry
            onClick={() => {
              setLoadError(false);
              setUnlocked(false);
              setTimeout(() => setUnlocked(true), 0);
            }}
          >
            {c.retry}
          </button>
        </div>
      ) : null}

      {body ? (
        <>
          <div className="pl-kpis" data-pl-kpis>
            {kpis.map((kpi) => (
              <div key={kpi.label} className="pl-kpi" data-pl-kpi>
                <span className="pl-kpiLabel">{kpi.label}</span>
                <span className="pl-kpiValue">{kpi.value}</span>
              </div>
            ))}
          </div>

          <section className="pl-trend" data-pl-trend aria-label={c.trendTitle}>
            <div className="pl-trendHead">
              <h2 className="pl-trendTitle">{c.trendTitle}</h2>
              <div className="pl-trendDeltas">
                <span className="pl-delta" data-pl-delta-opens>
                  {c.opensDelta}: {deltaText(body.trend.opensDelta, locale, c.unavailableDelta)}
                </span>
                <span className="pl-delta" data-pl-delta-days>
                  {c.visitorDaysDelta}: {deltaText(body.trend.visitorDaysDelta, locale, c.unavailableDelta)}
                </span>
              </div>
            </div>
            <ol className="pl-bars">
              {body.trend.points.map((point) => (
                <li key={point.day} className="pl-barCol" data-pl-bar>
                  <span className="pl-bar" style={{ height: `${Math.round((point.opens / maxOpensToday) * 100)}%` }} />
                  <span className="pl-barLabel">{point.day.slice(5)}</span>
                  <span className="pl-barValue">{formatInteger(point.opens, locale)}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="pl-recs" data-pl-recs aria-label={c.recommendations}>
            <h2 className="pl-recsTitle">{c.recommendations}</h2>
            <p className="pl-recsNote">{c.recommendationNote}</p>
            <ol className="pl-recList">
              {body.recommendations.map((rec, index) => (
                <li key={index} className="pl-rec" data-pl-rec>
                  <span className="pl-recText">{locale === 'en' ? rec.en : rec.zh}</span>
                  <span className="pl-recBasis">{c.recommendationBasis}: {rec.basis}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="pl-warnings" data-pl-warnings aria-label={c.warningsTitle}>
            <h2 className="pl-recsTitle">{c.warningsTitle}</h2>
            {body.warnings.length === 0 ? (
              <p className="pl-recsNote" data-pl-warnings-calm>{c.warningsCalm}</p>
            ) : (
              <ol className="pl-recList">
                {body.warnings.map((warn, index) => (
                  <li key={index} className="pl-warn" data-pl-warn={warn.kind}>
                    <span className="pl-recText">{locale === 'en' ? warn.en : warn.zh}</span>
                    <span className="pl-recBasis">{c.warnBasis}: {warn.basis}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="pl-hot" data-pl-hot aria-label={c.hotTitle}>
            <h2 className="pl-recsTitle">{c.hotTitle}</h2>
            {body.hot.length === 0 ? (
              <p className="pl-recsNote" data-pl-hot-empty>{c.hotEmpty}</p>
            ) : (
              <ol className="pl-hotList">
                {body.hot.map((item) => (
                  <li key={item.publicationId} className="pl-hotItem" data-pl-hotitem>
                    <span className="pl-hotName">{item.projectName}</span>
                    <span className="pl-hotMeta">
                      {c.hotDelta}: {item.velocityPct >= 0 ? '+' : ''}{Math.round(item.velocityPct)}%（{formatInteger(item.opensCurr, locale)} vs {formatInteger(item.opensPrev, locale)}）
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <footer className="pl-foot">
            <p className="pl-footNote">{c.footNote}</p>
            <p className="pl-footStamp">{c.generatedAt} {new Date(body.generatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')}</p>
          </footer>
        </>
      ) : null}
    </section>
  );
}
