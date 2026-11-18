'use client';

import { useCallback, useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/**
 * §MODERATION-ASSIST · 复核助理——人工裁决前的「AI 帮我读一眼」。
 *   只读、只参考、不裁决、不替你按「放行/拒绝」。失败不冒充、不干扰 ResolveButtons。
 */
const COPY: Record<Locale, {
  idle: string;
  busy: string;
  retry: string;
  kicker: string;
  honestTitle: string;
  honestBody: string;
  badge: (m: string, cached: number, total: number) => string;
}> = {
  zh: {
    kicker: '复核助理 · AI 帮我读一眼',
    idle: '机检已挂、人没下结论之前——先看一段 AI 的「读前摘要」（不替你裁决，不生效）',
    busy: '在读这案子的 findings…',
    retry: '再读一次',
    honestTitle: 'provider 不说话',
    honestBody: '现在没有摘要可看——绝不冒充一条「AI 觉得你该放行/拒绝」。等潮平了再读。',
    badge: (m, cached, total) => cached > 0 ? `${m} · cached ${cached}/${total}` : m,
  },
  en: {
    kicker: 'Review aide · what it sees',
    idle: 'Before any verdict — a short “what to look at” brief from the AI (not a verdict, not binding)',
    busy: 'Reading the findings…',
    retry: 'Read it again',
    honestTitle: 'The provider will not speak',
    honestBody: 'No brief, no verdict — nothing is fabricated in this box. Try again when the water settles.',
    badge: (m, cached, total) => cached > 0 ? `${m} · cached ${cached}/${total}` : m,
  },
};

type State =
  | { phase: 'idle' }
  | { phase: 'busy' }
  | { phase: 'ok'; advice: string; model: string; cached: number; total: number }
  | { phase: 'honest' };

export function ModerationAssist({ caseId, locale }: { caseId: string; locale: Locale }) {
  const c = COPY[locale];
  const [state, setState] = useState<State>({ phase: 'idle' });

  const ask = useCallback(async () => {
    if (state.phase === 'busy') return;
    setState({ phase: 'busy' });
    try {
      const res = await fetch('/api/admin/moderation/assist', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ caseId, locale }),
      });
      if (!res.ok) { setState({ phase: 'honest' }); return; }
      const body = (await res.json()) as { advice?: string; model?: string; cachedTokens?: number; tokensIn?: number };
      if (typeof body.advice !== 'string' || !body.advice.trim()) { setState({ phase: 'honest' }); return; }
      setState({ phase: 'ok', advice: body.advice.trim(), model: body.model ?? '', cached: body.cachedTokens ?? 0, total: body.tokensIn ?? 0 });
    } catch {
      setState({ phase: 'honest' });
    }
  }, [caseId, locale, state.phase]);

  if (state.phase === 'idle') {
    return (
      <div className="moderation-aidr moderation-aidr-idle" data-moderation-assist-idle>
        <div>
          <p className="moderation-aidrKicker">{c.kicker}</p>
          <p className="moderation-aidrHint">{c.idle}</p>
        </div>
        <button type="button" className="moderation-aidrButton" onClick={() => void ask()} data-moderation-assist-button>
          {locale === 'zh' ? 'AI 帮我读一眼' : 'Read it first'}
        </button>
      </div>
    );
  }

  if (state.phase === 'busy') {
    return (
      <div className="moderation-aidr moderation-aidr-busy" data-moderation-assist-busy role="status" aria-live="polite">
        <p className="moderation-aidrKicker">{c.kicker}</p>
        <p className="moderation-aidrHint">{c.busy}</p>
      </div>
    );
  }

  if (state.phase === 'honest') {
    return (
      <div className="moderation-aidr moderation-aidr-honest" role="status" data-moderation-assist-honest>
        <p className="moderation-aidrKicker">{c.kicker}</p>
        <p className="moderation-aidrHonestTitle">{c.honestTitle}</p>
        <p className="moderation-aidrHonestBody">{c.honestBody}</p>
        <button type="button" className="moderation-aidrButton" onClick={() => void ask()} data-moderation-assist-retry>
          {c.retry}
        </button>
      </div>
    );
  }

  return (
    <div className="moderation-aidr moderation-aidr-ok" data-moderation-assist data-moderation-assist-cached={state.cached > 0 ? '1' : '0'}>
      <p className="moderation-aidrKicker">
        {c.kicker}
        {state.model ? <span className="moderation-aidrBadge">{c.badge(state.model, state.cached, state.total)}</span> : null}
      </p>
      <p className="moderation-aidrText">{state.advice}</p>
    </div>
  );
}
