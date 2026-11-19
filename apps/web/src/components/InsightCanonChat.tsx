'use client';

import { useCallback, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §INSIGHT-4 · 正典深问——观察坞里的「问典」直通通道。
 * 与 /api/insight/chat 对应：system 前缀 = 世界大典 digest（≈15 万 tokens，字节恒定），
 * 多轮 / 多人共享同一份 provider 前缀缓存。模型能看到的只有正典 + 你这句问题。
 * provider 不可达时如实告知，不编造（§159/§160）。
 */
const COPY: Record<Locale, {
  kicker: string;
  hint: string;
  placeholder: string;
  button: string;
  busy: string;
  badge: (m: string, cached: number, total: number) => string;
  honestTitle: string;
  honestBody: string;
  tapAgain: string;
}> = {
  zh: {
    kicker: '正典深问 · CANON DEEP-ASK',
    hint: '整部《低语诸王》世界大典作为字节级稳定的系统前缀随每次提问发送（≈15 万 tokens · 13 章 + 158 回响 + 4 annex，多轮多人共享同一份 KV 缓存，不丢不换；16 路并发实测 16/16 全额命中）。模型只认典籍，典籍里没有的就直说，不编。',
    placeholder: '问一个典籍里的问题：比如「《收件人》里谁签收了那张单？」',
    button: '问典籍',
    busy: '潮汐在读典籍…',
    badge: (m, cached, total) => (cached > 0 ? `${m} · cached ${cached}/${total} tokens` : m),
    honestTitle: '潮汐现在不走',
    honestBody: '模型通道没拨通——不是你的错，也不是我回答不了，是 provider 这会儿不通。稍后再来。',
    tapAgain: '再问一次',
  },
  en: {
    kicker: 'CANON DEEP-ASK',
    hint: 'The full Tide-Conclave canon ships as a byte-stable system prefix with every question (≈150k tokens: 13 chapters + 158 echoes + 4 appendices; many rounds and many readers share the same KV cache; 16/16 full hits under a 16-way burst). The model answers strictly from the ledger and says "not in the canon" when it is not there.',
    placeholder: 'Ask something from the ledger — e.g. “Who signed the receipt in The Addressee?”',
    button: 'Ask the ledger',
    busy: 'The tide is reading…',
    badge: (m, cached, total) => (cached > 0 ? `${m} · cached ${cached}/${total} tokens` : m),
    honestTitle: 'The tide is out',
    honestBody: 'The model channel is unreachable — not a bug on your side. Try again later.',
    tapAgain: 'Ask again',
  },
};

export function InsightCanonChat({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const [question, setQuestion] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'answered' | 'honest'>('idle');
  const [answer, setAnswer] = useState('');
  const [badge, setBadge] = useState<string | null>(null);

  const ask = useCallback(async () => {
    if (phase === 'loading') return;
    const q = question.trim();
    if (q.length < 2) return;
    setPhase('loading');
    setBadge(null);
    try {
      const tryOnce = () =>
        fetch('/api/insight/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({ question: q, locale }),
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
      const body = (await resp.json()) as {
        answer?: string; model?: string; cachedTokens?: number; tokensIn?: number;
      };
      if (!resp.ok || typeof body.answer !== 'string') {
        setPhase('honest');
        return;
      }
      setAnswer(body.answer.trim());
      setBadge(body.model ? c.badge(body.model, body.cachedTokens ?? 0, body.tokensIn ?? 0) : null);
      setPhase('answered');
    } catch {
      setPhase('honest');
    }
  }, [phase, question, locale, c]);

  return (
    <div className="insg-aiCard insg-aiConsole" data-insight-chat-card>
      <p className="insg-aiKicker">{c.kicker}</p>
      <p className="insg-aiHint">{c.hint}</p>
      <textarea
        className="insg-aiConsoleInput"
        data-insight-chat-input
        rows={3}
        maxLength={400}
        placeholder={c.placeholder}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        aria-label={c.kicker}
      />
      <button
        type="button"
        className="insg-aiBtn"
        onClick={() => void ask()}
        disabled={phase === 'loading' || question.trim().length < 2}
        data-insight-chat-button
      >
        {phase === 'loading' ? c.busy : phase === 'answered' ? c.tapAgain : c.button}
      </button>

      {phase === 'answered' && (
        <div className="insg-aiOutput" aria-live="polite" data-insight-chat-output>
          {badge && <span className="insg-aiBadge" data-insight-chat-badge>{badge}</span>}
          <p className="insg-aiText">{answer}</p>
        </div>
      )}
      {phase === 'honest' && (
        <div className="insg-aiHonest" role="status" data-insight-chat-honest>
          <p className="insg-aiHonestTitle">{c.honestTitle}</p>
          <p className="insg-aiHonestBody">{c.honestBody}</p>
        </div>
      )}
    </div>
  );
}
