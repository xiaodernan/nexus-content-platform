'use client';

import { useState } from 'react';
import type { DiffEntry } from '@nexus/design-model';
import { cn } from '@/lib/cn';
import { studio, useStudio } from './store';

const KIND_LABEL: Record<DiffEntry['kind'], string> = {
  modified: '改',
  added: '增',
  removed: '删',
  moved: '移',
  token: '令牌',
};

/** 变更值要能一眼看出差别，所以直给字面量而不是"[object Object]" */
function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function DiffRow({ entry }: { entry: DiffEntry }) {
  return (
    <li className="flex flex-col gap-[2px] py-[2px] pl-[var(--nexus-space-3)]" data-history-diff={entry.path}>
      <span className="flex items-center gap-[var(--nexus-space-1)] text-11">
        <span
          className={cn(
            'shrink-0 rounded px-1 font-mono',
            entry.kind === 'removed' ? 'bg-warn text-bg-0' : entry.kind === 'added' ? 'bg-success text-bg-0' : 'bg-bg-2 text-fg-3',
          )}
        >
          {KIND_LABEL[entry.kind]}
        </span>
        <span className="min-w-0 truncate text-fg-2">{entry.nodeName}</span>
        <span className="min-w-0 shrink font-mono text-fg-3">{entry.path}</span>
      </span>
      <span className="break-all font-mono text-11 text-fg-3">
        {formatValue(entry.before)} → <span className="text-fg-2">{formatValue(entry.after)}</span>
      </span>
    </li>
  );
}

/**
 * §27 事务历史：View（跳转查看）+ 一次 AI 事务整体回滚。
 * 展开的变更清单就是 AI Diff（§151）——只列安全、简洁的工作结果，不显示模型思维过程（§26）。
 */
export function HistoryPanel() {
  const state = useStudio();
  const [open, setOpen] = useState<string | null>(null);
  const current = state.lastEntry?.id;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]">
        <p className="text-12 text-fg-3">
          本地事务（Ctrl+Z / Ctrl+Shift+Z）。展开一条可以看到它改了什么；快照与分支在服务端版本接入后可比较、可恢复。
        </p>
      </div>
      <ol className="min-h-0 flex-1 overflow-auto">
        {state.history.map((entry) => (
          <li key={entry.id}>
            <div className="flex items-stretch">
              <button
                type="button"
                onClick={() => studio.jumpTo(entry.id)}
                className={cn(
                  'flex min-w-0 flex-1 flex-col gap-[2px] px-[var(--nexus-space-3)] py-[var(--nexus-space-2)] text-left hover:bg-bg-2',
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
                  <span>
                    {entry.patchCount} 补丁 / {entry.diff.length} 变更
                  </span>
                  {entry.capability?.demoMode ? <span className="text-warn">DEMO</span> : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(open === entry.id ? null : entry.id)}
                aria-expanded={open === entry.id}
                data-history-toggle={entry.label}
                className="w-[26px] shrink-0 border-l border-[var(--nexus-color-border-subtle)] text-12 text-fg-3 hover:bg-bg-2"
                title="查看变更明细"
              >
                {open === entry.id ? '▾' : '▸'}
              </button>
            </div>
            {open === entry.id ? (
              <ul
                className={cn(
                  'space-y-[2px] border-t border-[var(--nexus-color-border-subtle)] bg-bg-0 pb-[var(--nexus-space-2)] pt-[var(--nexus-space-1)]',
                  entry.diff.length ? 'max-h-[240px] overflow-auto' : '',
                )}
                data-history-diff-list={entry.label}
              >
                {entry.diff.map((diff, index) => (
                  <DiffRow key={`${diff.nodeId}:${diff.path}:${index}`} entry={diff} />
                ))}
                {!entry.diff.length ? (
                  <li className="px-[var(--nexus-space-3)] text-11 text-fg-3">这次事务没有可展示的字段级变更。</li>
                ) : null}
              </ul>
            ) : null}
          </li>
        ))}
        {!state.history.length ? (
          <li className="px-[var(--nexus-space-3)] py-[var(--nexus-space-2)] text-12 text-fg-3">还没有修改记录</li>
        ) : null}
      </ol>
    </div>
  );
}
