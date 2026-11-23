'use client';

import { useEffect, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';
import { hint } from '@/lib/hintCopy';
import { TeachingHint } from '@/components/TeachingHint';
import { studio, useStudioFields, type ViewportMode } from './store';
import { viewportOptions } from './viewer-params';
import { PublishPanel } from './PublishPanel';
import { ExportPanel } from './ExportPanel';
import { shellCopy } from './shell-i18n';
import type { Locale } from '@/lib/i18n';

/**
 * 顶栏那一排视口按钮。名字与宽度都取自 `viewer-params` 那一份表：
 * 以前这里手抄了一份"移动 375 / 平板 768"，与访客页的"手机 375"两套叫法并存，
 * 而数字抄的是模型里的常量——同一件事在两个界面里长得不一样，作者会以为它们不是一回事（§16）。
 */

/** §4 顶栏：Project · File · Preview · Share · Publish + 撤销/重做 + 保存状态 + viewport 切换 */

const CJK = /[\u3400-\u9fff]/;

// 历史命令目前只有中文标签；英文气泡宁可省略细节，也不把汉字拼进英文说明。
function historySuffix(label: string, locale: Locale): string {
  return locale === 'en' && CJK.test(label) ? '' : ` ${label}`;
}

export function TopBar({ onOpenRail, credits = null, locale = 'zh', onOpenHelp }: { onOpenRail: () => void; credits?: { ai: number; grant: number; plan: string } | null; locale?: Locale; onOpenHelp?: () => void }) {
  const c = shellCopy(locale);
  const viewports: { id: ViewportMode; label: string; hint: string }[] = [
    { id: 'design', label: c.designViewLabel, hint: c.designViewHint },
    ...viewportOptions(locale).map((option) => ({
      id: option.id as ViewportMode,
      label: option.label,
      hint: c.viewportHint(option.width),
    })),
  ];
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
      ? c.saving
      : saveState === 'error'
        ? c.saveFailed(saveError)
        : dirty
          ? c.unsavedChanges
          : savedAt
            ? c.savedAt(new Date(savedAt).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'zh-CN', { hour12: false }))
            : c.synced;
  const undoButton = (
    <TopButton label={c.undo} shortcut="Ctrl+Z" disabled={!canUndo} onClick={() => studio.undo()} />
  );
  const redoButton = (
    <TopButton label={c.redo} shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={() => studio.redo()} />
  );

  return (
    <header className="sp-topbar">
      <TeachingHint hintId="studio.topbar.rail" locale={locale}>
        <button
          type="button"
          onClick={onOpenRail}
          className="sp-railToggle"
        >
          {c.railToggle}
        </button>
      </TeachingHint>
      <a href="/" className="sp-wordmark">
        NEXUS
      </a>
      <span className="sp-divider" />
      {editingName ? (
        <input aria-label={c.projectNameAria}
          ref={nameRef}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
            if (e.key === 'Escape') setEditingName(false);
            e.stopPropagation();
          }}
          className="sp-nameInput"
        />
      ) : (
        <TeachingHint hintId="studio.topbar.rename" locale={locale}>
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="sp-nameBtn"
            data-project-name
          >
            {documentName || c.defaultProjectName}
          </button>
        </TeachingHint>
      )}

      <div className="sp-toolGroup">
        {undoLabel ? (
          <TeachingHint text={`${hint('studio.topbar.undo', locale)}${historySuffix(undoLabel, locale)}`} locale={locale}>
            {undoButton}
          </TeachingHint>
        ) : undoButton}
        {redoLabel ? (
          <TeachingHint text={`${hint('studio.topbar.redo', locale)}${historySuffix(redoLabel, locale)}`} locale={locale}>
            {redoButton}
          </TeachingHint>
        ) : redoButton}
      </div>

      <div className="sp-actions">
        {credits ? <CreditChip credits={credits} locale={locale} /> : null}
        <span className={cn('sp-saveState', saveState === 'error' ? 'sp-saveErr' : 'sp-saveIdle')} data-save-state>
          {saveLabel}
        </span>
        <div className="sp-toolGroup">
          {viewports.map((v) => (
            <TeachingHint key={v.id} text={v.hint} locale={locale}>
              <button
                type="button"
                onClick={() => studio.setViewport(v.id)}
                data-viewport={v.id}
                className={cn(
                  'sp-viewportBtn',
                  viewport === v.id ? 'sp-viewportOn' : 'sp-viewportOff',
                )}
              >
                {v.label}
              </button>
            </TeachingHint>
          ))}
        </div>
        <TeachingHint hintId="studio.topbar.themeMode" locale={locale}>
          <select
            value={activeMode ?? 'default'}
            onChange={(e) => studio.setMode(e.target.value === 'default' ? null : e.target.value)}
            data-theme-mode
            className="sp-modeSelect"
          >
            <option value="default">{c.defaultThemeLabel}</option>
            {modes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </TeachingHint>
        <TeachingHint hintId="studio.topbar.grid" locale={locale}>
          <TopButton
            label={c.grid}
            shortcut="Ctrl+G"
            active={grid}
            onClick={() => studio.toggleGrid()}
          />
        </TeachingHint>
        <ExportPanel locale={locale} />
        {onOpenHelp ? (
          <TeachingHint hintId="studio.topbar.help" locale={locale}>
            <button
              type="button"
              onClick={onOpenHelp}
              className="sp-helpToggle"
              data-help-open
            >
              {c.helpToggle}
            </button>
          </TeachingHint>
        ) : null}
        <PublishPanel locale={locale} />
        <TeachingHint hintId="studio.topbar.preview" locale={locale}>
          <a
            href={`/preview/${projectId}`}
            className="sp-previewLink"
          >
            {c.preview}
          </a>
        </TeachingHint>
      </div>
    </header>
  );
}

function TopButton(props: ComponentPropsWithoutRef<'button'> & { label: string; shortcut?: string; active?: boolean }) {
  const { label, shortcut, active: _active, ...buttonProps } = props;
  const keyshortcuts = shortcut === 'Ctrl+Z' ? 'Control+Z' : shortcut === 'Ctrl+Shift+Z' ? 'Control+Shift+Z' : shortcut === 'Ctrl+G' ? 'Control+G' : undefined;
  return (
    <button
      {...buttonProps}
      type="button"
      aria-pressed={props.active}
      aria-keyshortcuts={keyshortcuts}
      className={cn(
        'sp-topBtn',
        props.active ? 'sp-topBtnOn' : 'sp-topBtnOff',
        props.disabled && 'sp-topBtnDisabled',
      )}
    >
      {label}
    </button>
  );
}

/**
 * 顶栏 AI 额度芯片（v703）：让"这次编辑还够不够 AI"在余光里可见。
 * - 余额由服务端 page 直读（`readCredits`），null = 读不到就整片不渲染（§3 不猜）；
 * - 低额度（<15%）变琥珀辉光、零时变红，提醒的是"再点就要不到额度"，不是吓人；
 * - 纯 CSS 宽条过渡，无 JS 动画；做的是一跳到 /credits 的入口，不在这里扣款。
 */
function CreditChip({ credits, locale = 'zh' }: { credits: { ai: number; grant: number; plan: string }; locale?: Locale }) {
  const c = shellCopy(locale);
  const grant = Math.max(0, credits.grant);
  const balance = Math.max(0, credits.ai);
  const pct = grant > 0 ? Math.min(100, Math.max(0, Math.round((balance / grant) * 100))) : 0;
  const tone =
    balance === 0
      ? 'sp-creditChip sp-creditChipZero'
      : pct < 15
        ? 'sp-creditChip sp-creditChipWarm'
        : 'sp-creditChip';
  const fill =
    balance === 0
      ? 'sp-creditChipFill sp-creditChipFillZero'
      : pct < 15
        ? 'sp-creditChipFill sp-creditChipFillWarn'
        : 'sp-creditChipFill';
  return (
    <a
      href="/credits"
      title={c.creditTitle(balance, grant, credits.plan)}
      data-credit-chip={balance}
      className={tone}
    >
      <span className="sp-creditChipLabel">AI</span>
      <span className="sp-creditChipBalance">{balance}<span className="sp-creditChipGrant">/{grant}</span></span>
      <span className="sp-creditChipTrack" aria-hidden="true">
        <span className={fill} style={{ width: `${pct}%` }} />
      </span>
    </a>
  );
}
