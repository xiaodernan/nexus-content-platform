'use client';
import { useState } from 'react';
import { childIdList } from '@nexus/design-model';
import { useStudio } from '@/lib/store';

/** Page tab strip above the canvas. Switching the active page is studio-local view state this
 *  increment (not an undoable op); adds route through the reversible addSubtree→pageIds path. */
export default function PageTabs() {
  const doc = useStudio((s) => s.doc);
  const activePageId = useStudio((s) => s.activePageId);
  const switchPage = useStudio((s) => s.switchPage);
  const addPage = useStudio((s) => s.addPage);
  const updateNode = useStudio((s) => s.updateNode);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');

  const pages = childIdList(doc.nodes[doc.rootId]!).filter((id) => doc.nodes[id]?.type === 'page');

  const commitRename = (id: string) => {
    const n = doc.nodes[id];
    if (n && name.trim() && name !== n.name) updateNode(id, { name: name.trim() });
    setRenaming(null);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--nexus-border)', background: 'var(--nexus-surface, #0e131d)', overflowX: 'auto' }}>
      {pages.map((id) => {
        const node = doc.nodes[id]!;
        const active = id === activePageId;
        return renaming === id ? (
          <input
            key={id}
            autoFocus
            className="field"
            style={{ width: 120, height: 26 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => commitRename(id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename(id);
              else if (e.key === 'Escape') setRenaming(null);
            }}
          />
        ) : (
          <button
            key={id}
            onClick={() => switchPage(id)}
            onDoubleClick={() => {
              setRenaming(id);
              setName(node.name);
            }}
            title={`${node.name} (double-click to rename)`}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
              border: active ? '1px solid var(--nexus-brand)' : '1px solid var(--nexus-border)',
              background: active ? 'rgba(110,168,254,0.14)' : 'transparent',
              color: active ? 'var(--nexus-fg, #e6ecf5)' : 'var(--nexus-muted)',
            }}
          >
            {node.name}
          </button>
        );
      })}
      <button className="btn" style={{ fontSize: 14, padding: '2px 9px' }} onClick={addPage} title="Add page">
        +
      </button>
    </div>
  );
}
