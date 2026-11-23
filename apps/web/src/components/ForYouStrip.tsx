'use client';

import { csrfHeaders } from '@/lib/csrf';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';

/**
 * ──FOR-YOU-STRIP · /discover 的"推荐位"（cont. 199）──────────────────────────
 *
 * 挂载条件：当前登录用户（服务器端决定是否渲染本组件）；匿名看不到这一条。
 * 本组件 POST /api/discover/interest——服务端只看这个用户自己的实测阅读信号。
 *
 * 纪律：
 *  1. 未登录/痕迹不足 → 不渲染或不调模型（服务端如实说"不替没有痕迹的人排序"）；
 *  2. 推荐基于 myOpens/views/likes——每条必须落在数字上；
 *  3. 失败时安静消失——公共页，错误信息只留给本地日志；
 *  4. 缓存 24h（服务端 LRU）。
 */

interface InterestSignal {
  publicationId: string;
  path: string;
  name: string;
  kind: string;
  views: number;
  likes: number;
  myOpens: number;
}

interface InterestOk {
  picks: { publicationId: string; path: string; name: string; note: string }[];
  model: string;
  disclaimer: string;
  cached: boolean;
  signals: InterestSignal[];
}

type Phase = 'idle' | 'loading' | 'ok' | 'error';

const COPY = {
  zh: {
    kicker: '为你推荐 · 实测',
    title: '让 AI 照着你自己的阅读记录排一下',
    lede: '喂给它的只有两样东西：你对每件作品打开过多少次（myOpens）+ 作品的实测数据。别的一概不知道。',
    cta: '让 AI 看看我看过什么',
    rerun: '重新排（缓存 24 小时）',
    loading: '模型正在看你的阅读痕迹……',
    err401: '先登录——推荐位只对有痕迹的人说话。',
    err409: 'AI 未就绪——当前 DEMO MODE，如实拒绝出推荐。',
    err429: '次数超限（每小时 10 次），稍后再来。',
    err503: 'AI 服务暂不可达——请稍后再试。',
    err502: '模型没落在实测信号上——不展示，请稍后重试。',
    errUnknown: '请求失败了——请稍后重试。',
    dismiss: '收起',
    basis: '依据（你自己打开过的作品）',
    opens: '打开了',
    times: '次',
    empty: '你还没有可复盘的阅读痕迹——我们不替没有痕迹的人排序。先去 trending 逛一圈。',
    cached: '缓存结果',
    realTime: '实时生成',
  },
  en: {
    kicker: 'For you · measured',
    title: 'Let AI rank from your own reading trace',
    lede: 'It only sees two things: how many times you opened each work (myOpens) and measured work metrics. Nothing else.',
    cta: 'Let AI look at what I read',
    rerun: 'Re-rank (24-hour cache)',
    loading: 'The model is reviewing your reading trace…',
    err401: 'Sign in first — this strip only speaks to people with traces.',
    err409: 'AI not ready — DEMO MODE refuses, honestly.',
    err429: 'Rate limited (10 / hour), try later.',
    err503: 'AI service unreachable — try again shortly.',
    err502: 'The model did not ground itself in the signals — not shown; retry later.',
    errUnknown: 'The request failed — try again shortly.',
    dismiss: 'Dismiss',
    basis: 'Basis (works you opened yourself)',
    opens: 'opened',
    times: '×',
    empty: 'No reading trace yet — we do not rank for people without traces. Browse trending first.',
    cached: 'cached result',
    realTime: 'freshly generated',
  },
} as const;

export function ForYouStrip({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const [phase, setPhase] = useState<Phase>('idle');
  const [ok, setOk] = useState<InterestOk | null>(null);
  const [fail, setFail] = useState<{ message: string; retryAfterMs?: number } | null>(null);

  async function run() {
    if (phase === 'loading') return;
    setPhase('loading');
    setFail(null);
    try {
      const response = await fetch('/api/discover/interest', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ locale }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as InterestOk | { message?: string; retryAfterMs?: number } | null;
      if (response.ok && json && Array.isArray((json as InterestOk).picks)) {
        setOk(json as InterestOk);
        setPhase('ok');
        return;
      }
      const f = (json ?? {}) as { message?: string; retryAfterMs?: number };
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

  // 打开页面就自动触发一次——推荐位是静默的（公共页，SSR 无产出，client mount 后取数）
  useEffect(() => {
    void run();
  }, []);

  if (phase === 'loading') {
    return (
      <section className="fys-root" data-for-you-root data-for-you-loading>
        <p className="fys-kicker">{c.kicker}</p>
        <p className="fys-loading" role="status">{c.loading}</p>
      </section>
    );
  }

  if (phase === 'error' && fail) {
    return (
      <section className="fys-root" data-for-you-root data-for-you-error>
        <p className="fys-kicker">{c.kicker}</p>
        <p className="fys-error" role="alert">{fail.message}</p>
        {fail.retryAfterMs ? <p className="fys-meta">retryAfterMs={fail.retryAfterMs}</p> : null}
        <div className="fys-row">
          <button type="button" className="fys-button" data-for-you-retry onClick={() => void run()}>{c.cta}</button>
          <button type="button" className="fys-dismiss" data-for-you-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
        </div>
      </section>
    );
  }

  if (phase === 'ok' && ok) {
    if (ok.picks.length === 0) {
      return (
        <section className="fys-root" data-for-you-root data-for-you-empty>
          <p className="fys-kicker">{c.kicker}</p>
          <p className="fys-lede">{c.empty}</p>
        </section>
      );
    }
    const opensById = new Map(ok.signals.map((s) => [s.publicationId, s.myOpens] as const));
    return (
      <section className="fys-root" data-for-you-root data-for-you-ok>
        <p className="fys-kicker">{c.kicker}</p>
        <ol className="fys-list">
          {ok.picks.map((pick) => (
            <li key={pick.publicationId} className="fys-item" data-for-you-item={pick.publicationId}>
              <Link href={pick.path} className="fys-link">
                <span className="fys-name">{pick.name}</span>
                <span className="fys-noteText">{pick.note}</span>
                <span className="fys-opens">{c.opens} {opensById.get(pick.publicationId) ?? 0} {c.times}</span>
              </Link>
            </li>
          ))}
        </ol>
        <p className="fys-disclaimer">{ok.disclaimer}</p>
        <div className="fys-row">
          <button type="button" className="fys-button" data-for-you-rerun onClick={() => void run()}>{c.rerun}</button>
          <button type="button" className="fys-dismiss" data-for-you-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
        </div>
      </section>
    );
  }

  return (
    <section className="fys-root" data-for-you-root>
      <p className="fys-kicker">{c.kicker}</p>
      <h2 className="fys-title">{c.title}</h2>
      <p className="fys-lede">{c.lede}</p>
      <button type="button" className="fys-button fys-buttonPrimary" data-for-you-cta onClick={() => void run()}>
        {c.cta}
      </button>
    </section>
  );
}
