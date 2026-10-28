'use client';

import { useState } from 'react';
import { csrfHeaders } from '@/lib/csrf';

/** §60 主页上的关注按钮。状态从服务端带进来，这里只发请求并显示真实回话 */
export function FollowButton({ handle, initialFollowing, initialFollowers }: { handle: string; initialFollowing: boolean; initialFollowers: number }) {
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
        setError(body?.message ?? `没做成（HTTP ${res.status}）`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void click()}
        data-follow-button={following ? 'on' : 'off'}
        className="rounded bg-accent-2 px-3 py-1 text-12 text-accent-fg disabled:opacity-50"
      >
        {following ? '已关注' : '关注'} · {followers}
      </button>
      {error ? (
        <span className="text-11 text-danger" data-follow-error>
          {error}
        </span>
      ) : null}
    </span>
  );
}
