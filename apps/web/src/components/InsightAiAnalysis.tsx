'use client';

import { useCallback, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/**
 * §INSIGHT-3 · 大模型解读——按下按钮，让 `gpt-6.2-sol` 读 aggregate 快照，
 * 给出「现象 → 证据 → 动作」三段式诊断。模型永远看不到个人数据——
 * digest 聚合整数构建，见 @/server/domain/insightAi。
 * provider 不可用 → 诚实状态（不演示分析，§159/§160）。
 */
const COPY: Record<Locale, {
  kicker: string;
  hint: string;
  button: string;
  busy: string;
  badge: (m: string, n: number) => string;
  honestTitle: string;
  honestBody: string;
  tapAgain: string;
}> = {
  zh: {
    kicker: '大模型解读',
    hint: '按钮把 30 天聚合快照交给真实大模型（不出站个人字段），产出「现象 → 证据 → 动作」。provider 不通时下面会如实告诉你。',
    button: '让大模型看看这些数字',
    busy: '模型在读「观察坞」……',
    badge: (m, n) => `${m}${n > 0 ? ` · cached ${n} tokens` : ''}`,
    honestTitle: '模型连不上',
    honestBody: '分析没法假造——等 provider 拨好了再问。',
    tapAgain: '再看一次',
  },
  en: {
    kicker: 'AI-READ-THE-LEDGER · AGGREGATE-ONLY',
    hint: 'A button that hands the last-30-days aggregate snapshot to a real model (no personal fields leave the process); returns “observation → evidence → action”. If the model is down, you will see an honest notice instead.',
    button: 'Let the model read these numbers',
    busy: 'The model is reading the observatory…',
    badge: (m, n) => `${m}${n > 0 ? ` · cached ${n} tokens` : ''}`,
    honestTitle: 'Model unreachable',
    honestBody: 'No fake analysis on this page — try again when the provider is reachable.',
    tapAgain: 'Try again',
  },
};

export function InsightAiAnalysis({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const [phase, setPhase] = useState<'idle' | 'loading' | 'answered' | 'honest'>('idle');
  const [text, setText] = useState('');
  const [badge, setBadge] = useState<string | null>(null);
  const [verified, setVerified] = useState(true);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);

  const ask = useCallback(async () => {
    if (phase === 'loading') return;
    setPhase('loading');
    setBadge(null);
    try {
      const tryOnce = () =>
        fetch('/api/insight/analyze', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({ locale }),
        });
      let resp = await tryOnce();
      if (resp.status >= 500) {
        // §159 诚实边界：provider 上游 5xx 抖动 → 800ms 后重试一次；两次都失败才走 honest。
        await new Promise((r) => setTimeout(r, 800));
        resp = await tryOnce();
        if (resp.status >= 500) {
          setPhase('honest');
          return;
        }
      }
      if (resp.status >= 429) {
        setPhase('honest');
        return;
      }
      const body = (await resp.json()) as { answer?: string; model?: string; cachedTokens?: number; verified?: boolean; verifyNote?: string | null };
      if (!resp.ok || typeof body.answer !== 'string') {
        setPhase('honest');
        return;
      }
      setText(body.answer.trim());
      setBadge(body.model ? c.badge(body.model, body.cachedTokens ?? 0) : null);
      setVerified(body.verified === true);
      setVerifyNote(typeof body.verifyNote === 'string' ? body.verifyNote : null);
      setPhase('answered');
    } catch {
      setPhase('honest');
    }
  }, [locale, phase, c]);

  return (
    <div className="insg-aiCard" data-insight-ai-card>
      <p className="insg-aiKicker">{c.kicker}</p>
      <p className="insg-aiHint">{c.hint}</p>
      <button type="button" className="insg-aiBtn" onClick={() => void ask()} disabled={phase === 'loading'} data-insight-ai-button>
        {phase === 'loading' ? c.busy : phase === 'answered' ? c.tapAgain : c.button}
      </button>

      {phase === 'answered' && (
        <div className="insg-aiOutput" aria-live="polite" data-insight-ai-output>
          {badge && <span className="insg-aiBadge" data-insight-ai-badge>{badge}</span>}
          <p className="insg-aiText">{text}</p>
          <p className="insg-aiHonestBody" data-insight-ai-verified={verified ? 'passed' : 'failed'}>
            {verified
              ? (locale === 'zh' ? '机检通过（现象/证据 + 数字，三段式）' : 'Machine check passed (observation/evidence + digits).')
              : (verifyNote ?? (locale === 'zh' ? '机检未通过' : 'Machine check not passed.'))}
          </p>
        </div>
      )}
      {phase === 'honest' && (
        <div className="insg-aiHonest" role="status" data-insight-ai-honest>
          <p className="insg-aiHonestTitle">{c.honestTitle}</p>
          <p className="insg-aiHonestBody">{c.honestBody}</p>
        </div>
      )}
    </div>
  );
}
