'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/** 双语：每行文案按 cookie locale 选；服务端下发的判定原文（message）原样保留——那是服务端裁决 */
const BT_TXT = {
  zh: {
    failed: (status: number) => `没做成（HTTP ${status}）`,
    unblock: '解除',
  },
  en: {
    failed: (status: number) => `Did not happen (HTTP ${status})`,
    unblock: 'Unblock',
  },
} as const;

/** §132 解除关系。这一页存在的意义就是"拉黑不是一条只有做的时候才有的单向门" */
export function UnblockButton({ handle, locale = 'zh' }: { handle: string; locale?: Locale }) {
  const T = BT_TXT[locale];
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
        setError(body?.message ?? T.failed(res.status));
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
        {T.unblock}
      </button>
      {error ? (
        <span className="bk-error" data-unblock-error>
          {error}
        </span>
      ) : null}
    </span>
  );
}
