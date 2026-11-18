'use client';

import { useEffect, useState, type ReactElement, type FormEvent } from 'react';
import type { Locale } from '@/lib/i18n';
import { BIBLE_CHAPTERS, BIBLE_ECHOES } from '@/world-bible/generated';

/**
 * §BIBLE-WHISPER 答问者——读者选一卷正典、问一句、按原文出答案。
 *
 * 不说"我能帮你解读"（那是模型的胡说前置）；只说"基于这一卷正典给你答"。
 * 问一次拿一次回答，答案不会被任何一路存回库里——页眉上的"零记忆"不是装饰。
 */

type WhisperFileEntry = {
  slug: string;
  titleZh: string;
  titleEn: string;
  order: number;
};

const COPY = {
  zh: {
    kicker: '§BIBLE-WHISPER · 答问者',
    title: '答问者 · 问点书里的事',
    lede: '挑一卷正典、问一句话。典籍里有写的就照它写；没写的就直说"典籍里没写"——AI 不替史官补刀。问完清空，没有什么对话记忆。',
    fileLabel: '选一卷正典',
    questionLabel: '你的一句话',
    placeholder: '比如：第八盏灯为什么不熄？',
    send: '寄出一问',
    sending: '正典翻卷中……',
    answerLabel: '典籍的回声（读并看原文）',
    emptyQuestion: '先问一句再按',
    demoMode: '当前为 DEMO MODE：需要接上真 provider 才会有真回答；没有也不装作答了。',
    errorHint: '回声断了——再试一次。',
    newChat: '换一个问题',
    clearEverything: '清空',
    rateLimit: '问太频繁了——歇十分钟。',
  },
  en: {
    kicker: '§BIBLE-WHISPER · Ask the canon',
    title: 'The Answerer · Ask the book',
    lede: 'Pick a chapter/echo, ask one line. If the canon says it, it answers. If not, it says so — the AI does not invent the historian’s voice. No chat memory, no persistence, no leak to anyone else.',
    fileLabel: 'Pick a tome',
    questionLabel: 'One sentence',
    placeholder: 'e.g. why does the Eighth Lamp keep burning?',
    send: 'Ask',
    sending: 'The canon is turning the page…',
    answerLabel: 'The reply (this is what the canon says)',
    emptyQuestion: 'Write a question first.',
    demoMode: 'Demo mode — the answerer needs a real provider to answer truthfully; otherwise nothing is generated.',
    errorHint: 'The whisper broke — try again.',
    newChat: 'Another question',
    clearEverything: 'Clear',
    rateLimit: 'Too many questions — wait ten minutes.',
  },
} as const;

export default function BibleWhisperClient({ locale = 'zh' }: { locale?: Locale }): ReactElement {
  const c = COPY[locale];
  const [slug, setSlug] = useState<string>(BIBLE_CHAPTERS[3]?.slug ?? BIBLE_CHAPTERS[0]!.slug);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const files: readonly WhisperFileEntry[] = [
    ...BIBLE_CHAPTERS.map((c2) => ({ slug: c2.slug, titleZh: c2.titleZh, titleEn: c2.titleEn, order: c2.order })),
    ...BIBLE_ECHOES.map((c2) => ({ slug: c2.slug, titleZh: c2.titleZh, titleEn: c2.titleEn, order: c2.order })),
  ];

  const submission = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setAnswer('');
    try {
      const tryOnce = () =>
        fetch('/api/bible/whisper', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slug, question: question.trim(), locale }),
        });
      let res = await tryOnce();
      if (res.status >= 500) {
        // §159 诚实边界：provider 上游 5xx 抖动 → 800ms 后重试一次；两次都失败才进入错误态。
        await new Promise((r) => setTimeout(r, 800));
        res = await tryOnce();
      }
      const payload = (await res.json()) as { answer?: string; message?: string };
      if (!res.ok) {
        setError(payload.message ?? 'The canon did not answer.');
        return;
      }
      setAnswer(payload.answer ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 只选一个默认 tome，方便用户开口问
    if (!slug && files[0]) setSlug(files[0].slug);
  }, []);

  return (
    <section className="adm-shellXl" data-whisper-root>
      <header className="be-shellHead">
        <p className="wv-kicker">{c.kicker}</p>
        <h1 className="wv-title">{c.title}</h1>
        <p className="wv-lede">{c.lede}</p>
      </header>

      <form className="wx-form" onSubmit={(event) => { void submission(event); }} data-whisper-form>
        <label className="wx-label">
          <span className="wx-labelText">{c.fileLabel}</span>
          <select
            className="wx-select"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            data-whisper-file-select
          >
            {files.map((f) => (
              <option key={f.slug} value={f.slug}>
                {locale === 'en' ? f.titleEn : f.titleZh} · {String(f.order).padStart(2, '0')}
              </option>
            ))}
          </select>
        </label>

        <label className="wx-label">
          <span className="wx-labelText">{c.questionLabel}</span>
          <textarea
            className="wx-textarea"
            rows={3}
            maxLength={500}
            placeholder={c.placeholder}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            data-whisper-question
          />
        </label>

        <div className="wx-actions">
          <button
            type="submit"
            className="wv-cta"
            data-whisper-send
            disabled={loading || !question.trim()}
          >
            {loading ? c.sending : c.send}
          </button>
          {question ? (
            <button
              type="button"
              className="wx-clear"
              onClick={() => { setQuestion(''); setAnswer(''); setError(null); }}
              data-whisper-clear
            >
              {c.clearEverything}
            </button>
          ) : null}
        </div>
      </form>

      {error ? (
        <p className="wx-error" role="alert" data-whisper-error>{error}</p>
      ) : null}

      {answer ? (
        <article className="wx-answer" data-whisper-answer>
          <h2 className="wx-answerTitle">{c.answerLabel}</h2>
          <p className="wx-answerText">{answer}</p>
        </article>
      ) : null}
    </section>
  );
}
