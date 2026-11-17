'use client';

import { useCallback, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §INSIGHT-TIDE-CAST · 潮汐签——
 * 让「潮」开口，用典籍语调说出近 30 天这片水面的「涨还是退」。
 * 与 InsightAiAnalysis 的分析员不同：签不下判断、不给方案，它只说「它看见了什么」。
 * 本组件：真实 provider 真的调用、缓存命中、低上下文（数值 + 趋势线）、无个人字段。
 */
const COPY: Record<Locale, {
  kicker: string;
  hint: string;
  button: string;
  busy: string;
  honestTitle: string;
  honestBody: string;
  badge: (m: string, cached: number, total: number) => string;
}> = {
  zh: {
    kicker: '潮汐签 · TIDE CAST',
    hint: '把整张观察坞的数交给真模型，再问它：「这片水面涨了还是退了？」——它会用潮的口吻说两句，不下判断、不给方案，只说看见什么。',
    button: '翻签 · 潮汐看见了什么',
    busy: '潮水在转……',
    honestTitle: '潮退了。',
    honestBody: '模型没开口——这不是潮汐签。等它回复再翻。',
    badge: (m, cached, total) => cached > 0 ? `${m} · cached ${cached}/${total}` : m,
  },
  en: {
    kicker: 'TIDE CAST',
    hint: 'Hand the observatory ledger to the real model and ask: “is the water rising or retreating?” It answers in two sentences, in the tide’s voice — witness only, no decision, no plan.',
    button: 'Cast the tide · what the water saw',
    busy: 'The tide is turning…',
    honestTitle: 'The tide withdrew.',
    honestBody: 'The model has no voice now — this is not the tide cast. Try again when it does.',
    badge: (m, cached, total) => cached > 0 ? `${m} · cached ${cached}/${total}` : m,
  },
};

export function InsightTideCast({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const [phase, setPhase] = useState<'idle' | 'loading' | 'answered' | 'honest'>('idle');
  const [oracle, setOracle] = useState('');
  const [badge, setBadge] = useState<string | null>(null);

  const ask = useCallback(async () => {
    if (phase === 'loading') return;
    setPhase('loading');
    setOracle('');
    setBadge(null);
    try {
      const resp = await fetch('/api/insight/tide-cast', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ locale }),
      });
      if (resp.status >= 429 || resp.status >= 500) {
        setPhase('honest');
        return;
      }
      const body = await resp.json() as { oracle?: string; model?: string; cachedTokens?: number; tokensIn?: number };
      if (!resp.ok || typeof body.oracle !== 'string') {
        setPhase('honest');
        return;
      }
      setOracle(body.oracle.trim());
      setBadge(body.model ? c.badge(body.model, body.cachedTokens ?? 0, body.tokensIn ?? 0) : null);
      setPhase('answered');
    } catch {
      setPhase('honest');
    }
  }, [phase, locale, c]);

  return (
    <div className="insg-aiCard" data-insight-tide-cast-card>
      <p className="insg-aiKicker">{c.kicker}</p>
      <p className="insg-aiHint">{c.hint}</p>
      <button type="button" className="insg-aiBtn" onClick={() => void ask()} disabled={phase === 'loading'} data-insight-tide-cast-button>
        {phase === 'loading' ? c.busy : c.button}
      </button>
      {phase === 'answered' && (
        <div className="insg-aiOutput" aria-live="polite" data-insight-tide-cast-output>
          {badge && <span className="insg-aiBadge" data-insight-tide-cast-badge>{badge}</span>}
          <p className="insg-aiText">{oracle}</p>
        </div>
      )}
      {phase === 'honest' && (
        <div className="insg-aiHonest" role="status" data-insight-tide-cast-honest>
          <p className="insg-aiHonestTitle">{c.honestTitle}</p>
          <p className="insg-aiHonestBody">{c.honestBody}</p>
        </div>
      )}
    </div>
  );
}
