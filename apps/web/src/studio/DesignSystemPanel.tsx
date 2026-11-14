'use client';

import { useMemo, useState } from 'react';
import { DEFAULT_TOKENS, syncInstanceOps, uid, type Token } from '@nexus/creative-model';
import { cn } from '@/lib/cn';
import type { Locale } from '@/lib/i18n';
import { tokenUsage } from './token-usage';
import { studio, useStudioReady } from './store';

/**
 * §12 / §13 设计系统面板：token 是设计语言的真值，改一处要全线跟着动。
 *
 * 所有改动都走 `studio.execute`，所以改 token 和改节点一样可撤销（§148）；
 * 面板上同时显示"有多少节点引用它"，因为删掉一个正在用的 token 会留下断链——
 * 与其让人删了再等 lint 报错，不如直接不让删。
 * 双语（v748）：locale 由 StudioShell 透传；zh 原文原样保留，en 逐句对应。
 */

const COPY = {
  zh: {
    heading: 'Design System',
    tokenCount: (n: number) => `${n} 个 token`,
    add: '新增',
    components: '组件',
    saveAsComponent: '存为组件',
    saveComponentTitle: (hasSelection: boolean) =>
      hasSelection ? '把选中的元素存为主组件的根' : '先在画布上选中一个元素',
    componentsEmpty: '还没有组件。选中一个元素后用上面那个按钮，或让 AI 生成（addComponent）。',
    refs: (n: number) => `引用 ${n}`,
    placeHere: '放到当前页',
    placeTitleReady: '把这份组件复制一个实例放到当前页末尾（可撤销）',
    placeTitleDetached: '主组件的根节点已经不在任何页面上了，放不出实例',
    updateInstances: '更新实例',
    updateInstancesCount: (n: number) => `更新实例 ${n}`,
    syncTitleReady: (n: number) => `把这一页上 ${n} 个实例的复制体换成主组件现在的样子（可撤销）`,
    syncTitleNoRefs: '还没有实例引用这份组件',
    syncTitleElsewhere: (n: number) => `引用都在别的页面上（共 ${n} 个）；切过去才能更新那一页`,
    delete: '删除',
    deleteComponentTitle: '从组件目录里移出，并解开所有页面上引用它的实例（可撤销）',
    visualDnaClear: '清除',
    visualDnaClearTitle: '清除 Visual DNA',
    visualDnaSource: {
      'pixel-stats': '本地像素统计',
      'vision-model': '视觉模型',
      'concept-language': '概念语言',
      unknown: '来源未知',
    } as Record<string, string>,
    newKeyAria: '新 token 的键',
    newTypeAria: '新 token 的类型',
    valueKey: '#7c5cff 或 16',
    newValueAria: '新 token 的值',
    badKey: 'token 名要像 color.brand / space.5 这样：小写字母开头，用点分段',
    keyExists: (key: string) => `已经有 ${key} 这个 token`,
    valueUnreadable: (type: string) => `按 ${type} 读不懂这个值`,
    addToken: '加入',
    cancel: '取消',
    unused: '未使用',
    usedRefs: (n: number) => `${n} 处引用`,
    builtinProtected: '内置 token 不能删（可以改值）',
    stillReferenced: '还有节点引用它，先解绑再删',
    deleteToken: '删除这个 token',
    valueAria: (key: string) => `${key} · 值`,
    colorAria: (key: string) => `${key} · 颜色`,
    editToken: (key: string, mode?: string) => (mode ? `修改 token ${key}（${mode}）` : `修改 token ${key}`),
    addTokenUndo: (key: string) => `新增 token ${key}`,
    removeTokenUndo: (key: string) => `删除 token ${key}`,
    saveComponentUndo: (name: string) => `存为组件 ${name}`,
    instantiateUndo: (name: string) => `放入 ${name} 实例`,
    syncInstancesUndo: (name: string, n: number) => `更新 ${name} 的 ${n} 个实例`,
    deleteComponentUndo: (name: string) => `删除组件 ${name}`,
    clearDnaUndo: '清除 Visual DNA',
    groupLabels: {
      color: '颜色',
      dimension: '尺寸 / 间距 / 圆角',
      fontFamily: '字体',
      shadow: '阴影',
      other: '其他',
    },
  },
  en: {
    heading: 'Design System',
    tokenCount: (n: number) => `${n} tokens`,
    add: 'Add',
    components: 'Components',
    saveAsComponent: 'Save as component',
    saveComponentTitle: (hasSelection: boolean) =>
      hasSelection ? 'Save the selected element as the root of a master component' : 'Select an element on the canvas first',
    componentsEmpty: 'No components yet. Select an element and use the button above, or let the AI generate one (addComponent).',
    refs: (n: number) => `refs ${n}`,
    placeHere: 'Place here',
    placeTitleReady: 'Place a new instance of this component at the end of this page (undoable)',
    placeTitleDetached: 'The master component root no longer lives on any page; no instance can be placed',
    updateInstances: 'Update instances',
    updateInstancesCount: (n: number) => `Update instances ${n}`,
    syncTitleReady: (_n: number) => `Swap the clones on this page for the master component’s current shape (undoable)`,
    syncTitleNoRefs: 'No instances reference this component yet',
    syncTitleElsewhere: (n: number) => `All ${n} references live on other pages; switch there to update them`,
    delete: 'Delete',
    deleteComponentTitle: 'Remove from the component catalog and unwrap every instance referencing it (undoable)',
    visualDnaClear: 'Clear',
    visualDnaClearTitle: 'Clear Visual DNA',
    visualDnaSource: {
      'pixel-stats': 'Local pixel stats',
      'vision-model': 'Vision model',
      'concept-language': 'Concept language',
      unknown: 'Unknown source',
    } as Record<string, string>,
    newKeyAria: 'New token key',
    newTypeAria: 'New token type',
    valueKey: '#7c5cff or 16',
    newValueAria: 'Value of the new token',
    badKey: 'Token names look like color.brand / space.5 — lowercase-first segments, dot-separated',
    keyExists: (key: string) => `A token ${key} already exists`,
    valueUnreadable: (type: string) => `Cannot read this value as ${type}`,
    addToken: 'Add',
    cancel: 'Cancel',
    unused: 'Unused',
    usedRefs: (n: number) => `${n} refs`,
    builtinProtected: 'Built-in tokens cannot be deleted (change the value instead)',
    stillReferenced: 'Nodes still reference it — unbind first, then delete',
    deleteToken: 'Delete this token',
    valueAria: (key: string) => `${key} · value`,
    colorAria: (key: string) => `${key} · color`,
    editToken: (key: string, mode?: string) => (mode ? `Edit token ${key} (${mode})` : `Edit token ${key}`),
    addTokenUndo: (key: string) => `Add token ${key}`,
    removeTokenUndo: (key: string) => `Remove token ${key}`,
    saveComponentUndo: (name: string) => `Save component ${name}`,
    instantiateUndo: (name: string) => `Place ${name} instance`,
    syncInstancesUndo: (name: string, n: number) => `Update ${name}’s ${n} instances`,
    deleteComponentUndo: (name: string) => `Remove component ${name}`,
    clearDnaUndo: 'Clear Visual DNA',
    groupLabels: {
      color: 'Color',
      dimension: 'Size / spacing / radii',
      fontFamily: 'Fonts',
      shadow: 'Shadow',
      other: 'Other',
    },
  },
} as const;

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

export function DesignSystemPanel({ locale = 'zh' }: { locale?: Locale }) {
  const c = COPY[locale];
  const GROUPS: { types: Token['type'][]; label: string }[] = [
    { types: ['color'], label: c.groupLabels.color },
    { types: ['dimension'], label: c.groupLabels.dimension },
    { types: ['fontFamily'], label: c.groupLabels.fontFamily },
    { types: ['shadow'], label: c.groupLabels.shadow },
    { types: ['number', 'string', 'motion', 'duration', 'easing'], label: c.groupLabels.other },
  ];
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

  const setTokenValue = (token: Token, raw: string, mode?: string) => {
    const parsed = parseInput(token.type, raw);
    if (parsed === null) {
      setDrafts((d) => ({ ...d, [`${token.key}|${mode ?? ''}`]: raw }));
      return;
    }
    studio.execute(c.editToken(token.key, mode), [
      { op: 'setToken', key: token.key, value: parsed, ...(mode ? { mode } : {}) },
    ]);
  };

  const addToken = () => {
    const key = newToken.key.trim().toLowerCase();
    if (!TOKEN_KEY.test(key)) {
      setFormError(c.badKey);
      return;
    }
    if (document.tokens.some((t) => t.key === key)) {
      setFormError(c.keyExists(key));
      return;
    }
    const value = parseInput(newToken.type, newToken.value);
    if (value === null) {
      setFormError(c.valueUnreadable(newToken.type));
      return;
    }
    const type = newToken.type;
    studio.execute(c.addTokenUndo(key), [{ op: 'addToken', token: { key, type, value } }]);
    setFormError(null);
    setAdding(false);
    setNewToken({ key: '', type: 'color', value: '#7c5cff' });
  };

  const removeToken = (token: Token) => {
    studio.execute(c.removeTokenUndo(token.key), [{ op: 'removeToken', key: token.key }]);
  };

  return (
    <div className="ds-root" data-design-system-root>
      <div className="ds-head">
        <span className="ds-title">{c.heading}</span>
        <span className="ds-monoFaintM" data-token-count>
          {c.tokenCount(document.tokens.length)}
        </span>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          data-token-add-open
          className="ds-btn"
        >
          {c.add}
        </button>
      </div>

      <section className="ds-section" data-components-section>
        <div className="ds-row2">
          <span className="ds-label">{c.components}</span>
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
              studio.execute(c.saveComponentUndo(root.name), [
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
            title={c.saveComponentTitle(state.selection.length > 0)}
          >
            {c.saveAsComponent}
          </button>
        </div>
        {document.components.length === 0 ? (
          <p className="ds-monoFaintMt1" data-components-empty>
            {c.componentsEmpty}
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
                    <span className="ds-monoFaintMShrink">{c.refs(refs)}</span>
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
                        studio.execute(c.instantiateUndo(component.name), [
                          { op: 'instantiate', componentId: component.id, instanceId },
                        ]);
                        // 落成了才选上：viewer 只读模式下 execute 会被按下，那时不该把选区指向不存在的节点
                        if (studio.getSnapshot().page?.nodes[instanceId]) studio.select([instanceId]);
                      }}
                      data-component-instantiate={component.id}
                      title={
                        rootOf(component.rootId)
                          ? c.placeTitleReady
                          : c.placeTitleDetached
                      }
                      className="ds-btnGhostMode"
                    >
                      {c.placeHere}
                    </button>
                    <button
                      type="button"
                      disabled={syncOps.length === 0}
                      onClick={() =>
                        studio.execute(c.syncInstancesUndo(component.name, onThisPage.length), syncOps)
                      }
                      data-component-sync={component.id}
                      data-component-sync-count={onThisPage.length}
                      title={
                        syncOps.length > 0
                          ? c.syncTitleReady(onThisPage.length)
                          : refs === 0
                            ? c.syncTitleNoRefs
                            : c.syncTitleElsewhere(refs)
                      }
                      className="ds-btnGhostMode"
                    >
                      {onThisPage.length ? c.updateInstancesCount(onThisPage.length) : c.updateInstances}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        studio.execute(c.deleteComponentUndo(component.name), [
                          { op: 'removeComponent', componentId: component.id },
                        ])
                      }
                      data-component-delete={component.id}
                      title={c.deleteComponentTitle}
                      className="ds-btnGhostMono"
                    >
                      {c.delete}
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
              {c.visualDnaSource[document.visualDna.source?.method ?? 'unknown'] ?? c.visualDnaSource.unknown}
            </span>
            <button
              type="button"
              onClick={() => studio.execute(c.clearDnaUndo, [{ op: 'setVisualDna', dna: null }])}
              data-visual-dna-clear
              className="ds-btnGhostMonoEnd"
              title={c.visualDnaClearTitle}
            >
              {c.visualDnaClear}
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
              aria-label={c.newKeyAria}
              className="ds-tokenInput"
            />
            <select
              value={newToken.type}
              onChange={(e) => setNewToken((t) => ({ ...t, type: e.target.value as Token['type'] }))}
              aria-label={c.newTypeAria}
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
            placeholder={c.valueKey}
            data-token-new-value
            aria-label={c.newValueAria}
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
              {c.addToken}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFormError(null);
              }}
              className="ds-linkBtnFaint"
            >
              {c.cancel}
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
                          {used ? c.usedRefs(used) : c.unused}
                        </span>
                        <button
                          type="button"
                          disabled={!removable}
                          title={
                            DEFAULT_KEYS.has(token.key)
                              ? c.builtinProtected
                              : used
                                ? c.stillReferenced
                                : c.deleteToken
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
                          aria-label={c.valueAria(token.key)}
                          className="ds-wfullInput"
                        />
                        {isColor(token) ? (
                          <input
                            type="color"
                            value={/^#[0-9a-f]{6}$/i.test(String(token.value)) ? String(token.value) : '#000000'}
                            onChange={(e) => setTokenValue(token, e.target.value)}
                            data-token-color={token.key}
                            aria-label={c.colorAria(token.key)}
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
