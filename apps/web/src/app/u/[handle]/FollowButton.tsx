'use client';

import { useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/**
 * §60 主页上的关注按钮。状态从服务端带进来，这里只发请求并显示真实回话。
 * 双语（2026-11-15 公开试玩面 wave）：服务端透传 `locale`；缺省 zh。
 */
const COPY: Record<Locale, {
  follow: string;
  following: string;
  failed: (status: number) => string;
}> = {
  zh: {
    follow: '关注',
    following: '已关注',
    failed: (status) => `没做成（HTTP ${status}）`,
  },
  en: {
    follow: 'Follow',
    following: 'Following',
    failed: (status) => `Could not do that (HTTP ${status})`,
  },
};

export function FollowButton({ handle, initialFollowing, initialFollowers, locale = 'zh' }: { handle: string; initialFollowing: boolean; initialFollowers: number; locale?: Locale }) {
  const c = COPY[locale];
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
        setError(body?.message ?? c.failed(res.status));
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
        {following ? c.following : c.follow} · {followers}
      </button>
      {error ? (
        <span className="fw-error" data-follow-error>
          {error}
        </span>
      ) : null}
    </span>
  );
}
