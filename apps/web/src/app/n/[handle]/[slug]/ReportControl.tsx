'use client';

import { useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/** 双语：每行文案按 cookie locale 选；服务端返的判定原文（message/issues）原样保留——那是服务端裁决，不是本地文案 */
const RC_TXT = {
  zh: {
    reasons: [
      { id: 'minor_safety', label: '涉及未成年人的性内容' },
      { id: 'intimate_nonconsensual', label: '非自愿亲密影像' },
      { id: 'impersonation', label: '冒充他人或机构' },
      { id: 'illegal', label: '违法内容' },
      { id: 'ip', label: '侵犯版权或商标' },
      { id: 'spam', label: '垃圾信息 / 欺诈' },
      { id: 'other', label: '其他' },
    ],
    submitFailed: (status: number) => `提交失败（HTTP ${status}）`,
    reportRecorded: '举报已记录',
    reportThisPage: '举报此页',
    ariaReason: '举报理由',
    ariaDetail: '举报补充说明（可选）',
    detailPlaceholder: '补充说明（可选）',
    submitting: '提交中…',
    submit: '提交举报',
    note: '举报不会立刻撤下内容；是否下架由人看完决定。',
  },
  en: {
    reasons: [
      { id: 'minor_safety', label: 'Sexual content involving minors' },
      { id: 'intimate_nonconsensual', label: 'Non-consensual intimate imagery' },
      { id: 'impersonation', label: 'Impersonation of a person or organization' },
      { id: 'illegal', label: 'Illegal content' },
      { id: 'ip', label: 'Copyright or trademark infringement' },
      { id: 'spam', label: 'Spam / fraud' },
      { id: 'other', label: 'Other' },
    ],
    submitFailed: (status: number) => `Submit failed (HTTP ${status})`,
    reportRecorded: 'Report recorded',
    reportThisPage: 'Report this page',
    ariaReason: 'Report reason',
    ariaDetail: 'Report detail (optional)',
    detailPlaceholder: 'Detail (optional)',
    submitting: 'Submitting…',
    submit: 'Submit report',
    note: 'A report does not take the content down; whether it stays up is decided by a person.',
  },
} as const;

/**
 * §132 举报入口：公开页上访客真能点开的东西。
 *
 * 两条说在界面上的事实（不只在代码注释里）：
 * - 举报**不会**立刻撤下内容，撤下是人的裁决；
 * - 访客不需要登录也能举报（这一页本来就是给匿名访客看的）。
 */
export function ReportControl({ path, locale = 'zh' }: { path: string; locale?: Locale }) {
  const RC = RC_TXT[locale];
  const REASONS = RC.reasons;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[6]!.id);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/published/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ path, reason, detail: detail.trim() || undefined }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; issues?: string[] } | null;
      if (!res.ok) {
        setError(body?.issues?.join(locale === 'en' ? '; ' : '；') ?? body?.message ?? RC.submitFailed(res.status));
        return;
      }
      setNotice(body?.message ?? RC.reportRecorded);
      setOpen(false);
      setDetail('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rc-root" data-report-root>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rc-openBtn"
        data-report-open
      >
        {RC.reportThisPage}
      </button>
      {open ? (
        <div className="rc-form" data-report-form>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label={RC.ariaReason}
            className="rc-select"
            data-report-reason
          >
            {REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <input aria-label={RC.ariaDetail}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={RC.detailPlaceholder}
            maxLength={2000}
            className="rc-input"
            data-report-detail
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rc-submitBtn"
            data-report-submit
          >
            {busy ? RC.submitting : RC.submit}
          </button>
          <p className="rc-note">{RC.note}</p>
        </div>
      ) : null}
      {error ? (
        <span className="rc-error" data-report-error>
          {error}
        </span>
      ) : null}
      {notice ? (
        <span className="rc-hint" data-report-notice>
          {notice}
        </span>
      ) : null}
    </div>
  );
}
