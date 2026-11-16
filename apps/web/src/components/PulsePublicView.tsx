'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { fitLinear, projectForward, summarizeVolatility, buildPublicActions, type Volatility } from '@/server/domain/pulseProjection';
import { DeepReadCard } from '@/components/DeepReadCard';

/**
 * §PUB-1 公共观测大厅（/admin/public）——口令 `123` 打开
 *
 * 公开读数全部经 `/api/pulse` 读回；口令只是点亮 UI（/api/pulse 本来就是公开的），
 * 不承担任何安全职责：这里展示的全是聚合、无个人数据、无 per-event 粒度。
 *
 * 三个区：
 *  1. 最近 14 天趋势（SVG 柱状）
 *  2. 规则式外推 7 天 + 置信带（约 80%）+ 波动小结
 *  3. 行动项（规则式建议，明示每条的数字依据）
 */

interface PulseBody {
  users: number;
  admins: number;
  publishedVersions: number;
  opens: number;
  opensBot: number;
  visitors: number;
  visitorsToday: number;
  visitorDays: number;
  visibleMs: number;
  gameClears: number;
  workCompletions: number;
  remixes: number;
  follows: number;
  trend: {
    days: number;
    points: { day: string; opens: number; visitorDays: number }[];
    opensDelta: number | null;
    visitorDaysDelta: number | null;
  };
  hot: {
    publicationId: string;
    projectName: string;
    path: string;
    opensCurr: number;
    opensPrev: number;
    velocityPct: number;
  }[];
  warnings: { kind: string; zh: string; en: string }[];
  generatedAt: string;
}

const COPY = {
  zh: {
    kicker: 'public observatory · 123',
    title: '公共观测大厅',
    lede: '所有人(是的，所有人)都能进、都能围观平台的统一泳道：流量、改编、通关——口令 123 只是围观提示，不是安全边界；这个页面没有任何个人信息（无邮箱、无名称、无 per-event 粒度）。',
    gateTitle: '围观提示：口令 123',
    gateLede: '不用担心——你不会误删数据，因为这里只显示平台级横截面；真·admin 才能点审核/删/退回——那些按钮不在本页。',
    gateLabel: '口令（123）',
    gateButton: '进来围观',
    gateError: '不对——口令是 123。',
    loading: '加载平台读数……',
    failTitle: '大厅坏了',
    failBody: '/api/pulse 没应答——这是诚实的 503，不是假数据；刷新再试几次。',
    retry: '再围观一次',
    trendTitle: '最近 14 天 · 打开数',
    projectionTitle: '规则外推 · 未来 7 天（不是概率，是直线，提醒你够守）',
    projectionHint: '一阶最小二乘 · 置信带 = 残差σ × 1.28 ≈ 80% 的区间 · 不参与任何下注/收费研究，只用来定"什么时候该进货/断货"',
    volatilityTitle: '波动小结',
    mean: '14 天日均打开',
    stdDev: '标准差',
    cv: '变异系数 σ/μ',
    lastDelta: '最近一日环比',
    ptTrough: '峰谷比',
    hotTitle: '谁变热了（Top-3 速度榜）',
    actionsTitle: '下一步优化措施（规则式、每项带依据）',
    actionsNote: '以下建议全部是规则，不是 LLM 胡说——每条都写明触发它的那条读数；你可以照抄到 KPI 会上。',
    footNote: '全部聚合匿名：人·天口径不是去重人数；爬虫票算爬虫、不算真人；写数字时如实写，误差自然落在读数里。',
    botLabel: '爬虫占比',
    generatedAt: '聚合生成于',
    noHot: '这一窗口没有 hot 级作品。',
  },
  en: {
    kicker: 'public observatory · 123',
    title: 'The public observation hall',
    lede: 'Anyone can walk in and watch the same swimlane everyone else sees: opens, remixes, clears — with the passphrase 123 as a courtesy gate, not a security boundary. This page hosts only aggregated anonymity — no emails, no names, no per-event granularity.',
    gateTitle: 'A walk-in prompt: the passphrase is 123',
    gateLede: 'Nothing on this page can break anything — it only renders the shared pool. The destructive buttons (review / ban / redeem) live behind role=admin and are not here.',
    gateLabel: 'Passphrase (123)',
    gateButton: 'Step inside',
    gateError: 'Wrong — the passphrase is 123.',
    loading: 'Aggregating the platform…',
    failTitle: 'The hall is down',
    failBody: '/api/pulse did not answer — this is an honest 503, not a placeholder. Reload and retry.',
    retry: 'Try again',
    trendTitle: 'Last 14 days · opens',
    projectionTitle: 'Rule projection · next 7 days (a straight line, not a bet)',
    projectionHint: 'Least squares · band = residual σ × 1.28 ≈ 80% interval · no money, no betting advice, just "when to ship / when to hold"',
    volatilityTitle: 'Volatility summary',
    mean: '14-day daily mean',
    stdDev: 'Std dev',
    cv: 'CV (σ/μ)',
    lastDelta: 'Latest day QoQ',
    ptTrough: 'Peak / trough',
    hotTitle: 'Warming up (Top-3 velocity)',
    actionsTitle: 'Suggested next steps (rule-based, each with a basis)',
    actionsNote: 'Every row cites the readout that triggers it — nothing here is a language-model guess. Take it to your KPI review as-is.',
    footNote: 'All aggregated anonymous — person-day is not a unique human count; bots are not humans; numbers are shown as computed.',
    botLabel: 'bot share',
    generatedAt: 'aggregated at',
    noHot: 'Nothing at hot-speed this window — distribution is flat.',
  },
} as const;

const PASS_KEY = 'nexus.public.passphrase';
const PASSPHRASE = '123';

function fmtInteger(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-CN').format(value);
}

function maxOf(values: number[]): number {
  return values.reduce((acc, v) => Math.max(acc, v), 1);
}

export function PulsePublicView({ locale = 'zh' }: { locale?: Locale }) {
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
      /* disabled sessionStorage */
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

  const trendPoints = body?.trend.points ?? [];
  const opensValues = trendPoints.map((p) => p.opens);
  const maxOpen = Math.max(maxOf(opensValues), 1);
  const series = trendPoints.slice(-14);

  const { fit, projected, volatility, actions } = useMemo(() => {
    if (!body) {
      const emptyVolatility: Volatility = { mean: 0, stdDev: 0, coefficientOfVariation: 0, lastDayDeltaPct: null, peakToTroughRatio: null };
      return { fit: fitLinear([]), projected: [], volatility: emptyVolatility, actions: [] };
    }
    const { fit, projected } = projectForward(trendPoints.slice(-14), 7);
    const volatility = summarizeVolatility(trendPoints.slice(-14));
    const botShare = body.opens > 0 ? body.opensBot / body.opens : 0;
    const projected7d = projected.reduce((acc, p) => acc + p.projected, 0);
    const actions = buildPublicActions({
      opensDelta: body.trend.opensDelta,
      visitorDaysDelta: body.trend.visitorDaysDelta,
      botShare,
      projected7d,
      coefficientOfVariation: volatility.coefficientOfVariation,
    });
    return { fit, projected, volatility, actions };
  }, [body, trendPoints]);

  const maxProjected = projected.reduce((acc, p) => Math.max(acc, p.upper80), 1);

  const unlock = (): void => {
    if (pass.trim() === PASSPHRASE) {
      try {
        window.sessionStorage.setItem(PASS_KEY, PASSPHRASE);
      } catch {
        /* ignore */
      }
      setUnlocked(true);
      setGateError(false);
      return;
    }
    setGateError(true);
  };

  if (!unlocked) {
    return (
      <section className="pl-gate" data-pulse-public-gate>
        <div className="pl-gatePanel">
          <p className="pl-kicker">{c.kicker}</p>
          <h1 className="pl-title">{c.title}</h1>
          <p className="pl-lede">{c.gateLede}</p>
          <label className="pl-gateLabel" htmlFor="pl-passphrase">{c.gateLabel}</label>
          <form className="pl-gateRow" onSubmit={(event) => { event.preventDefault(); unlock(); }}>
            <input
              id="pl-passphrase"
              type="password"
              autoComplete="off"
              className="pl-gateInput"
              value={pass}
              data-pulse-public-passphrase
              onChange={(event) => {
                setPass(event.target.value);
                setGateError(false);
              }}
            />
            <button type="submit" className="pl-gateButton" data-pulse-public-enter>
              {c.gateButton}
            </button>
          </form>
          {gateError ? <p className="pl-gateError" role="alert" data-pulse-public-error>{c.gateError}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="pl-root" data-pulse-public-root>
      <header className="pl-head">
        <p className="pl-kicker">{c.kicker}</p>
        <h1 className="pl-title">{c.title}</h1>
        <p className="pl-lede">{c.lede}</p>
      </header>

      {loading && !body ? <p className="pl-state" data-pulse-public-loading>{c.loading}</p> : null}

      {loadError ? (
        <div className="pl-state" role="alert" data-pulse-public-error-load>
          <h2 className="pl-trendTitle">{c.failTitle}</h2>
          <p>{c.failBody}</p>
          <button
            type="button"
            className="pl-gateButton"
            data-pulse-public-retry
            onClick={() => {
              setLoadError(false);
              setUnlocked(false);
              window.sessionStorage.removeItem(PASS_KEY);
            }}
          >
            {c.retry}
          </button>
        </div>
      ) : null}

      {body ? (
        <>
          <section className="pl-trend" aria-label={c.trendTitle} data-pulse-public-trend>
            <div className="pl-trendHead">
              <h2 className="pl-trendTitle">{c.trendTitle}</h2>
              <span className="pl-delta" data-pulse-public-bot>{c.botLabel}: {body.opens > 0 ? ((body.opensBot / body.opens) * 100).toFixed(1) : '0'}%</span>
            </div>
            <ol className="pl-bars">
              {series.map((point) => (
                <li key={point.day} className="pl-barCol" data-pulse-public-bar>
                  <span className="pl-bar" style={{ height: `${Math.round((point.opens / maxOpen) * 100)}%` }} />
                  <span className="pl-barLabel">{point.day.slice(5)}</span>
                  <span className="pl-barValue">{fmtInteger(point.opens, locale)}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="pl-trend" aria-label={c.projectionTitle} data-pulse-public-projection>
            <div className="pl-trendHead">
              <h2 className="pl-trendTitle">{c.projectionTitle}</h2>
              <span className="pl-delta" data-pulse-public-hint>{c.projectionHint}</span>
            </div>
            <ol className="pl-bars">
              {projected.map((p) => (
                <li key={p.dayOffset} className="pl-barCol" data-pulse-public-proj-bar data-pulse-public-proj-offset={p.dayOffset}>
                  <span className="pl-bar" style={{ height: `${Math.round((p.projected / maxProjected) * 100)}%` }} />
                  <span className="pl-barLabel">+{p.dayOffset}d</span>
                  <span className="pl-barValue">{fmtInteger(p.projected, locale)}</span>
                </li>
              ))}
            </ol>
            <p className="pl-recsNote" data-pulse-public-fit>
              slope={fit.slope.toFixed(3)} · intercept={fit.intercept.toFixed(1)} · residual σ={fit.residualStd.toFixed(2)} · n={fit.n}
            </p>
          </section>

          <section className="pl-recs" data-pulse-public-volatility aria-label={c.volatilityTitle}>
            <h2 className="pl-recsTitle">{c.volatilityTitle}</h2>
            <div className="pl-kpis">
              <div className="pl-kpi"><span className="pl-kpiLabel">{c.mean}</span><span className="pl-kpiValue">{volatility.mean.toFixed(1)}</span></div>
              <div className="pl-kpi"><span className="pl-kpiLabel">{c.stdDev}</span><span className="pl-kpiValue">{volatility.stdDev.toFixed(1)}</span></div>
              <div className="pl-kpi"><span className="pl-kpiLabel">{c.cv}</span><span className="pl-kpiValue">{volatility.coefficientOfVariation.toFixed(2)}</span></div>
              <div className="pl-kpi"><span className="pl-kpiLabel">{c.lastDelta}</span><span className="pl-kpiValue">{volatility.lastDayDeltaPct === null ? '—' : `${volatility.lastDayDeltaPct >= 0 ? '+' : ''}${volatility.lastDayDeltaPct}%`}</span></div>
              <div className="pl-kpi"><span className="pl-kpiLabel">{c.ptTrough}</span><span className="pl-kpiValue">{volatility.peakToTroughRatio === null ? '—' : `${volatility.peakToTroughRatio.toFixed(2)}×`}</span></div>
            </div>
          </section>

          <section className="pl-hot" data-pulse-public-hot aria-label={c.hotTitle}>
            <h2 className="pl-recsTitle">{c.hotTitle}</h2>
            {body.hot.length === 0 ? (
              <p className="pl-recsNote" data-pulse-public-hot-empty>{c.noHot}</p>
            ) : (
              <ol className="pl-hotList">
                {body.hot.map((item) => (
                  <li key={item.publicationId} className="pl-hotItem" data-pulse-public-hotitem>
                    <span className="pl-hotName">{item.projectName}</span>
                    <span className="pl-hotMeta">+{Math.round(item.velocityPct)}%（{fmtInteger(item.opensCurr, locale)} vs {fmtInteger(item.opensPrev, locale)}） · {item.path}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="pl-recs" data-pulse-public-actions aria-label={c.actionsTitle}>
            <h2 className="pl-recsTitle">{c.actionsTitle}</h2>
            <p className="pl-recsNote">{c.actionsNote}</p>
            <ol className="pl-recList">
              {actions.map((act, index) => (
                <li key={index} className="pl-rec" data-pulse-public-action>
                  <span className="pl-recText">{locale === 'en' ? act.en : act.zh}</span>
                  <span className="pl-recBasis">{act.basis}</span>
                </li>
              ))}
            </ol>
          </section>

          <DeepReadCard body={body} locale={locale} />

          <footer className="pl-foot">
            <p className="pl-footNote">{c.footNote}</p>
            <p className="pl-footStamp">{c.generatedAt} {new Date(body.generatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')}</p>
          </footer>
        </>
      ) : null}
    </section>
  );
}
