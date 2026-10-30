'use client';

import { useEffect, useRef, useState } from 'react';
import {
  addSearchHistory,
  readSearchHistory,
  removeSearchHistory,
  writeSearchHistory,
} from './search-history';

/**
 * §165 搜索框：建议 + 历史。
 *
 * 三个诚实性问题，这一版都按"不装作"处理：
 * 1. **建议来自真的命中**，不是猜词：`/api/search/suggest` 复用 `searchPlatform` 的同一份
 *    可见性判定，只把标题与链接挑出来。搜不到的东西不会被"建议"出来。
 * 2. **历史只在这台设备**：localStorage，不上传；清空按钮就是真的删掉。
 * 3. **没有 JS 也能搜**：表单还是原生 GET；建议与历史是增强，不是唯一入口。
 *
 * 键盘照 combobox 的惯例：↓/↑ 移动、Enter 打开选中的那条、Esc 收起。
 */

interface Suggestion {
  id: string;
  title: string;
  detail: string | null;
  href: string;
  group: string;
  label: string;
}

const MIN_QUERY = 2;

export function SearchBox({ initialQuery }: { initialQuery: string }) {
  const [value, setValue] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [history, setHistory] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // 历史只能在挂载后读：服务端渲染时没有 localStorage，先渲染空列表才不会水合不一致
  useEffect(() => {
    setHistory(readSearchHistory(window.localStorage));
  }, []);

  // 输入防抖 250ms；上一发请求在下一发开始时中止，慢响应不会盖掉新输入
  useEffect(() => {
    const q = value.trim();
    abortRef.current?.abort();
    if (q.length < MIN_QUERY) {
      setSuggestions([]);
      setOpen(false);
      setActive(-1);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const run = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { suggestions?: Suggestion[] };
        if (controller.signal.aborted) return;
        setSuggestions(body.suggestions ?? []);
        setOpen(true);
        setActive(-1);
      } catch {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setOpen(false);
      }
    };
    const timer = window.setTimeout(() => {
      void run();
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const remember = (query: string): void => {
    const next = addSearchHistory(readSearchHistory(window.localStorage), query);
    writeSearchHistory(window.localStorage, next);
    setHistory(next);
  };

  const go = (href: string): void => {
    remember(value);
    window.location.assign(href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === 'ArrowDown') {
      if (!suggestions.length) return;
      event.preventDefault();
      // Esc 收起之后 ↓ 应当把列表重新打开并落在第一条——这是 combobox 的惯例，
      // 也是"收起"不等于"这一版建议作废"
      if (!open) {
        setOpen(true);
        setActive(0);
        return;
      }
      setActive((current) => (current + 1) % suggestions.length);
      return;
    }
    if (!open || !suggestions.length) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      go(suggestions[active]!.href);
    }
  };

  const showHistory = !value.trim() && history.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <form
        action="/search"
        method="get"
        className="flex items-center gap-2"
        data-search-form
        onSubmit={() => remember(value)}
      >
        <input
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          aria-label="搜索内容"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `search-suggestion-${active}` : undefined}
          autoComplete="off"
          data-search-input
          placeholder="项目 / 用户 / 世界 / 游戏 / 角色 / 设计稿 / 组件 / 资产"
          className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-1 px-3 py-2 text-14 text-fg-1 outline-none focus:bg-bg-2"
        />
        <button type="submit" data-search-submit className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-4 py-2 text-13 text-accent-fg">
          搜
        </button>
      </form>

      {open && suggestions.length ? (
        <ul
          id="search-suggestions"
          role="listbox"
          aria-label="搜索建议"
          data-search-suggest
          className="overflow-hidden rounded-[var(--nexus-radius-sm)] border border-[var(--nexus-color-border-subtle)] bg-bg-1"
        >
          {suggestions.map((hit, index) => (
            <li key={`${hit.group}:${hit.id}`} id={`search-suggestion-${index}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(hit.href)}
                data-search-suggestion={hit.id}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-bg-2 ${
                  index === active ? 'bg-bg-2' : ''
                }`}
              >
                <span className="truncate text-13 text-fg-1">{hit.title}</span>
                <span className="shrink-0 font-mono text-11 text-fg-3">{hit.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showHistory ? (
        <div className="flex flex-wrap items-center gap-2" data-search-history>
          <span className="text-11 text-fg-3">最近的搜索（只存在这台设备上）</span>
          {history.map((query) => (
            <span key={query} className="inline-flex items-center gap-1 rounded-[var(--nexus-radius-sm)] bg-bg-1 px-2 py-1">
              <a
                href={`/search?q=${encodeURIComponent(query)}`}
                data-search-history-item={query}
                className="text-12 text-fg-2 hover:text-fg-1"
              >
                {query}
              </a>
              <button
                type="button"
                aria-label={`删除最近搜索 ${query}`}
                data-search-history-remove={query}
                onClick={() => {
                  const next = removeSearchHistory(readSearchHistory(window.localStorage), query);
                  writeSearchHistory(window.localStorage, next);
                  setHistory(next);
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-11 text-fg-3 hover:bg-bg-2 hover:text-fg-1"
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            data-search-history-clear
            onClick={() => {
              writeSearchHistory(window.localStorage, []);
              setHistory([]);
            }}
            className="text-11 text-fg-3 underline hover:text-fg-1"
          >
            清空
          </button>
        </div>
      ) : null}
    </div>
  );
}
