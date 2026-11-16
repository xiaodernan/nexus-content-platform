'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * ──PULSE-REVIEW · /observatory 的"AI 独立复核"（cont. 203）───────────────────
 *
 * 规则引擎写的是展板、波形图、动作清单；本组件请模型**独立重算一遍**并判 agree/disagree。
 * 它不写库、不改规则——只说话。规则代码本身就是真值。
 *
 * 纪律：
 *  1. DEMO MODE / provider 挂了 → 原样展示服务端说什么（不替它圆场）；
 *  2. 每条复核必须带数字（服务端有缺数字即 502 的机械检查）；
 *  3. 常驻 disclaimer：AI 复核 · 依据实测聚合数字 · 非人工背书。
 */

interface ReviewOk {
  checks: { claim: string; verdict: 'agrees' | 'disagrees'; basis: string }[];
  bestNextMove: string;
  model: string;
  disclaimer: string;
  cached: boolean;
  basis: { slope: number; intercept: number; residualStd: number; n: number; cv: number; lastDeltaPct: number | null; projected7d: number };
}

interface ReviewFail {
  error?: string;
  message?: string;
  retryAfterMs?: number;
}

type Phase = 'idle' | 'loading' | 'ok' | 'error';

const COPY = {
  zh: {
    kicker: '独立复核 · 规则引擎对不对',
    title: '让模型把上面的数字重算一遍',
    lede: '规则引擎写的是展板——大模型只回答"它算得对不对、那条动作该不该做"。它不写库、不改规则。',
    cta: '让 AI 独立复核',
    rerun: '再复核一次（缓存 24 小时）',
    loading: '模型正在重算……',
    err409: 'AI 未就绪——当前 DEMO MODE，如实拒绝出复核。',
    err429: '次数超限（每小时 10 次），稍后再来。',
    err503: 'AI 服务暂不可达——请稍后再试。',
    err502: '模型输出未落在实测数字上——不展示，请稍后重试。',
    errUnknown: '请求失败了——请稍后重试。',
    dismiss: '收起',
    agree: '同意',
    disagree: '不同意',
    bestNext: '如果只改一件事',
    basis: '规则引擎实测',
    cached: '缓存结果',
    realTime: '实时复核',
  },
  en: {
    kicker: 'Independent review · right or not',
    title: 'Let the model recompute the board',
    lede: 'The rule engine writes the board — the model only answers whether it holds up, and whether each action is worth doing. It never writes the DB or the rules.',
    cta: 'Let AI review it',
    rerun: 'Re-review (24-hour cache)',
    loading: 'The model is recomputing…',
    err409: 'AI not ready — DEMO MODE refuses, honestly.',
    err429: 'Rate limited (10 / hour), try later.',
    err503: 'AI service unreachable — try again shortly.',
    err502: 'The review did not ground itself in the figures — not shown; retry later.',
    errUnknown: 'The request failed — try again shortly.',
    dismiss: 'Dismiss',
    agree: 'agrees',
    disagree: 'disagrees',
    bestNext: 'If only one thing changes',
    basis: 'Rule engine measured',
    cached: 'cached result',
    realTime: 'freshly reviewed',
  },
} as const;

interface ReviewInput {
  points: { day: string; opens: number }[];
  opens: number;
  opensBot: number;
  opensDelta: number | null;
  visitorDaysDelta: number | null;
}

export function ReviewCard({ body, locale }: { body: ReviewInput | null; locale: Locale }) {
  const c = COPY[locale];
  const [phase, setPhase] = useState<Phase>('idle');
  const [ok, setOk] = useState<ReviewOk | null>(null);
  const [fail, setFail] = useState<{ message: string; retryAfterMs?: number } | null>(null);

  async function run() {
    if (!body || phase === 'loading') return;
    setPhase('loading');
    setFail(null);
    try {
      const response = await fetch('/api/pulse/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, locale }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as ReviewOk | ReviewFail | null;
      if (response.ok && json && Array.isArray((json as ReviewOk).checks)) {
        setOk(json as ReviewOk);
        setPhase('ok');
        return;
      }
      const f = (json ?? {}) as ReviewFail;
      const status = response.status;
      const message =
        status === 409 ? c.err409 :
        status === 429 ? c.err429 :
        status === 502 ? c.err502 :
        status === 503 ? c.err503 :
        (typeof f.message === 'string' ? f.message : c.errUnknown);
      setFail({ message, retryAfterMs: typeof f.retryAfterMs === 'number' ? f.retryAfterMs : undefined });
      setPhase('error');
    } catch {
      setFail({ message: c.errUnknown });
      setPhase('error');
    }
  }

  if (phase === 'loading') {
    return (
      <section className="pr-root" data-pulse-review-root data-pulse-review-loading>
        <p className="pr-kicker">{c.kicker}</p>
        <p className="pr-loading" role="status">{c.loading}</p>
      </section>
    );
  }

  if (phase === 'error' && fail) {
    return (
      <section className="pr-root" data-pulse-review-root data-pulse-review-error>
        <p className="pr-kicker">{c.kicker}</p>
        <p className="pr-error" role="alert">{fail.message}</p>
        {fail.retryAfterMs ? <p className="pr-meta">retryAfterMs={fail.retryAfterMs}</p> : null}
        <div className="pr-row">
          <button type="button" className="pr-button" data-pulse-review-retry onClick={() => void run()}>{c.cta}</button>
          <button type="button" className="pr-dismiss" data-pulse-review-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
        </div>
      </section>
    );
  }

  if (phase === 'ok' && ok) {
    return (
      <section className="pr-root" data-pulse-review-root data-pulse-review-ok>
        <p className="pr-kicker">{c.kicker}</p>
        <ol className="pr-list">
          {ok.checks.map((check, i) => (
            <li key={i} className={`pr-item ${check.verdict === 'agrees' ? 'pr-itemAgrees' : 'pr-itemDisagrees'}`} data-pulse-review-item>
              <span className="pr-verdict">{check.verdict === 'agrees' ? c.agree : c.disagree}</span>
              <span className="pr-claim">{check.claim}</span>
              <span className="pr-basis">{check.basis}</span>
            </li>
          ))}
        </ol>
        <p className="pr-best">
          <span className="pr-bestTag">{c.bestNext}</span>
          {ok.bestNextMove}
        </p>
        <p className="pr-note">{c.basis}：slope {ok.basis.slope.toFixed(3)} · CV {ok.basis.cv.toFixed(2)} · 7d→{ok.basis.projected7d}</p>
        <p className="pr-disclaimer">{ok.disclaimer}</p>
        <div className="pr-row">
          <button type="button" className="pr-button" data-pulse-review-rerun onClick={() => void run()}>{c.rerun}</button>
          <button type="button" className="pr-dismiss" data-pulse-review-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="pr-root" data-pulse-review-root>
      <p className="pr-kicker">{c.kicker}</p>
      <h2 className="pr-title">{c.title}</h2>
      <p className="pr-lede">{c.lede}</p>
      <button type="button" className="pr-button pr-buttonPrimary" data-pulse-review-cta disabled={!body} onClick={() => void run()}>
        {c.cta}
      </button>
    </section>
  );
}
