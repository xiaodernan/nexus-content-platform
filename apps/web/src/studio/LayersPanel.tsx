'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONTAINER_TYPES, type DesignNode, type NodeType } from '@nexus/creative-model';
import { cn } from '@/lib/cn';
import { flattenLayers, keepAncestors, type LayerRow as LayerRowData } from './layers-flat';
import { studio, useStudioReady } from './store';
import type { Locale } from '@/lib/i18n';

/** 双语（v731）：一中一英、逐 key 对齐；键盘字面与 aria-label/title 保持同一套措辞。 */
const COPY = {
  zh: {
    searchAria: '搜索图层',
    searchPlaceholder: '搜索图层 / 文本',
    filterTitle: '按类型过滤',
    all: '全部',
    containerChip: '容器',
    textChip: '文本',
    mediaChip: '媒体',
    typeChip: '容器',
    addType: {
      section: 'Section',
      container: '容器',
      text: '文本',
      button: '按钮',
      input: '输入框',
      image: '图片',
      card: '卡片',
      grid: '网格',
      shape: '形状',
    } as Record<NodeType, string>,
    newPage: '新建页面',
    emptyFiltered: '没有匹配的图层',
    layerNameAria: '图层名',
    hide: '隐藏',
    show: '显示',
    unlock: '解锁',
    lock: '锁定',
  },
  en: {
    searchAria: 'Search layers',
    searchPlaceholder: 'Search layers / text',
    filterTitle: 'Filter by type',
    all: 'All',
    containerChip: 'Container',
    textChip: 'Text',
    mediaChip: 'Media',
    typeChip: 'Container',
    addType: {
      section: 'Section',
      container: 'Container',
      text: 'Text',
      button: 'Button',
      input: 'Input',
      image: 'Image',
      card: 'Card',
      grid: 'Grid',
      shape: 'Shape',
    } as Record<NodeType, string>,
    newPage: 'New page',
    emptyFiltered: 'No matching layers',
    layerNameAria: 'Layer name',
    hide: 'Hide',
    show: 'Show',
    unlock: 'Unlock',
    lock: 'Lock',
  },
} as const;

/** §5 Layers 树：重命名 / 显隐 / 锁定 / 拖拽改父级 / 多选 / 搜索 / 按类型过滤 */
const ADD_KINDS = ['section', 'container', 'text', 'button', 'input', 'image', 'card', 'grid', 'shape'] as const satisfies readonly NodeType[];

export function LayersPanel({ locale = 'zh' }: { locale?: Locale } = {}) {
  const c = COPY[locale];
  const state = useStudioReady();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'container' | 'text' | 'media'>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const page = state.page;
  const root = page ? page.nodes[page.rootId] : null;

  /** 有没有在过滤。没过滤时 `matches` 根本不会被用上（rows 传 null），所以别去算它 */
  const filtering = Boolean(query.trim()) || typeFilter !== 'all';

  const matches = useMemo(() => {
    // 这一趟要遍历整页节点，而它挂在 [page] 上——**每次改动都会重算**。
    // 没在过滤时不产出任何结果，就不该付这个代价（§147：随节点数线性长的那一段）
    if (!page || !filtering) return new Set<string>();
    const q = query.trim().toLowerCase();
    const hit = new Set<string>();
    for (const node of Object.values(page.nodes)) {
      if (node.id === page.rootId) continue;
      const typeOk =
        typeFilter === 'all'
          ? true
          : typeFilter === 'container'
            ? CONTAINER_TYPES.includes(node.type)
            : typeFilter === 'text'
              ? node.type === 'text' || node.type === 'button' || node.type === 'input'
              : node.type === 'image' || node.type === 'video' || node.type === 'svg';
      const textOk = !q || node.name.toLowerCase().includes(q) || (node.text ?? '').toLowerCase().includes(q);
      if (typeOk && textOk) hit.add(node.id);
    }
    return hit;
  }, [page, query, typeFilter, filtering]);

  const rows = useMemo(() => {
    if (!page) return [];
    return flattenLayers(page, collapsed, filtering ? keepAncestors(page, matches) : null);
  }, [page, matches, filtering, collapsed]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, end: 40 });
  /** 看得见的那一段：滚动位置是唯一输入，行高固定所以不必量每一行 */
  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const start = Math.max(0, Math.floor(el.scrollTop / ROW_H) - OVERSCAN);
    const end = Math.min(rows.length, Math.ceil((el.scrollTop + el.clientHeight) / ROW_H) + OVERSCAN);
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, [rows.length]);
  // 换页 / 折叠 / 过滤都会让"看得见的那段"变，而它们不触发 scroll 事件
  useEffect(() => {
    measure();
  }, [measure]);

  // 面板从隐藏变可见（窄视口默认收起）或窗口/分栏尺寸变了，可视高度跟着变——
  // 只靠 `rows.length` 的话，隐藏时按 clientHeight=0 算出的窗口会一直停在 6 行。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure]);

  if (!page || !root) return null;

  const onDropNode = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    studio.reparentNode(dragId, targetId);
    setDragId(null);
  };

  return (
    <div className="ly-root">
      <div className="ly-header">
        <input aria-label={c.searchAria}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={c.searchPlaceholder}
          className="ly-search"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="ly-filter"
          title={c.filterTitle}
        >
          <option value="all">{c.all}</option>
          <option value="container">{c.containerChip}</option>
          <option value="text">{c.textChip}</option>
          <option value="media">{c.mediaChip}</option>
        </select>
        <div className="ly-rel">
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="ly-addBtn"
            data-add-node
          >
            +
          </button>
          {adding ? (
            <div className="ly-drop">
              {ADD_KINDS.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    studio.addNode(type);
                    setAdding(false);
                  }}
                  className="ly-dropItem"
                >
                  {c.addType[type]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="ly-pageTabs">
        {state.document.pages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => studio.setPage(p.id)}
            data-page-tab={p.name}
            className={cn('ly-pageBtn', p.id === page.id && 'ly-pageBtnActive')}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => studio.addPage(`Page ${state.document.pages.length + 1}`)}
          className="ly-pageAdd"
          title={c.newPage}
        >
          +
        </button>
      </div>

      {/* §147：一维化 + 窗口化。4000 节点那一档以前在这里铺 3999 行 DOM，
          首帧量不到；现在只铺看得见的那几十行，`data-layer-total` 是文档侧的真数，
          压测脚本拿它核对"树真的展开了"而不是"列表被裁没了" */}
      <div
        ref={scrollRef}
        onScroll={measure}
        data-layer-scroll
        data-layer-total={rows.length}
        className="ly-scroller"
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => dragId && onDropNode(page.rootId)}
      >
        <div className="ly-spacer" style={{ height: rows.length * ROW_H }}>
          {rows.slice(range.start, range.end).map((row, i) => (
            <div
              key={row.node.id}
              className="ly-rowShell"
              style={{ top: (range.start + i) * ROW_H, height: ROW_H }}
            >
              <LayerRow
                row={row}
                page={page}
                selection={state.selection}
                collapsed={collapsed}
                onToggleCollapse={(id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
                onDragStart={setDragId}
                onDropNode={onDropNode}
                locale={locale}
              />
            </div>
          ))}
        </div>
        {!rows.length ? <p className="ly-empty">{c.emptyFiltered}</p> : null}
      </div>
    </div>
  );
}

/** 行高是窗口化的前提：它必须是一个数，而不是"内容多高算多高" */
const ROW_H = 24;
const OVERSCAN = 6;

function LayerRow(props: {
  row: LayerRowData;
  page: { rootId: string; nodes: Record<string, DesignNode> };
  selection: readonly string[];
  collapsed: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onDragStart: (id: string) => void;
  onDropNode: (id: string) => void;
  locale: Locale;
}) {
  const c = COPY[props.locale];
  const { row, selection } = props;
  const node = row.node;
  const depth = row.depth;
  const selected = selection.includes(node.id);
  const isContainer = row.hasChildren;
  const open = !props.collapsed[node.id];
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(node.name);

  const commitRename = () => {
    const next = draft.trim();
    if (next && next !== node.name) studio.rename(node.id, next);
    setRenaming(false);
  };

  return (
    <>
      <div
        data-layer-id={node.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          props.onDragStart(node.id);
        }}
        onDragOver={(e) => {
          if (CONTAINER_TYPES.includes(node.type)) e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          props.onDropNode(node.id);
        }}
        onClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) studio.toggleSelection(node.id);
          else studio.select([node.id]);
        }}
        onDoubleClick={() => {
          setDraft(node.name);
          setRenaming(true);
        }}
        className={cn('ly-row', selected && 'ly-rowSelected')}
        style={{ paddingLeft: `calc(var(--nexus-space-2) + ${depth * 12}px)` }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isContainer) props.onToggleCollapse(node.id);
          }}
          className="ly-iconBtn"
        >
          {isContainer ? (open ? '▾' : '▸') : '·'}
        </button>
        <span className="ly-typeChip">{node.type}</span>
        {renaming ? (
          <input
            autoFocus
            value={draft}
            aria-label={c.layerNameAria}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="ly-rename"
            data-layer-rename
          />
        ) : (
          <span className="ly-name">{node.name}</span>
        )}
        <button
          type="button"
          title={node.visible ? c.hide : c.show}
          onClick={(e) => {
            e.stopPropagation();
            studio.setVisible(node.id, !node.visible);
          }}
          className={cn('ly-iconBtn', !node.visible && 'ly-danger')}
        >
          {node.visible ? '◉' : '◌'}
        </button>
        <button
          type="button"
          title={node.locked ? c.unlock : c.lock}
          onClick={(e) => {
            e.stopPropagation();
            studio.setLocked(node.id, !node.locked);
          }}
          className={cn('ly-iconBtn', node.locked && 'ly-warn')}
        >
          {node.locked ? '⊘' : '○'}
        </button>
      </div>
    </>
  );
}
