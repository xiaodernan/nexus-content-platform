'use client';

import { csrfHeaders } from '@/lib/csrf';
import { useState, type ReactElement } from 'react';
import type { Locale } from '@/lib/i18n';

/**
 * §CANON-REVIEW 面板：贴候选 → 真模型评审 → 只读显示。
 *
 * 纪律：本面板不写任何东西——没有"接受/拒绝"按钮，没有自动改写。模型给的是评审文本，
 * 决定权在写作者手里。失败如实显示（401/403/429/503 原样），不包装成"正在思考"。
 */

const COPY = {
  zh: {
    kindLabel: '候选类型',
    kindEcho: '回响（Echo）',
    kindChapter: '章节（Chapter）',
    textLabel: '候选原文（Markdown，含以“锚句”开头的行）',
    placeholder: '把新写的回响整篇贴进来——正文 + 锚句行。评审只读，不会改动它。',
    submit: '交给模型评审',
    submitting: '模型正在对照正典……',
    clear: '清空',
    resultLabel: '评审结果（模型原话）',
    empty: '还没有评审结果。贴一篇候选，按上面的按钮。',
    tooShort: '太短了——至少贴一整段正文（40 字以上）。',
    tooLong: '太长了——单篇候选上限 24,000 字；整卷/整章集合请拆开。',
    rateLimited: '评审太频繁（每次要带全部既有锚句）——歇十分钟再试。',
    denied: '这个操作只对审核员开放。',
    unauthenticated: '需要先登录。',
    failed: '评审没成功——',
    meta: (model: string, cached: number, tokensIn: number) =>
      `模型 ${model} · 输入 ${tokensIn.toLocaleString()} tokens · 命中缓存 ${cached.toLocaleString()}`,
  },
  en: {
    kindLabel: 'Candidate kind',
    kindEcho: 'Echo',
    kindChapter: 'Chapter',
    textLabel: 'Candidate text (Markdown, including a line that starts with the anchor marker)',
    placeholder: 'Paste the whole new echo — body plus its anchor line. Review is read-only; nothing here changes it.',
    submit: 'Send to the model',
    submitting: 'The model is reading it against the canon…',
    clear: 'Clear',
    resultLabel: 'Review (the model’s own words)',
    empty: 'No review yet. Paste a candidate and press the button above.',
    tooShort: 'Too short — paste at least one full paragraph (40+ characters).',
    tooLong: 'Too long — one candidate is capped at 24,000 characters; split whole volumes/collections.',
    rateLimited: 'Too many reviews (each one carries every existing anchor) — wait ten minutes.',
    denied: 'This action is open to reviewers only.',
    unauthenticated: 'You must sign in first.',
    failed: 'The review did not go through —',
    meta: (model: string, cached: number, tokensIn: number) =>
      `model ${model} · ${tokensIn.toLocaleString()} input tokens · ${cached.toLocaleString()} cached`,
  },
} as const;

const MIN_CHARS = 40;
const MAX_CHARS = 24_000;

export function CanonReviewPanel({
  locale,
  panelTitle,
  ariaLabel,
}: {
  locale: Locale;
  panelTitle: string;
  ariaLabel: string;
}): ReactElement {
  const c = COPY[locale];
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'echo' | 'chapter'>('echo');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setError(null);
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      setError(c.tooShort);
      return;
    }
    if (trimmed.length > MAX_CHARS) {
      setError(c.tooLong);
      return;
    }
    setBusy(true);
    setReview(null);
    setMeta(null);
    try {
      const response = await fetch('/api/admin/canon/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ text: trimmed, kind }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        review?: string;
        model?: string;
        usage?: { tokensIn?: number; cachedTokens?: number };
        error?: { code?: string; message?: string };
        message?: string;
      };
      if (!response.ok) {
        if (response.status === 401) setError(c.unauthenticated);
        else if (response.status === 403) setError(c.denied);
        else if (response.status === 429) setError(c.rateLimited);
        else setError(`${c.failed} ${body.message ?? body.error?.message ?? `HTTP ${response.status}`}`);
        return;
      }
      setReview(body.review ?? '');
      if (body.model) {
        setMeta(c.meta(body.model, body.usage?.cachedTokens ?? 0, body.usage?.tokensIn ?? 0));
      }
    } catch (err) {
      setError(`${c.failed} ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cr-panel" aria-label={ariaLabel} data-canon-review-panel>
      <h2 className="cr-title" data-canon-review-title>
        {panelTitle}
      </h2>

      <div className="cr-field">
        <label className="cr-label" htmlFor="canon-review-kind">
          {c.kindLabel}
        </label>
        <select
          id="canon-review-kind"
          className="cr-select"
          value={kind}
          onChange={(e) => setKind(e.target.value === 'chapter' ? 'chapter' : 'echo')}
          data-canon-review-kind
        >
          <option value="echo">{c.kindEcho}</option>
          <option value="chapter">{c.kindChapter}</option>
        </select>
      </div>

      <div className="cr-field">
        <label className="cr-label" htmlFor="canon-review-text">
          {c.textLabel}
        </label>
        <textarea
          id="canon-review-text"
          className="cr-textarea"
          rows={14}
          value={text}
          placeholder={c.placeholder}
          onChange={(e) => setText(e.target.value)}
          data-canon-review-input
        />
      </div>

      <div className="cr-actions">
        <button
          type="button"
          className="cr-primaryBtn"
          onClick={() => void submit()}
          disabled={busy}
          data-canon-review-submit
        >
          {busy ? c.submitting : c.submit}
        </button>
        <button
          type="button"
          className="cr-ghostBtn"
          onClick={() => {
            setText('');
            setReview(null);
            setMeta(null);
            setError(null);
          }}
          disabled={busy}
          data-canon-review-clear
        >
          {c.clear}
        </button>
      </div>

      {error ? (
        <p className="cr-error" role="alert" data-canon-review-error>
          {error}
        </p>
      ) : null}

      <div className="cr-field">
        <span className="cr-label">{c.resultLabel}</span>
        {review === null ? (
          <p className="cr-muted" data-canon-review-empty>
            {c.empty}
          </p>
        ) : (
          <>
            <pre className="cr-result" data-canon-review-result>
              {review}
            </pre>
            {meta ? (
              <p className="cr-muted" data-canon-review-meta>
                {meta}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
