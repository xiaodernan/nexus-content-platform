'use client';

import { useState } from 'react';
import Link from 'next/link';
import { csrfHeaders } from '@/lib/csrf';
import type { Locale } from '@/lib/i18n';

/** 双语：每行文案按 cookie locale 选；服务端返的判定原文（message/reason）原样保留——那是服务端裁决 */
const PANEL_TXT = {
  zh: {
    failedHttp: (status: number) => `接受失败（HTTP ${status}）`,
    failed: '接受失败',
    joined: '已加入项目。',
    openProject: '打开这个项目',
    busy: '处理中…',
    acceptCta: '接受邀请，加入这个项目',
  },
  en: {
    failedHttp: (status: number) => `Accept failed (HTTP ${status})`,
    failed: 'Accept failed',
    joined: 'Joined the project.',
    openProject: 'Open this project',
    busy: 'Working…',
    acceptCta: 'Accept the invitation, join this project',
  },
} as const;

/**
 * 接受按钮：转发 POST /api/projects/invites/<token>/accept，一句话回执。
 *
 * 被拒不重试、不猜：话是服务端给的（token 不存在 / 已撤回 / 邮箱对不上），
 * 原样显示。本机没有发信，链接是邀请人转交的——"打不开"的第一嫌疑是链接给错了人。
 */
export function InviteAcceptPanel({ token, locale = 'zh' }: { token: string; locale?: Locale }) {
  const T = PANEL_TXT[locale];
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
        setError(body?.message ?? body?.reason ?? T.failedHttp(res.status));
        return;
      }
      setJoinedProjectId(body.projectId ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : T.failed);
    } finally {
      setBusy(false);
    }
  };

  if (joinedProjectId) {
    return (
      <div className="iv-panel" data-invite-accepted>
        <p className="iv-success">{T.joined}</p>
        <Link href={`/studio/${joinedProjectId}`} className="iv-successLink">
          {T.openProject}
        </Link>
      </div>
    );
  }

  return (
    <div className="iv-panel">
      <button
        type="button"
        disabled={busy}
        onClick={() => void accept()}
        data-invite-accept
        className="iv-btn"
      >
        {busy ? T.busy : T.acceptCta}
      </button>
      {error ? (
        <p className="iv-error" data-invite-error>
          {error}
        </p>
      ) : null}
    </div>
  );
}
