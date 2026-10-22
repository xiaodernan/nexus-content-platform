'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §123/#158：一条举报工单的三个处置动作。这是界面上唯一能推进
 * `marketplace_reports.status` 的地方——举报提交做不到，机检也做不到。
 *
 * 结案 / 驳回只写工单结论，**不会**下架物品或撤下公开页；page 上那句提示
 * 就是这件事，按钮本身不写含糊的"处理"。终态不可改写（域层条件 UPDATE），
 * 所以 409 要把服务端那句"已经结案"原样念出来，而不是换个成功文案。
 */
export function TriageButtons({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (status: 'reviewing' | 'resolved' | 'dismissed'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/marketplace/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ status, adminNotes: notes.trim() || undefined }),
      });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; issues?: string[] }
        | null;
      if (!res.ok) {
        setError(body?.issues?.join('；') ?? body?.message ?? `处置失败（HTTP ${res.status}）`);
        return;
      }
      setOutcome(body?.message ?? '已记录处置');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  // 成功提示与按钮并排，而不是把按钮换掉：受理之后工单还在页面上，
  // router.refresh() 会复用这个组件的状态，换掉按钮就等于逼审核员刷新才能接着结案。
  return (
    <div className="flex flex-col gap-1">
      {outcome ? (
        <p className="text-11 text-fg-3" data-triage-done={reportId}>
          {outcome}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="处置依据（可选，会记在工单上）"
          maxLength={2000}
          className="min-w-[14rem] flex-1 rounded bg-bg-1 px-2 py-1 text-11 text-fg-1"
          data-triage-note
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void send('reviewing')}
          className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
          data-triage="reviewing"
        >
          受理（复核中）
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send('resolved')}
          className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
          data-triage="resolved"
        >
          结案（举报成立）
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void send('dismissed')}
          className="rounded bg-danger px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
          data-triage="dismissed"
        >
          驳回（举报不成立）
        </button>
        {error ? (
          <span className="text-11 text-danger" data-triage-error>
            {error}
          </span>
        ) : null}
      </div>
    </div>
  );
}
