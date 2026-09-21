'use client';
import { useMemo } from 'react';
import { expandComponentInstances, type DesignDocument, type DiffSummary } from '@nexus/design-model';
import { docToSvg, svgToDataUri } from '@/lib/thumbnail';

function thumbUri(doc: DesignDocument, pageId: string): string {
  // Materialize instances so component/instance edits show their projected children in the diff.
  return svgToDataUri(docToSvg(expandComponentInstances(doc).doc, pageId));
}

function Thumb({ label, uri }: { label: string; uri: string }) {
  return (
    <figure style={{ margin: 0, flex: 1, minWidth: 0 }}>
      <figcaption style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--nexus-muted)', marginBottom: 3 }}>{label}</figcaption>
      {/* Inline SVG data URI (no network) — next/image offers no benefit here. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={uri}
        alt={label}
        style={{ width: '100%', height: 88, objectFit: 'contain', background: '#0b0e14', border: '1px solid var(--nexus-border)', borderRadius: 6 }}
      />
    </figure>
  );
}

/**
 * Reusable semantic before/after summary card (§36 AI-diff). Extracted from PropertiesPanel so
 * both the live "last edit" view and every History-panel row render the same thing (ADR 0006/0007).
 * When `before`/`after`/`pageId` are supplied it also renders model→SVG thumbnails (ADR 0005).
 */
export function DiffCard({
  diff,
  title = 'AI / Edit Diff',
  onClose,
  before,
  after,
  pageId,
}: {
  diff: DiffSummary | null;
  title?: string;
  onClose?: () => void;
  before?: DesignDocument | null;
  after?: DesignDocument | null;
  pageId?: string | null;
}) {
  const uris = useMemo(() => {
    if (!before || !after || !pageId) return null;
    if (!before.nodes[pageId] || !after.nodes[pageId]) return null;
    return { before: thumbUri(before, pageId), after: thumbUri(after, pageId) };
  }, [before, after, pageId]);

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
      {uris && (
        <div style={{ display: 'flex', gap: 8, margin: '8px 0 4px' }}>
          <Thumb label="before" uri={uris.before} />
          <Thumb label="after" uri={uris.after} />
        </div>
      )}
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
