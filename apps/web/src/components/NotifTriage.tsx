'use client';

import { csrfHeaders } from '@/lib/csrf';
import { useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * ──NOTIF-TRIAGE · /notifications 的"AI 先读一下"（cont. 194）────────────────
 *
 * 本组件只递一枚按钮——收件箱的计数全部由服务端自算（标题/正文/行为者一个字都不进模型）。
 * 返回的摘要会附上喂给模型的实测计数本身，用户可以逐条对照页签复核。
 *
 * 纪律：
 *  1. DEMO MODE / provider 挂了 / 401 → 原样展示服务端说什么；
 *  2. 摘要必须落在计数上（服务端已做缺数字即 502 的机械检查）；
 *  3. 不替你做结论——只排顺序，最后一步交给你。
 */

interface Histo {
  total: number;
  unread: number;
  kinds: { kind: string; total: number; unread: number }[];
}

interface DigestOk {
  digest: string;
  model: string;
  disclaimer: string;
  cached: boolean;
  histogram: Histo;
}

interface DigestFail {
  error?: string;
  message?: string;
  retryAfterMs?: number;
}

type Phase = 'idle' | 'loading' | 'ok' | 'error';

const COPY = {
  zh: {
    kicker: '伴读 · 先看哪件',
    title: '让 AI 按实测计数替你排一下优先级',
    lede: '只数数：moderation / approval / team 里有人在等你，like / follow 只是数字。摘要会附上喂给模型的计数本身。',
    cta: '让 AI 先读一下',
    rerun: '再读一次（缓存 6 小时）',
    loading: '模型正在数数……',
    err401: '先登录——收件箱属于你。',
    err409: 'AI 未就绪——当前 DEMO MODE，如实拒绝出摘要。',
    err429: '次数超限（每小时 20 次），稍后再来。',
    err503: 'AI 服务暂不可达——请稍后再试。',
    err502: '模型没落在计数上——不展示，请稍后重试。',
    errUnknown: '请求失败了——请稍后重试。',
    dismiss: '收起',
    basis: '依据（喂给模型的实测计数）',
    cached: '缓存结果',
    realTime: '实时生成',
    histoLine: (k: Histo) => `共 ${k.total} 条 · 未读 ${k.unread}`,
  },
  en: {
    kicker: 'Companion · what to open first',
    title: 'Let AI rank your inbox by measured counts',
    lede: 'Counts only: moderation / approval / team means a human waits on you; likes and follows are just tallies. The digest comes back with the exact figures shown to the model.',
    cta: 'Let AI read it first',
    rerun: 'Read again (6-hour cache)',
    loading: 'The model is counting…',
    err401: 'Sign in first — the inbox is yours.',
    err409: 'AI not ready — DEMO MODE refuses, honestly.',
    err429: 'Rate limited (20 / hour), try later.',
    err503: 'AI service unreachable — try again shortly.',
    err502: 'The model did not ground itself in the counts — not shown; retry later.',
    errUnknown: 'The request failed — try again shortly.',
    dismiss: 'Dismiss',
    basis: 'Basis (the measured counts shown to the model)',
    cached: 'cached result',
    realTime: 'freshly generated',
    histoLine: (k: Histo) => `${k.total} total · ${k.unread} unread`,
  },
} as const;

export function NotifTriage({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const [phase, setPhase] = useState<Phase>('idle');
  const [ok, setOk] = useState<DigestOk | null>(null);
  const [fail, setFail] = useState<{ message: string; retryAfterMs?: number } | null>(null);

  async function run() {
    if (phase === 'loading') return;
    setPhase('loading');
    setFail(null);
    try {
      const response = await fetch('/api/notifications/digest', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ locale }),
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
        status === 401 ? c.err401 :
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
      <section className="ntg-root" data-notif-triage-root data-notif-triage-loading>
        <p className="ntg-kicker">{c.kicker}</p>
        <p className="ntg-loading" role="status">{c.loading}</p>
      </section>
    );
  }

  if (phase === 'error' && fail) {
    return (
      <section className="ntg-root" data-notif-triage-root data-notif-triage-error>
        <p className="ntg-kicker">{c.kicker}</p>
        <p className="ntg-error" role="alert">{fail.message}</p>
        {fail.retryAfterMs ? <p className="ntg-meta">retryAfterMs={fail.retryAfterMs}</p> : null}
        <div className="ntg-row">
          <button type="button" className="ntg-button" data-notif-triage-retry onClick={() => void run()}>{c.cta}</button>
          <button type="button" className="ntg-dismiss" data-notif-triage-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
        </div>
      </section>
    );
  }

  if (phase === 'ok' && ok) {
    return (
      <section className="ntg-root" data-notif-triage-root data-notif-triage-ok>
        <p className="ntg-kicker">{c.kicker}</p>
        <p className="ntg-digest" data-notif-triage-text>{ok.digest}</p>
        <div className="ntg-basis" data-notif-triage-basis>
          <p className="ntg-basisTitle">{c.basis} · {c.histoLine(ok.histogram)}</p>
          <ul className="ntg-histo">
            {ok.histogram.kinds.map((k) => (
              <li key={k.kind} className="ntg-chip" data-notif-triage-chip={k.kind}>
                <span className="ntg-chipKind">{k.kind}</span>
                <span className="ntg-chipCount">{k.unread}/{k.total}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="ntg-disclaimer">{ok.disclaimer}</p>
        <div className="ntg-footRow">
          <p className="ntg-meta">{ok.cached ? c.cached : c.realTime} · {ok.model}</p>
          <div className="ntg-row">
            <button type="button" className="ntg-button" data-notif-triage-rerun onClick={() => void run()}>{c.rerun}</button>
            <button type="button" className="ntg-dismiss" data-notif-triage-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ntg-root" data-notif-triage-root>
      <p className="ntg-kicker">{c.kicker}</p>
      <h2 className="ntg-title">{c.title}</h2>
      <p className="ntg-lede">{c.lede}</p>
      <button type="button" className="ntg-button ntg-buttonPrimary" data-notif-triage-cta onClick={() => void run()}>
        {c.cta}
      </button>
    </section>
  );
}
