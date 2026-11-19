'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * ──CHAPTER-DIGEST · 典籍室的"让 AI 读给你听"（cont. 193）────────────────────
 *
 * 本组件只递一枚按钮和读一段输出——摘要与思考题全部来自服务端：
 * /api/bible/chapter-digest 让 gpt-6.2-sol 只读本章/回响的原文摘录，
 * 不编造、不超出，最后递一句"思考：/Ponder:"把读者留在门边。
 *
 * 纪律：
 *  1. 按钮只发一次请求——同一章/语言由服务端 7 天 LRU 兜底，重复点击不重复计费；
 *  2. DEMO MODE / provider 挂了 → 原样展示服务端消息（不替它圆场）；
 *  3. 思考题不替读者回答——"不替你在结尾落款"；
 *  4. 这是一行关于正典的模型复述——正典原文永远是上面的 markdown，不是这段摘要。
 */

interface DigestOk {
  digest: string;
  ponder: string;
  model: string;
  cached: boolean;
}

interface DigestFail {
  error?: string;
  message?: string;
  retryAfterMs?: number;
}

type Phase = 'idle' | 'loading' | 'ok' | 'error';

const COPY = {
  zh: {
    kicker: '伴读 · AI 摘要',
    title: '让模型读一遍给你听',
    lede: '模型只读本章/回响的原文摘录——不编造、不超出；读完留下三句话和一句思考题。正典永远以原文为准。',
    cta: '让 AI 读给你听',
    rerun: '再读一次（缓存 7 天）',
    loading: '模型正在翻本章……',
    err409: 'AI 未就绪——当前 DEMO MODE，如实拒绝出摘要。',
    err429: '次数超限（每小时 20 次），稍后再来。',
    err503: 'AI 服务暂不可达——请稍后再试。',
    err502: '模型输出没达到可展示的质量，请稍后重试。',
    errUnknown: '请求失败了——请稍后重试。',
    dismiss: '收起',
    ponderLabel: '思考',
    cached: '缓存结果',
    realTime: '实时生成',
    modelLine: '模型',
  },
  en: {
    kicker: 'Companion · AI digest',
    title: 'Let the model read this chapter to you',
    lede: 'The model reads only an excerpt of this chapter/echo — nothing beyond, nothing invented. Three sentences, then one question, and the canon itself stays the authority.',
    cta: 'Let AI read it to you',
    rerun: 'Read again (7-day cache)',
    loading: 'The model is turning the pages…',
    err409: 'AI not ready — DEMO MODE refuses, honestly.',
    err429: 'Rate limited (20 / hour), try later.',
    err503: 'AI service unreachable — try again shortly.',
    err502: 'The model output did not reach exhibit-quality; retry later.',
    errUnknown: 'The request failed — try again shortly.',
    dismiss: 'Dismiss',
    ponderLabel: 'Ponder',
    cached: 'cached result',
    realTime: 'freshly generated',
    modelLine: 'model',
  },
} as const;

export function ChapterDigest({ slug, locale }: { slug: string; locale: Locale }) {
  const c = COPY[locale];
  const [phase, setPhase] = useState<Phase>('idle');
  const [ok, setOk] = useState<DigestOk | null>(null);
  const [fail, setFail] = useState<{ message: string; retryAfterMs?: number } | null>(null);

  async function run() {
    if (phase === 'loading') return;
    setPhase('loading');
    setFail(null);
    try {
      const response = await fetch('/api/bible/chapter-digest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, locale }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as DigestOk | DigestFail | null;
      if (response.ok && json && typeof (json as DigestOk).digest === 'string') {
        setOk(json as DigestOk);
        setPhase('ok');
        return;
      }
      const f = (json ?? {}) as DigestFail;
      const status = response.status;
      const message =
        status === 409 ? c.err409 :
        status === 429 ? c.err429 :
        status === 503 || status === 502 ? (status === 502 ? c.err502 : c.err503) :
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
      <section className="cdg-root" data-chapter-digest-root data-chapter-digest-loading>
        <p className="cdg-kicker">{c.kicker}</p>
        <p className="cdg-loading" role="status">{c.loading}</p>
      </section>
    );
  }

  if (phase === 'error' && fail) {
    return (
      <section className="cdg-root" data-chapter-digest-root data-chapter-digest-error>
        <p className="cdg-kicker">{c.kicker}</p>
        <p className="cdg-error" role="alert">{fail.message}</p>
        {fail.retryAfterMs ? <p className="cdg-meta">retryAfterMs={fail.retryAfterMs}</p> : null}
        <div className="cdg-row">
          <button type="button" className="cdg-button" data-chapter-digest-retry onClick={() => void run()}>{c.cta}</button>
          <button type="button" className="cdg-dismiss" data-chapter-digest-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
        </div>
      </section>
    );
  }

  if (phase === 'ok' && ok) {
    return (
      <section className="cdg-root" data-chapter-digest-root data-chapter-digest-ok>
        <p className="cdg-kicker">{c.kicker}</p>
        <div className="cdg-digest" data-chapter-digest-text>
          {ok.digest.split('\n').filter(Boolean).map((line, i) => (
            <p key={i} className="cdg-line">{line}</p>
          ))}
        </div>
        <p className="cdg-ponder" data-chapter-digest-ponder>
          <span className="cdg-ponderTag">{c.ponderLabel}</span>
          <span className="cdg-ponderText">{ok.ponder}</span>
        </p>
        <div className="cdg-footRow">
          <p className="cdg-meta">{ok.cached ? c.cached : c.realTime} · {c.modelLine}: {ok.model}</p>
          <div className="cdg-row">
            <button type="button" className="cdg-button" data-chapter-digest-rerun onClick={() => void run()}>{c.rerun}</button>
            <button type="button" className="cdg-dismiss" data-chapter-digest-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="cdg-root" data-chapter-digest-root>
      <p className="cdg-kicker">{c.kicker}</p>
      <h2 className="cdg-title">{c.title}</h2>
      <p className="cdg-lede">{c.lede}</p>
      <button type="button" className="cdg-button cdg-buttonPrimary" data-chapter-digest-cta onClick={() => void run()}>
        {c.cta}
      </button>
    </section>
  );
}
