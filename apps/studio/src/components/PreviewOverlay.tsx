'use client';
import { useMemo } from 'react';
import { renderPreviewHtml } from '@/lib/preview';
import { useStudio } from '@/lib/store';

export default function PreviewOverlay() {
  const doc = useStudio((s) => s.doc);
  const setPreview = useStudio((s) => s.setPreview);
  const html = useMemo(() => renderPreviewHtml(doc, doc.activePageId), [doc]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(4,6,10,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24 }}
      onClick={() => setPreview(false)}
    >
      <div
        className="panel"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(1100px, 96vw)', height: '88vh', display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--nexus-border)' }}>
          <b style={{ fontSize: 13 }}>Live Preview</b>
          <span style={{ fontSize: 11, color: 'var(--nexus-muted)' }}>rendered directly from the Nexus Design Model (not the DOM)</span>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={() => setPreview(false)}>Close ✕</button>
        </div>
        <iframe title="NEXUS Preview" srcDoc={html} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
      </div>
    </div>
  );
}
