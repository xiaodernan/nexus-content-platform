'use client';

import { useCallback, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §GAME-TIDE-WITNESS · 潮汐见证——
 * 典籍室门口坐着的那位只说本章有的话。一次询问（限 123 解锁的观察坞）== 真 LLM 一次判据，
 * 不编造也不补戏：典抄没写的他一个字也说不出口（见 buildWitnessPrompt）。
 *
 * 典型实测：第二次及以上的询问 provider 前缀缓存可稳定命中（~99% cachedTokens）——
 * 系统 prompt 是 buildWitnessPrompt(file, locale) 的逐字节稳定产物，
 * 这是 §CACHE-4 / codex 前缀路线的另一处落地，不是凑数。
 */
const COPY: Record<Locale, {
  kicker: string;
  hint: string;
  locked: string;
  cta: string;
  busy: string;
  badge: (m: string, cached: number, total: number) => string;
  honestTitle: string;
  honestBody: string;
  orderLabel: (n: number) => string;
}> = {
  zh: {
    kicker: '潮汐见证',
    hint: '本章的旁证：口令 123 解锁后，那位坐在典籍室门口的人会说一句只会引自本章的话——正典没写的，他一个字也说不出来。',
    locked: '这片潮还没到你眼前——先去开 /insight（口令 123）再来',
    cta: '潮给原典作证',
    busy: '他在翻第几卷……',
    badge: (m, cached, total) => cached > 0 ? `${m} · cached ${cached}/${total} tokens` : m,
    honestTitle: '潮时没对上',
    honestBody: '模型现在不肯说话——没有代替他开口。等潮再平一点，他自己会答。',
    orderLabel: (n) => `第 ${n} 章`,
  },
  en: {
    kicker: 'THE TIDE-EYE WITNESS',
    hint: 'A witness for this chapter: unlock /insight (passphrase 123) and the figure at the door of the copying hall will speak one sentence — only from what the canon already holds. He cannot invent.',
    locked: 'The tide is not yours yet — unlock /insight (passphrase 123) and return.',
    cta: 'Ask the witness',
    busy: 'He is turning the pages…',
    badge: (m, cached, total) => cached > 0 ? `${m} · cached ${cached}/${total} tokens` : m,
    honestTitle: 'The tide mis-timed',
    honestBody: 'The model will not speak now — no fabricated witness. When the water settles, he will.',
    orderLabel: (n) => `Chapter ${n}`,
  },
};

export function TideWitness({ slug, locale, order }: { slug: string; locale: Locale; order: number }) {
  const c = COPY[locale];
  const [phase, setPhase] = useState<'idle' | 'loading' | 'answered' | 'honest' | 'locked'>('idle');
  const [text, setText] = useState('');
  const [meta, setMeta] = useState<{ model?: string; cached?: number; total?: number } | null>(null);
  const [orderHint] = useState(order);

  const ask = useCallback(async () => {
    if (phase === 'loading') return;
    setPhase('loading');
    try {
      const resp = await fetch('/api/game/witness', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ slug, locale }),
      });
      if (resp.status === 403) { setPhase('locked'); return; }
      if (resp.status >= 429 || resp.status >= 500) { setPhase('honest'); return; }
      const body = await resp.json() as { text?: string; model?: string; cachedTokens?: number; tokensIn?: number };
      if (!resp.ok || typeof body.text !== 'string') { setPhase('honest'); return; }
      setText(body.text.trim());
      setMeta({ model: body.model, cached: body.cachedTokens ?? 0, total: body.tokensIn ?? 0 });
      setPhase('answered');
    } catch {
      setPhase('honest');
    }
  }, [phase, slug, locale]);

  return (
    <section className="tide-witness" aria-label={c.kicker} data-tide-witness aria-live="polite">
      <p className="tide-witnessKicker">{c.kicker}</p>
      <p className="tide-witnessLedgerOrder" data-tide-witness-order>{c.orderLabel(orderHint)}</p>
      <p className="tide-witnessHint">{c.hint}</p>

      {phase !== 'answered' && (
        <button
          type="button"
          className="tide-witnessButton"
          disabled={phase === 'loading'}
          onClick={() => void ask()}
          data-tide-witness-button
        >
          {phase === 'loading' ? c.busy : c.cta}
        </button>
      )}

      {phase === 'answered' && (
        <div className="tide-witnessOutput" data-tide-witness-output>
          {meta?.model && (
            <span className="tide-witnessBadge" data-tide-witness-badge>
              {c.badge(meta.model, meta.cached ?? 0, meta.total ?? 0)}
            </span>
          )}
          <blockquote className="tide-witnessLine">{text}</blockquote>
        </div>
      )}
      {phase === 'locked' && <p className="tide-witnessLocked" data-tide-witness-locked>{c.locked}</p>}
      {phase === 'honest' && (
        <div className="tide-witnessHonest" role="status" data-tide-witness-honest>
          <p className="tide-witnessHonestTitle">{c.honestTitle}</p>
          <p className="tide-witnessHonestBody">{c.honestBody}</p>
        </div>
      )}
    </section>
  );
}
