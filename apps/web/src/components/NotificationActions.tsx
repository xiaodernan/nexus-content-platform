'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/**
 * §164 标已读的按钮。回话里那个数原样显示，包括 0——
 * "已标记 0 条"是有信息量的：要么它们本来就已读，要么这些 id 不是你的收件箱里的。
 * 双语（2026-11-15）：`label` 由调用方按 locale 给；其余回执译文同字典。
 */
const COPY: Record<Locale, { marked: (n: number) => string; notMarked: (status: number) => string; sendFailed: string }> = {
  zh: {
    marked: (n) => `已标记 ${n} 条`,
    notMarked: (status) => `没有标成（${status}）`,
    sendFailed: '请求没有送出去',
  },
  en: {
    marked: (n) => `${n} marked`,
    notMarked: (status) => `could not mark (${status})`,
    sendFailed: 'The request never left',
  },
};

export function MarkRead({ ids, all = false, label, locale = 'zh' }: { ids?: string[]; all?: boolean; label: string; locale?: Locale }) {
  const c = COPY[locale];
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
      setResult(res.ok && json?.ok ? c.marked(json.marked ?? 0) : c.notMarked(res.status));
      router.refresh();
    } catch {
      setResult(c.sendFailed);
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
        className="nd-readBtn"
        data-notification-mark-read={all ? 'all' : ids?.length === 1 ? ids[0] : 'many'}
      >
        {label}
      </button>
      {result ? (
        <span className="nb-resultInk" data-notification-result>
          {result}
        </span>
      ) : null}
    </>
  );
}
