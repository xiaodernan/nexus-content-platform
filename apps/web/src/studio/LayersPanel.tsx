'use client';

import { useMemo, useState } from 'react';
import { CONTAINER_TYPES, type DesignNode, type NodeType } from '@nexus/design-model';
import { cn } from '@/lib/cn';
import { studio, useStudioReady } from './store';

const ADD_TYPES: { type: NodeType; label: string }[] = [
  { type: 'section', label: 'Section' },
  { type: 'container', label: '容器' },
  { type: 'text', label: '文本' },
  { type: 'button', label: '按钮' },
  { type: 'input', label: '输入框' },
  { type: 'image', label: '图片' },
  { type: 'card', label: '卡片' },
  { type: 'grid', label: '网格' },
  { type: 'shape', label: '形状' },
];

/** §5 Layers 树：重命名 / 显隐 / 锁定 / 拖拽改父级 / 多选 / 搜索 / 按类型过滤 */
export function LayersPanel() {
  const state = useStudioReady();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'container' | 'text' | 'media'>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const page = state.page;
  const root = page ? page.nodes[page.rootId] : null;

  const matches = useMemo(() => {
    if (!page) return new Set<string>();
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
  }, [page, query, typeFilter]);

  const visibleTree = useMemo(() => {
    if (!page) return [];
    // 过滤时保留命中节点及其祖先链
    const keep = new Set<string>();
    for (const id of matches) {
      let cursor: DesignNode | undefined = page.nodes[id];
      while (cursor && cursor.id !== page.rootId) {
        keep.add(cursor.id);
        cursor = cursor.parentId ? page.nodes[cursor.parentId] : undefined;
      }
    }
    const filtering = Boolean(query.trim()) || typeFilter !== 'all';
    const walk = (node: DesignNode): TreeEntry => ({
      node,
      children: node.children
        .map((id) => page.nodes[id])
        .filter((child): child is DesignNode => Boolean(child))
        .map(walk),
    });
    return walk(root!).children.filter((entry) => !filtering || keep.has(entry.node.id));
  }, [page, root, matches, query, typeFilter]);

  if (!page || !root) return null;

  const onDropNode = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    studio.reparentNode(dragId, targetId);
    setDragId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-2)] py-[var(--nexus-space-2)]">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索图层 / 文本"
          className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 placeholder:text-fg-3"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 py-1 text-12 text-fg-2"
          title="按类型过滤"
        >
          <option value="all">全部</option>
          <option value="container">容器</option>
          <option value="text">文本</option>
          <option value="media">媒体</option>
        </select>
        <div className="relative">
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-[var(--nexus-radius-sm)] bg-brand px-2 py-1 text-12 text-bg-0"
            data-add-node
          >
            +
          </button>
          {adding ? (
            <div className="absolute right-0 top-7 z-50 w-[140px] rounded-[var(--nexus-radius-md)] border border-[var(--nexus-color-border-subtle)] bg-bg-1 p-1 shadow-panel">
              {ADD_TYPES.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    studio.addNode(item.type);
                    setAdding(false);
                  }}
                  className="block w-full rounded-[var(--nexus-radius-sm)] px-2 py-1 text-left text-12 text-fg-1 hover:bg-bg-2"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--nexus-color-border-subtle)] px-[var(--nexus-space-2)] py-[var(--nexus-space-1)]">
        {state.document.pages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => studio.setPage(p.id)}
            data-page-tab={p.name}
            className={cn(
              'shrink-0 rounded-[var(--nexus-radius-sm)] px-[var(--nexus-space-2)] py-1 text-12',
              p.id === page.id ? 'bg-bg-3 text-fg-1' : 'text-fg-3 hover:bg-bg-2',
            )}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          onClick={() => studio.addPage(`Page ${state.document.pages.length + 1}`)}
          className="shrink-0 rounded-[var(--nexus-radius-sm)] px-2 py-1 text-12 text-fg-3 hover:bg-bg-2"
          title="新建页面"
        >
          +
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-[var(--nexus-space-1)]" onDragOver={(e) => e.preventDefault()} onDrop={() => dragId && onDropNode(page.rootId)}>
        {visibleTree.map((entry) => (
          <LayerRow
            key={entry.node.id}
            entry={entry}
            depth={0}
            page={page}
            selection={state.selection}
            collapsed={collapsed}
            onToggleCollapse={(id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
            onDragStart={setDragId}
            onDropNode={onDropNode}
          />
        ))}
        {!visibleTree.length ? <p className="px-[var(--nexus-space-3)] py-[var(--nexus-space-2)] text-12 text-fg-3">没有匹配的图层</p> : null}
      </div>
    </div>
  );
}

interface TreeEntry {
  node: DesignNode;
  children: TreeEntry[];
}

function LayerRow(props: {
  entry: TreeEntry;
  depth: number;
  page: { rootId: string; nodes: Record<string, DesignNode> };
  selection: readonly string[];
  collapsed: Record<string, boolean>;
  onToggleCollapse: (id: string) => void;
  onDragStart: (id: string) => void;
  onDropNode: (id: string) => void;
}) {
  const { entry, depth, selection } = props;
  const node = entry.node;
  const selected = selection.includes(node.id);
  const isContainer = entry.children.length > 0;
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
        className={cn(
          'flex cursor-default items-center gap-1 px-[var(--nexus-space-2)] py-[2px] text-12',
          selected ? 'bg-bg-3 text-fg-1' : 'text-fg-2 hover:bg-bg-2',
        )}
        style={{ paddingLeft: `calc(var(--nexus-space-2) + ${depth * 12}px)` }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isContainer) props.onToggleCollapse(node.id);
          }}
          className="w-3 shrink-0 text-fg-3"
        >
          {isContainer ? (open ? '▾' : '▸') : '·'}
        </button>
        <span className="w-[52px] shrink-0 truncate font-mono text-12 text-fg-3">{node.type}</span>
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-1 text-12"
            data-layer-rename
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
        )}
        <button
          type="button"
          title={node.visible ? '隐藏' : '显示'}
          onClick={(e) => {
            e.stopPropagation();
            studio.setVisible(node.id, !node.visible);
          }}
          className={cn('shrink-0 px-1', node.visible ? 'text-fg-3' : 'text-danger')}
        >
          {node.visible ? '◉' : '◌'}
        </button>
        <button
          type="button"
          title={node.locked ? '解锁' : '锁定'}
          onClick={(e) => {
            e.stopPropagation();
            studio.setLocked(node.id, !node.locked);
          }}
          className={cn('shrink-0 px-1', node.locked ? 'text-warn' : 'text-fg-3')}
        >
          {node.locked ? '⊘' : '○'}
        </button>
      </div>
      {isContainer && open
        ? entry.children.map((child) => (
            <LayerRow key={child.node.id} {...props} entry={child} depth={depth + 1} />
          ))
        : null}
    </>
  );
}
