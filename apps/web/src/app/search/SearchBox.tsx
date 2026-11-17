'use client';

import { useEffect, useRef, useState } from 'react';
import {
  addSearchHistory,
  readSearchHistory,
  removeSearchHistory,
  writeSearchHistory,
} from './search-history';
import { pauseMsFromResponse, remainingSeconds } from './suggest-pause';
import { clientLocale } from '@/lib/client-locale';
import type { Locale } from '@/lib/i18n';

/**
 * 双语 COPY（2026-11-15 公开试玩面 wave）：判据严苛的 aria/占位/按钮文案同源 zh-en 对齐；
 * 服务端产生的 suggestion.label 已经随 locale 出口翻译（/api/search/suggest 同一张表）。
 */
const COPY: Record<Locale, {
  searchAria: string;
  placeholder: string;
  submit: string;
  pauseNote: (seconds: number) => string;
  suggestionsAria: string;
  recentLabel: string;
  removeAria: (query: string) => string;
  clear: string;
}> = {
  zh: {
    searchAria: '搜索内容',
    placeholder: '项目 / 用户 / 世界 / 游戏 / 角色 / 设计稿 / 组件 / 资产',
    submit: '搜',
    pauseNote: (seconds) => `建议暂停 ${seconds} 秒——打字太快被限流；结果页照常能搜。`,
    suggestionsAria: '搜索建议',
    recentLabel: '最近的搜索（只存在这台设备上）',
    removeAria: (query) => `删除最近搜索 ${query}`,
    clear: '清空',
  },
  en: {
    searchAria: 'Search everything',
    placeholder: 'projects / people / worlds / games / characters / designs / components / assets',
    submit: 'Search',
    pauseNote: (seconds) => `Suggestions paused for ${seconds}s — too many requests; results page still works.`,
    suggestionsAria: 'Suggestions',
    recentLabel: 'Recent searches (this device only)',
    removeAria: (query) => `Remove recent search ${query}`,
    clear: 'Clear',
  },
};

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

export function SearchBox({ initialQuery, locale: localeProp }: { initialQuery: string; locale?: Locale }) {
  const [locale] = useState<Locale>(() => localeProp ?? clientLocale());
  const c = COPY[locale];
  const [value, setValue] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [history, setHistory] = useState<string[]>([]);
  /** 429 之后的静默期（epoch ms）；`0` = 不在暂停中 */
  const [pausedUntil, setPausedUntil] = useState(0);
  /** 只为倒计时重渲染：暂停中每 500ms 走一格 */
  const [nowTick, setNowTick] = useState(() => Date.now());
  const abortRef = useRef<AbortController | null>(null);

  // 历史只能在挂载后读：服务端渲染时没有 localStorage，先渲染空列表才不会水合不一致
  useEffect(() => {
    setHistory(readSearchHistory(window.localStorage));
  }, []);

  // 暂停到期自己收尾：不要求用户"再敲一个键"才知道可以继续
  useEffect(() => {
    if (!pausedUntil) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (now >= pausedUntil) setPausedUntil(0);
    }, 500);
    return () => window.clearInterval(timer);
  }, [pausedUntil]);

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
    if (Date.now() < pausedUntil) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const run = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) {
          // 429 是"歇一下"，不是"没有建议"：读 retryAfterMs，进暂停期，界面把这句话显示出来
          const body: unknown = await res.json().catch(() => null);
          const pause = pauseMsFromResponse(res.status, body);
          if (pause !== null) {
            if (controller.signal.aborted) return;
            setPausedUntil(Date.now() + pause);
            setSuggestions([]);
            setOpen(false);
            setActive(-1);
            return;
          }
          throw new Error(String(res.status));
        }
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
  }, [value, pausedUntil]);

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
  const pauseSeconds = remainingSeconds(pausedUntil, nowTick);

  return (
    <div className="se-boxRoot">
      <form action="/search" method="get" className="se-form" data-search-form onSubmit={() => remember(value)}>
        <input
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          aria-label={c.searchAria}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls="search-suggestions"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `search-suggestion-${active}` : undefined}
          autoComplete="off"
          data-search-input
          placeholder={c.placeholder}
          className="se-input"
        />
        <button type="submit" data-search-submit className="se-submit">
          {c.submit}
        </button>
      </form>

      {pauseSeconds > 0 ? (
        <p data-search-suggest-pause role="status" className="se-pauseNote">
          {c.pauseNote(pauseSeconds)}
        </p>
      ) : null}

      {open && suggestions.length ? (
        <ul
          id="search-suggestions"
          role="listbox"
          aria-label={c.suggestionsAria}
          data-search-suggest
          className="se-suggest"
        >
          {suggestions.map((hit, index) => (
            <li key={`${hit.group}:${hit.id}`} id={`search-suggestion-${index}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(hit.href)}
                data-search-suggestion={hit.id}
                className={`se-suggestion ${index === active ? 'se-suggestionActive' : ''}`}
              >
                <span className="se-suggestTitle">{hit.title}</span>
                <span className="se-suggestionLabel">{hit.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showHistory ? (
        <div className="se-historyRow" data-search-history>
          <span className="se-hint11">{c.recentLabel}</span>
          {history.map((query) => (
            <span key={query} className="se-historyChip">
              <a
                href={`/search?q=${encodeURIComponent(query)}`}
                data-search-history-item={query}
                className="se-historyLink"
              >
                {query}
              </a>
              <button
                type="button"
                aria-label={c.removeAria(query)}
                data-search-history-remove={query}
                onClick={() => {
                  const next = removeSearchHistory(readSearchHistory(window.localStorage), query);
                  writeSearchHistory(window.localStorage, next);
                  setHistory(next);
                }}
                className="se-historyRemove"
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
            className="se-clearBtn"
          >
                {c.clear}
          </button>
        </div>
      ) : null}
    </div>
  );
}
