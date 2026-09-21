'use client';
import { renderPreviewHtml } from '@/lib/preview';
import { exportCanvasPng, exportHtml, exportJson, slug } from '@/lib/export';
import { useStudio, type Tool } from '@/lib/store';

const TOOLS: { id: Tool; label: string; icon: string; key: string }[] = [
  { id: 'select', label: 'Move', icon: '↖', key: 'V' },
  { id: 'frame', label: 'Frame', icon: '⛶', key: 'F' },
  { id: 'rectangle', label: 'Rectangle', icon: '▭', key: 'R' },
  { id: 'ellipse', label: 'Ellipse', icon: '◯', key: 'O' },
  { id: 'text', label: 'Text', icon: 'T', key: 'T' },
];

export default function Toolbar() {
  const doc = useStudio((s) => s.doc);
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const mode = useStudio((s) => s.mode);
  const status = useStudio((s) => s.status);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const setPreview = useStudio((s) => s.setPreview);
  const newProject = useStudio((s) => s.newProject);

  const exportPng = () => {
    const el = document.getElementById('nexus-canvas') as HTMLCanvasElement | null;
    if (el) exportCanvasPng(el, slug(doc.name));
  };

  return (
    <header className="panel" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderLeft: 'none', borderRight: 'none', borderTop: 'none' }}>
      <strong style={{ fontSize: 15, letterSpacing: 1 }}>
        NEXUS <span style={{ color: 'var(--nexus-brand)' }}>Studio</span>
      </strong>
      <span style={{ fontSize: 12, color: 'var(--nexus-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {doc.name}
      </span>

      <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`btn ${tool === t.id ? 'tool-active' : ''}`}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.id)}
            style={{ minWidth: 38 }}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn" onClick={undo} title="Undo (Ctrl+Z)">↶</button>
        <button className="btn" onClick={redo} title="Redo (Ctrl+Shift+Z)">↷</button>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--nexus-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {status}
        </span>
        <span
          title="No AI provider keys configured. All generation runs in deterministic DEMO MODE (§60)."
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            padding: '3px 8px',
            borderRadius: 999,
            background: mode === 'demo' ? '#3a2f00' : '#0d2f1a',
            color: mode === 'demo' ? '#ffd24a' : '#63f0a4',
            border: `1px solid ${mode === 'demo' ? '#7a6300' : '#1c6b40'}`,
          }}
        >
          {mode === 'demo' ? 'DEMO MODE' : 'LIVE'}
        </span>
        <button className="btn" onClick={exportPng}>PNG</button>
        <button className="btn" onClick={() => exportHtml(renderPreviewHtml(doc, doc.activePageId), slug(doc.name))}>HTML</button>
        <button className="btn" onClick={() => exportJson(doc)}>JSON</button>
        <button className="btn" onClick={newProject}>New</button>
        <button className="btn btn-primary" onClick={() => setPreview(true)}>Preview</button>
      </div>
    </header>
  );
}
