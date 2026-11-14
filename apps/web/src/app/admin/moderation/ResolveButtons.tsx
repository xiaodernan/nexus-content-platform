'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

const COPY = {
  zh: {
    noteAria: '结论依据（可选）',
    notePlaceholder: '结论依据（可选，会记在案子上）',
    approve: '放行',
    reject: '拒绝并撤下',
    failedNotice: (status: number) => `裁决失败（HTTP ${status}）`,
    doneNotice: '已记录裁决',
  },
  en: {
    noteAria: 'Verdict rationale (optional)',
    notePlaceholder: 'Verdict rationale (optional, recorded on the case)',
    approve: 'Approve',
    reject: 'Reject & take down',
    failedNotice: (status: number) => `Verdict failed (HTTP ${status})`,
    doneNotice: 'Verdict recorded',
  },
} as const;

/**
 * §131：人工裁决的两个按钮。这是整个审核链上唯一能写下 approved / rejected 的地方——
 * 机检不能（它只能说"这次没命中规则"），举报也不能。
 *
 * 拒绝会立刻让公开 URL 变 404，所以按钮上写的就是这件事，不是含糊的"处理"。
 */
export function ResolveButtons({ caseId, locale = 'zh' }: { caseId: string; locale?: Locale }) {
  const c = COPY[locale];
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = async (resolution: 'approved' | 'rejected'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/moderation/${caseId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ resolution, note: note.trim() || undefined }),
      });
      const body = (await res.json().catch(() => null)) as { message?: string; issues?: string[] } | null;
      if (!res.ok) {
        setError(body?.issues?.join('；') ?? body?.message ?? c.failedNotice(res.status));
        return;
      }
      setOutcome(body?.message ?? c.doneNotice);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (outcome) {
    return (
      <p className="am-triageDone" data-resolve-done={caseId}>
        {outcome}
      </p>
    );
  }

  return (
    <div className="am-triageRow">
      <input aria-label={c.noteAria}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={c.notePlaceholder}
        maxLength={2000}
        className="am-noteInput"
        data-resolve-note
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void resolve('approved')}
        className="am-btn"
        data-resolve="approved"
      >
        {c.approve}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void resolve('rejected')}
        className="am-btnDanger"
        data-resolve="rejected"
      >
        {c.reject}
      </button>
      {error ? (
        <span className="am-triageError" data-resolve-error>
          {error}
        </span>
      ) : null}
    </div>
  );
}
