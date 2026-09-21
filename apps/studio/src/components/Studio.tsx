'use client';
import Toolbar from './Toolbar';
import Canvas from './Canvas';
import LayersPanel from './LayersPanel';
import PropertiesPanel from './PropertiesPanel';
import DesignSystemPanel from './DesignSystemPanel';
import PromptBar from './PromptBar';
import PreviewOverlay from './PreviewOverlay';
import { useStudio } from '@/lib/store';

export default function Studio() {
  const previewOpen = useStudio((s) => s.previewOpen);

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
            <DesignSystemPanel />
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <Canvas />
          </div>
          <PromptBar />
        </main>

        <aside className="panel" style={{ width: 300, borderRight: 'none', borderBottom: 'none', borderTop: 'none', overflow: 'auto' }}>
          <PropertiesPanel />
        </aside>
      </div>
      {previewOpen && <PreviewOverlay />}
    </div>
  );
}
