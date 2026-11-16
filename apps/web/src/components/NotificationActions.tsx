'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/** 双语：回执按 cookie locale 选（不夹杂） */
const MARK_TXT = {
  zh: { done: (n: number) => `已标记 ${n} 条`, failed: (status: number) => `没有标成（${status}）`, offline: '请求没有送出去' },
  en: { done: (n: number) => `Marked ${n}`, failed: (status: number) => `Not marked (${status})`, offline: 'The request never went out' },
} as const;

/**
 * §164 标已读的按钮。回话里那个数原样显示，包括 0——
 * "已标记 0 条"是有信息量的：要么它们本来就已读，要么这些 id 不是你的收件箱里的。
 */
export function MarkRead({ ids, all = false, label, locale = 'zh' }: { ids?: string[]; all?: boolean; label: string; locale?: Locale }) {
  const T = MARK_TXT[locale];
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
      setResult(res.ok && json?.ok ? T.done(json.marked ?? 0) : T.failed(res.status));
      router.refresh();
    } catch {
      setResult(T.offline);
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
