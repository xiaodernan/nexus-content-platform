'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §49 项目简介。展开后才显示输入框，收起时只有一行状态文字——
 * 九个项目的列表里如果每个都常驻一个 textarea，这一屏就没法看了。
 *
 * 为什么不并进 TopBar 的重命名：那条链是设计文档的自动保存，改一个像素都会跑一次 PUT；
 * 简介是项目行的元信息，PUT 里带它只会被下一次自动保存覆盖掉。
 */
export function ProjectDescriptionEditor({
  projectId,
  initialDescription,
}: {
  projectId: string;
  initialDescription: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialDescription ?? '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const save = async (next: string): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        // 空串在这里是"清空"而不是"没改"：服务端把 trim 后为空的值写成 null
        body: JSON.stringify({ description: next }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; issues?: string[]; project?: { description: string | null } }
        | null;
      if (!res.ok || !body?.ok) {
        setNotice(`没保存：${body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`}`);
        return;
      }
      setValue(body.project?.description ?? '');
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="flex items-center gap-2" data-project-desc-row={projectId}>
        <span className="text-11 text-fg-3" data-project-desc={initialDescription ? 'set' : 'empty'}>
          {initialDescription ?? '没有简介'}
        </span>
        <button
          type="button"
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
          className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2"
          data-project-desc-edit={projectId}
        >
          {initialDescription ? '改简介' : '写简介'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-project-desc-row={projectId}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="一句话说明这个项目是什么（会作为公开页的 og:description）"
        className="rounded-[var(--nexus-radius-sm)] bg-bg-1 px-2 py-1 text-12 text-fg-1"
        data-project-desc-input={projectId}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(value)}
          className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-fg-1 disabled:opacity-50"
          data-project-desc-save={projectId}
        >
          {busy ? '保存中…' : '保存简介'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save('')}
          className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-40"
          data-project-desc-clear={projectId}
        >
          清空
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setValue(initialDescription ?? '');
            setNotice(null);
            setOpen(false);
          }}
          className="text-11 text-fg-3 hover:text-fg-2 disabled:opacity-40"
          data-project-desc-cancel={projectId}
        >
          取消
        </button>
        <span className="font-mono text-11 text-fg-3">{value.length}/500</span>
      </div>
      {notice ? (
        <p className="text-11 text-fg-2" data-project-desc-notice={projectId}>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
