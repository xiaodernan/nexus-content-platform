'use client';

import { useMemo, useState } from 'react';
import { DEFAULT_TOKENS, type Token } from '@nexus/design-model';
import { cn } from '@/lib/cn';
import { studio, useStudioReady } from './store';

/**
 * §12 / §13 设计系统面板：token 是设计语言的真值，改一处要全线跟着动。
 *
 * 所有改动都走 `studio.execute`，所以改 token 和改节点一样可撤销（§148）；
 * 面板上同时显示"有多少节点引用它"，因为删掉一个正在用的 token 会留下断链——
 * 与其让人删了再等 lint 报错，不如直接不让删。
 */

const GROUPS: { types: Token['type'][]; label: string }[] = [
  { types: ['color'], label: '颜色' },
  { types: ['dimension'], label: '尺寸 / 间距 / 圆角' },
  { types: ['fontFamily'], label: '字体' },
  { types: ['shadow'], label: '阴影' },
  { types: ['number', 'string', 'motion', 'duration', 'easing'], label: '其他' },
];

const DEFAULT_KEYS = new Set(DEFAULT_TOKENS.map((t) => t.key));

const TOKEN_KEY = /^[a-z][a-z0-9._-]{1,63}$/;

function valueInput(token: Token): string {
  const value = token.value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** 解析输入：颜色接受 #rgb/#rrggbb，数字接受纯数，其余按 JSON 读；读不动就返回 null */
function parseInput(type: Token['type'], raw: string): unknown | null {
  const text = raw.trim();
  if (!text) return null;
  if (type === 'color') return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text) ? text : null;
  if (type === 'dimension' || type === 'number' || type === 'duration') {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'fontFamily' || type === 'string' || type === 'easing' || type === 'motion') return text;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isColor(token: Token): boolean {
  return token.type === 'color' && typeof token.value === 'string' && /^#[0-9a-f]{3,8}$/i.test(token.value);
}

export function DesignSystemPanel() {
  const state = useStudioReady();
  const document = state.document;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [newToken, setNewToken] = useState({ key: '', type: 'color' as Token['type'], value: '#7c5cff' });
  const [formError, setFormError] = useState<string | null>(null);

  /** 引用计数：整棵页面树里出现过 "{key}" 的节点数（一个节点多次引用只算一次） */
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    const bump = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
    const countIn = (serialized: string) => {
      for (const token of document.tokens) {
        // 绑定写的是 "{color.primary}" 这种花括号引用，不是裸 key
        if (serialized.includes(`"{${token.key}}"`)) bump(token.key);
      }
    };
    for (const page of document.pages) {
      for (const node of Object.values(page.nodes)) countIn(JSON.stringify(node));
    }
    for (const component of document.components) countIn(JSON.stringify(component));
    return counts;
  }, [document]);

  const setTokenValue = (token: Token, raw: string, mode?: string) => {
    const parsed = parseInput(token.type, raw);
    if (parsed === null) {
      setDrafts((d) => ({ ...d, [`${token.key}|${mode ?? ''}`]: raw }));
      return;
    }
    studio.execute(mode ? `修改 token ${token.key}（${mode}）` : `修改 token ${token.key}`, [
      { op: 'setToken', key: token.key, value: parsed, ...(mode ? { mode } : {}) },
    ]);
  };

  const addToken = () => {
    const key = newToken.key.trim().toLowerCase();
    if (!TOKEN_KEY.test(key)) {
      setFormError('token 名要像 color.brand / space.5 这样：小写字母开头，用点分段');
      return;
    }
    if (document.tokens.some((t) => t.key === key)) {
      setFormError(`已经有 ${key} 这个 token`);
      return;
    }
    const value = parseInput(newToken.type, newToken.value);
    if (value === null) {
      setFormError(`按 ${newToken.type} 读不懂这个值`);
      return;
    }
    const type = newToken.type;
    studio.execute(`新增 token ${key}`, [{ op: 'addToken', token: { key, type, value } }]);
    setFormError(null);
    setAdding(false);
    setNewToken({ key: '', type: 'color', value: '#7c5cff' });
  };

  const removeToken = (token: Token) => {
    studio.execute(`删除 token ${token.key}`, [{ op: 'removeToken', key: token.key }]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-design-system-root>
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-[var(--nexus-space-2)]">
        <span className="text-12 text-fg-2">Design System</span>
        <span className="ml-auto font-mono text-11 text-fg-3" data-token-count>
          {document.tokens.length} 个 token
        </span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          data-token-add-open
          className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-[2px] text-11 text-fg-2 hover:bg-bg-3"
        >
          新增
        </button>
      </div>

      {adding ? (
        <div className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] bg-bg-2 p-[var(--nexus-space-2)]">
          <div className="flex gap-1">
            <input
              value={newToken.key}
              onChange={(e) => setNewToken((t) => ({ ...t, key: e.target.value }))}
              placeholder="color.brand"
              data-token-new-key
              className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-1 px-2 py-1 font-mono text-11 text-fg-1 outline-none"
            />
            <select
              value={newToken.type}
              onChange={(e) => setNewToken((t) => ({ ...t, type: e.target.value as Token['type'] }))}
              data-token-new-type
              className="rounded-[var(--nexus-radius-sm)] bg-bg-1 px-1 py-1 text-11 text-fg-1"
            >
              {['color', 'dimension', 'fontFamily', 'number', 'string', 'shadow'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <input
            value={newToken.value}
            onChange={(e) => setNewToken((t) => ({ ...t, value: e.target.value }))}
            placeholder="#7c5cff 或 16"
            data-token-new-value
            className="mt-1 w-full rounded-[var(--nexus-radius-sm)] bg-bg-1 px-2 py-1 font-mono text-11 text-fg-1 outline-none"
          />
          {formError ? (
            <p className="mt-1 text-11 text-danger" data-token-form-error>
              {formError}
            </p>
          ) : null}
          <div className="mt-1 flex gap-1">
            <button
              type="button"
              onClick={addToken}
              data-token-new-submit
              className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-2 py-[2px] text-11 text-fg-1"
            >
              加入
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFormError(null);
              }}
              className="px-2 py-[2px] text-11 text-fg-3 hover:text-fg-1"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto px-[var(--nexus-space-2)] py-[var(--nexus-space-2)]">
        {GROUPS.map((group) => {
          const tokens = document.tokens.filter((t) => group.types.includes(t.type));
          if (!tokens.length) return null;
          return (
            <section key={group.label} className="mb-[var(--nexus-space-3)]">
              <h3 className="mb-1 font-mono text-11 text-fg-3">{group.label}</h3>
              <ul className="flex flex-col gap-[3px]">
                {tokens.map((token) => {
                  const used = usage.get(token.key) ?? 0;
                  const draft = drafts[`${token.key}|`] ?? valueInput(token);
                  const removable = !DEFAULT_KEYS.has(token.key) && used === 0;
                  return (
                    <li
                      key={token.key}
                      className="rounded-[var(--nexus-radius-sm)] border border-transparent px-1 py-1 hover:border-[var(--nexus-color-border-subtle)]"
                      data-token-row={token.key}
                    >
                      <div className="flex items-center gap-1">
                        {isColor(token) ? (
                          <span
                            className="h-3.5 w-3.5 shrink-0 rounded-[3px] border border-[var(--nexus-color-border-subtle)]"
                            style={{ background: String(token.value) }}
                            data-token-swatch={token.key}
                          />
                        ) : null}
                        <span className="min-w-0 flex-1 truncate font-mono text-11 text-fg-2" title={token.key}>
                          {token.key}
                        </span>
                        <span className="shrink-0 font-mono text-10 text-fg-3" data-token-usage={token.key}>
                          {used ? `${used} 处引用` : '未使用'}
                        </span>
                        <button
                          type="button"
                          disabled={!removable}
                          title={
                            DEFAULT_KEYS.has(token.key)
                              ? '内置 token 不能删（可以改值）'
                              : used
                                ? '还有节点引用它，先解绑再删'
                                : '删除这个 token'
                          }
                          onClick={() => removeToken(token)}
                          data-token-remove={token.key}
                          className={cn(
                            'shrink-0 rounded-[var(--nexus-radius-sm)] px-1 text-11',
                            removable ? 'text-fg-3 hover:bg-bg-2 hover:text-danger' : 'cursor-not-allowed opacity-30',
                          )}
                        >
                          ×
                        </button>
                      </div>
                      <div className="mt-[3px] flex items-center gap-1">
                        <input
                          value={draft}
                          onChange={(e) => setDrafts((d) => ({ ...d, [`${token.key}|`]: e.target.value }))}
                          onBlur={() => {
                            const raw = drafts[`${token.key}|`];
                            if (raw !== undefined && raw !== valueInput(token)) setTokenValue(token, raw);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            e.stopPropagation();
                          }}
                          data-token-value={token.key}
                          className="w-full min-w-0 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-[2px] font-mono text-11 text-fg-1 outline-none focus:bg-bg-3"
                        />
                        {isColor(token) ? (
                          <input
                            type="color"
                            value={/^#[0-9a-f]{6}$/i.test(String(token.value)) ? String(token.value) : '#000000'}
                            onChange={(e) => setTokenValue(token, e.target.value)}
                            data-token-color={token.key}
                            className="h-5 w-6 shrink-0 cursor-pointer rounded-[3px] border border-[var(--nexus-color-border-subtle)] bg-transparent"
                          />
                        ) : null}
                      </div>
                      {token.modes ? (
                        <div className="mt-[3px] flex flex-wrap gap-1">
                          {Object.entries(token.modes).map(([mode, value]) => {
                            const modeDraft = drafts[`${token.key}|${mode}`] ?? String(value);
                            return (
                              <label key={mode} className="flex items-center gap-[3px]">
                                <span className="font-mono text-10 text-fg-3">{mode}</span>
                                <input
                                  value={modeDraft}
                                  onChange={(e) => setDrafts((d) => ({ ...d, [`${token.key}|${mode}`]: e.target.value }))}
                                  onBlur={() => {
                                    const raw = drafts[`${token.key}|${mode}`];
                                    if (raw !== undefined && raw !== String(value)) setTokenValue(token, raw, mode);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                    e.stopPropagation();
                                  }}
                                  data-token-mode-value={`${token.key}:${mode}`}
                                  className="w-[72px] rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-[1px] font-mono text-10 text-fg-1 outline-none focus:bg-bg-3"
                                />
                              </label>
                            );
                          })}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
