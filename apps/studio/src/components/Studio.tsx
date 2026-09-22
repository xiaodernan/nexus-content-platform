'use client';
import { useEffect } from 'react';
import Toolbar from './Toolbar';
import Canvas from './Canvas';
import PageTabs from './PageTabs';
import AlignBar from './AlignBar';
import LayersPanel from './LayersPanel';
import Minimap from './Minimap';
import PropertiesPanel from './PropertiesPanel';
import DesignSystemPanel from './DesignSystemPanel';
import ComponentsPanel from './ComponentsPanel';
import HistoryPanel from './HistoryPanel';
import AgentPanel from './AgentPanel';
import PromptBar from './PromptBar';
import PreviewOverlay from './PreviewOverlay';
import { useStudio } from '@/lib/store';
import { deserializeApp, serializeApp } from '@/lib/persist';
import { browserStorage, STUDIO_DOC_KEY } from '@/lib/storage';

const SAVE_DEBOUNCE_MS = 500;

export default function Studio() {
  const previewOpen = useStudio((s) => s.previewOpen);

  // Local persistence: hydrate once, then debounced-save on every document change (§32 durability
  // for the slice; server snapshot/versioning is M7+). Storage I/O lives behind the seam in
  // lib/storage so this component never touches `window` directly.
  useEffect(() => {
    const store = browserStorage();
    const raw = store.getItem(STUDIO_DOC_KEY);
    if (raw) {
      const res = deserializeApp(raw);
      if (res.ok) useStudio.getState().loadDocument(res.doc);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useStudio.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          store.setItem(STUDIO_DOC_KEY, serializeApp(useStudio.getState().doc));
        } catch {
          /* quota / private-mode: persistence is best-effort for the slice */
        }
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--nexus-bg)' }}>
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside className="panel" style={{ width: 240, borderLeft: 'none', borderBottom: 'none', borderTop: 'none', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '8px 12px', fontSize: 11, letterSpacing: 1, color: 'var(--nexus-muted)', textTransform: 'uppercase' }}>
            Layers
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <LayersPanel />
          </div>
          <div style={{ borderTop: '1px solid var(--nexus-border)' }}>
            <ComponentsPanel />
          </div>
          <div style={{ borderTop: '1px solid var(--nexus-border)' }}>
            <DesignSystemPanel />
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <PageTabs />
          <AlignBar />
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <Canvas />
            <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 5 }}>
              <Minimap />
            </div>
          </div>
          <PromptBar />
        </main>

        <aside className="panel" style={{ width: 300, borderRight: 'none', borderBottom: 'none', borderTop: 'none', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: '1 1 55%', minHeight: 0, overflow: 'auto' }}>
            <PropertiesPanel />
          </div>
          <div style={{ borderTop: '1px solid var(--nexus-border)' }}>
            <AgentPanel />
          </div>
          <div style={{ flex: '1 1 45%', minHeight: 0, overflow: 'auto', borderTop: '1px solid var(--nexus-border)' }}>
            <HistoryPanel />
          </div>
        </aside>
      </div>
      {previewOpen && <PreviewOverlay />}
    </div>
  );
}
