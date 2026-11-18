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
}> = {
  zh: {
    kicker: '问典 · The Tidal Inquiry',
    title: '问潮问问 · 向《低语诸王》提问',
    lede: '正典（13 章）+ 回响（131 篇）都在桌上——用中文或英文问，任何问题；问典只答潮候院范围内的事。',
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
  },
  en: {
    kicker: 'The Tidal Inquiry',
    title: 'Ask the Canon · Ask the Tides',
    lede: 'The canon (13 chapters) and every echo (131 pieces) sit on the same table — question away, in Chinese or in English. The Inquiry stays inside the Institute.',
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
  },
};

type Phase = 'idle' | 'loading' | 'answered' | 'honest';

export function BibleAsk({ locale = 'zh', initialQuestion }: { locale?: Locale; initialQuestion?: string }) {
  const c = COPY[locale];
  const [question, setQuestion] = useState(initialQuestion ?? '');
  const [answer, setAnswer] = useState('');
  const [badge, setBadge] = useState<{ model: string; cachedTokens: number } | null>(null);
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
      };
      if (!resp.ok || typeof body.answer !== 'string') {
        setPhase('honest');
        return;
      }
      setAnswer(body.answer.trim());
      setBadge({ model: body.model ?? 'gpt-6.1-terra', cachedTokens: body.cachedTokens ?? 0 });
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
