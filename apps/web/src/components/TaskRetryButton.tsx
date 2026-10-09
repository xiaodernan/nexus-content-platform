'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { csrfHeaders } from '@/lib/csrf';

/**
 * §162 取消/重试：任务列表里"再来一次"的按钮。
 *
 * 只在**自己的**失败/已取消的行上出现（服务端 `mine` 算的，别人行上的按钮点了也只会 404）。
 * 点下之后走 `POST /api/ai/tasks/<id>/retry`：请求原话从上一行取回、重跑同一条提交流水线，
 * 结果是**新的一行**（`attempt` + 1）——所以按钮的回执里带着新任务号，
 * 而表格刷新（`router.refresh()`，只重取 server component 那一层）之后新行才会出现：
 * 这一页没有乐观更新，表里的每一行都必须是库里真有的一行。
 */
export function TaskRetryButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/ai/tasks/${encodeURIComponent(taskId)}/retry`, { method: 'POST', headers: csrfHeaders() });
      const body = (await res.json().catch(() => null)) as
        | { message?: string; error?: string; taskId?: string; backend?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      setNote(`已重试：新任务 ${body?.taskId?.slice(0, 8) ?? '？'} · 后端 ${body?.backend ?? '未知'}，下面会多出一行第 2 次`);
      router.refresh();
    } catch (e) {
      setNote(`重试没成功：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void retry()}
        disabled={busy}
        data-task-retry={taskId}
        className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] px-2 py-[2px] text-11 text-fg-2 disabled:opacity-50"
      >
        {busy ? '重试中…' : '重试'}
      </button>
      {note ? (
        <span className="text-fg-3" data-task-retry-note>
          {note}
        </span>
      ) : null}
    </span>
  );
}
