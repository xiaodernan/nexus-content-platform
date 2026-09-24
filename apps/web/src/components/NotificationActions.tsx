'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §164 标已读的按钮。回话里那个数原样显示，包括 0——
 * "已标记 0 条"是有信息量的：要么它们本来就已读，要么这些 id 不是你的收件箱里的。
 */
export function MarkRead({ ids, all = false, label }: { ids?: string[]; all?: boolean; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify(all ? { all: true } : { ids: ids ?? [] }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; marked?: number } | null;
      setResult(res.ok && json?.ok ? `已标记 ${json.marked ?? 0} 条` : `没有标成（${res.status}）`);
      router.refresh();
    } catch {
      setResult('请求没有送出去');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] px-2 py-0.5 text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-50"
        data-notification-mark-read={all ? 'all' : ids?.length === 1 ? ids[0] : 'many'}
      >
        {label}
      </button>
      {result ? (
        <span className="ml-2 text-11 text-fg-3" data-notification-result>
          {result}
        </span>
      ) : null}
    </>
  );
}
