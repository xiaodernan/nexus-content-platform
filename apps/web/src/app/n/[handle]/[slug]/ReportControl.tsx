'use client';

import { useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §132 举报入口：公开页上访客真能点开的东西。
 *
 * 两条说在界面上的事实（不只在代码注释里）：
 * - 举报**不会**立刻撤下内容，撤下是人的裁决；
 * - 访客不需要登录也能举报（这一页本来就是给匿名访客看的）。
 */
const REASONS: { id: string; label: string }[] = [
  { id: 'minor_safety', label: '涉及未成年人的性内容' },
  { id: 'intimate_nonconsensual', label: '非自愿亲密影像' },
  { id: 'impersonation', label: '冒充他人或机构' },
  { id: 'illegal', label: '违法内容' },
  { id: 'ip', label: '侵犯版权或商标' },
  { id: 'spam', label: '垃圾信息 / 欺诈' },
  { id: 'other', label: '其他' },
];

export function ReportControl({ path }: { path: string }) {
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
        setError(body?.issues?.join('；') ?? body?.message ?? `提交失败（HTTP ${res.status}）`);
        return;
      }
      setNotice(body?.message ?? '举报已记录');
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
        举报此页
      </button>
      {open ? (
        <div className="rc-form" data-report-form>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-label="举报理由"
            className="rc-select"
            data-report-reason
          >
            {REASONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <input aria-label="举报补充说明（可选）"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="补充说明（可选）"
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
            {busy ? '提交中…' : '提交举报'}
          </button>
          <p className="rc-note">举报不会立刻撤下内容；是否下架由人看完决定。</p>
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
