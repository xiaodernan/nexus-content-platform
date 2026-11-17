'use client';

import { useEffect, useState } from 'react';
import { isControlTarget, isEditableTarget } from '@/lib/keyboard';
import type { Locale } from '@/lib/i18n';

/** 双语：chrome 每行文案按 cookie locale 选（不夹杂） */
const KB_TXT = {
  zh: {
    fabClose: '关闭快捷键速览',
    fabOpen: '打开快捷键速览',
    pressQuestion: '按 ? 也行',
    close: '关闭',
    title: '快捷键速览',
    ariaLabel: '快捷键速览',
    macOS: '本机识别为 macOS · ⌘ 即 Ctrl。',
    otherOS: '本机是 Windows / Linux · 文中 ⌘ 对应 Ctrl（Ctrl Z = ⌘Z）。',
    honestyNote1: '代码里查得到的才列——少而准，不填充。',
    honestyNote2: '不起眼的键少不了，是因为它们没有被任何地方偷偷吃掉。',
  },
  en: {
    fabClose: 'Close the shortcut cheatsheet',
    fabOpen: 'Open the shortcut cheatsheet',
    pressQuestion: '? also works',
    close: 'Close',
    title: 'Shortcut cheatsheet',
    ariaLabel: 'Shortcut cheatsheet',
    macOS: 'Detected macOS — ⌘ means Ctrl.',
    otherOS: 'Detected Windows / Linux — ⌘ in these notes means Ctrl (Ctrl Z = ⌘Z).',
    honestyNote1: 'Only what can be found in the code is listed — few and accurate, no padding.',
    honestyNote2: 'No shortcut was hidden from you — the hard-to-notice keys are here exactly because no other surface quietly swallowed them.',
  },
} as const;

/**
 * §FE-KB 「?」快捷键速览——全站真实快捷键清单（2026-11-14）。
 *
 * 诚实边界：本面板里列出的每一条，都能在代码里查到对应的键处理
 * （studio/CanvasStage · studio/CommandBar · components/CommandPalette ·
 *  lib/command-palette/input · components/ConstellationPanel）。
 * 多出来的行（没人用的自造键）一个不写。少即是多：宁可短，不容假。
 */

interface ShortcutRow {
  keys: string;
  action: string;
}
interface ShortcutGroup {
  id: string;
  title: string;
  scope: string;
  rows: ShortcutRow[];
}

const GROUPS: ShortcutGroup[] = [
  {
    id: 'global',
    title: '全局',
    scope: '任意页面',
    rows: [
      { keys: '⌘ K / Ctrl K', action: '打开命令面板（在输入框里只认 ⌘K）' },
      { keys: '?', action: '打开 / 关闭本速览' },
      { keys: 'Esc', action: '关闭命令面板（本速览也有效）' },
    ],
  },
  {
    id: 'studio',
    title: 'Studio 画布',
    scope: '/studio/<project>',
    rows: [
      { keys: 'Ctrl Z / ⌘ Z', action: '撤销' },
      { keys: 'Ctrl Y / ⌘ Y', action: '重做' },
      { keys: 'Ctrl S / ⌘ S', action: '保存' },
      { keys: 'Ctrl A / ⌘ A', action: '全选顶层元素' },
      { keys: 'Ctrl G / ⌘ G', action: '显示 / 隐藏网格' },
      { keys: 'Shift 1 / Ctrl 0 / ⌘ 0', action: '适配窗口' },
      { keys: 'Delete / Backspace', action: '删除选中' },
      { keys: '方向键', action: '移动选中 1px' },
      { keys: 'Shift + 方向键', action: '移动选中 8px' },
      { keys: 'Esc', action: '清除选中' },
    ],
  },
  {
    id: 'palette',
    title: '命令面板内',
    scope: '⌘K 打开后',
    rows: [
      { keys: '↑ / ↓', action: '移动选择' },
      { keys: 'Enter', action: '执行选中项' },
      { keys: '直接输入', action: '按标签/关键字过滤（带权重排序）' },
    ],
  },
  {
    id: 'commandbar',
    title: '提示词命令条',
    scope: '/studio/<project>',
    rows: [
      { keys: '/', action: '聚焦命令条输入框' },
      { keys: 'Enter', action: '发送' },
      { keys: 'Shift Enter', action: '换行（不发送）' },
    ],
  },
  {
    id: 'constellation',
    title: '人物关系星图',
    scope: '/world/<project>/constellation',
    rows: [
      { keys: 'Enter / Space', action: '选 / 取消选这颗星' },
      { keys: 'Tab', action: '按顺序游走所有星' },
    ],
  },
  {
    id: 'chronicle',
    title: '世界编年',
    scope: '/world/<project>/chronicle',
    rows: [
      { keys: 'Tab', action: '聚焦横向走廊容器，之后可用方向键（原生滚动）' },
    ],
  },
];

/** GROUPS 的英文镜像（v814）：同键、同组序，逐行对应 */
const GROUPS_EN: ShortcutGroup[] = [
  {
    id: 'global',
    title: 'Global',
    scope: 'Any page',
    rows: [
      { keys: '⌘ K / Ctrl K', action: 'Open the command palette (inside inputs only ⌘K counts)' },
      { keys: '?', action: 'Toggle this cheatsheet' },
      { keys: 'Esc', action: 'Close the command palette (also works here)' },
    ],
  },
  {
    id: 'studio',
    title: 'Studio canvas',
    scope: '/studio/<project>',
    rows: [
      { keys: 'Ctrl Z / ⌘ Z', action: 'Undo' },
      { keys: 'Ctrl Y / ⌘ Y', action: 'Redo' },
      { keys: 'Ctrl S / ⌘ S', action: 'Save' },
      { keys: 'Ctrl A / ⌘ A', action: 'Select all top-level elements' },
      { keys: 'Ctrl G / ⌘ G', action: 'Show / hide grid' },
      { keys: 'Shift 1 / Ctrl 0 / ⌘ 0', action: 'Fit window' },
      { keys: 'Delete / Backspace', action: 'Delete selection' },
      { keys: 'Arrow keys', action: 'Move selection by 1px' },
      { keys: 'Shift + Arrow keys', action: 'Move selection by 8px' },
      { keys: 'Esc', action: 'Clear selection' },
    ],
  },
  {
    id: 'palette',
    title: 'In the palette',
    scope: 'After ⌘K opens it',
    rows: [
      { keys: '↑ / ↓', action: 'Move the selection' },
      { keys: 'Enter', action: 'Run the highlighted entry' },
      { keys: 'Just type', action: 'Filter by label / keywords (weighted ranking)' },
    ],
  },
  {
    id: 'commandbar',
    title: 'Prompt command bar',
    scope: '/studio/<project>',
    rows: [
      { keys: '/', action: 'Focus the command bar input' },
      { keys: 'Enter', action: 'Send' },
      { keys: 'Shift Enter', action: 'New line (does not send)' },
    ],
  },
  {
    id: 'constellation',
    title: 'Character constellation',
    scope: '/world/<project>/constellation',
    rows: [
      { keys: 'Enter / Space', action: 'Select / deselect this star' },
      { keys: 'Tab', action: 'Walk every star in order' },
    ],
  },
  {
    id: 'chronicle',
    title: 'World chronicle',
    scope: '/world/<project>/chronicle',
    rows: [
      { keys: 'Tab', action: 'Focus the horizontal corridor container, then arrow keys work (native scroll)' },
    ],
  },
];

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function KeyboardCheatsheet({ locale = 'zh' }: { locale?: Locale }) {
  const KB = KB_TXT[locale];
  const GROUPS_SEL = locale === 'en' ? GROUPS_EN : GROUPS;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target);
      const control = isControlTarget(event.target);

      // Esc 总是能关（不拦截其它用途——没有面板打开时它啥也不做）
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      // 面板自己可见时，? 再按一次关闭
      // ? 就是 Shift + /（或直接 ?，兼容欧洲键位）
      const wantsCheatsheet = event.key === '?' || (event.shiftKey && event.code === 'Slash');
      if (wantsCheatsheet && !editable && !control) {
        // 命令面板开着时不抢键——那边的输入区才轮到用户
        if (typeof document !== 'undefined' && document.querySelector('[data-command-palette-root]')) return;
        event.preventDefault();
        setOpen((v) => !v);
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // 面板开时锁屏（body overflow hidden），关时恢复
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = open ? 'hidden' : previous;
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="kb-fab"
        aria-label={open ? KB.fabClose : KB.fabOpen}
        aria-expanded={open}
        aria-controls="kb-sheet"
        data-kb-fab
        onClick={() => setOpen((v) => !v)}
        title={KB.pressQuestion}
      >
        ?
      </button>

      {open ? (
        <div className="kb-backdrop" role="presentation" onClick={() => setOpen(false)} data-kb-backdrop>
          <div
            id="kb-sheet"
            className="kb-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={KB.ariaLabel}
            data-kb-sheet
            onClick={(event) => event.stopPropagation()}
          >
            <header className="kb-head">
              <p className="kb-kicker">SHORTCUTS</p>
              <h2 className="kb-title">{KB.title}</h2>
              <p className="kb-note">
                {IS_MAC ? KB.macOS : KB.otherOS}
                {KB.honestyNote1}
                {KB.honestyNote2}
              </p>
              <button type="button" className="kb-close" onClick={() => setOpen(false)} aria-label={KB.close}>×</button>
            </header>
            <div className="kb-groups" data-kb-groups>
              {GROUPS_SEL.map((group) => (
                <section key={group.id} className="kb-group" data-kb-group={group.id} aria-label={group.title}>
                  <div className="kb-groupHead">
                    <h3 className="kb-groupTitle">{group.title}</h3>
                    <p className="kb-groupScope">{group.scope}</p>
                  </div>
                  <ul className="kb-rows">
                    {group.rows.map((row) => (
                      <li key={row.keys} className="kb-row" data-kb-row>
                        <kbd className="kb-key" data-kb-key>{row.keys}</kbd>
                        <span className="kb-action">{row.action}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
