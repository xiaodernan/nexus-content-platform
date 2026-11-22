'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';
import { BIBLE_ECHOES } from '@/world-bible/generated';
import {
  DOT_ROAD_BLANK_STEP,
  DOT_ROAD_CLOSING,
  DOT_ROAD_STEPS,
  clampStep,
  isBlankStep,
  parseDotRoadAnchors,
  stationIndexOf,
  stepKind,
} from '@/lib/dotRoad';

/**
 * ──DOT-ROAD · E220《照着点走一遍》的可走版（2026-11-22 新模块）
 *
 * 原文里的十九步不是比喻：孩子真的沿点走了一遍，停在最后一个点之后的空白前。
 * 这一页把十九步画成一条路——六个站各挂一句 E220 的锚句（逐字来自生成的原文），
 * 第十九步没有点，只有空白和文末那两句话。
 *
 * 纪律：
 *  - 锚句现场从 `generated.ts` 解析，不手写、不加占位；解析不出就直说；
 *  - 进度只在本机 localStorage（走远到第几步），没有云端计数、不冒充别人的读数；
 *  - 中文模式只出中文、英文模式只出英文；不并排混写；
 *  - 不需要 provider、不需要网络。
 */

const STORE_KEY = 'nexus.dotroad.v1';
const ZH_STATIONS = ['一', '二', '三', '四', '五', '六'];
const EN_STATIONS = ['I', 'II', 'III', 'IV', 'V', 'VI'];

const COPY = {
  zh: {
    kicker: '典籍室 · 第五个角落',
    title: '点路',
    lede: 'E220 里，孩子把七页点铺在地上，用粉笔连成一条线，沿点走了十九步，停在最后一个点之后的空白前。这里可以真的走一遍：六个站各留着一句原文。',
    progress: (n: number) => `第 ${n} / ${DOT_ROAD_STEPS} 步`,
    station: (i: number) => `第${ZH_STATIONS[i] ?? i + 1}站`,
    stationMeta: (i: number) => `E220 · 其二百二十 · 第${ZH_STATIONS[i] ?? i + 1}站`,
    quiet: '这一段还没有站——只是路。再走一步。',
    endTitle: '空白',
    endNote: '最后一步之后没有点。路的尽头是一格空白——原文把它留在那，这一页不替它补上。',
    next: '向前一步',
    prev: '退回一步',
    restart: '重走一遍',
    best: (n: number) => `本机走过最远：第 ${n} 步`,
    fresh: '还没有走过——从第一步开始。',
    done: '已经走到空白。',
    hint: '点路上的任意一个点也能跳过去；键盘 ← → 走，Home 回第一步，End 到空白。',
    empty: 'E220 原文里没有解析出成对锚句——这一页不拿占位句代替。',
    ariaPath: '点路：十九个步点',
    ariaDot: (n: number) => `第 ${n} 步`,
    back: '← 回典籍室',
  },
  en: {
    kicker: 'The shelf · a fifth corner',
    title: 'The Dot Road',
    lede: 'In Echo 220 the child laid seven pages of dots on the floor, joined them with chalk, and walked nineteen steps — stopping at the blank after the last dot. Here you can walk it yourself; six stations each keep one verbatim line.',
    progress: (n: number) => `Step ${n} / ${DOT_ROAD_STEPS}`,
    station: (i: number) => `Station ${EN_STATIONS[i] ?? i + 1}`,
    stationMeta: (i: number) => `Echo 220 · station ${EN_STATIONS[i] ?? i + 1}`,
    quiet: 'No station here — just the road. One more step.',
    endTitle: 'The blank',
    endNote: 'After the last step there are no dots. The road ends at a blank — the echo leaves it empty, and this page does not fill it in.',
    next: 'One step forward',
    prev: 'One step back',
    restart: 'Walk it again',
    best: (n: number) => `Furthest walked on this device: step ${n}`,
    fresh: 'Not walked yet — start from the first step.',
    done: 'You have reached the blank.',
    hint: 'Click any dot to jump there; use ← → to walk, Home for the first step, End for the blank.',
    empty: 'No paired anchor lines were parsed from Echo 220 — this page will not substitute placeholders.',
    ariaPath: 'The dot road: nineteen steps',
    ariaDot: (n: number) => `step ${n}`,
    back: '← The shelf',
  },
} as const;

export function DotRoad({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const anchors = useMemo(() => {
    const echo = BIBLE_ECHOES.find((entry) => entry.order === 220);
    return echo ? parseDotRoadAnchors(echo.markdownZh, echo.markdownEn) : [];
  }, []);
  const [step, setStep] = useState(1);
  const [best, setBest] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      const value = raw ? Number(raw) : 0;
      if (Number.isFinite(value) && value >= 1) setBest(clampStep(value));
    } catch {
      // 隐私模式/存储被禁：没有记录不等于走过，保持 null。
    }
  }, []);

  useEffect(() => {
    if (best === null || step <= best) return;
    setBest(step);
    try {
      window.localStorage.setItem(STORE_KEY, String(step));
    } catch {
      // 写不进去就只是这一局有效——不冒充已保存。
    }
  }, [step, best]);

  const station = stationIndexOf(step);
  const blank = isBlankStep(step);
  const kind = stepKind(step);
  const anchor = station !== null ? anchors[station] : undefined;

  const walk = (next: number) => setStep(clampStep(next));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      walk(step + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      walk(step - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      walk(1);
    } else if (event.key === 'End') {
      event.preventDefault();
      walk(DOT_ROAD_BLANK_STEP);
    }
  };

  return (
    <div className="dr-root" data-dr-root data-dr-locale={locale}>
      <header className="dr-hero">
        <p className="dr-kicker">{c.kicker}</p>
        <h1 className="dr-title">{c.title}</h1>
        <p className="dr-lede">{c.lede}</p>
        <p className="dr-hint" data-dr-hint>{c.hint}</p>
      </header>

      <div
        className="dr-board"
        data-dr-board
        role="group"
        aria-label={c.ariaPath}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <span className="dr-line" aria-hidden="true" />
        <ol className="dr-dots">
          {Array.from({ length: DOT_ROAD_STEPS }, (_, index) => {
            const n = index + 1;
            const dotKind = stepKind(n);
            return (
              <li key={n} className="dr-dotSlot">
                <button
                  type="button"
                  className={`dr-dot${dotKind === 'station' ? ' dr-dot-station' : ''}${dotKind === 'blank' ? ' dr-dot-blank' : ''}${n === step ? ' dr-dotNow' : ''}${n < step ? ' dr-dotPast' : ''}`}
                  data-dr-dot={n}
                  data-dr-kind={dotKind}
                  data-dr-current={n === step ? 'true' : 'false'}
                  aria-label={c.ariaDot(n)}
                  aria-current={n === step ? 'step' : undefined}
                  onClick={() => walk(n)}
                />
              </li>
            );
          })}
        </ol>
      </div>

      <p className="dr-progress" data-dr-progress>{c.progress(step)}</p>

      <section className="dr-panel" data-dr-panel data-dr-panel-kind={kind} aria-live="polite">
        {anchors.length === 0 ? (
          <p className="dr-empty" data-dr-empty>{c.empty}</p>
        ) : blank ? (
          <div className="dr-end" data-dr-blank>
            <span className="dr-blank" aria-hidden="true" />
            <h2 className="dr-endTitle">{c.endTitle}</h2>
            <p className="dr-closing" data-dr-closing>{DOT_ROAD_CLOSING[locale]}</p>
            <p className="dr-endNote">{c.endNote}</p>
          </div>
        ) : station !== null && anchor ? (
          <div className="dr-station" data-dr-station>
            <p className="dr-stationLabel">{c.station(station)}</p>
            <blockquote className="dr-anchor" data-dr-anchor>{anchor[locale]}</blockquote>
            <p className="dr-stationMeta">{c.stationMeta(station)}</p>
          </div>
        ) : (
          <p className="dr-quiet">{c.quiet}</p>
        )}
      </section>

      <div className="dr-controls" data-dr-controls>
        <button type="button" className="dr-btn dr-btnGhost" data-dr-prev onClick={() => walk(step - 1)} disabled={step <= 1}>
          {c.prev}
        </button>
        <button type="button" className="dr-btn" data-dr-next onClick={() => walk(step + 1)} disabled={step >= DOT_ROAD_BLANK_STEP}>
          {c.next}
        </button>
        <button type="button" className="dr-btn dr-btnGhost" data-dr-restart onClick={() => walk(1)}>
          {c.restart}
        </button>
      </div>

      <p className="dr-best" data-dr-best={best ?? ''}>
        {best === null ? c.fresh : best >= DOT_ROAD_BLANK_STEP ? c.done : c.best(best)}
      </p>

      <footer className="dr-foot">
        <Link href="/bible" className="dr-back" data-dr-back>{c.back}</Link>
      </footer>
    </div>
  );
}
