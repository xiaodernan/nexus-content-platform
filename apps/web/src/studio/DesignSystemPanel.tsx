'use client';

import { useMemo, useState } from 'react';
import { DEFAULT_TOKENS, syncInstanceOps, uid, type Token } from '@nexus/creative-model';
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
   * 当前这一页上接着这份主组件的实例。
   * 只数这一页不是偷懒：`studio.execute` 的补丁一律打在 activePageId 上，
   * 按钮承诺"这一页的 N 颗"，别的工作簿切过去再点——在按钮上写"全部"是假话。
   */
  const pageInstancesOf = (componentId: string): string[] =>
    Object.values(state.page.nodes)
      .filter((node) => node.type === 'instance' && node.componentId === componentId)
      .map((node) => node.id);

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
    <div className="ds-root" data-design-system-root>
      <div className="ds-head">
        <span className="ds-title">Design System</span>
        <span className="ds-monoFaintM" data-token-count>
          {document.tokens.length} 个 token
        </span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          data-token-add-open
          className="ds-btn"
        >
          新增
        </button>
      </div>

      <section className="ds-section" data-components-section>
        <div className="ds-row2">
          <span className="ds-label">组件</span>
          <span className="ds-mono10">{document.components.length}</span>
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
            className="ds-btnMono"
            title={state.selection.length ? '把选中的元素存为主组件的根' : '先在画布上选中一个元素'}
          >
            存为组件
          </button>
        </div>
        {document.components.length === 0 ? (
          <p className="ds-monoFaintMt1" data-components-empty>
            还没有组件。选中一个元素后用上面那个按钮，或让 AI 生成（addComponent）。
          </p>
        ) : (
          <ul className="ds-colMt1">
            {document.components.map((component) => {
              const refs = instanceCount(component.id);
              const onThisPage = pageInstancesOf(component.id);
              // 能不能同步以**产出的 op** 为准，不以"这一页有没有实例"为准：
              // 复制体缺了的那颗会返回空串，那时按下只会得一条被 skip 的记账（§159）
              const syncOps = onThisPage.flatMap((id) => syncInstanceOps(document, component, id));
              return (
                <li
                  key={component.id}
                  className="ds-componentCard"
                  data-component-card={component.id}
                >
                  <div className="ds-row2">
                    <span className="ds-trunc12" title={component.name}>
                      {component.name}
                    </span>
                    <span className="ds-monoFaintMShrink">引用 {refs}</span>
                  </div>
                  {/* 动作换一行摆：这一栏宽约 280px，三个按钮加名字排不进同一行，
                      排不进去的那一个会被画布盖住——e2e 点它时不是失败而是干等到超时
                      （2026-11-03 加「更新实例」的下一格就踩到了，见 §13 第三十五片） */}
                  <div className="ds-wrapCenter1">
                    <button
                      type="button"
                      // 主组件的根节点不在任何页面上了（老数据 / 那一页被删过）就造不出复制体：
                      // 按下去只会得一条 skipped 记账，不如直接不让点（§159 不假装能用）
                      disabled={!rootOf(component.rootId)}
                      onClick={() => {
                        // id 在客户端点名下：`instantiate` 的撤销条目要能指名道姓，
                        // 而 invertPatch 跑在 apply 之前，那时这颗实例还不存在（§150）
                        const instanceId = uid('ins');
                        studio.execute(`放入 ${component.name} 实例`, [
                          { op: 'instantiate', componentId: component.id, instanceId },
                        ]);
                        // 落成了才选上：viewer 只读模式下 execute 会被按下，那时不该把选区指向不存在的节点
                        if (studio.getSnapshot().page?.nodes[instanceId]) studio.select([instanceId]);
                      }}
                      data-component-instantiate={component.id}
                      title={
                        rootOf(component.rootId)
                          ? '把这份组件复制一个实例放到当前页末尾（可撤销）'
                          : '主组件的根节点已经不在任何页面上了，放不出实例'
                      }
                      className="ds-btnGhostMode"
                    >
                      放到当前页
                    </button>
                    <button
                      type="button"
                      disabled={syncOps.length === 0}
                      onClick={() =>
                        studio.execute(`更新 ${component.name} 的 ${onThisPage.length} 个实例`, syncOps)
                      }
                      data-component-sync={component.id}
                      data-component-sync-count={onThisPage.length}
                      title={
                        syncOps.length > 0
                          ? `把这一页上 ${onThisPage.length} 个实例的复制体换成主组件现在的样子（可撤销）`
                          : refs === 0
                            ? '还没有实例引用这份组件'
                            : `引用都在别的页面上（共 ${refs} 个）；切过去才能更新那一页`
                      }
                      className="ds-btnGhostMode"
                    >
                      更新实例{onThisPage.length > 0 ? ` ${onThisPage.length}` : ''}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        studio.execute(`删除组件 ${component.name}`, [
                          { op: 'removeComponent', componentId: component.id },
                        ])
                      }
                      data-component-delete={component.id}
                      title="从组件目录里移出，并解开所有页面上引用它的实例（可撤销）"
                      className="ds-btnGhostMono"
                    >
                      删除
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {document.visualDna ? (
        <section className="ds-section" data-visual-dna>
          <div className="ds-row2">
            <span className="ds-label">Visual DNA</span>
            <span className="ds-mono10">
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
              className="ds-btnGhostMonoEnd"
            >
              清除
            </button>
          </div>
          <div className="ds-wrapMt1">
            {document.visualDna.palette.map((entry) => (
              <span key={entry.role} className="ds-instanceChip">
                <span
                  className="ds-swatch12"
                  style={{ background: typeof entry.color === 'string' ? entry.color : undefined }}
                />
                {entry.role}
              </span>
            ))}
          </div>
          <p className="ds-ink11Mt1" data-visual-dna-descriptors>
            {document.visualDna.descriptors.join(' · ')}
          </p>
          {/* 测不出来的字段一律留白说明，而不是补一个看起来完整的假值（§159） */}
          {document.visualDna.source?.notes?.length ? (
            <p className="ds-monoMt10">{document.visualDna.source.notes.join(' ')}</p>
          ) : null}
        </section>
      ) : null}

      {adding ? (
        <div className="ds-sectionInset">
          <div className="ds-wrap1">
            <input
              value={newToken.key}
              onChange={(e) => setNewToken((t) => ({ ...t, key: e.target.value }))}
              placeholder="color.brand"
              data-token-new-key
              aria-label="新 token 的键"
              className="ds-tokenInput"
            />
            <select
              value={newToken.type}
              onChange={(e) => setNewToken((t) => ({ ...t, type: e.target.value as Token['type'] }))}
              aria-label="新 token 的类型"
              data-token-new-type
              className="ds-typeSelect"
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
            aria-label="新 token 的值"
            className="ds-addTokenInput"
          />
          {formError ? (
            <p className="ds-dangerMt1" data-token-form-error>
              {formError}
            </p>
          ) : null}
          <div className="ds-rowMt1">
            <button
              type="button"
              onClick={addToken}
              data-token-new-submit
              className="ds-accentBtnSm"
            >
              加入
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFormError(null);
              }}
              className="ds-linkBtnFaint"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <div className="ds-scrollCol">
        {GROUPS.map((group) => {
          const tokens = document.tokens.filter((t) => group.types.includes(t.type));
          if (!tokens.length) return null;
          return (
            <section key={group.label} className="ds-mb3">
              <h3 className="ds-mb1mono">{group.label}</h3>
              <ul className="ds-colGap3">
                {tokens.map((token) => {
                  const used = usage.get(token.key) ?? 0;
                  const draft = drafts[`${token.key}|`] ?? valueInput(token);
                  const removable = !DEFAULT_KEYS.has(token.key) && used === 0;
                  return (
                    <li
                      key={token.key}
                      className="ds-rowCard"
                      data-token-row={token.key}
                    >
                      <div className="ds-row1">
                        {isColor(token) ? (
                          <span
                            className="ds-swatch14"
                            style={{ background: String(token.value) }}
                            data-token-swatch={token.key}
                          />
                        ) : null}
                        <span className="ds-fname11truncate" title={token.key}>
                          {token.key}
                        </span>
                        <span className="ds-mono10shrink" data-token-usage={token.key}>
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
                          className={cn('ds-iconSm', removable ? 'ds-iconSmReady' : 'ds-iconSmIdle')}
                        >
                          ×
                        </button>
                      </div>
                      <div className="ds-rowMt3">
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
                          aria-label={`${token.key} · 值`}
                          className="ds-wfullInput"
                        />
                        {isColor(token) ? (
                          <input
                            type="color"
                            value={/^#[0-9a-f]{6}$/i.test(String(token.value)) ? String(token.value) : '#000000'}
                            onChange={(e) => setTokenValue(token, e.target.value)}
                            data-token-color={token.key}
                            aria-label={`${token.key} · 颜色`}
                            className="ds-colorWell"
                          />
                        ) : null}
                      </div>
                      {token.modes ? (
                        <div className="ds-wrapMt3">
                          {Object.entries(token.modes).map(([mode, value]) => {
                            const modeDraft = drafts[`${token.key}|${mode}`] ?? String(value);
                            return (
                              <label key={mode} className="ds-rowGap3">
                                <span className="ds-mono10">{mode}</span>
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
                                  className="ds-modeInput72"
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
