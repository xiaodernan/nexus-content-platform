'use client';
import type { DiffSummary } from '@nexus/design-model';

/**
 * Reusable semantic before/after summary card (§36 AI-diff). Extracted from PropertiesPanel so
 * both the live "last edit" view and every History-panel row render the same thing (ADR 0006/0007).
 */
export function DiffCard({ diff, title = 'AI / Edit Diff', onClose }: { diff: DiffSummary | null; title?: string; onClose?: () => void }) {
  if (!diff) return null;
  return (
    <div style={{ padding: 10, borderRadius: 8, background: 'rgba(110,168,254,0.08)', border: '1px solid var(--nexus-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b style={{ fontSize: 12 }}>{title}</b>
        {onClose && (
          <button className="btn" style={{ fontSize: 10, padding: '2px 6px' }} onClick={onClose} aria-label="dismiss">
            ✕
          </button>
        )}
      </div>
      <div style={{ fontSize: 12, marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: '#63f0a4' }}>+{diff.added.length}</span>
        <span style={{ color: '#ff7a7a' }}>−{diff.removed.length}</span>
        <span style={{ color: 'var(--nexus-brand)' }}>~{diff.modified.length}</span>
        {diff.moved.length > 0 && <span style={{ color: 'var(--nexus-accent)' }}>⇅{diff.moved.length}</span>}
        {diff.tokensChanged && <span style={{ color: 'var(--nexus-muted)' }}>tokens</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--nexus-muted)', marginTop: 4 }}>
        {diff.nodeCountBefore} → {diff.nodeCountAfter} nodes
      </div>
    </div>
  );
}
