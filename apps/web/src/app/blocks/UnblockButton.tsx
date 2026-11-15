'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

const COPY: Record<Locale, { failed: (status: number) => string; button: string }> = {
  zh: {
    failed: (status) => `没做成（HTTP ${status}）`,
    button: '解除',
  },
  en: {
    failed: (status) => `Not done (HTTP ${status})`,
    button: 'Unblock',
  },
};

/** §132 解除关系。这一页存在的意义就是"拉黑不是一条只有做的时候才有的单向门" */
export function UnblockButton({ handle, locale = 'zh' }: { handle: string; locale?: Locale }) {
  const c = COPY[locale];
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
        setError(body?.message ?? c.failed(res.status));
        return;
      }
      // removed=false 也要重取一次：那一行可能在别处被取消过，页面显示的是旧的一份
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="bk-btnWrap">
      <button
        type="button"
        disabled={busy}
        onClick={() => void clear()}
        className="bk-btn"
        data-unblock={handle}
      >
        {c.button}
      </button>
      {error ? (
        <span className="bk-error" data-unblock-error>
          {error}
        </span>
      ) : null}
    </span>
  );
}
