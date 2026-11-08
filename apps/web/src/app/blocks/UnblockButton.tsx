'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/** §132 解除关系。这一页存在的意义就是"拉黑不是一条只有做的时候才有的单向门" */
export function UnblockButton({ handle }: { handle: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/blocks', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ handle }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; removed?: boolean; message?: string } | null;
      if (!body?.ok) {
        setError(body?.message ?? `没做成（HTTP ${res.status}）`);
        return;
      }
      // removed=false 也要重取一次：那一行可能在别处被取消过，页面显示的是旧的一份
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void clear()}
        className="rounded bg-bg-2 px-2 py-1 text-11 text-fg-1 disabled:opacity-50"
        data-unblock={handle}
      >
        解除
      </button>
      {error ? (
        <span className="text-11 text-danger-ink" data-unblock-error>
          {error}
        </span>
      ) : null}
    </span>
  );
}
