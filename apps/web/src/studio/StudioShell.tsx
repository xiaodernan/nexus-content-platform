'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { studio, useStudio } from './store';
import { TopBar } from './TopBar';
import { LayersPanel } from './LayersPanel';
import { HistoryPanel } from './HistoryPanel';
import { PropertiesPanel } from './PropertiesPanel';
import { CanvasStage } from './CanvasStage';
import { CodePanel } from './CodePanel';
import { CommandBar } from './CommandBar';

type PanelTab = 'layers' | 'history';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'layers', label: '图层' },
  { id: 'history', label: '历史' },
];

/** §4 Studio 外壳：负责载入与保存时机，不做布局细节 */
export function StudioShell({ projectId, demoMode }: { projectId: string; demoMode: boolean }) {
  const state = useStudio();

  useEffect(() => {
    void studio.load(projectId);
  }, [projectId]);

  useEffect(() => {
    const flush = () => studio.flushSave();
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      studio.flushSave();
    };
  }, [projectId]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg-0 text-fg-1" data-studio-root data-project-id={projectId}>
      {state.ready ? (
        <StudioWorkspace zoom={state.zoom} demoMode={demoMode} />
      ) : (
        <p className="m-auto font-mono text-13 text-fg-3" data-studio-status>
          {state.loadError ?? '载入项目…'}
        </p>
      )}
    </div>
  );
}

/** 只在 load 完成后挂载：子组件因此可以假定 document / page / layout 存在 */
function StudioWorkspace({ zoom, demoMode }: { zoom: number; demoMode: boolean }) {
  const [tab, setTab] = useState<PanelTab>('layers');
  const [view, setView] = useState<'canvas' | 'code'>('canvas');
  const [railOpen, setRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  return (
    <>
      <TopBar onOpenRail={() => setRailOpen((v) => !v)} />
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[44px] shrink-0 flex-col items-center gap-1 border-r border-[var(--nexus-color-border-subtle)] bg-bg-1 py-[var(--nexus-space-2)]">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => {
                setTab(item.id);
                setRailOpen(true);
              }}
              data-panel-tab={item.id}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-[var(--nexus-radius-sm)] text-12',
                tab === item.id && railOpen ? 'bg-bg-3 text-fg-1' : 'text-fg-3 hover:bg-bg-2',
              )}
            >
              {item.label[0]}
            </button>
          ))}
        </nav>

        <aside
          className={cn(
            'min-h-0 w-[264px] shrink-0 border-r border-[var(--nexus-color-border-subtle)] bg-bg-1',
            railOpen ? 'block' : 'hidden',
          )}
          data-left-panel
        >
          {tab === 'layers' ? <LayersPanel /> : <HistoryPanel />}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* 视图切换与 DEMO 标识常驻在同一行：浮层会盖住代码视图的文件标签（§160） */}
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--nexus-color-border-subtle)] bg-bg-1 px-[var(--nexus-space-2)] py-1">
              <span className="flex items-center gap-1" data-view-switch>
                {(['canvas', 'code'] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setView(id)}
                    data-view={id}
                    aria-pressed={view === id}
                    className={cn(
                      'rounded-[var(--nexus-radius-sm)] px-2 py-[2px] font-mono text-12',
                      view === id ? 'bg-bg-3 text-fg-1' : 'text-fg-3 hover:bg-bg-2',
                    )}
                  >
                    {id === 'canvas' ? '画布' : '代码'}
                  </button>
                ))}
              </span>
              {view === 'canvas' ? (
                <span className="font-mono text-12 text-fg-3" data-zoom>
                  {Math.round(zoom * 100)}%
                </span>
              ) : null}
              <span
                data-demo-mode={demoMode ? 'on' : 'off'}
                className={cn(
                  'ml-auto rounded-[var(--nexus-radius-sm)] px-2 py-1 font-mono text-12',
                  demoMode ? 'bg-warn text-bg-0' : 'bg-success text-bg-0',
                )}
              >
                {demoMode ? 'DEMO MODE' : 'LIVE PROVIDER'}
              </span>
            </div>
            <div className="relative min-h-0 flex-1">{view === 'canvas' ? <CanvasStage /> : <CodePanel />}</div>
          </div>
          <CommandBar />
        </main>

        {inspectorOpen ? (
          <button
            type="button"
            aria-label="关闭属性面板"
            onClick={() => setInspectorOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 xl:hidden"
          />
        ) : null}
        <aside
          className={cn(
            'z-50 min-h-0 w-[300px] shrink-0 border-l border-[var(--nexus-color-border-subtle)] bg-bg-1',
            inspectorOpen ? 'fixed bottom-0 left-0 right-0 top-auto h-[52vh] max-xl:block' : 'hidden',
            'xl:static xl:block xl:h-auto',
          )}
          data-right-panel
        >
          <div className="relative flex h-full min-h-0 flex-col">
            <button
              type="button"
              onClick={() => setInspectorOpen((v) => !v)}
              className="absolute bottom-2 right-2 z-50 rounded-[var(--nexus-radius-sm)] bg-bg-2 px-2 py-1 text-12 text-fg-3 xl:hidden"
            >
              {inspectorOpen ? '收起属性' : '属性面板'}
            </button>
            <PropertiesPanel />
          </div>
        </aside>
      </div>
    </>
  );
}
