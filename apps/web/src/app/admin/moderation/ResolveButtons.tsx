'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §131：人工裁决的两个按钮。这是整个审核链上唯一能写下 approved / rejected 的地方——
 * 机检不能（它只能说"这次没命中规则"），举报也不能。
 *
 * 拒绝会立刻让公开 URL 变 404，所以按钮上写的就是这件事，不是含糊的"处理"。
 */
export function ResolveButtons({ caseId }: { caseId: string }) {
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
        setError(body?.issues?.join('；') ?? body?.message ?? `裁决失败（HTTP ${res.status}）`);
        return;
      }
      setOutcome(body?.message ?? '已记录裁决');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (outcome) {
    return (
      <p className="text-11 text-fg-3" data-resolve-done={caseId}>
        {outcome}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="结论依据（可选，会记在案子上）"
        maxLength={2000}
        className="min-w-[14rem] flex-1 rounded bg-bg-1 px-2 py-1 text-11 text-fg-1"
        data-resolve-note
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void resolve('approved')}
        className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
        data-resolve="approved"
      >
        放行
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => void resolve('rejected')}
        className="rounded bg-danger px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
        data-resolve="rejected"
      >
        拒绝并撤下
      </button>
      {error ? (
        <span className="text-11 text-danger" data-resolve-error>
          {error}
        </span>
      ) : null}
    </div>
  );
}
