'use client';

import { useMemo, useState } from 'react';
import { DEFAULT_TOKENS, type Token } from '@nexus/design-model';
import { cn } from '@/lib/cn';
import { tokenUsage } from './token-usage';
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

/** 解析输入：颜色接受 #rgb/#rrggbb，数字接受纯数，其余按 JSON 读；读不动就返回 null（所以调用方只认 null 这一个失败信号） */
function parseInput(type: Token['type'], raw: string): unknown {
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

  /** 组件的根节点可以在任何一页上，所以按 id 跨页找（找不到就不该建这个组件） */
  const rootOf = (id: string) => {
    for (const page of document.pages) {
      const node = page.nodes[id];
      if (node) return node;
    }
    return undefined;
  };
  /** 有多少实例节点引用这个组件——删除会连带解开它们，所以这个数字要摊在卡片上 */
  const instanceCount = (componentId: string) => {
    let n = 0;
    for (const page of document.pages) {
      for (const node of Object.values(page.nodes)) if (node.componentId === componentId) n += 1;
    }
    return n;
  };

  /**
   * 引用计数：整棵页面树里引用过某个 token 的节点数（一个节点多次引用只算一次）。
   *
   * 算法在 `token-usage.ts`（有语义要钉住，也放得下单测）。
   * 这里只说明**为什么换掉旧写法**：旧的是"把每个节点 `JSON.stringify` 一遍，
   * 再拿**每一个 token** 去 `includes`"，复杂度是 节点数 × token 数 × 字符串长度；
   * 而它挂在 `[document]` 上，也就是每次改动都整份重算——4000 节点的文档上
   * 这是一次实打实的卡顿，而它要回答的只是"这个 token 有几个节点在用"（§147）。
   */
  const usage = useMemo(() => tokenUsage(document), [document]);

  /**
   * 提交后丢掉草稿：输入框只在自己编辑的那一会儿持有未落库的内容。
   * 留着不清会让面板在撤销 / AI 改动之后仍显示旧值——屏幕上说的就和模型不一致了（§16）。
   */
  const dropDraft = (key: string) =>
    setDrafts((d) => {
      if (!(key in d)) return d;
      const next = { ...d };
      delete next[key];
      return next;
    });

  const setTokenValue = (token: Token, raw: string, mode?: string) => {    const parsed = parseInput(token.type, raw);
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

      <section className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-2" data-components-section>
        <div className="flex items-center gap-2">
          <span className="font-mono text-11 uppercase tracking-wide text-fg-3">组件</span>
          <span className="font-mono text-10 text-fg-3">{document.components.length}</span>
          <button
            type="button"
            // 存为组件 = 把选中的那个元素指认为主组件的根：没有选中就没有可指认的东西，
            // 按钮不可点，而不是"凭空造一个组件"（§16 面板只是真值的投影）
            disabled={state.selection.length === 0}
            onClick={() => {
              const rootId = state.selection[0];
              if (!rootId) return;
              const root = rootOf(rootId);
              if (!root) return;
              studio.execute(`存为组件 ${root.name}`, [
                {
                  op: 'addComponent',
                  component: {
                    id: `cmp_${Date.now().toString(36)}`,
                    name: root.name,
                    rootId,
                    props: [],
                    variants: [],
                    slots: [],
                  },
                },
              ]);
            }}
            data-component-save
            className="ml-auto rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-[2px] font-mono text-11 text-fg-2 hover:bg-bg-3 disabled:opacity-50"
            title={state.selection.length ? '把选中的元素存为主组件的根' : '先在画布上选中一个元素'}
          >
            存为组件
          </button>
        </div>
        {document.components.length === 0 ? (
          <p className="mt-1 font-mono text-11 text-fg-3" data-components-empty>
            还没有组件。选中一个元素后用上面那个按钮，或让 AI 生成（addComponent）。
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {document.components.map((component) => {
              const refs = instanceCount(component.id);
              return (
                <li
                  key={component.id}
                  className="flex items-center gap-2 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1"
                  data-component-card={component.id}
                >
                  <span className="truncate text-12 text-fg-1" title={component.name}>
                    {component.name}
                  </span>
                  <span className="ml-auto shrink-0 font-mono text-11 text-fg-3">引用 {refs}</span>
                  <button
                    type="button"
                    onClick={() => studio.execute(`删除组件 ${component.name}`, [{ op: 'removeComponent', componentId: component.id }])}
                    data-component-delete={component.id}
                    title="从组件目录里移出，并解开所有页面上引用它的实例（可撤销）"
                    className="shrink-0 rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-11 text-fg-3 hover:bg-bg-3"
                  >
                    删除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {document.visualDna ? (
        <section className="shrink-0 border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-3)] py-2" data-visual-dna>
          <div className="flex items-center gap-2">
            <span className="font-mono text-11 uppercase tracking-wide text-fg-3">Visual DNA</span>
            <span className="font-mono text-10 text-fg-3">
              {document.visualDna.source?.method === 'pixel-stats'
                ? '本地像素统计'
                : document.visualDna.source?.method === 'vision-model'
                  ? '视觉模型'
                  : document.visualDna.source?.method === 'concept-language'
                    ? '概念语言'
                    : '来源未知'}
            </span>
            <button
              type="button"
              onClick={() => studio.execute('清除 Visual DNA', [{ op: 'setVisualDna', dna: null }])}
              data-visual-dna-clear
              className="ml-auto rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-11 text-fg-3 hover:bg-bg-3"
            >
              清除
            </button>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {document.visualDna.palette.map((entry) => (
              <span key={entry.role} className="flex items-center gap-1 rounded bg-bg-2 px-1 py-[2px] font-mono text-10 text-fg-3">
                <span
                  className="inline-block h-3 w-3 rounded-[2px] border border-[var(--nexus-color-border-subtle)]"
                  style={{ background: typeof entry.color === 'string' ? entry.color : undefined }}
                />
                {entry.role}
              </span>
            ))}
          </div>
          <p className="mt-1 text-11 text-fg-2" data-visual-dna-descriptors>
            {document.visualDna.descriptors.join(' · ')}
          </p>
          {/* 测不出来的字段一律留白说明，而不是补一个看起来完整的假值（§159） */}
          {document.visualDna.source?.notes?.length ? (
            <p className="mt-1 text-10 text-fg-3">{document.visualDna.source.notes.join(' ')}</p>
          ) : null}
        </section>
      ) : null}

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
              aria-label="新 token 的类型"
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
            <p className="mt-1 text-11 text-danger-ink" data-token-form-error>
              {formError}
            </p>
          ) : null}
          <div className="mt-1 flex gap-1">
            <button
              type="button"
              onClick={addToken}
              data-token-new-submit
              className="rounded-[var(--nexus-radius-sm)] bg-accent-2 px-2 py-[2px] text-11 text-accent-fg"
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
                            removable ? 'text-fg-3 hover:bg-bg-2 hover:text-danger-ink' : 'cursor-not-allowed opacity-30',
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
                            dropDraft(`${token.key}|`);
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
                                    dropDraft(`${token.key}|${mode}`);
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
