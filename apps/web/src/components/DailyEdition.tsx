'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * ──DAILY · 今日潮候（cont. 206）─────────────────────────────────────────
 *
 * The page renders the date's leaf (title + kind), then one button calls
 * /api/daily/edition — the model reads ONLY that leaf's excerpt and writes
 * three sentences + one ponder. Same honesty discipline as §CHAPTER-DIGEST:
 * DEMO MODE → 409 with the server's own words; 429 → rate-limited message;
 * 502 → nothing half-shown reaches the page.
 */

interface EditionOk {
  dateIso: string;
  leaf: { slug: string; titleZh: string; titleEn: string; kind: 'chapter' | 'echo'; index: number };
  digest: string;
  ponder: string;
  model: string;
  cached: boolean;
}
interface EditionFail {
  error?: string;
  message?: string;
  retryAfterMs?: number;
}
type Phase = 'idle' | 'loading' | 'ok' | 'error';

const COPY = {
  zh: {
    kicker: '今日潮候',
    title: '今天的潮，只翻这一页',
    lede: '每天一期，从正典里确定性地抽一叶——模型只读这一叶，写三句话和一句思考题。正典永远以原文为准。',
    cta: '出今日潮候',
    rerun: '再出一次（缓存 24 小时）',
    loading: '模型正在翻这一叶……',
    ponderLabel: '思考',
    chapterTag: '正典章',
    echoTag: '回响',
    cached: '今日已生成',
    realTime: '实时生成',
    modelLine: '模型',
    err409: 'AI 未就绪——当前 DEMO MODE，如实拒绝出笺。',
    err429: '次数超限（每小时 20 次），稍后再来。',
    err503: 'AI 服务暂不可达——请稍后再试。',
    err502: '模型输出没达到可展示的质量，请稍后重试。',
    errUnknown: '请求失败了——请稍后重试。',
    dismiss: '收起',
    dateLabel: '期号',
  },
  en: {
    kicker: 'The Daily Tide',
    title: 'One leaf a day — that is all the tide shows',
    lede: 'One edition per day, drawn deterministically from the canon — the model reads only that leaf, writes three sentences and one ponder. The canon itself stays the authority.',
    cta: 'Write today’s edition',
    rerun: 'Write again (24 h cache)',
    loading: 'The model is turning the leaf…',
    ponderLabel: 'Ponder',
    chapterTag: 'Chapter',
    echoTag: 'Echo',
    cached: 'edition ready',
    realTime: 'freshly written',
    modelLine: 'model',
    err409: 'AI not ready — DEMO MODE refuses, honestly.',
    err429: 'Rate limited (20 / hour), try later.',
    err503: 'AI service unreachable — try again shortly.',
    err502: 'The model output did not reach exhibit-quality; retry later.',
    errUnknown: 'The request failed — try again shortly.',
    dismiss: 'Dismiss',
    dateLabel: 'No.',
  },
} as const;

export function DailyEdition({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const [phase, setPhase] = useState<Phase>('idle');
  const [ok, setOk] = useState<EditionOk | null>(null);
  const [fail, setFail] = useState<{ message: string; retryAfterMs?: number } | null>(null);

  const todayIso = new Date().toISOString().slice(0, 10);

  async function run() {
    if (phase === 'loading') return;
    setPhase('loading');
    setFail(null);
    try {
      const response = await fetch('/api/daily/edition', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as EditionOk | EditionFail | null;
      if (response.ok && json && typeof (json as EditionOk).digest === 'string') {
        setOk(json as EditionOk);
        setPhase('ok');
        return;
      }
      const f = (json ?? {}) as EditionFail;
      const status = response.status;
      const message =
        status === 409 ? c.err409 :
        status === 429 ? c.err429 :
        status === 503 ? c.err503 :
        status === 502 ? c.err502 :
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
      <section className="dle-root" data-daily-edition-root data-daily-edition-loading>
        <p className="dle-kicker">{c.kicker}</p>
        <p className="dle-loading" role="status">{c.loading}</p>
      </section>
    );
  }

  if (phase === 'error' && fail) {
    return (
      <section className="dle-root" data-daily-edition-root data-daily-edition-error>
        <p className="dle-kicker">{c.kicker}</p>
        <p className="dle-error" role="alert">{fail.message}</p>
        {fail.retryAfterMs ? <p className="dle-meta">retryAfterMs={fail.retryAfterMs}</p> : null}
        <div className="dle-row">
          <button type="button" className="dle-button" data-daily-edition-retry onClick={() => void run()}>{c.cta}</button>
          <button type="button" className="dle-dismiss" data-daily-edition-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
        </div>
      </section>
    );
  }

  if (phase === 'ok' && ok) {
    const leaf = ok.leaf;
    const title = locale === 'en' ? leaf.titleEn : leaf.titleZh;
    const tag = leaf.kind === 'echo' ? c.echoTag : c.chapterTag;
    return (
      <section className="dle-root" data-daily-edition-root data-daily-edition-ok>
        <p className="dle-kicker">{c.kicker} · {c.dateLabel} {ok.dateIso}</p>
        <h2 className="dle-leafTitle" data-daily-edition-leaf>
          <span className="dle-leafTag">{tag}</span>
          {title}
        </h2>
        <div className="dle-digest" data-daily-edition-text>
          {ok.digest.split('\n').filter(Boolean).map((line, i) => (
            <p key={i} className="dle-line">{line}</p>
          ))}
        </div>
        <p className="dle-ponder" data-daily-edition-ponder>
          <span className="dle-ponderTag">{c.ponderLabel}</span>
          <span className="dle-ponderText">{ok.ponder}</span>
        </p>
        <div className="dle-footRow">
          <p className="dle-meta">{ok.cached ? c.cached : c.realTime} · {c.modelLine}: {ok.model}</p>
          <div className="dle-row">
            <button type="button" className="dle-button" data-daily-edition-rerun onClick={() => void run()}>{c.rerun}</button>
            <button type="button" className="dle-dismiss" data-daily-edition-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="dle-root" data-daily-edition-root data-daily-edition-idle>
      <p className="dle-kicker">{c.kicker} · {todayIso}</p>
      <h1 className="dle-title">{c.title}</h1>
      <p className="dle-lede">{c.lede}</p>
      <button type="button" className="dle-button dle-buttonPrimary" data-daily-edition-cta onClick={() => void run()}>
        {c.cta}
      </button>
    </section>
  );
}
