'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * ──AI-DEEP-READ 观测大厅的"AI 深读"面板（cont. 190）────────────────────────
 *
 * 看到这里的人已经解锁了 123 大厅（众人皆知的口令，不是权限系统），
 * 桌上铺着同一份实测聚合数据——本面板把它原样 POST 给 /api/ai/deep-read，
 * 让 gpt-6.1-terra 基于这些数字起草 4 条按可操作性排序的优化建议。
 *
 * 纪律：
 *  1. 你看到的建议**只基于上面展示的聚合数字**——不是模型脑补；
 *  2. 每条建议都带"依据"与"下一步"，数字来自本页卡片；
 *  3. DEMO MODE / provider 挂了 → 原样展示服务端说什么（不替它圆场）；
 *  4. 20 分钟缓存；重复点击不收额外 provider 账单；
 *  5. 执行前请人工复核——AI 起草，数字实测，结论仍需你落地。
 */

interface Suggestion {
  title: string;
  basis: string;
  impact: string;
  action: string;
  confidence: 'high' | 'medium' | 'low';
}

interface DeepReadOk {
  suggestions: Suggestion[];
  generatedAt: string;
  model: string;
  disclaimer: string;
  cached: boolean;
}

interface DeepReadFail {
  error?: string;
  message?: string;
  retryAfterMs?: number;
}

type Phase = 'idle' | 'loading' | 'ok' | 'error';

const COPY = {
  zh: {
    kicker: 'AI 深读 · 实测数据',
    title: '让模型把以上数字读完，给你四条',
    lede: '上面那些数字全部是平台自身实测的聚合值；下面的建议同样只基于它们——不添你看不见的数。',
    cta: '让 AI 深读',
    rerun: '再算一次（缓存 20 分钟）',
    loading: '模型正在过账……',
    loadingText: '正在让模型逐项过账——几秒钟',
    err409: 'AI 未就绪——当前 DEMO MODE，如实拒绝出数。',
    err429: '次数超限（每小时 10 次），稍后再来。',
    err503: 'AI 服务暂不可达——请稍后再试。',
    err502: '模型输出没达到可展示的质量，请稍后重试。',
    errUnknown: '请求失败了——请稍后重试。',
    dismiss: '收起',
    basis: '依据',
    impact: '预期收益',
    action: '下一步',
    confidenceHigh: '高置信',
    confidenceMedium: '中置信',
    confidenceLow: '低置信',
    generatedAt: 'AI 生成于',
    cached: '缓存结果',
    realTime: '实时生成',
  },
  en: {
    kicker: 'AI deep-read · measured numbers',
    title: 'Have the model read these numbers and hand you four',
    lede: 'Every figure above is platform-measured aggregates; the suggestions below use exactly those — nothing you cannot see.',
    cta: 'Let AI read them',
    rerun: 'Re-run (20-min cache)',
    loading: 'Reading the numbers…',
    loadingText: 'The model is going through the books — a few seconds',
    err409: 'AI not ready — DEMO MODE refuses, honestly.',
    err429: 'Rate limited (10 / hour), try later.',
    err503: 'AI service unreachable — try again shortly.',
    err502: 'The model output did not reach exhibit-quality; retry later.',
    errUnknown: 'The request failed — try again shortly.',
    dismiss: 'Dismiss',
    basis: 'Basis',
    impact: 'Expected impact',
    action: 'Next step',
    confidenceHigh: 'high confidence',
    confidenceMedium: 'medium confidence',
    confidenceLow: 'low confidence',
    generatedAt: 'AI generated at',
    cached: 'cached result',
    realTime: 'freshly generated',
  },
} as const;

function confidenceLabel(level: Suggestion['confidence'], c: { confidenceHigh: string; confidenceMedium: string; confidenceLow: string }) {
  return level === 'high' ? c.confidenceHigh : level === 'medium' ? c.confidenceMedium : c.confidenceLow;
}

export function DeepReadCard({ body, locale }: { body: unknown; locale: Locale }) {
  const c = COPY[locale];
  const [phase, setPhase] = useState<Phase>('idle');
  const [ok, setOk] = useState<DeepReadOk | null>(null);
  const [fail, setFail] = useState<{ message: string; retryAfterMs?: number } | null>(null);

  async function run() {
    if (!body || phase === 'loading') return;
    setPhase('loading');
    setFail(null);
    try {
      const response = await fetch('/api/ai/deep-read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...(body as Record<string, unknown>), locale }),
        cache: 'no-store',
      });
      const json = (await response.json().catch(() => null)) as (DeepReadOk & { ok?: boolean }) | DeepReadFail | null;
      if (response.ok && json && Array.isArray((json as DeepReadOk).suggestions)) {
        setOk(json as DeepReadOk);
        setPhase('ok');
        return;
      }
      const f = (json ?? {}) as DeepReadFail;
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
      <section className="dr-root" data-ai-deep-read-root data-ai-deep-read-loading>
        <p className="dr-kicker">{c.kicker}</p>
        <p className="dr-loading" role="status">{c.loadingText}</p>
      </section>
    );
  }

  if (phase === 'error' && fail) {
    return (
      <section className="dr-root" data-ai-deep-read-root data-ai-deep-read-error>
        <p className="dr-kicker">{c.kicker}</p>
        <p className="dr-error" role="alert">{fail.message}</p>
        {fail.retryAfterMs ? (
          <p className="dr-note">retryAfterMs={fail.retryAfterMs}</p>
        ) : null}
        <div className="dr-row">
          <button type="button" className="dr-button" data-ai-deep-read-retry onClick={() => void run()}>{c.cta}</button>
          <button type="button" className="dr-dismiss" data-ai-deep-read-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
        </div>
      </section>
    );
  }

  if (phase === 'ok' && ok) {
    return (
      <section className="dr-root" data-ai-deep-read-root data-ai-deep-read-ok>
        <p className="dr-kicker">{c.kicker}</p>
        <p className="dr-note">{ok.disclaimer}</p>
        <ol className="dr-list">
          {ok.suggestions.map((s, i) => (
            <li key={i} className="dr-item" data-ai-deep-read-item>
              <div className="dr-itemHead">
                <h3 className="dr-itemTitle">{i + 1}. {s.title}</h3>
                <span className={s.confidence === 'high' ? 'dr-conf dr-confHigh' : s.confidence === 'medium' ? 'dr-conf dr-confMedium' : 'dr-conf dr-confLow'}>
                  {confidenceLabel(s.confidence, c)}
                </span>
              </div>
              <dl className="dr-meta">
                <div><dt>{c.basis}</dt><dd>{s.basis}</dd></div>
                <div><dt>{c.impact}</dt><dd>{s.impact}</dd></div>
                <div><dt>{c.action}</dt><dd>{s.action}</dd></div>
              </dl>
            </li>
          ))}
        </ol>
        <div className="dr-footRow">
          <p className="dr-footStamp">{c.generatedAt} {new Date(ok.generatedAt).toLocaleString(locale === 'en' ? 'en-US' : 'zh-CN')} · {ok.cached ? c.cached : c.realTime} · {ok.model}</p>
          <div className="dr-row">
            <button type="button" className="dr-button" data-ai-deep-read-rerun onClick={() => void run()}>{c.rerun}</button>
            <button type="button" className="dr-dismiss" data-ai-deep-read-dismiss onClick={() => setPhase('idle')}>{c.dismiss}</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="dr-root" data-ai-deep-read-root>
      <p className="dr-kicker">{c.kicker}</p>
      <h2 className="dr-title">{c.title}</h2>
      <p className="dr-lede">{c.lede}</p>
      <button type="button" className="dr-button dr-buttonPrimary" data-ai-deep-read-cta disabled={!body} onClick={() => void run()}>
        {c.cta}
      </button>
    </section>
  );
}
