'use client';

import { cn } from '@/lib/cn';
import { studio, useStudio } from './store';

/** §27 本地事务历史：View（跳转查看）+ 一次 AI 事务整体回滚。服务端快照/分支在任务 #8 接入。 */
export function HistoryPanel() {
  const state = useStudio();
  const current = state.lastEntry?.id;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]">
        <p className="text-12 text-fg-3">本地事务（Ctrl+Z / Ctrl+Shift+Z）。快照与分支在服务端版本接入后可比较、可恢复。</p>
      </div>
      <ol className="min-h-0 flex-1 overflow-auto">
        {state.history.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => studio.jumpTo(entry.id)}
              className={cn(
                'flex w-full flex-col gap-[2px] px-[var(--nexus-space-3)] py-[var(--nexus-space-2)] text-left hover:bg-bg-2',
                entry.id === current ? 'bg-bg-3' : '',
              )}
              data-history-entry={entry.label}
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded px-1 font-mono text-11 uppercase',
                    entry.source === 'ai' ? 'bg-accent-2 text-bg-0' : 'bg-bg-2 text-fg-3',
                  )}
                >
                  {entry.source}
                </span>
                <span className="min-w-0 flex-1 truncate text-12">{entry.label}</span>
              </span>
              <span className="flex items-center gap-2 font-mono text-11 text-fg-3">
                <span>{new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                <span>{entry.patchCount} 补丁 / {entry.diff.length} 变更</span>
                {entry.capability?.demoMode ? <span className="text-warn">DEMO</span> : null}
              </span>
            </button>
          </li>
        ))}
        {!state.history.length ? <li className="px-[var(--nexus-space-3)] py-[var(--nexus-space-2)] text-12 text-fg-3">还没有修改记录</li> : null}
      </ol>
    </div>
  );
}
