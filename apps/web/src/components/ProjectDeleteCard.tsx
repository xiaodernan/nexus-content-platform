'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §74 删除项目。界面上要打的字和左边显示的名字是同一串，服务端比的是项目名的原值——
 * 这不是形式主义：审批门的意义就是"停下来把这件事说清楚一次"，
 * 一个"确定要删除吗？【确定】"的弹窗删掉的东西和没弹窗一样多。
 *
 * 说清楚删掉之后会发生什么，是因为这些是用户当时看不到但以后会撞上的：
 * 公开页立刻 404（收藏了这版的人点进去也是 404），但快照、发布记录、评论都还在，
 * 从下面的回收站恢复后原样回来。
 */
export function ProjectDeleteCard({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const remove = async (): Promise<void> => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ confirm: typed }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; issues?: string[]; error?: string }
        | null;
      if (!res.ok || !body?.ok) {
        setNotice(`没删除：${body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`}`);
        return;
      }
      setTyped('');
      setOpen(false);
      // 刷新由服务端重新读列表：这一行消失的依据是查询结果，不是本地把它藏起来
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setNotice(null);
          setTyped('');
          setOpen(true);
        }}
        className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-2 py-1 text-11 text-fg-2 hover:bg-bg-2"
        data-project-delete={projectId}
      >
        删除项目
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--nexus-radius-sm)] bg-bg-1 px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]" data-project-delete-card={projectId}>
      <p className="text-11 text-fg-2">
        输入项目名 <span className="font-mono text-fg-1" data-project-delete-expected={projectId}>{projectName}</span> 才会删除。
        公开页会立刻打不开，快照与发布记录留着，可以在回收站恢复。
      </p>
      <div className="flex items-center gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="逐字输入项目名"
          maxLength={2000}
          className="w-[240px] rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] bg-bg-2 px-2 py-1 text-12 text-fg-1 placeholder:text-fg-3"
          data-project-delete-input={projectId}
        />
        {/* 名字打错时按钮照样能按：审批门的拒绝要在界面上看得见，
            一遇到不匹配就禁用等于让这道门从不显形，测试也撞不到它 */}
        <button
          type="button"
          disabled={busy || typed.trim().length === 0}
          onClick={() => void remove()}
          className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-3 py-1 text-12 text-accent-fg disabled:opacity-40"
          data-project-delete-confirm={projectId}
        >
          {busy ? '删除中…' : '确认删除'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setNotice(null);
            setTyped('');
            setOpen(false);
          }}
          className="text-11 text-fg-3 hover:text-fg-2 disabled:opacity-40"
          data-project-delete-cancel={projectId}
        >
          取消
        </button>
      </div>
      {notice ? (
        <p className="text-11 text-fg-2" data-project-delete-notice={projectId}>
          {notice}
        </p>
      ) : null}
    </div>
  );
}
