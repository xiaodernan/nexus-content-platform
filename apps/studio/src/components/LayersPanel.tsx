'use client';
import { useState } from 'react';
import { buildTree, childIdList, type DesignDocument, type TreeNode } from '@nexus/design-model';
import { useStudio } from '@/lib/store';

const TYPE_ICON: Record<string, string> = {
  frame: '⛶',
  group: '❏',
  rectangle: '▭',
  ellipse: '◯',
  line: '∕',
  path: '∿',
  text: 'T',
  image: '🖼',
  instance: '⧉',
  component: '◈',
  page: '▦',
  document: '🗂',
};

function Row({ tree, doc, depth }: { tree: TreeNode; doc: DesignDocument; depth: number }) {
  const { node, children } = tree;
  const selection = useStudio((s) => s.selection);
  const hoverId = useStudio((s) => s.hoverId);
  const select = useStudio((s) => s.select);
  const toggleInSelection = useStudio((s) => s.toggleInSelection);
  const setHover = useStudio((s) => s.setHover);
  const updateNode = useStudio((s) => s.updateNode);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(node.name);

  const selected = selection.includes(node.id);
  const isRoot = node.id === doc.activePageId;
  const container = children.length > 0;
  const [collapsed, setCollapsed] = useState(false);

  if (node.type === 'document') {
    // skip document node; render page children
    return (
      <>
        {children.map((c) => (
          <Row key={c.node.id} tree={c} doc={doc} depth={depth} />
        ))}
      </>
    );
  }

  return (
    <>
      <div
        onPointerEnter={() => setHover(node.id)}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? toggleInSelection(node.id) : select([node.id]))}
        onDoubleClick={() => {
          setDraft(node.name);
          setEditing(true);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          paddingLeft: 8 + depth * 12,
          fontSize: 13,
          cursor: 'pointer',
          background: selected ? 'rgba(110,168,254,0.16)' : hoverId === node.id ? 'rgba(255,255,255,0.04)' : 'transparent',
          color: node.visible ? 'var(--nexus-text)' : 'var(--nexus-muted)',
          fontStyle: node.type === 'page' ? 'italic' : 'normal',
        }}
      >
        {container ? (
          <span onClick={(e) => { e.stopPropagation(); setCollapsed((v) => !v); }} style={{ width: 12, color: 'var(--nexus-muted)', userSelect: 'none' }}>
            {collapsed ? '▸' : '▾'}
          </span>
        ) : (
          <span style={{ width: 12 }} />
        )}
        <span style={{ width: 16, textAlign: 'center', opacity: 0.8 }}>{TYPE_ICON[node.type] ?? '•'}</span>
        {editing ? (
          <input
            className="field"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { updateNode(node.id, { name: draft || node.name }); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
            style={{ padding: '1px 4px', fontSize: 13 }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        )}
        {!isRoot && (
          <>
            <button
              title={node.visible ? 'Hide' : 'Show'}
              onClick={(e) => { e.stopPropagation(); updateNode(node.id, { visible: !node.visible }); }}
              style={iconBtn}
            >
              {node.visible ? '👁' : '⊘'}
            </button>
            <button
              title={node.locked ? 'Unlock' : 'Lock'}
              onClick={(e) => { e.stopPropagation(); updateNode(node.id, { locked: !node.locked }); }}
              style={iconBtn}
            >
              {node.locked ? '🔒' : '🔓'}
            </button>
          </>
        )}
      </div>
      {container && !collapsed && children.map((c) => <Row key={c.node.id} tree={c} doc={doc} depth={depth + 1} />)}
    </>
  );
}

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--nexus-muted)',
  fontSize: 12,
  padding: 2,
  lineHeight: 1,
};

export default function LayersPanel() {
  const doc = useStudio((s) => s.doc);
  const tree = buildTree(doc);
  if (!tree) return null;
  // Only show the active page subtree to keep the panel focused.
  const pageNode: TreeNode = { node: doc.nodes[doc.activePageId]!, children: childIdList(doc.nodes[doc.activePageId]!).map((id) => buildTree(doc, id)).filter((t): t is TreeNode => Boolean(t)) };
  void tree;
  return (
    <div>
      <Row tree={pageNode} doc={doc} depth={0} />
    </div>
  );
}
