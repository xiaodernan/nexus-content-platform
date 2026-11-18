'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/i18n';

/** /insight 的退出按钮：清 cookie 后整页刷新回口令门。 */
export function InsightLogoutButton({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const label = locale === 'zh' ? '退出观察哨' : 'Leave Insight';
  const signOut = async () => {
    setBusy(true);
    try {
      await fetch('/api/insight/logout', { method: 'POST' });
    } finally {
      router.refresh();
    }
  };
  return (
    <button
      type="button"
      className="insg-logout"
      disabled={busy}
      data-insight-logout
      onClick={() => { void signOut(); }}
    >
      {busy ? (locale === 'zh' ? '退出中…' : 'Leaving…') : label}
    </button>
  );
}
