'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §74 回收站里的恢复。一句话动作，不需要审批门——§74 管的是"删"那一侧，
 * 恢复不破坏任何东西，把它也设成门槛只会让人以为删掉的项目找不回来。
 */
export function RestoreProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const restore = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({}),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; error?: string } | null;
      if (!res.ok || !body?.ok) {
        setNotice(`没恢复：${body?.message ?? `HTTP ${res.status}`}`);
        return;
      }
      // 成功后不显示"已恢复"这句话：列表会因 refresh 少掉这一行，
      // 一句留在回收站里的"已恢复"是假状态——项目在上面的项目列表里
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => void restore()}
        className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-40"
        data-restore-project={projectId}
      >
        {busy ? '恢复中…' : `恢复「${projectName}」`}
      </button>
      {notice ? (
        <span className="text-11 text-fg-2" data-restore-notice={projectId}>
          {notice}
        </span>
      ) : null}
    </span>
  );
}
