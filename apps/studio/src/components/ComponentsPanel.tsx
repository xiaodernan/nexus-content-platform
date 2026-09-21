'use client';
import { useStudio } from '@/lib/store';
import type { DesignDocument, DesignNode } from '@nexus/design-model';

function componentsOf(doc: DesignDocument): DesignNode[] {
  return Object.values(doc.nodes).filter((n) => n.type === 'component');
}

/**
 * Component / instance authoring (ADR 0015). Masters live under the document root and never
 * render on a page directly; pages carry `instance` nodes that the canvas materializes through
 * the pure expandComponentInstances projection. Every action here routes through reversible ops,
 * so create/insert/detach land in History + the AI-diff for free.
 */
export default function ComponentsPanel() {
  const doc = useStudio((s) => s.doc);
  const selection = useStudio((s) => s.selection);
  const createComponent = useStudio((s) => s.createComponent);
  const insertInstance = useStudio((s) => s.insertInstance);
  const detachInstance = useStudio((s) => s.detachInstance);

  const comps = componentsOf(doc);
  const canCreate = selection.some((id) => {
    const n = doc.nodes[id];
    return !!n && n.parentId !== null && n.type !== 'page' && n.type !== 'document' && n.type !== 'component' && !n.locked;
  });
  const canDetach = selection.some((id) => doc.nodes[id]?.type === 'instance');
  const usage = (id: string) => Object.values(doc.nodes).filter((n) => n.type === 'instance' && n.componentId === id).length;

  const action: React.CSSProperties = {
    flex: 1,
    padding: '6px 8px',
    fontSize: 12,
    border: '1px solid var(--nexus-border)',
    borderRadius: 6,
    background: 'var(--nexus-surface-alt, #1e2634)',
    color: 'var(--nexus-text)',
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: '8px 12px 12px' }}>
      <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--nexus-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
        Components
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button className="btn" style={{ ...action, opacity: canCreate ? 1 : 0.4 }} disabled={!canCreate} onClick={() => createComponent()} title="Wrap the selected layers into a component and place an instance">
          Make component
        </button>
        <button className="btn" style={{ ...action, opacity: canDetach ? 1 : 0.4 }} disabled={!canDetach} onClick={() => detachInstance()} title="Turn the selected instance back into editable layers">
          Detach
        </button>
      </div>
      {comps.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--nexus-muted)', lineHeight: 1.5 }}>
          No components yet. Select layers on the canvas and choose <em>Make component</em>.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {comps.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', border: '1px solid var(--nexus-border)', borderRadius: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--nexus-brand, #6ea8fe)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{c.name}</span>
              <span style={{ fontSize: 10, color: 'var(--nexus-muted)' }}>{usage(c.id)}×</span>
              <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => insertInstance(c.id)} title="Insert an instance of this component">
                Insert
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
