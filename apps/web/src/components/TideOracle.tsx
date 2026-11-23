'use client';

import { useCallback, useMemo, useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §TIDE-ORACLE · 潮语 · 潮汐预言——向潮问一个问题，它从正典里读两句潮语给你。
 * 它从不预言、不替你拿主意、不编造正典没有的东西；它只看见，然后把看见说两句。
 * 真实 provider · 稳定 canon 前缀 KV 缓存 · 一次调用 · 不写库。
 */
const COPY: Record<Locale, {
  kicker: string;
  title: string;
  lede: string;
  examplesHeading: string;
  examples: readonly string[];
  placeholder: string;
  submit: string;
  busy: string;
  badge: (m: string, cached: number, total: number) => string;
  honestTitle: string;
  honestBody: string;
  locked: string;
  counter: (n: number, max: number) => string;
  foot: string;
  citeLabel: { cited: (n: number) => string; declined: string; notCited: string };
}> = {
  zh: {
    kicker: '潮语',
    title: '向潮问一句话',
    lede: '潮不知道你是谁，也不预言将来——它从《低语诸王》世界大典里读一遍，只说它看见的生活面。你问的是灰封之后、第四十三次大会、灰炉为什么还热——凡正典里有的，它都答；正典里没有的，它一句也不编。',
    examplesHeading: '几句有人真问过的话',
    examples: ['灰封之后发生了什么？', '灰炉为什么热？', '灰封的半粒盐落在哪里？', '第四十一次大会发生了什么？'],
    placeholder: '向潮说点什么…（200 字以内）',
    submit: '问潮',
    busy: '潮在听…',
    badge: (m, cached, total) => cached > 0 ? `${m} · cached ${cached}/${total}` : m,
    honestTitle: '潮退了',
    honestBody: '模型现在不肯说话——这不是潮语。等潮再平一点，再来问。',
    locked: '这片水面未到你眼前——先去 /insight 解锁（口令 123），再回来问。',
    counter: (n, max) => `${n} / ${max}`,
    foot: '潮语只是潮的回声：它不预言、不投资建议、不替你拿主意；它不隐瞒自己的来路——每次都走真实模型，从不编造。',
    citeLabel: { cited: (n) => `引经据典 · 正典锚句逐字对齐 ✓（${n} 条）`, declined: '正典没写 · 潮如实给出没有的答复', notCited: '自由作答 · 未逐字引典' },
  },
  en: {
    kicker: 'THE TIDE ORACLE',
    title: 'Ask the tide one thing',
    lede: 'The tide does not know who you are and does not foresee the future — it reads the World Bible of «The Whispers’ Kings» and says only what it sees on the surface. Ask about the grey binding, the forty-third Convocation, the grey hearth — whatever the canon holds, it answers; anything the canon does not hold, it will not invent.',
    examplesHeading: 'Things people have genuinely asked',
    examples: ['What happened after the grey binding?', 'Why was the hearth still warm?', 'Where did the half-grain of salt land?', 'What happened at the forty-first Convocation?'],
    placeholder: 'Say something to the tide… (under 200 characters)',
    submit: 'Ask the tide',
    busy: 'The tide is listening…',
    badge: (m, cached, total) => cached > 0 ? `${m} · cached ${cached}/${total}` : m,
    honestTitle: 'The tide withdrew',
    honestBody: 'The model has no voice right now — this is not the tide’s answer. Come back when the water settles.',
    locked: 'This water has not reached you — unlock /insight (passphrase 123) and return.',
    counter: (n, max) => `${n} / ${max}`,
    foot: 'Tide words are tide echoes: no prophecy, no investment advice, no decisions made for you — and never fabricated noise: every reading walks the real model.',
    citeLabel: { cited: (n) => `Quoting the canon verbatim ✓ (${n})`, declined: 'Not in the canon — the tide says so honestly', notCited: 'Free answer — no verbatim anchor from the canon' },
  },
};

const MAX_QUESTION = 200;

export function TideOracle({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const [question, setQuestion] = useState('');
  const [phase, setPhase] = useState<'idle' | 'loading' | 'answered' | 'honest' | 'locked'>('idle');
  const [answer, setAnswer] = useState('');
  const [badge, setBadge] = useState<string | null>(null);
  const [cite, setCite] = useState<{ state: 'cited' | 'declined' | 'not-cited'; anchorsCited?: number } | null>(null);

  const canSubmit = useMemo(() => question.trim().length > 0 && question.trim().length <= MAX_QUESTION && phase !== 'loading', [question, phase]);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (!q || phase === 'loading') return;
    setPhase('loading');
    setAnswer('');
    setBadge(null);
    setCite(null);
    try {
      const tryOnce = () =>
        fetch('/api/tide/oracle', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({ question: q, locale }),
        });
      let resp = await tryOnce();
      if (resp.status >= 500) {
        // §159 诚实边界：provider 上游 5xx 抖动 → 800ms 后重试一次；两次都失败才走 honest。
        await new Promise((r) => setTimeout(r, 800));
        resp = await tryOnce();
        if (resp.status >= 500) { setPhase('honest'); return; }
      }
      if (resp.status === 403) { setPhase('locked'); return; }
      if (resp.status >= 429) { setPhase('honest'); return; }
      const body = await resp.json() as { answer?: string; model?: string; cachedTokens?: number; tokensIn?: number; citation?: { state?: string; anchorsCited?: number } };
      if (!resp.ok || typeof body.answer !== 'string') { setPhase('honest'); return; }
      const citState = body.citation?.state;
      setCite((citState === 'cited' || citState === 'declined' || citState === 'not-cited')
        ? { state: citState as 'cited' | 'declined' | 'not-cited', anchorsCited: body.citation?.anchorsCited }
        : null);
      setAnswer(body.answer.trim());
      setBadge(body.model ? c.badge(body.model, body.cachedTokens ?? 0, body.tokensIn ?? 0) : null);
      setPhase('answered');
    } catch {
      setPhase('honest');
    }
  }, [phase, question, locale, c]);

  return (
    <section className="tide-oracle" aria-label={c.kicker} data-tide-oracle>
      <p className="tide-oracleKicker">{c.kicker}</p>
      <h1 className="tide-oracleTitle">{c.title}</h1>
      <p className="tide-oracleLede">{c.lede}</p>

      <ul className="tide-oracleExamples" aria-label={c.examplesHeading}>
        {c.examples.map((ex) => (
          <li key={ex}>
            <button type="button" className="tide-oracleExample" onClick={() => setQuestion(ex.slice(0, MAX_QUESTION))} data-tide-oracle-example>
              {ex}
            </button>
          </li>
        ))}
      </ul>

      <form
        className="tide-oracleForm"
        onSubmit={(event) => { event.preventDefault(); void ask(); }}
        data-tide-oracle-form
      >
        <textarea
          className="tide-oracleInput"
          name="question"
          aria-label={c.placeholder}
          placeholder={c.placeholder}
          value={question}
          maxLength={MAX_QUESTION}
          rows={2}
          onChange={(event) => setQuestion(event.target.value)}
          data-tide-oracle-input
        />
        <div className="tide-oracleMeta">
          <span className="tide-oracleCounter" aria-hidden="true">{c.counter(question.trim().length, MAX_QUESTION)}</span>
          <button type="submit" className="tide-oracleButton" disabled={!canSubmit} data-tide-oracle-submit>
            {phase === 'loading' ? c.busy : c.submit}
          </button>
        </div>
      </form>

      {phase === 'answered' && (
        <div className="tide-oracleOutput" aria-live="polite" data-tide-oracle-output>
          {badge && <span className="tide-oracleBadge" data-tide-oracle-badge>{badge}</span>}
          {cite && (
            <p className="tide-oracleCite" data-tide-oracle-cite={cite.state}>
              {cite.state === 'cited' ? c.citeLabel.cited(cite.anchorsCited ?? 1) : cite.state === 'declined' ? c.citeLabel.declined : c.citeLabel.notCited}
            </p>
          )}
          <blockquote className="tide-oracleLine">{answer}</blockquote>
        </div>
      )}
      {phase === 'locked' && (
        <p className="tide-oracleLocked" data-tide-oracle-locked>
          {c.locked} <a href="/insight">/insight</a>
        </p>
      )}
      {phase === 'honest' && (
        <div className="tide-oracleHonest" role="status" data-tide-oracle-honest>
          <p className="tide-oracleHonestTitle">{c.honestTitle}</p>
          <p className="tide-oracleHonestBody">{c.honestBody}</p>
        </div>
      )}
      <p className="tide-oracleFoot">{c.foot}</p>
    </section>
  );
}
