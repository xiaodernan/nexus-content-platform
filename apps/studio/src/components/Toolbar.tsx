'use client';
import { useEffect, useState } from 'react';
import { renderPreviewHtml } from '@/lib/preview';
import { exportCanvasPng, exportHtml, exportJson, slug } from '@/lib/export';
import { probePublish, publishProject, type PublishLaneProbe } from '@/lib/publishLane';
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
  const activePageId = useStudio((s) => s.activePageId);
  const tool = useStudio((s) => s.tool);
  const setTool = useStudio((s) => s.setTool);
  const mode = useStudio((s) => s.mode);
  const status = useStudio((s) => s.status);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const setPreview = useStudio((s) => s.setPreview);
  const newProject = useStudio((s) => s.newProject);
  const surface = useStudio((s) => s.surface);
  const setSurface = useStudio((s) => s.setSurface);

  const exportPng = () => {
    const el = document.getElementById('nexus-canvas') as HTMLCanvasElement | null;
    if (el) exportCanvasPng(el, slug(doc.name));
  };

  /**
   * M7 v194 — the Publish face.
   *
   * The service is PROBED on mount so the control can say what it will do before it is pressed: a Studio
   * whose backend is not running should say so, rather than offering a button that fails when clicked.
   * `services/nexus-api` not running is the ordinary state of this repository, so "unavailable" is a
   * NORMAL answer with a reason, never an error banner.
   */
  const [service, setService] = useState<PublishLaneProbe | null>(null);
  const [publishNote, setPublishNote] = useState('');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    let live = true;
    void probePublish().then((probe) => {
      if (live) setService(probe);
    });
    return () => {
      live = false;
    };
  }, []);

  const onPublish = async () => {
    setPublishing(true);
    setPublishNote('');
    try {
      // The project id and the title come from the document; the VERSION, the INSTANT and the URL come back
      // from the service. This component computes none of them — it would be reporting its own guess about a
      // record it did not write.
      const answer = await publishProject(doc.id, doc.name, doc);
      setPublishNote(answer.ok ? `published v${answer.version} → ${answer.url}` : `not published: ${answer.reason}`);
      // A publish can also be the first thing that discovers the service went away.
      if (!answer.ok) setService(await probePublish());
    } finally {
      setPublishing(false);
    }
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

      {/* M5 v142: the 3D surface is a VIEW, so it is a toggle next to the view-level controls rather
          than a document tool. `2D` is the default the golden-path harness drives. */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 4 }}>
        <button
          className={`btn ${surface === '2d' ? 'tool-active' : ''}`}
          title="2D canvas (the Design Model)"
          onClick={() => setSurface('2d')}
          data-surface-toggle="2d"
        >
          2D
        </button>
        <button
          className={`btn ${surface === '3d' ? 'tool-active' : ''}`}
          title="3D scene (@nexus/three-runtime, M5)"
          onClick={() => setSurface('3d')}
          data-surface-toggle="3d"
        >
          3D
        </button>
        <button
          className={`btn ${surface === 'world' ? 'tool-active' : ''}`}
          title="World (@nexus/world-engine, M4)"
          onClick={() => setSurface('world')}
          data-surface-toggle="world"
        >
          World
        </button>
        <button
          className={`btn ${surface === 'assets' ? 'tool-active' : ''}`}
          title="Assets (@nexus/ai-providers multimodal, M3)"
          onClick={() => setSurface('assets')}
          data-surface-toggle="assets"
        >
          Assets
        </button>
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
        <button className="btn" onClick={() => exportHtml(renderPreviewHtml(doc, activePageId), slug(doc.name))}>HTML</button>
        <button className="btn" onClick={() => exportJson(doc)}>JSON</button>
        <button
          className="btn"
          data-toolbar-publish
          onClick={() => void onPublish()}
          disabled={publishing || service?.available === false}
          title={
            service === null
              ? 'checking whether nexus-api is running…'
              : service.available
                ? `publish this document to ${service.apiBase}`
                : `nexus-api is not reachable at ${service.apiBase} — ${service.reason ?? 'no reason given'}`
          }
        >
          {publishing ? 'Publishing…' : 'Publish'}
        </button>
        {/* The service's state is shown, not implied by whether a button looks enabled. */}
        <span
          data-toolbar-publish-note
          style={{
            fontSize: 11,
            maxWidth: 300,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: publishNote.startsWith('published') ? 'var(--nexus-brand)' : 'var(--nexus-muted)',
          }}
        >
          {publishNote || (service === null ? 'publish: checking…' : service.available ? 'publish: service ready' : 'publish: service unavailable')}
        </span>
        <button className="btn" onClick={newProject}>New</button>
        <button className="btn btn-primary" onClick={() => setPreview(true)}>Preview</button>
      </div>
    </header>
  );
}
