'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { studio, useStudioFields, type ViewportMode } from './store';
import { BREAKPOINT_LABELS, VIEWPORT_OPTIONS } from './viewer-params';
import { PublishPanel } from './PublishPanel';
import { ExportPanel } from './ExportPanel';

/**
 * 顶栏那一排视口按钮。名字与宽度都取自 `viewer-params` 那一份表：
 * 以前这里手抄了一份"移动 375 / 平板 768"，与访客页的"手机 375"两套叫法并存，
 * 而数字抄的是模型里的常量——同一件事在两个界面里长得不一样，作者会以为它们不是一回事（§16）。
 */
const VIEWPORTS: { id: ViewportMode; label: string; hint: string }[] = [
  { id: 'design', label: '设计', hint: '模型原始画布宽度' },
  ...VIEWPORT_OPTIONS.map((option) => ({
    id: option.id as ViewportMode,
    label: `${BREAKPOINT_LABELS[option.id]} ${option.width}`,
    hint: `按 ${option.width}px 重新求解布局`,
  })),
];

/** §4 顶栏：Project · File · Preview · Share · Publish + 撤销/重做 + 保存状态 + viewport 切换 */
export function TopBar({ onOpenRail, credits = null }: { onOpenRail: () => void; credits?: { ai: number; grant: number; plan: string } | null }) {
  // §147 选中响应：顶栏只关心文档名 / 保存状态 / 视口 / 主题 mode，这些在选中时都不变。
  // 用选式子订阅，选中（commit 换了整快照对象）不再把顶栏也拖着重渲染。
  const { documentName, saveState, saveError, dirty, savedAt, canUndo, canRedo, undoLabel, redoLabel, viewport, activeMode, projectId, modes, grid } =
    useStudioFields((s) => ({
      documentName: s.document?.name ?? '',
      saveState: s.saveState,
      saveError: s.saveError,
      dirty: s.dirty,
      savedAt: s.savedAt,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      undoLabel: s.undoLabel,
      redoLabel: s.redoLabel,
      viewport: s.viewport,
      activeMode: s.activeMode,
      projectId: s.projectId,
      modes: s.document?.metadata?.modes ?? [],
      grid: s.grid,
    }));
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(documentName);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingName) nameRef.current?.select();
  }, [editingName]);

  useEffect(() => setNameDraft(documentName), [documentName]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== documentName) studio.renameDocument(trimmed);
    setEditingName(false);
  };

  const saveLabel =
    saveState === 'saving'
      ? '保存中…'
      : saveState === 'error'
        ? `保存失败：${saveError ?? '未知错误'}`
        : dirty
          ? '有未保存改动'
          : savedAt
            ? `已保存 ${new Date(savedAt).toLocaleTimeString('zh-CN', { hour12: false })}`
            : '已同步';

  return (
    <header className="relative z-[60] flex h-[var(--nexus-space-10)] shrink-0 items-center gap-[var(--nexus-space-3)] border-b border-[var(--nexus-color-border-subtle)] bg-bg-1 px-[var(--nexus-space-3)]">
      <button
        type="button"
        onClick={onOpenRail}
        className="rounded-[var(--nexus-radius-sm)] px-[var(--nexus-space-2)] py-1 text-13 text-fg-2 hover:bg-bg-2 lg:hidden"
      >
        面板
      </button>
      <a href="/" className="inline-flex min-h-6 items-center font-mono text-13 tracking-[.18em] text-fg-2">
        NEXUS
      </a>
      <span className="h-4 w-px bg-[var(--nexus-color-border-subtle)]" />
      {editingName ? (
        <input aria-label="项目名"
          ref={nameRef}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
            if (e.key === 'Escape') setEditingName(false);
            e.stopPropagation();
          }}
          className="w-[220px] rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-14"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingName(true)}
          title="重命名项目"
          className="inline-flex min-h-6 max-w-[280px] items-center truncate text-14 font-medium"
          data-project-name
        >
          {documentName || '未命名项目'}
        </button>
      )}

      <div className="flex items-center gap-1">
        <TopButton label="撤销" shortcut="Ctrl+Z" disabled={!canUndo} title={undoLabel ?? undefined} onClick={() => studio.undo()} />
        <TopButton label="重做" shortcut="Ctrl+Shift+Z" disabled={!canRedo} title={redoLabel ?? undefined} onClick={() => studio.redo()} />
      </div>

      <div className="ml-auto flex items-center gap-[var(--nexus-space-2)]">
        {credits ? <CreditChip credits={credits} /> : null}
        <span className={cn('font-mono text-12', saveState === 'error' ? 'text-danger-ink' : 'text-fg-3')} data-save-state>
          {saveLabel}
        </span>
        <div className="flex items-center gap-1">
          {VIEWPORTS.map((v) => (
            <button
              key={v.id}
              type="button"
              title={v.hint}
              onClick={() => studio.setViewport(v.id)}
              data-viewport={v.id}
              className={cn(
                'rounded-[var(--nexus-radius-sm)] px-[var(--nexus-space-2)] py-1 text-12',
                viewport === v.id ? 'bg-brand text-accent-fg' : 'text-fg-3 hover:bg-bg-2',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <select
          value={activeMode ?? 'default'}
          onChange={(e) => studio.setMode(e.target.value === 'default' ? null : e.target.value)}
          data-theme-mode
          className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-2"
          title="Token 主题 mode"
        >
          <option value="default">默认主题</option>
          {modes.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <TopButton label="网格" shortcut="Ctrl+G" active={grid} onClick={() => studio.toggleGrid()} />
        <ExportPanel />
        <PublishPanel />
        <a
          href={`/preview/${projectId}`}
          className="rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-strong)] px-[var(--nexus-space-3)] py-1 text-13 text-fg-2"
          title="只读运行预览（任务 #7 接入运行态投影）"
        >
          预览
        </a>
      </div>
    </header>
  );
}

function TopButton(props: { label: string; shortcut?: string; disabled?: boolean; active?: boolean; title?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.shortcut ? `${props.label}（${props.shortcut}）` : props.label}
      aria-pressed={props.active}
      className={cn(
        'rounded-[var(--nexus-radius-sm)] px-[var(--nexus-space-2)] py-1 text-12',
        props.active ? 'bg-brand text-accent-fg' : 'text-fg-2 hover:bg-bg-2',
        props.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
      )}
    >
      {props.label}
    </button>
  );
}

/**
 * 顶栏 AI 额度芯片（v703）：让"这次编辑还够不够 AI"在余光里可见。
 * - 余额由服务端 page 直读（`readCredits`），null = 读不到就整片不渲染（§3 不猜）；
 * - 低额度（<15%）变琥珀辉光、零时变红，提醒的是"再点就要不到额度"，不是吓人；
 * - 纯 CSS 宽条过渡，无 JS 动画；做的是一跳到 /credits 的入口，不在这里扣款。
 */
function CreditChip({ credits }: { credits: { ai: number; grant: number; plan: string } }) {
  const grant = Math.max(0, credits.grant);
  const balance = Math.max(0, credits.ai);
  const pct = grant > 0 ? Math.min(100, Math.max(0, Math.round((balance / grant) * 100))) : 0;
  const tone =
    balance === 0
      ? 'border-danger-ink/60 text-danger-ink'
      : pct < 15
        ? 'border-warn/60 text-warn-ink'
        : 'border-[var(--nexus-color-brand)]/40 text-accent-2-ink';
  const fill =
    balance === 0
      ? 'bg-danger-ink'
      : pct < 15
        ? 'bg-warn'
        : 'bg-gradient-to-r from-[var(--nexus-color-brand)] via-[var(--nexus-color-accent-1)] to-[var(--nexus-color-accent-2)]';
  return (
    <a
      href="/credits"
      title={`AI 额度 ${balance}/${grant}（${credits.plan} 档）· 点开 /credits 看燃烧速度`}
      data-credit-chip={balance}
      className={cn('flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-11', tone)}
    >
      <span className="text-fg-4">AI</span>
      <span className="font-mono tabular-nums">{balance}<span className="text-fg-4">/{grant}</span></span>
      <span className="h-1 w-8 overflow-hidden rounded-full bg-[var(--nexus-color-border-subtle)]" aria-hidden="true">
        <span className={cn('block h-full rounded-full transition-[width] duration-700', fill)} style={{ width: `${pct}%` }} />
      </span>
    </a>
  );
}
