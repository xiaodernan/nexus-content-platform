'use client';

import { useState } from 'react';
import type { DiffEntry } from '@nexus/creative-model';
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
    <li className="hi-diffRow" data-history-diff={entry.path}>
      <span className="hi-diffHead">
        <span
          className={cn('hi-diffBadge', entry.kind === 'removed' ? 'hi-badgeRemoved' : entry.kind === 'added' ? 'hi-badgeAdded' : 'hi-badgeIdle')}
        >
          {KIND_LABEL[entry.kind]}
        </span>
        <span className="wd-nameTrunc">{entry.nodeName}</span>
      </span>
      {/* 面板很窄：路径单独一行，不然最关键的"改了哪个字段"会被截断 */}
      <span className="hi-monoBreak">{entry.path}</span>
      <span className="hi-monoBreak">
        {formatValue(entry.before)} → <span className="hi-ink">{formatValue(entry.after)}</span>
      </span>
    </li>
  );
}

/**
 * §28 分支 + §27 Duplicate。
 * 分支是"有名字的快照线"，用来并排放几个设计方向；副本是另一个项目，用来单独发布或改造。
 * 两个动作都不会丢东西：切换前服务端会先把当前现场存回原分支。
 */
function BranchSection() {
  const state = useStudio();
  const [name, setName] = useState('');
  const [copyName, setCopyName] = useState('');
  const current = state.branches.find((branch) => branch.current);

  const create = async () => {
    const text = name.trim();
    if (!text) return;
    const created = await studio.createBranch(text);
    if (created) setName('');
  };

  const duplicate = async () => {
    const id = await studio.duplicateProject(copyName.trim());
    if (id) window.location.href = `/studio/${id}`;
  };

  return (
    <div className="hi-sideHeader">
      <div className="hi-wrapCenter1">
        <span className="wd-faint11shrink">分支</span>
        {state.branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            onClick={() => {
              if (!branch.current) void studio.switchBranch(branch.id);
            }}
            disabled={state.snapshotBusy || branch.current}
            title={branch.current ? '当前分支' : `切到 ${branch.name}（当前现场会先存回${current ? `「${current.name}」` : '原分支'}）`}
            className={cn('hi-branchTab', branch.current ? 'hi-antOn' : 'hi-antOff')}
            data-branch={branch.id}
            data-branch-name={branch.name}
            data-branch-current={branch.current ? 'true' : undefined}
          >
            {branch.name}
          </button>
        ))}
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void create();
          }}
          placeholder="新分支名"
          aria-label="新分支名"
          className="hi-search84"
          data-branch-input
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={state.snapshotBusy || !name.trim()}
          className="hi-chipGhost"
          data-branch-create
        >
          开分支
        </button>
      </div>
      <div className="hi-diffHead">
        <input
          value={copyName}
          onChange={(event) => setCopyName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void duplicate();
          }}
          placeholder="副本名称（可留空）"
          aria-label="副本名称"
          className="hi-growSearch"
          data-duplicate-input
        />
        <button
          type="button"
          onClick={() => void duplicate()}
          disabled={state.snapshotBusy}
          className="hi-chipGhost"
          data-duplicate-create
        >
          复制为项目
        </button>
      </div>
    </div>
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
  const [scopeBusy, setScopeBusy] = useState(false);
  const branchNames = new Map(state.branches.map((branch) => [branch.id, branch.name]));
  const currentBranch = state.branches.find((branch) => branch.current);
  const onlyCurrent = state.snapshotScope === 'current';

  const toggleScope = async (checked: boolean) => {
    setScopeBusy(true);
    await studio.setSnapshotScope(checked ? 'current' : 'all');
    setScopeBusy(false);
  };

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
    <div className="hi-flex3Col">
      <BranchSection />
      <div className="hi-headRow">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void create();
          }}
          placeholder="快照名称"
          aria-label="快照名称"
          className="hi-growSearch12"
          data-snapshot-input
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={state.snapshotBusy}
          className="hi-chipGhost"
          data-snapshot-create
        >
          {state.snapshotBusy ? '处理中…' : '创建快照'}
        </button>
      </div>
      {state.snapshotError ? (
        <p className="hi-warnCell" data-snapshot-error>
          快照操作未完成：{state.snapshotError}
        </p>
      ) : null}
      <div className="hi-headRowTight">
        <label className="hi-cursorRow">
          <input
            type="checkbox"
            checked={onlyCurrent}
            disabled={!currentBranch || scopeBusy || state.snapshotBusy}
            onChange={(event) => void toggleScope(event.target.checked)}
            className="pp-checkBrand"
            data-snapshot-filter-current
          />
          只看当前分支
          {currentBranch ? (
            <span className="hi-monoTruncFaint" data-snapshot-filter-branch-name>
              {currentBranch.name}
            </span>
          ) : null}
        </label>
        {!currentBranch ? <span className="hi-truncFaint">现在不在任何一条分支线上</span> : null}
      </div>
      <ul className="hi-listScroll">
        {state.snapshots.map((snapshot) => {
          const comparing = state.compare?.snapshotId === snapshot.id;
          return (
          <li
            key={snapshot.id}
            className="hi-listMeta"
            data-snapshot-item={snapshot.id}
          >
            <span className="hi-row2gap">
              <span className="hi-sourceChip">
                {SOURCE_LABEL[snapshot.source] ?? snapshot.source}
              </span>
              <span className="hi-trunc12">
                {snapshot.label ?? snapshot.id.slice(0, 8)}
              </span>
              {branchNames.get(snapshot.branchId ?? '') ? (
                <span className="hi-monoFaintShrink" data-snapshot-branch={snapshot.branchId ?? ''}>
                  {branchNames.get(snapshot.branchId ?? '')}
                </span>
              ) : null}
            </span>
            <span className="hi-diffHead">
              <span className="hi-monoTrunc">
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
                aria-controls={comparing ? `snapshot-diff-${snapshot.id}` : undefined}
                className={cn('hi-chipSm', comparing ? 'hi-antOn' : 'hi-antOff')}
                data-snapshot-compare={snapshot.id}
              >
                比较
              </button>
              <button
                type="button"
                onClick={() => void restore(snapshot)}
                disabled={state.snapshotBusy}
                className={cn('hi-chipSm', pending === snapshot.id ? 'hi-restoreWarn' : 'hi-antOff')}
                data-snapshot-restore={snapshot.id}
              >
                {pending === snapshot.id ? '确认恢复' : '恢复'}
              </button>
            </span>
            {comparing && state.compare ? (
              <ul
                id={`snapshot-diff-${snapshot.id}`}
                className="hi-diffList"
                data-snapshot-diff-list={snapshot.id}
              >
                <li className="hi-cellFaintB">
                  这份快照与当前文档的差异（共 {state.compare.diff.total} 处）
                </li>
                {state.compare.diff.entries.map((diff, index) => (
                  <DiffRow key={`${diff.nodeId}:${diff.path}:${index}`} entry={diff} />
                ))}
                {!state.compare.diff.entries.length ? (
                  <li className="hi-cellFaint">这份快照和当前文档一致。</li>
                ) : null}
                {state.compare.diff.truncated ? (
                  <li className="hi-cellWarn">
                    差异过多，只列出前 {state.compare.diff.entries.length} 处。
                  </li>
                ) : null}
              </ul>
            ) : null}
          </li>
          );
        })}
        {!state.snapshots.length && !state.snapshotError ? (
          <li className="hi-cellPad" data-snapshot-empty>
            {onlyCurrent
              ? `「${currentBranch?.name ?? '当前分支'}」这条线上还没有快照；取消「只看当前分支」可以看全部。`
              : '还没有服务端快照'}
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
    <div className="wd-rootCol">
      <div className="hi-headBordered">
        <p className="hi-faint12">
          本地事务（Ctrl+Z / Ctrl+Shift+Z）。展开一条可以看变更；下方分支线可开可切，快照可以只看当前那条线、可比较、可恢复（切换与恢复都会清空本地撤销栈）。
        </p>
      </div>
      <ol className="hi-flex2Scroll">
        {state.history.map((entry) => (
          <li key={entry.id}>
            <div className="hi-stretch">
              <button
                type="button"
                onClick={() => studio.jumpTo(entry.id)}
                className={cn('hi-entryRow', entry.id === current && 'hi-entryCurrent')}
                data-history-entry={entry.label}
              >
                <span className="wd-row2">
                  <span
                    className={cn('hi-sourceChip2', entry.source === 'ai' ? 'hi-sourceAi' : 'hi-sourceIdle')}
                  >
                    {entry.source}
                  </span>
                  <span className="hi-trunc12color">{entry.label}</span>
                </span>
                <span className="hi-row2mono">
                  <span>{new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                  <span>
                    {entry.patchCount} 补丁 / {entry.diff.length} 变更
                  </span>
                  {entry.capability?.demoMode ? <span className="hi-warnInk">DEMO</span> : null}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setOpen(open === entry.id ? null : entry.id)}
                aria-expanded={open === entry.id}
                aria-controls={open === entry.id ? `history-diff-${entry.id}` : undefined}
                data-history-toggle={entry.label}
                className="hi-railToggle"
                title="查看变更明细"
              >
                {open === entry.id ? '▾' : '▸'}
              </button>
            </div>
            {open === entry.id ? (
              <ul
                id={`history-diff-${entry.id}`}
                className={cn('hi-diffList', entry.diff.length > 0 && 'hi-diffListCapped')}
                data-history-diff-list={entry.label}
              >
                {entry.diff.map((diff, index) => (
                  <DiffRow key={`${diff.nodeId}:${diff.path}:${index}`} entry={diff} />
                ))}
                {!entry.diff.length ? (
                  <li className="hi-cellFaint">这次事务没有可展示的字段级变更。</li>
                ) : null}
              </ul>
            ) : null}
          </li>
        ))}
        {!state.history.length ? (
          <li className="hi-cellPad12">还没有修改记录</li>
        ) : null}
      </ol>
      <SnapshotSection />
    </div>
  );
}
