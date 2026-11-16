'use client';

import { useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/** 双语：每行文案按 cookie locale 选；服务端下发的判定原文（message）原样保留——那是服务端裁决 */
const FU_TXT = {
  zh: {
    failed: (status: number) => `没做成（HTTP ${status}）`,
    following: '已关注',
    follow: '关注',
  },
  en: {
    failed: (status: number) => `Did not happen (HTTP ${status})`,
    following: 'Following',
    follow: 'Follow',
  },
} as const;

/** §60 主页上的关注按钮。状态从服务端带进来，这里只发请求并显示真实回话 */
export function FollowButton({ handle, initialFollowing, initialFollowers, locale = 'zh' }: { handle: string; initialFollowing: boolean; initialFollowers: number; locale?: Locale }) {
  const T = FU_TXT[locale];
  const [following, setFollowing] = useState(initialFollowing);
  const [followers, setFollowers] = useState(initialFollowers);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const click = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ handle }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; following?: boolean; followers?: number; message?: string } | null;
      if (body?.ok) {
        setFollowing(body.following === true);
        setFollowers(Number(body.followers ?? followers));
      } else {
        setError(body?.message ?? T.failed(res.status));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="fw-wrap">
      <button
        type="button"
        disabled={busy}
        onClick={() => void click()}
        data-follow-button={following ? 'on' : 'off'}
        className="fw-btn"
      >
        {following ? T.following : T.follow} · {followers}
      </button>
      {error ? (
        <span className="fw-error" data-follow-error>
          {error}
        </span>
      ) : null}
    </span>
  );
}
