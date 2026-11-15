'use client';

import { useEffect, useState } from 'react';
import type { BurnProjection } from '@/lib/burn-projection';
import type { Locale } from '@/lib/i18n';

/**
 * 「点数燃烬」（v700 / ROADMAP）—— /credits 页上的燃烬速度卡。
 * §FE-BN 门面版：全部 `.bn-*`（tokens，零 hex，零裸 atom）；SVG 用 CSS var() 取色；
 * 钩子守恒（data-burn-*）。双语（2026-11-15）：locale 由 RSC 透传，COPY 中英一辞两字面。
 *
 * 诚实边界（§3/§159）：
 * - 预测就是预测；footnote 说清口径（AI 类、delta<0、UTC 日、近 30 天）；
 * - 活跃天数不够 → 明文说「不猜」；斜率 ≥ 0 → 明文说「按趋势走完不完」；
 * - 不说"还能用 X 个月"这种单位，只给天数与 ISO 日期；封顶 9999 天说明；
 * - 发放不计入燃烬；video 类不在这条预测里。
 */

const W = 320;
const H = 120;
const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 16;
const EXTRA_DAYS = 4; // 虚线外推几天

const COPY: Record<Locale, {
  ariaCard: string;
  kicker: string;
  projectingDays: string;
  noBurnDays: string;
  noBurnCopy: (avg: string) => string;
  noGuessDays: string;
  noGuessCopy: (days: number) => string;
  svgAria: (total: string) => string;
  emptyDays: string;
  chipAvg: string;
  chipActive: string;
  chipTotal: string;
  note: string;
  point: string;
}> = {
  zh: {
    ariaCard: '点数燃烬速度',
    kicker: '点数燃烬 · 近 30 天',
    projectingDays: '天',
    noBurnDays: '稳',
    noBurnCopy: (avg) =>
      `近 30 天没有下降趋势（斜率 ≥ 0）——照现在的用法，AI 额度撑得过这个整月。日均燃烬约 ${avg} 点。`,
    noGuessDays: '不猜',
    noGuessCopy: (days) =>
      `近 30 天只有${days} 个活跃燃烬日（< 3），样本不够算出方向——这一页就不给你编一个日期。`,
    svgAria: (total) => `近 30 天每日 AI 点数燃烬，合计 ${total} 点`,
    emptyDays: '这 30 天没有 AI 消耗行为',
    chipAvg: '日均燃烬',
    chipActive: '活跃燃烬日',
    chipTotal: '窗口合计',
    note: '口径：仅 AI 类、delta<0、按 UTC 日分组、近 30 天；least-squares 线性外推不是承诺；发放不计；video 类不在这条预测里。',
    point: ' 点',
  },
  en: {
    ariaCard: 'Credit burn rate',
    kicker: 'Credit burn · last 30 days',
    projectingDays: 'days',
    noBurnDays: 'Steady',
    noBurnCopy: (avg) =>
      `No decline over the last 30 days (slope ≥ 0) — at this pace the AI pool lasts the whole month. Average daily burn ≈ ${avg} credits.`,
    noGuessDays: 'No guess',
    noGuessCopy: (days) =>
      `Only ${days} active burn day(s) in the last 30 days (< 3) — the sample can’t carry a direction, so this page won’t invent you a date.`,
    svgAria: (total) => `Daily AI credit burn over the last 30 days, totalling ${total} credits`,
    emptyDays: 'No AI consumption in these 30 days',
    chipAvg: 'Avg daily burn',
    chipActive: 'Active burn days',
    chipTotal: 'Window total',
    note: 'Scope: AI only, delta<0, bucketed by UTC day, last 30 days; least-squares is a mirror, not a promise; grants never count; the video class is not predicted here.',
    point: ' credits',
  },
};

function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -7 * t);
}

function useCountUp(target: number, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setValue(t >= 1 ? target : Math.round(target * easeOutExpo(t)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

export function CreditsBurnCard({ projection, balance, locale = 'zh' }: { projection: BurnProjection; balance: number; locale?: Locale }) {
  const c = COPY[locale];
  const daysLeft = projection.daysUntilEmpty;
  const animatedDays = useCountUp(daysLeft ?? 0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const max = Math.max(1, ...projection.series);
  const n = projection.series.length;
  const step = n > 1 ? (W - 2 * PAD_X) / (n - 1) : 0;
  const xAt = (i: number) => PAD_X + i * step;
  const yAt = (v: number) => {
    const usable = H - PAD_TOP - PAD_BOTTOM;
    const scaled = Math.min(max, Math.max(0, v)) / max;
    return PAD_TOP + (1 - scaled) * usable;
  };
  const floorY = H - PAD_BOTTOM;

  const linePoints = projection.series.map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');
  const areaPath =
    n > 0
      ? `M ${xAt(0).toFixed(2)},${floorY.toFixed(2)} L ${projection.series
          .map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`)
          .join(' L ')} L ${xAt(n - 1).toFixed(2)},${floorY.toFixed(2)} Z`
      : '';

  // 虚线外推：从最后一个点按斜率续 EXTRA_DAYS 天，夹在地板上
  let dashed: { x1: number; y1: number; x2: number; y2: number } | null = null;
  if (projection.verdict === 'projecting' && n > 0) {
    const extra = EXTRA_DAYS * step;
    const drop = projection.slopePerDay * EXTRA_DAYS; // 负数
    const yExtra = yAt(Math.max(0, projection.series[n - 1]! + drop));
    dashed = { x1: xAt(n - 1), y1: yAt(projection.series[n - 1]!), x2: xAt(n - 1) + extra * 0.7, y2: yExtra };
  }

  const balanceLabel = Number.isFinite(balance) ? Math.max(0, Math.trunc(balance)) : 0;

  return (
    <section
      data-burn-card
      aria-label={c.ariaCard}
      className="bn-root"
    >
      <div aria-hidden="true" className="bn-glowRight" />
      <div aria-hidden="true" className="bn-glowLeft" />

      <div className="bn-layout">
        <div className="bn-colLead">
          <span className="bn-kicker">
            <FlameIcon /> {c.kicker}
          </span>
          {projection.verdict === 'projecting' ? (
            <>
              <div className="bn-daysBig" data-burn-days>
                ≈ {animatedDays >= 9999 ? '9999+' : animatedDays} {c.projectingDays}
              </div>
              <p className="bn-copy">
                {locale === 'zh' ? (
                  <>按近 30 天的下降趋势（least-squares 线性外推），剩余<b data-burn-balance>{balanceLabel}</b> 点 AI 额度约在{' '}<b data-burn-date>{projection.exhaustDate}</b> 耗尽。外推不是承诺，只是你过去的消耗照出了镜子。</>
                ) : (
                  <>Judging by the fall-off slope over the last 30 days (least-squares projection), <b data-burn-balance>{balanceLabel}</b> credits left should burn out around <b data-burn-date>{projection.exhaustDate}</b>. A projection is not a promise — just your own consumption mirrored back.</>
                )}
              </p>
            </>
          ) : projection.verdict === 'no-burn' ? (
            <>
              <div className="bn-daysBig" data-burn-days>{c.noBurnDays}</div>
              <p className="bn-copy">{c.noBurnCopy(projection.avgPerDay.toFixed(1))}</p>
            </>
          ) : (
            <>
              <div className="bn-daysBig" data-burn-days>{c.noGuessDays}</div>
              <p className="bn-copy">{c.noGuessCopy(projection.activeDays)}</p>
            </>
          )}
        </div>

        <div className="bn-colMain">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="bn-svg"
            role="img"
            aria-label={c.svgAria(projection.totalBurned.toFixed(0))}
            data-burn-svg
          >
            <defs>
              <linearGradient id="burnArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--nexus-color-brand)" stopOpacity="0.55" />
                <stop offset="100%" stopColor="var(--nexus-color-brand)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <line x1={PAD_X} y1={floorY} x2={W - PAD_X} y2={floorY} stroke="currentColor" strokeOpacity="0.14" strokeDasharray="3 5" />
            {projection.series.every((v) => v === 0) ? (
              <text
                x={W / 2}
                y={H / 2 - 4}
                textAnchor="middle"
                fontSize="12"
                fill="currentColor"
                fillOpacity="0.35"
              >
                {c.emptyDays}
              </text>
            ) : null}
            {mounted && areaPath ? <path d={areaPath} fill="url(#burnArea)" /> : null}
            {n > 0 ? (
              <polyline
                points={linePoints}
                fill="none"
                stroke="var(--nexus-color-brand)"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {mounted && dashed ? (
              <line
                x1={dashed.x1}
                y1={dashed.y1}
                x2={dashed.x2}
                y2={dashed.y2}
                stroke="var(--nexus-color-accent-2)"
                strokeWidth="2"
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
            ) : null}
            {n > 0 ? <circle cx={xAt(n - 1)} cy={yAt(projection.series[n - 1]!)} r="3" fill="var(--nexus-color-accent-mix)" /> : null}
          </svg>

          <div className="bn-chips" data-burn-chips>
            <Chip label={c.chipAvg} value={`${projection.avgPerDay.toFixed(1)}${c.point}`} marker="avg" />
            <Chip label={c.chipActive} value={String(projection.activeDays)} marker="active" />
            <Chip label={c.chipTotal} value={`${Math.round(projection.totalBurned)}${c.point}`} marker="total" />
          </div>

          <p className="bn-note">{c.note}</p>
        </div>
      </div>
    </section>
  );
}

function Chip({ marker, label, value }: { marker: string; label: string; value: string }) {
  return (
    <span data-burn-chip={marker} className="bn-chip">
      <span className="bn-chipLabel">{label}</span>
      <span className="bn-chipValue">{value}</span>
    </span>
  );
}

function FlameIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="bn-kickerIcon">
      <path
        d="M12 3c1.2 3.6 4.6 5.1 4.6 9a4.6 4.6 0 0 1-9.2 0c0-1.8.8-3 2-4.6.6 1.4 1.6 2 2.6 2-.6-2.4-.6-4.6 0-6.4Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="currentColor"
        fillOpacity="0.28"
      />
    </svg>
  );
}
