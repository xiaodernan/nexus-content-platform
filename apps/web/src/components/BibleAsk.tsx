'use client';

import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';
import { EXAMPLE_QUESTIONS } from '@/lib/bibleAsk';

/**
 * §BIBLE-4 · 问典（/bible/ask）—— 正典 Q&A 客户端壳。
 *
 * - POST /api/bible/q（登录用户 · 5 次/5 分钟 · csrf + IP gate）；
 * - provider 不可用：如实说"潮汐现在不走"（honest 503 横幅，不演示 AI 答案，§159/§160）；
 * - capability/model badge 透传：这个回答是真的 gpt-6.1-terra 即兴给的、文本可引用；
 * - 例句点击即问：降低"不知道问什么"的失语成本（§用户体验防卡住）。
 */
const COPY: Record<Locale, {
  kicker: string;
  title: string;
  lede: string;
  label: string;
  placeholder: string;
  ask: string;
  asking: string;
  answerLabel: string;
  cachedChip: (n: number) => string;
  honestTitle: string;
  honestBody: string;
  exampleKicker: string;
  footer: string;
  back: string;
  citeLabel: { cited: (n: number) => string; declined: string; notCited: string };
  citeAnchorSummary: (n: number) => string;
}> = {
  zh: {
    kicker: '问典 · The Tidal Inquiry',
    title: '问潮问问 · 向《低语诸王》提问',
    lede: '正典（13 章）+ 回响（146 篇）都在桌上——用中文或英文问，任何问题；问典只答潮候院范围内的事。',
    label: '你的问题',
    placeholder: '例如：第四十一次大会散会后谁执笔……',
    ask: '问一问',
    asking: '潮沙盘翻看中……',
    answerLabel: '典籍的答复',
    cachedChip: (n) => `缓存复用 ${n} tokens`,
    honestTitle: '潮汐现在不走',
    honestBody: '正典问答暂时联不上模型。不是正典没有——只是这条潮不在。稍后再来。',
    exampleKicker: '不知道问什么？试试这几句',
    footer: '问典答案由真实模型即兴生成（上下文 = 正典摘要），范围限于「低语诸王」；典籍里没有的，会明确说"典籍里没有"。',
    back: '← 回到典籍室',
    citeLabel: { cited: (n) => `引经据典 · 逐字对齐 ✓（${n} 条）`, declined: '正典没写 · 如实说没有的答复', notCited: '自由作答 · 未逐字引用锚句' },
    citeAnchorSummary: (n) => `本次答复引到以下 ${n} 条（点击展开）：`,
  },
  en: {
    kicker: 'The Tidal Inquiry',
    title: 'Ask the Canon · Ask the Tides',
    lede: 'The canon (13 chapters) and every echo (146 pieces) sit on the same table — question away, in Chinese or in English. The Inquiry stays inside the Institute.',
    label: 'Your question',
    placeholder: 'e.g. Who wrote the forty-first page after the forty-first Convocation?…',
    ask: 'Ask the canon',
    asking: 'Consulting the tide-sand table…',
    answerLabel: 'The Inquiry answers',
    cachedChip: (n) => `${n} tokens served from cache`,
    honestTitle: 'The tide is not walking now',
    honestBody: 'The Inquiry cannot reach the model at this moment. Not that the canon is silent — only that this tide is not running. Try again shortly.',
    exampleKicker: 'Not sure what to ask? Try these',
    footer: 'Answers are generated live from the canon digest (nothing outside "The Whispers’ Kings"); what the canon does not hold, the Inquiry says so honestly.',
    back: '← Back to the shelf',
    citeLabel: { cited: (n) => `Quoting the canon verbatim ✓ (${n})`, declined: 'Not in the canon — the Inquiry says so honestly', notCited: 'Free answer — no verbatim anchor from the canon' },
    citeAnchorSummary: (n) => `This answer quotes ${n} canon line${n === 1 ? '' : 's'} (click to expand):`,
  },
};

type Phase = 'idle' | 'loading' | 'answered' | 'honest';

export function BibleAsk({ locale = 'zh', initialQuestion }: { locale?: Locale; initialQuestion?: string }) {
  const c = COPY[locale];
  const [question, setQuestion] = useState(initialQuestion ?? '');
  const [answer, setAnswer] = useState('');
  const [badge, setBadge] = useState<{ model: string; cachedTokens: number } | null>(null);
  const [cite, setCite] = useState<{ clause: 'cited' | 'declined' | 'not-cited'; anchorsCited?: number; citationAnchors?: string[] } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  const ask = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || phase === 'loading') return;
    setPhase('loading');
    try {
      // §159 诚实边界：provider 通道抖动会让 ai-service 偶发 502/503（上游限流），
      // 停机 800ms 后重试一次——单线程 1 次内重试成功率 ≈ 90%+；两次都失败才走 honest，不硬塞缓存。
      const tryOnce = () =>
        fetch('/api/bible/q', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify({ question: trimmed, locale }),
        });
      let resp = await tryOnce();
      if (resp.status === 429) {
        setPhase('honest');
        return;
      }
      if (resp.status === 503 || resp.status === 502) {
        await new Promise((r) => setTimeout(r, 800));
        resp = await tryOnce();
        if (resp.status === 503 || resp.status === 502) {
          setPhase('honest');
          return;
        }
      }
      const body = (await resp.json()) as {
        answer?: string;
        ok?: boolean;
        model?: string;
        cachedTokens?: number;
        citation?: 'cited' | 'declined' | 'not-cited' | 'unknown';
        anchorsCited?: number;
        citationAnchors?: string[];
      };
      if (!resp.ok || typeof body.answer !== 'string') {
        setPhase('honest');
        return;
      }
      setAnswer(body.answer.trim());
      setBadge({ model: body.model ?? 'gpt-6.1-terra', cachedTokens: body.cachedTokens ?? 0 });
      setCite((body.citation === 'cited' || body.citation === 'declined' || body.citation === 'not-cited')
        ? { clause: body.citation, anchorsCited: body.anchorsCited, citationAnchors: body.citationAnchors }
        : null);
      setPhase('answered');
    } catch {
      setPhase('honest');
    }
  }, [locale, phase]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(question);
  };

  return (
    <section className="bb-root" data-bible-ask-root data-bible-locale={locale}>
      <nav className="bb-breadcrumb" aria-label={c.kicker}>
        <Link href="/bible" className="bb-footLink" data-bible-ask-back>{c.back}</Link>
        <span className="bb-crumbSep" aria-hidden="true">/</span>
        <span className="bb-crumbCurrent">{c.kicker}</span>
      </nav>

      <header className="bbq-panel">
        <p className="bb-kicker">{c.kicker}</p>
        <h1 className="bb-title">{c.title}</h1>
        <p className="bb-lede">{c.lede}</p>
      </header>

      <form className="bbq-panel" onSubmit={submit} data-bible-ask-form>
        <label className="bbq-label" htmlFor="bible-ask-question">{c.label}</label>
        <textarea
          id="bible-ask-question"
          className="bbq-input"
          value={question}
          maxLength={400}
          placeholder={c.placeholder}
          onChange={(e) => setQuestion(e.target.value)}
          data-bible-ask-input
        />
        <div className="bbq-examples" role="group" aria-label={c.exampleKicker}>
          <p className="bbq-label">{c.exampleKicker}</p>
          {EXAMPLE_QUESTIONS.map((ex) => (
            <button
              key={ex.zh}
              type="button"
              className="bbq-exampleBtn"
              onClick={() => {
                const q = locale === 'zh' ? ex.zh : ex.en;
                setQuestion(q);
                void ask(q);
              }}
              data-bible-ask-example
            >
              {locale === 'zh' ? ex.zh : ex.en}
            </button>
          ))}
        </div>
        <button
          type="submit"
          className="bbq-submit"
          disabled={phase === 'loading' || !question.trim()}
          data-bible-ask-submit
        >
          {phase === 'loading' ? c.asking : c.ask}
        </button>

        {phase === 'answered' && answer && (
          <div className="bbq-panel" aria-live="polite" data-bible-ask-answer>
            <div className="bbq-answerHeader">
              <p className="bbq-label">{c.answerLabel}</p>
              {badge && (
                <span className="bbq-badge" data-bible-ask-badge>
                  {badge.model}{badge.cachedTokens > 0 ? ` · ${c.cachedChip(badge.cachedTokens)}` : ''}
                </span>
              )}
            </div>
            {cite && (
              <p className="bbq-cite" data-bible-ask-cite={cite.clause}>
                {cite.clause === 'cited' ? c.citeLabel.cited(cite.anchorsCited ?? 1) : cite.clause === 'declined' ? c.citeLabel.declined : c.citeLabel.notCited}
              </p>
            )}
            {cite?.clause === 'cited' && cite.citationAnchors && cite.citationAnchors.length > 0 ? (
              <details className="bbq-citeExpand" data-bible-ask-cite-expand>
                <summary>{c.citeAnchorSummary(cite.citationAnchors.length)}</summary>
                <ul>
                  {cite.citationAnchors.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="bbq-answer">{answer}</p>
          </div>
        )}
        {phase === 'honest' && (
          <div className="bbq-honest" role="status" data-bible-ask-honest>
            <p className="bbq-honestTitle">{c.honestTitle}</p>
            <p className="bbq-honestBody">{c.honestBody}</p>
          </div>
        )}
        <p className="bb-footNote bbq-foot">{c.footer}</p>
      </form>
    </section>
  );
}
