'use client';

import { useState } from 'react';
import type { DiffEntry } from '@nexus/design-model';
import { cn } from '@/lib/cn';
import type { SnapshotMeta, SnapshotSource } from '@/server/domain/snapshots';
import { studio, useStudio } from './store';

const KIND_LABEL: Record<DiffEntry['kind'], string> = {
  modified: '改',
  added: '增',
  removed: '删',
  moved: '移',
  token: '令牌',
};

const SOURCE_LABEL: Record<SnapshotSource, string> = {
  manual: '手动',
  ai: 'AI',
  import: '导入',
  publish: '发布',
  branch: '分支',
};

/** 变更值要能一眼看出差别，所以直给字面量而不是"[object Object]" */
function formatValue(value: unknown): string {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function DiffRow({ entry }: { entry: DiffEntry }) {
  return (
    <li className="flex flex-col gap-[1px] py-[2px] pl-[var(--nexus-space-3)]" data-history-diff={entry.path}>
      <span className="flex items-center gap-[var(--nexus-space-1)] text-11">
        <span
          className={cn(
            'shrink-0 rounded px-1 font-mono',
            entry.kind === 'removed' ? 'bg-warn text-bg-0' : entry.kind === 'added' ? 'bg-success text-bg-0' : 'bg-bg-2 text-fg-3',
          )}
        >
          {KIND_LABEL[entry.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate text-fg-2">{entry.nodeName}</span>
      </span>
      {/* 面板很窄：路径单独一行，不然最关键的"改了哪个字段"会被截断 */}
      <span className="break-all font-mono text-11 text-fg-3">{entry.path}</span>
      <span className="break-all font-mono text-11 text-fg-3">
        {formatValue(entry.before)} → <span className="text-fg-2">{formatValue(entry.after)}</span>
      </span>
    </li>
  );
}

/**
 * 服务端快照（§27 / §108）：这是用户项目历史，和上面的本地事务栈、以及 git 的开发历史是三件事。
 * 恢复前服务端会为当前状态补一条快照，所以恢复不会丢东西；但本地撤销栈会清空，这里不假装还能 Ctrl+Z。
 */
function SnapshotSection() {
  const state = useStudio();
  const [label, setLabel] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const create = async () => {
    const text = label.trim() || `快照 ${new Date().toLocaleString('zh-CN', { hour12: false })}`;
    const created = await studio.createSnapshot(text);
    if (created) setLabel('');
  };

  const restore = async (snapshot: SnapshotMeta) => {
    if (pending !== snapshot.id) {
      setPending(snapshot.id);
      return;
    }
    setPending(null);
    await studio.restoreSnapshot(snapshot.id);
  };

  return (
    <div className="flex min-h-0 flex-[2] flex-col border-t border-[var(--nexus-color-border-subtle)]">
      <div className="flex shrink-0 items-center gap-[var(--nexus-space-2)] border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void create();
          }}
          placeholder="快照名称"
          aria-label="快照名称"
          className="min-w-0 flex-1 bg-transparent text-12 text-fg-1 outline-none placeholder:text-fg-3"
          data-snapshot-input
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={state.snapshotBusy}
          className="shrink-0 rounded border border-[var(--nexus-color-border-subtle)] px-2 py-[2px] text-11 text-fg-2 hover:bg-bg-2 disabled:opacity-50"
          data-snapshot-create
        >
          {state.snapshotBusy ? '处理中…' : '创建快照'}
        </button>
      </div>
      {state.snapshotError ? (
        <p className="shrink-0 px-[var(--nexus-space-3)] pb-[var(--nexus-space-2)] text-11 text-warn" data-snapshot-error>
          快照操作未完成：{state.snapshotError}
        </p>
      ) : null}
      <ul className="min-h-0 flex-1 overflow-auto py-[var(--nexus-space-1)]">
        {state.snapshots.map((snapshot) => {
          const comparing = state.compare?.snapshotId === snapshot.id;
          return (
          <li
            key={snapshot.id}
            className="flex flex-col gap-[2px] px-[var(--nexus-space-3)] py-[3px]"
            data-snapshot-item={snapshot.id}
          >
            <span className="flex items-center gap-[var(--nexus-space-2)]">
              <span className="shrink-0 rounded bg-bg-2 px-1 font-mono text-11 uppercase text-fg-3">
                {SOURCE_LABEL[snapshot.source] ?? snapshot.source}
              </span>
              <span className="min-w-0 flex-1 truncate text-12 text-fg-2">
                {snapshot.label ?? snapshot.id.slice(0, 8)}
              </span>
            </span>
            <span className="flex items-center gap-[var(--nexus-space-1)]">
              <span className="min-w-0 flex-1 truncate font-mono text-11 text-fg-3">
                {new Date(snapshot.createdAt).toLocaleString('zh-CN', {
                  hour12: false,
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
              <button
                type="button"
                onClick={() => void studio.compareSnapshot(snapshot.id)}
                disabled={state.snapshotBusy}
                aria-expanded={comparing}
                className={cn(
                  'shrink-0 rounded border px-1 text-11 disabled:opacity-50',
                  comparing
                    ? 'border-transparent bg-accent-2 text-bg-0'
                    : 'border-[var(--nexus-color-border-subtle)] text-fg-3 hover:bg-bg-2',
                )}
                data-snapshot-compare={snapshot.id}
              >
                比较
              </button>
              <button
                type="button"
                onClick={() => void restore(snapshot)}
                disabled={state.snapshotBusy}
                className={cn(
                  'shrink-0 rounded border px-1 text-11 disabled:opacity-50',
                  pending === snapshot.id
                    ? 'border-transparent bg-warn text-bg-0'
                    : 'border-[var(--nexus-color-border-subtle)] text-fg-3 hover:bg-bg-2',
                )}
                data-snapshot-restore={snapshot.id}
              >
                {pending === snapshot.id ? '确认恢复' : '恢复'}
              </button>
            </span>
            {comparing && state.compare ? (
              <ul
                className="mt-[2px] space-y-[2px] border-t border-[var(--nexus-color-border-subtle)] bg-bg-0 pt-[var(--nexus-space-1)]"
                data-snapshot-diff-list={snapshot.id}
              >
                <li className="px-[var(--nexus-space-3)] pb-[2px] text-11 text-fg-3">
                  这份快照与当前文档的差异（共 {state.compare.diff.total} 处）
                </li>
                {state.compare.diff.entries.map((diff, index) => (
                  <DiffRow key={`${diff.nodeId}:${diff.path}:${index}`} entry={diff} />
                ))}
                {!state.compare.diff.entries.length ? (
                  <li className="px-[var(--nexus-space-3)] text-11 text-fg-3">这份快照和当前文档一致。</li>
                ) : null}
                {state.compare.diff.truncated ? (
                  <li className="px-[var(--nexus-space-3)] text-11 text-warn">
                    差异过多，只列出前 {state.compare.diff.entries.length} 处。
                  </li>
                ) : null}
              </ul>
            ) : null}
          </li>
          );
        })}
        {!state.snapshots.length && !state.snapshotError ? (
          <li className="px-[var(--nexus-space-3)] py-[var(--nexus-space-2)] text-11 text-fg-3">
            还没有服务端快照
          </li>
        ) : null}
      </ul>
    </div>
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
          本地事务（Ctrl+Z / Ctrl+Shift+Z）。展开一条可以看到它改了什么；下方服务端快照可比较、可恢复（恢复会清空本地撤销栈）。
        </p>
      </div>
      <ol className="min-h-0 flex-[3] overflow-auto">
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
      <SnapshotSection />
    </div>
  );
}
