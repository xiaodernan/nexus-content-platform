'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from 'react';
import {
  groupOf,
  GROUP_LABEL,
  PALETTE_COMMANDS,
  type PaletteAction,
  type PaletteCommand,
} from '@/lib/command-palette/commands';
import { clampActive, isPaletteHotkey, moveActive } from '@/lib/command-palette/input';
import { shouldShowChip } from '@/lib/command-palette/placement';
import { rank, type MatchRange, type Ranked } from '@/lib/command-palette/score';
import { isTheme, THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * §CP-1 全站命令面板（⌘K / Ctrl+K）。
 *
 * ## 它解决什么
 *
 * 这个产品的路由已经长到十几条，管理台还有十几张页。此前从 `/credits` 去
 * `/marketplace/earnings` 只有两种走法：记住路径，或者回首页再点两下。
 * 命令面板把「我记得有那么个页面」变成一次按键 + 三个字符。
 *
 * ## 四条与全仓一致的诚实
 *
 * 1. **不画假结果**：`rank()` 匹配不上就是空列表，空列表说"没有匹配的命令"，
 *    绝不退回"猜你可能想看这些"——那会把一次没找到变成一次误导。
 * 2. **管理台不在表里**（见 `commands.ts` 顶部那段）：代价与理由都写在那边。
 * 3. **焦点是要还的**：打开时记住 `document.activeElement`，关闭时还回去。
 *    不还的话，用户按 Esc 之后焦点落回 `<body>`，键盘 Tab 从页首重来。
 * 4. **⌘K 在输入框里也开、纯 Ctrl+K 在输入框里放手**：判据在
 *    `command-palette/input.ts` 的 `isPaletteHotkey`，理由写在那个函数上。
 *
 * ## 为什么只让输入框可聚焦（而不是给每一行 tabIndex）
 *
 * 这是 WAI-ARIA 1.2 的"combobox + listbox"模式：高亮由 `aria-activedescendant` 表达，
 * 焦点始终在输入框里。好处是**不存在焦点陷阱要维护**——整个对话框只有一个可聚焦元素，
 * Tab 被就地吃掉即可。代价是列表行不能单独被 Tab 到（读屏仍会念，因为 activedescendant
 * 指过去了），这是这种控件的标准取舍。
 *
 * ## 最近使用
 *
 * `localStorage` 里存最近用过的 8 个 id，只用来**同分时加权**，不改变匹配与否。
 * 有界、失败静默（隐私模式下写不进去也不影响功能）。**不存查询串**——
 * 用户敲过什么可能包含项目名，那是内容不是偏好。
 */

const RECENT_KEY = 'nexus.palette.recent';
const RECENT_MAX = 8;
/** 同分时"最近用过"能加多少。取 6：足够把一条常用命令提到同分组的首位，又翻不过一条更高分的匹配。 */

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function writeRecent(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, RECENT_MAX)));
  } catch {
    /* 写不进去就当没有"最近"这一维，功能不受影响 */
  }
}

function Highlight({ text, ranges }: { text: string; ranges: readonly MatchRange[] }): ReactElement {
  if (!ranges.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      out.push(<span key={`s${cursor}`}>{text.slice(cursor, range.start)}</span>);
    }
    out.push(
      <mark key={`m${range.start}`} className="cp-hit">
        {text.slice(range.start, range.end)}
      </mark>,
    );
    cursor = range.end;
  }
  if (cursor < text.length) out.push(<span key={`t${cursor}`}>{text.slice(cursor)}</span>);
  return <>{out}</>;
}

export function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<readonly string[]>([]);
  const [mac, setMac] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // 平台只影响显示 ⌘K 还是 Ctrl+K。挂载后再读，首帧与 SSR 一致（不会有 hydration 差异）。
  useEffect(() => {
    setMac(/Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent));
  }, []);

  const results = useMemo(() => {
    const weight = new Map(recent.map((id, index) => [id, RECENT_MAX - index]));
    return rank(PALETTE_COMMANDS, query, { boost: (command) => weight.get(command.id) ?? 0 });
  }, [query, recent]);

  // 渲染顺序 = 键盘顺序：先按组分块（前往 → 查看 → 动作），块内保留分数序。
  // 少了这一步，上下键的落点就会与眼睛看到的顺序不一致——那是最容易让人以为"键盘坏了"的错。
  const ordered: Ranked<PaletteCommand>[] = useMemo(
    () => groupOf(results, (entry) => entry.item.group).flatMap((block) => block.items),
    [results],
  );

  const blocks = useMemo(() => groupOf(ordered, (entry) => entry.item.group), [ordered]);

  // 行号不让渲染过程自己数（`let i = 0` 在 map 里自增是渲染期副作用，StrictMode 下双渲染会露出马脚），
  // 改成一次建表：id → 在 ordered 里的位置。
  const indexById = useMemo(
    () => new Map(ordered.map((entry, index) => [entry.item.id, index])),
    [ordered],
  );

  const close = useCallback(() => {
    setOpen(false);
    const target = restoreRef.current;
    restoreRef.current = null;
    // 还焦点。放到下一帧：面板还在卸载中时 focus() 会被吞掉。
    if (target) window.requestAnimationFrame(() => target.focus());
  }, []);

  const openPalette = useCallback(() => {
    const current = document.activeElement;
    restoreRef.current = current instanceof HTMLElement ? current : null;
    setRecent(readRecent());
    setQuery('');
    setActive(0);
    setOpen(true);
  }, []);

  const remember = useCallback((id: string) => {
    const next = [id, ...readRecent().filter((item) => item !== id)].slice(0, RECENT_MAX);
    writeRecent(next);
  }, []);

  const doAction = useCallback((action: PaletteAction) => {
    if (action === 'toggle-theme') {
      const root = document.documentElement;
      const current = root.getAttribute('data-nexus-theme');
      const next = isTheme(current) && current === 'light' ? 'dark' : 'light';
      root.setAttribute('data-nexus-theme', next);
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* 与 ThemeToggle 同口径：写不了也照样在本页生效 */
      }
      return;
    }
    if (action === 'copy-link') {
      const clipboard = window.navigator.clipboard;
      if (clipboard) {
        void clipboard.writeText(window.location.href).catch(() => {
          /* 剪贴板被拒（非 https / 无权限）时什么都不做，也不假装复制成功 */
        });
      }
      return;
    }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }, []);

  const run = useCallback(
    (command: PaletteCommand) => {
      remember(command.id);
      setOpen(false);
      restoreRef.current = null;
      if (command.kind === 'nav') {
        router.push(command.href);
        return;
      }
      doAction(command.action);
    },
    [doAction, remember, router],
  );

  // 全局热键。依赖 open 是因为同一个键要能开也能关。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isPaletteHotkey(event)) {
        event.preventDefault();
        if (open) close();
        else openPalette();
        return;
      }
      if (open && event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close, openPalette]);

  // 打开时锁滚动，关闭时还原成原来的值（不是硬写回 ''——页面可能本来就有内联样式）。
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // 打开后把焦点交给输入框。用 rAF 而不是直接 focus()：面板子树这一帧才挂上。
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // 结果集缩小时把高亮夹回合法范围；缩到 0 条就是 -1（"没得选"）。
  useEffect(() => {
    setActive((current) => clampActive(current, ordered.length));
  }, [ordered.length]);

  const activeId = active >= 0 && active < ordered.length ? `cp-opt-${ordered[active]!.item.id}` : undefined;

  function onInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => moveActive(current, 1, ordered.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => moveActive(current, -1, ordered.length));
      return;
    }
    if (event.key === 'Enter') {
      const picked = active >= 0 ? ordered[active] : undefined;
      if (picked) {
        event.preventDefault();
        run(picked.item);
      }
      return;
    }
    if (event.key === 'Tab') {
      // 整个对话框只有输入框可聚焦（见文件头"为什么只让输入框可聚焦"）。
      // 让它 Tab 出去等于把用户丢到页面上一个看不见的地方，所以就地吃掉。
      event.preventDefault();
    }
  }

  const modifier = mac ? '⌘' : 'Ctrl';

  return (
    <>
      {shouldShowChip(pathname) ? (
        <button
          type="button"
          onClick={openPalette}
          className="cp-chip"
          data-command-palette-chip
          aria-label={`打开命令面板（${modifier}+K）`}
          aria-keyshortcuts={`${mac ? 'Meta' : 'Control'}+K`}
        >
          <Search size={13} aria-hidden />
          <span className="cp-chipText">命令</span>
          <kbd className="cp-kbd">{modifier} K</kbd>
        </button>
      ) : null}

      {open ? (
        <div
          className="cp-backdrop"
          data-command-palette-root
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            className="cp-panel"
            role="dialog"
            aria-modal="true"
            aria-label="命令面板"
            data-command-palette-dialog
          >
            <div className="cp-search">
              <Search size={15} aria-hidden className="cp-searchIcon" />
              <input
                ref={inputRef}
                className="cp-input"
                data-command-palette-input
                type="text"
                role="combobox"
                aria-expanded="true"
                aria-controls="cp-list"
                aria-autocomplete="list"
                aria-activedescendant={activeId}
                aria-label="搜索命令"
                placeholder="输入命令、页面名…"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKeyDown}
              />
              <kbd className="cp-kbd">Esc</kbd>
            </div>

            {ordered.length === 0 ? (
              <div className="cp-empty" data-command-palette-empty>
                <p className="cp-emptyTitle">没有匹配的命令</p>
                <p className="cp-emptyNote">
                  只匹配命令名与它的关键词（顺序敏感，比如「额度」或「token」）。
                  面板刻意不猜你想去哪。
                </p>
              </div>
            ) : (
              <div className="cp-list" id="cp-list" role="listbox" aria-label="命令">
                {blocks.map((block) => (
                  <div key={block.group} className="cp-block" role="group" aria-label={GROUP_LABEL[block.group]}>
                    <div className="cp-blockHead" aria-hidden="true">
                      {GROUP_LABEL[block.group]}
                    </div>
                    {block.items.map((entry) => {
                      const command = entry.item;
                      const index = indexById.get(command.id) ?? -1;
                      const isActive = index === active;
                      return (
                        <div
                          key={command.id}
                          id={`cp-opt-${command.id}`}
                          role="option"
                          aria-selected={isActive}
                          data-command-palette-row={command.id}
                          data-command-palette-active={isActive ? 'true' : undefined}
                          className={isActive ? 'cp-row cp-rowActive' : 'cp-row'}
                          onMouseMove={() => {
                            if (!isActive) setActive(index);
                          }}
                          onClick={() => run(command)}
                        >
                          <span className="cp-label">
                            <Highlight text={command.label} ranges={entry.ranges} />
                          </span>
                          <span className="cp-hint">
                            {command.kind === 'nav' ? command.href : '动作'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}

            <div className="cp-foot">
              <span className="cp-footGroup">
                <kbd className="cp-kbd">↑</kbd>
                <kbd className="cp-kbd">↓</kbd>
                选择
              </span>
              <span className="cp-footGroup">
                <kbd className="cp-kbd">↵</kbd>
                执行
              </span>
              <span className="cp-count" data-command-palette-count>
                {ordered.length} 条
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
