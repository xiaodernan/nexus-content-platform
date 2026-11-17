'use client';

import { useCallback, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/**
 * §169-AI · 创作者数据「大模型解读」——按钮，把这一项目的 §168 真数字整成 digest，
 * 给出「现象 → 证据 → 动作」三段式诊断（真实 provider；模型不认识其他用户，Digest 里也没有别人）。
 * provider 不可用 → 诚实横幅，不伪造。
 */
const COPY: Record<Locale, {
  kicker: string;
  hint: string;
  button: string;
  busy: string;
  badge: (m: string, n: number) => string;
  honestTitle: string;
  honestBody: string;
  tryAgain: string;
}> = {
  zh: {
    kicker: '大模型解读 · 让它读你的数据',
    hint: '不出站个人字段——digest 只含这一版作品的 168 口径数字与规则结论。输出：现象 → 证据 → 一个今天就能做的动作。',
    button: '让大模型看看我的数据',
    busy: '模型在读这一屏的数字……',
    badge: (m, n) => `${m}${n > 0 ? ` · cached ${n} tokens` : ''}`,
    honestTitle: '模型连不上',
    honestBody: '解读没法假造——稍后再来。',
    tryAgain: '再问一次',
  },
  en: {
    kicker: 'AI-READS-YOUR-LEDGER',
    hint: 'No personal fields leave the process — the digest is this one version’s own numbers + rule conclusions. Output: observation → evidence → one action you can take today.',
    button: 'Let the model read my stats',
    busy: 'The model is reading this ledger…',
    badge: (m, n) => `${m}${n > 0 ? ` · cached ${n} tokens` : ''}`,
    honestTitle: 'Model unreachable',
    honestBody: 'No fake analysis here — try again when the provider is up.',
    tryAgain: 'Ask again',
  },
};

export function AnalyticsAiNarrator({ projectId, locale = 'zh' }: { projectId: string; locale?: Locale }) {
  const c = COPY[locale];
  const [phase, setPhase] = useState<'idle' | 'loading' | 'answered' | 'honest'>('idle');
  const [text, setText] = useState('');
  const [badge, setBadge] = useState<string | null>(null);

  const ask = useCallback(async () => {
    if (phase === 'loading') return;
    setPhase('loading');
    setBadge(null);
    try {
      const resp = await fetch('/api/analytics/agent-narrate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ projectId, locale }),
      });
      if (resp.status >= 429 || resp.status >= 500) {
        setPhase('honest');
        return;
      }
      const body = (await resp.json()) as { answer?: string; model?: string; cachedTokens?: number };
      if (!resp.ok || typeof body.answer !== 'string') {
        setPhase('honest');
        return;
      }
      setText(body.answer.trim());
      setBadge(body.model ? c.badge(body.model, body.cachedTokens ?? 0) : null);
      setPhase('answered');
    } catch {
      setPhase('honest');
    }
  }, [projectId, locale, phase, c]);

  return (
    <div className="an-aiNarrator" data-analytics-ai-narrator>
      <p className="an-aiKicker">{c.kicker}</p>
      <p className="an-aiHint">{c.hint}</p>
      <button type="button" className="an-aiBtn" onClick={() => void ask()} disabled={phase === 'loading'} data-analytics-ai-button>
        {phase === 'loading' ? c.busy : phase === 'answered' ? c.tryAgain : c.button}
      </button>
      {phase === 'answered' && (
        <div className="an-aiOutput" aria-live="polite" data-analytics-ai-output>
          {badge && <span className="an-aiBadge" data-analytics-ai-badge>{badge}</span>}
          <p className="an-aiText">{text}</p>
        </div>
      )}
      {phase === 'honest' && (
        <div className="an-aiHonest" role="status" data-analytics-ai-honest>
          <p className="an-aiHonestTitle">{c.honestTitle}</p>
          <p className="an-aiHonestBody">{c.honestBody}</p>
        </div>
      )}
    </div>
  );
}
