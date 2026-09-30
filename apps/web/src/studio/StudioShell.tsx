'use client';

import { Profiler, useEffect, useState, type ProfilerOnRenderCallback } from 'react';
import type { DesignDocument } from '@nexus/design-model';
import { cn } from '@/lib/cn';
import { studio, useStudio } from './store';
import { TopBar } from './TopBar';
import { LayersPanel } from './LayersPanel';
import { HistoryPanel } from './HistoryPanel';
import { DesignSystemPanel } from './DesignSystemPanel';
import { AssetsPanel } from './AssetsPanel';
import { HealthRail } from './HealthPanel';
import { WorldPanel } from './WorldPanel';
import { GamePanel } from './GamePanel';
import { StoryboardPanel } from './StoryboardPanel';
import { CharacterPanel } from './CharacterPanel';
import { MemoryPanel } from './MemoryPanel';
import { RetrievePanel } from './RetrievePanel';
import { ContextPanel } from './ContextPanel';
import { AgentPanel } from './AgentPanel';
import { WorldGraphView } from './WorldGraphView';
import { GameGraphView } from './GameGraphView';
import { worldStore } from './worldStore';
import { gameStore } from './gameStore';
import { storyboardStore } from './storyboardStore';
import { PropertiesPanel } from './PropertiesPanel';
import { CanvasStage } from './CanvasStage';
import { CodePanel } from './CodePanel';
import { VariantsBoard } from './VariantsBoard';
import { CommandBar } from './CommandBar';

type PanelTab =
  | 'layers'
  | 'design'
  | 'assets'
  | 'world'
  | 'game'
  | 'storyboard'
  | 'characters'
  | 'memory'
  | 'retrieve'
  | 'context'
  | 'agent'
  | 'history'
  | 'health';

const TABS: { id: PanelTab; label: string }[] = [
  { id: 'layers', label: '图层' },
  { id: 'design', label: '设计系统' },
  { id: 'assets', label: '资产库' },
  { id: 'world', label: '世界' },
  { id: 'game', label: '游戏' },
  { id: 'storyboard', label: '分镜' },
  { id: 'characters', label: '角色' },
  { id: 'memory', label: '记忆' },
  { id: 'retrieve', label: '检索' },
  { id: 'context', label: '上下文' },
  { id: 'agent', label: 'Agent' },
  { id: 'history', label: '历史' },
  { id: 'health', label: '健康' },
];

/** 主区那几个视图：都是同一批真值的投影，切换不复制数据 */
type WorkspaceView = 'canvas' | 'variants' | 'code' | 'graph' | 'gamegraph';

const VIEWS: WorkspaceView[] = ['canvas', 'variants', 'code', 'graph', 'gamegraph'];

const VIEW_LABELS: Record<WorkspaceView, string> = {
  canvas: '画布',
  variants: '方案',
  code: '代码',
  graph: '世界图',
  gamegraph: '游戏图',
};

/**
 * §147 选中响应诊断：一次"点节点 → 手柄出现"是同一个同步任务，靠外部轮询拆不开
 * store 段与 React 段。Profiler 的 onRender 在这个任务里同步回调，把 React 渲染段
 * 记进 __studioPerf（只在开发模式记账；生产构建里 Profiler 的 actualDuration 恒为 0）。
 */
const recordRender = (id: string): ProfilerOnRenderCallback => (_id, _phase, actualDuration) => {
  if (process.env.NODE_ENV === 'production') return;
  const perf = (globalThis as unknown as { __studioPerf?: Record<string, unknown> });
  const bucket = perf.__studioPerf ??= {};
  bucket.reactMs = (bucket.reactMs as number || 0) + actualDuration;
  bucket.reactRenders = (bucket.reactRenders as number || 0) + 1;
  const by = (bucket.reactBy as Record<string, number> || {});
  bucket.reactBy = by;
  by[id] = (by[id] || 0) + actualDuration;
};

const recordWorkspaceRender = recordRender('workspace');

/** §4 Studio 外壳：负责载入与保存时机，不做布局细节 */
export function StudioShell({
  projectId,
  demoMode,
  initialDocument,
}: {
  projectId: string;
  demoMode: boolean;
  /** 服务端随 HTML 带下来的那一份文档；没有它就走原来的"水合后再 fetch" */
  initialDocument?: DesignDocument;
}) {
  const state = useStudio();

  useEffect(() => {
    // 先装服务端给的那一份，再叫 load()：它看到 `loadedFor` 已经对上就直接返回，
    // 于是首屏少一次接口往返，而"没有 initialDocument"的老路径一行都没变。
    if (initialDocument) studio.bootstrap(initialDocument);
    void studio.load(projectId);
  }, [projectId, initialDocument]);

  useEffect(() => {
    // 四份真值各自收尾：设计文档走画布的撤销栈，世界、游戏与分镜文档走各自的待写队列
    const flush = () => {
      studio.flushSave();
      worldStore.flushSave();
      gameStore.flushSave();
      storyboardStore.flushSave();
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [projectId]);

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-bg-0 text-fg-1" data-studio-root data-project-id={projectId}>
      {state.ready ? (
        <Profiler id="workspace" onRender={recordWorkspaceRender}>
          <StudioWorkspace zoom={state.zoom} demoMode={demoMode} />
        </Profiler>
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
  const [view, setView] = useState<WorkspaceView>('canvas');
  const [railOpen, setRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  return (
    <>
      <Profiler id="topbar" onRender={recordRender('topbar')}>
        <TopBar onOpenRail={() => setRailOpen((v) => !v)} />
      </Profiler>
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

        <Profiler id="left" onRender={recordRender('left')}>
        <aside
          className={cn(
            'min-h-0 w-[264px] shrink-0 border-r border-[var(--nexus-color-border-subtle)] bg-bg-1',
            railOpen ? 'block' : 'hidden',
          )}
          data-left-panel
        >
          {tab === 'layers' ? (
            <LayersPanel />
          ) : tab === 'design' ? (
            <DesignSystemPanel />
          ) : tab === 'assets' ? (
            <AssetsPanel />
          ) : tab === 'world' ? (
            <WorldPanel />
          ) : tab === 'game' ? (
            <GamePanel />
          ) : tab === 'storyboard' ? (
            <StoryboardPanel />
          ) : tab === 'characters' ? (
            <CharacterPanel />
          ) : tab === 'memory' ? (
            <MemoryPanel />
          ) : tab === 'retrieve' ? (
            <RetrievePanel />
          ) : tab === 'context' ? (
            <ContextPanel />
          ) : tab === 'agent' ? (
            <AgentPanel />
          ) : tab === 'health' ? (
            <HealthRail />
          ) : (
            <HistoryPanel />
          )}
        </aside>
      </Profiler>

        <Profiler id="main" onRender={recordRender('main')}>
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 flex-col">
            {/* 视图切换与 DEMO 标识常驻在同一行：浮层会盖住代码视图的文件标签（§160） */}
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--nexus-color-border-subtle)] bg-bg-1 px-[var(--nexus-space-2)] py-1">
              <span className="flex items-center gap-1" data-view-switch>
                {VIEWS.map((id) => (
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
                    {VIEW_LABELS[id]}
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
            <div className="relative min-h-0 flex-1">
              {view === 'canvas' ? (
                <CanvasStage />
              ) : view === 'variants' ? (
                <VariantsBoard />
              ) : view === 'graph' ? (
                <WorldGraphView />
              ) : view === 'gamegraph' ? (
                <GameGraphView />
              ) : (
                <CodePanel />
              )}
            </div>
          </div>
          {/* 比较板是只读的：AI 命令栏改的是工作区那一份，在这儿会让人以为改的是某张卡 */}
          {/* 命令栏改的是设计工作区；方案板、世界图与游戏图都不是它的作用域 */}
          {view === 'variants' || view === 'graph' || view === 'gamegraph' ? null : <CommandBar />}
        </main>
      </Profiler>

        {inspectorOpen ? (
          <button
            type="button"
            aria-label="关闭属性面板"
            onClick={() => setInspectorOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 xl:hidden"
          />
        ) : null}
        <Profiler id="properties" onRender={recordRender('properties')}>
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
      </Profiler>
      </div>
    </>
  );
}
