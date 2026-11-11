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
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--nexus-color-brand)]/30 bg-gradient-to-br from-bg-2 via-bg-2 to-bg-1 p-4 shadow-[0_0_30px_rgb(91_108_255/0.15)]" data-invite-accepted>
        <p className="flex items-center gap-2 text-16 font-semibold text-fg-1">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--nexus-color-accent-2-ink)]">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          已加入项目
        </p>
        <Link href={`/studio/${joinedProjectId}`} className="inline-flex min-h-10 w-fit items-center rounded-lg bg-[var(--nexus-color-brand)] px-4 py-2 text-13 font-semibold text-[var(--nexus-color-accent-fg)] transition-all hover:shadow-[0_0_24px_rgb(91_108_255/0.45)]">
          打开这个项目 →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => void accept()}
        data-invite-accept
        className="inline-flex min-h-11 w-fit items-center rounded-lg bg-[var(--nexus-color-brand)] px-5 py-2 text-13 font-semibold text-[var(--nexus-color-accent-fg)] transition-all duration-150 hover:shadow-[0_0_30px_rgb(91_108_255/0.45)] disabled:opacity-40 disabled:hover:shadow-none"
      >
        {busy ? '正在处理…' : '接受邀请，加入这个项目'}
      </button>
      {error ? (
        <p className="rounded-lg border border-[var(--nexus-color-danger)]/30 bg-danger/10 px-3 py-2 text-12 text-danger-ink" data-invite-error>
          {error}
        </p>
      ) : null}
    </div>
  );
}
