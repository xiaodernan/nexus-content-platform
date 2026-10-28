'use client';

import { useState } from 'react';
import Link from 'next/link';
import { csrfHeaders } from '@/lib/csrf';

/**
 * 接受按钮：转发 POST /api/projects/invites/<token>/accept，一句话回执。
 *
 * 被拒不重试、不猜：话是服务端给的（token 不存在 / 已撤回 / 邮箱对不上），
 * 原样显示。本机没有发信，链接是邀请人转交的——"打不开"的第一嫌疑是链接给错了人。
 */
export function InviteAcceptPanel({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinedProjectId, setJoinedProjectId] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: '{}',
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string; message?: string; projectId?: string } | null;
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? body?.reason ?? `接受失败（HTTP ${res.status}）`);
        return;
      }
      setJoinedProjectId(body.projectId ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '接受失败');
    } finally {
      setBusy(false);
    }
  };

  if (joinedProjectId) {
    return (
      <div className="flex flex-col gap-2" data-invite-accepted>
        <p className="text-13 text-accent-2-ink">已加入项目。</p>
        <Link href={`/studio/${joinedProjectId}`} className="text-13 text-accent-2-ink underline">
          打开这个项目
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void accept()}
        data-invite-accept
        className="self-start rounded-[var(--nexus-radius-sm)] bg-bg-3 px-3 py-1 text-13 text-fg-1 disabled:opacity-40"
      >
        {busy ? '处理中…' : '接受邀请，加入这个项目'}
      </button>
      {error ? (
        <p className="text-12 text-danger" data-invite-error>
          {error}
        </p>
      ) : null}
    </div>
  );
}
