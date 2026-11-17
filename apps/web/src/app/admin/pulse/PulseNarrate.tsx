'use client';

import { useState } from 'react';
import type { Locale } from '@/lib/i18n';

const COPY: Record<Locale, {
  button: string;
  loading: string;
  failed: (status: number) => string;
  digestNote: string;
}> = {
  zh: {
    button: '让大模型读这份账',
    loading: '模型正在读这份账…',
    failed: (status) => `解读失败（HTTP ${status}）——这里不会假装给分析。`,
    digestNote: '建议由模型基于上面这份快照现场生成；它只看见聚合数字，做不深也如实说。目标：下一步真能落地的一个动作。',
  },
  en: {
    button: 'Ask the model to read this ledger',
    loading: 'The model is reading the ledger…',
    failed: (status) => `Analysis failed (HTTP ${status}) — no fake analysis here.`,
    digestNote: 'The advice is generated on the spot from this snapshot alone; the model sees only aggregate numbers and will say so when it cannot see deeper. Goal: one action you can actually ship next.',
  },
};

type Narrated = { answer: string; model: string; durationMs: number; cacheReported: boolean; cachedTokens: number };

export function PulseNarrate({ locale }: { locale: Locale }) {
  const c = COPY[locale];
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [answer, setAnswer] = useState<Narrated | null>(null);
  const [errorStatus, setErrorStatus] = useState(0);

  const run = async () => {
    setState('loading');
    try {
      const res = await fetch('/api/admin/pulse/narrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) {
        setErrorStatus(res.status);
        setState('error');
        return;
      }
      const body = (await res.json()) as Narrated;
      setAnswer(body);
      setState('done');
    } catch {
      setErrorStatus(0);
      setState('error');
    }
  };

  return (
    <section className="am-audit" data-pulse-narrate>
      <h2 className="am-sectionHeadSm" data-pulse-narrate-heading>
        {locale === 'zh' ? '模型给我的下一步' : 'The model’s next step'}
      </h2>
      <p className="adm-capNote">{c.digestNote}</p>
      <div>
        <button type="button" className="at-btnPrimary" onClick={() => void run()} disabled={state === 'loading'} data-pulse-narrate-button>
          {state === 'loading' ? c.loading : c.button}
        </button>
      </div>
      {state === 'error' ? (
        <p className="at-error" data-pulse-narrate-error>
          {c.failed(errorStatus)}
        </p>
      ) : null}
      {state === 'done' && answer ? (
        <div className="am-stack" data-pulse-narrate-answer>
          {answer.answer.split('\n').filter(Boolean).map((line, index) => (
            <p key={index} className="adm-capNote" data-pulse-narrate-line={index}>
              {line}
            </p>
          ))}
          <p className="at-note" data-pulse-narrate-meta>
            {answer.model} · {answer.durationMs} ms · cached_tokens={answer.cacheReported ? answer.cachedTokens : '未报'}
          </p>
        </div>
      ) : null}
    </section>
  );
}
