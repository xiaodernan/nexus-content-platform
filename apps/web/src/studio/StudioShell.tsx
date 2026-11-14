'use client';

import { Profiler, Suspense, use, useEffect, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import type { DesignDocument } from '@nexus/creative-model';
import { cn } from '@/lib/cn';
import { studio, useStudioFields } from './store';
import { setStudioReadOnly } from './read-only';
import { TopBar } from './TopBar';
import { LayersPanel } from './LayersPanel';
import { HistoryPanel } from './HistoryPanel';
import { DesignSystemPanel } from './DesignSystemPanel';
import { AssetsPanel } from './AssetsPanel';
import { HealthRail } from './HealthPanel';
import { WorldPanel } from './WorldPanel';
import { GamePanel } from './GamePanel';
import { StoryboardPanel } from './StoryboardPanel';
import { TeamPanel } from './TeamPanel';
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
  | 'team'
  | 'characters'
  | 'memory'
  | 'retrieve'
  | 'context'
  | 'agent'
  | 'history'
  | 'health';

const TABS: { id: PanelTab }[] = [
  { id: 'layers' },
  { id: 'design' },
  { id: 'assets' },
  { id: 'world' },
  { id: 'game' },
  { id: 'storyboard' },
  { id: 'team' },
  { id: 'characters' },
  { id: 'memory' },
  { id: 'retrieve' },
  { id: 'context' },
  { id: 'agent' },
  { id: 'history' },
  { id: 'health' },
];

/** 主区那几个视图：都是同一批真值的投影，切换不复制数据 */
type WorkspaceView = 'canvas' | 'variants' | 'code' | 'graph' | 'gamegraph';
const VIEWS: WorkspaceView[] = ['canvas', 'variants', 'code', 'graph', 'gamegraph'];

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

/**
 * §147 流式首屏的客户端那一半：服务端文档**后到**，到了才 bootstrap。
 *
 * 三件事写在这里因为它们都不显眼：
 * 1. `use()` 解包 promise——pending 时本组件挂起（Suspense fallback 是 null，
 *    shell 的其余部分照常显示），文档 chunk 到达后自动接着渲染；
 * 2. `bootstrap` 与 `useEffect` 里那个 `studio.load()` **谁先到都安全**：
 *    `bootstrap` 对"已经 load 过同一个 projectId"是幂等 no-op（store.ts 的同名判断），
 *    所以不会互相覆盖，也不会把首屏省下来的那次往返又赌输；
 * 3. 读失败时服务端已 `.catch(() => null)`，这里只会拿到 null——什么都不做，
 *    `load()` 的失败路径照旧把原因显示出来（不装作读过）。
 */
function DocumentStream({ documentPromise }: { documentPromise: Promise<DesignDocument | null> }) {
  const document = use(documentPromise);
  useEffect(() => {
    if (document) studio.bootstrap(document);
  }, [document]);
  return null;
}

import { shellCopy } from './shell-i18n';
import type { Locale } from '@/lib/i18n';

/** §4 Studio 外壳：负责载入与保存时机，不做布局细节 */
export function StudioShell({
  projectId,
  demoMode,
  readOnly,
  documentPromise,
  credits = null,
  locale = 'zh',
}: {
  projectId: string;
  demoMode: boolean;
  /**
   * viewer 角色：服务端 `projectWriteAccess` 判出来的，不是界面猜的。
   * 只读时四个 store 的编辑/保存入口都会在本地按下（`read-only.ts`），
   * 横幅把原因说在前面——服务端的 403 仍是最后一道，不是唯一一道。
   */
  readOnly: boolean;
  /**
   * 服务端那份文档的 promise（§147 流式首屏，2026-10-23）。**不 await 地传下来**：
   * shell 先渲染，文档作为同一个响应的后续 chunk 后到——`use()` 在这个组件树下
   * 解开它。没有它（构建开关关掉 SSR 文档）就走原来的"水合后再 fetch"。
   */
  documentPromise?: Promise<DesignDocument | null>;
  /** v703 顶栏额度芯片：服务端 page 直读；读不到 = 不渲染（§3） */
  credits?: { ai: number; grant: number; plan: string } | null;
  /** 双语（v730）：服务端读 cookie 传入 */
  locale?: Locale;
}) {
  // §147 选中响应：外壳只关心 ready / loadError / zoom，这些在选中时不变。
  // 用选式子订阅，选中（整快照对象被换掉）不再把整个工作区子树拖着重渲染。
  const { ready, loadError, zoom } = useStudioFields((s) => ({
    ready: s.ready,
    loadError: s.loadError,
    zoom: s.zoom,
  }));
  const c = shellCopy(locale);

  useEffect(() => {
    setStudioReadOnly(readOnly);
    return () => setStudioReadOnly(false);
  }, [readOnly]);

  useEffect(() => {
    void studio.load(projectId);
  }, [projectId]);

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
    <div className="se-root" data-studio-root data-project-id={projectId}>
      {documentPromise ? (
        <Suspense fallback={null}>
          <DocumentStream documentPromise={documentPromise} />
        </Suspense>
      ) : null}
      {readOnly ? (
        <p
          data-studio-read-only
          className="se-readOnly"
        >
          {c.readOnly}
        </p>
      ) : null}
      {ready ? (
        <Profiler id="workspace" onRender={recordWorkspaceRender}>
          <StudioWorkspace zoom={zoom} demoMode={demoMode} credits={credits} locale={locale} />
        </Profiler>
      ) : (
        <p className="se-status" data-studio-status>
          {loadError ?? c.loadingProject}
        </p>
      )}
    </div>
  );
}

/** 只在 load 完成后挂载：子组件因此可以假定 document / page / layout 存在 */
function StudioWorkspace({ zoom, demoMode, credits = null, locale = 'zh' }: { zoom: number; demoMode: boolean; credits?: { ai: number; grant: number; plan: string } | null; locale?: Locale }) {
  const c = shellCopy(locale);
  const [tab, setTab] = useState<PanelTab>('layers');
  const [view, setView] = useState<WorkspaceView>('canvas');
  // §85 第二十七片：390 下 264px 的左栏把画布压到 82px——窄视口默认收起，
  // 宽视口照旧展开。用 effect 而不是初值：服务端不知道窗口宽，写在初值里会水合不一致。
  const [railOpen, setRailOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  /**
   * §85 第四十七片：xl 起右侧属性栏是常驻 300px 内联列——1279→1280 只差 1px，
   * 画布从 971 掉到 672（第四十五片量到的悬崖）。常驻属性栏是设计本身，但作者该有
   * 一次"把它折起来、把画布拿回来"的选择。默认不折：既有行为一个字不变。
   */
  const [inspectorFolded, setInspectorFolded] = useState(false);
  const unfoldRef = useRef<HTMLButtonElement | null>(null);
  const foldRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (window.innerWidth >= 1024) setRailOpen(true);
  }, []);

  return (
    <>
      <Profiler id="topbar" onRender={recordRender('topbar')}>
        <TopBar onOpenRail={() => setRailOpen((v) => !v)} credits={credits} locale={locale} />
      </Profiler>
      <div className="se-frame">
        <nav className="se-rail">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              title={c.tabs[item.id]}
              aria-label={c.tabs[item.id]}
              onClick={() => {
                setTab(item.id);
                setRailOpen(true);
              }}
              data-panel-tab={item.id}
              className={cn(
                'se-tab',
                tab === item.id && railOpen && 'se-tabActive',
              )}
            >
              {c.tabs[item.id][0]}
            </button>
          ))}
        </nav>

        <Profiler id="left" onRender={recordRender('left')}>
        <aside
          className={cn(
            // 小屏浮层：面板盖在画布上而不是挤窄它（`left-[44px]` 让出图标栏）；lg 起回到内联三栏
            'se-panel',
            railOpen ? 'se-panel-visible' : 'se-panel-hidden',
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
          ) : tab === 'team' ? (
            <TeamPanel />
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
        <main className="se-workArea">
          <div className="se-workCol">
            {/* 视图切换与 DEMO 标识常驻在同一行：浮层会盖住代码视图的文件标签（§160） */}
            <div className="se-viewBar">
              <span className="se-viewSwitch" data-view-switch>
                {VIEWS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setView(id)}
                    data-view={id}
                    aria-pressed={view === id}
              className={cn('se-viewBtn', view === id && 'se-viewBtnActive')}
                  >
                    {c.views[id]}
                  </button>
                ))}
              </span>
              {view === 'canvas' ? (
                <span className="se-zoomX" data-zoom>
                  {Math.round(zoom * 100)}%
                </span>
              ) : null}
              <span
                data-demo-mode={demoMode ? 'on' : 'off'}
                className={cn(
                  'se-demoChipBase',
                  demoMode ? 'se-demoChipWarn' : 'se-demoChipLive',
                )}
              >
                {demoMode ? 'DEMO MODE' : 'LIVE PROVIDER'}
              </span>
            </div>
            <div className="se-canvasWrap">
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
            aria-label={c.closeInspector}
            onClick={() => setInspectorOpen(false)}
            className="se-scrim"
          />
        ) : null}
        {inspectorFolded ? (
          <button
            ref={unfoldRef}
            type="button"
            aria-label={c.unfoldInspector}
            aria-expanded={false}
            aria-controls="nexus-inspector"
            onClick={() => {
              setInspectorFolded(false);
              window.requestAnimationFrame(() => foldRef.current?.focus());
            }}
            data-inspector-unfold
            className="se-unfoldBtn"
          >
            {c.propertyToggle}
          </button>
        ) : null}
        <Profiler id="properties" onRender={recordRender('properties')}>
        <aside
          className={cn(
            'se-inspector',
            inspectorOpen ? 'se-inspectorShowMobile' : 'se-inspectorHideMobile',
            
            inspectorFolded ? 'se-inspectorHideXL' : 'se-inspectorShowXL',
          )}
          id="nexus-inspector"
          data-right-panel
        >
          <div className="se-inspectorBody">
            <button
              ref={foldRef}
              type="button"
              aria-label={c.foldInspector}
              aria-expanded
              aria-controls="nexus-inspector"
              onClick={() => {
                setInspectorFolded(true);
                window.requestAnimationFrame(() => unfoldRef.current?.focus());
              }}
              data-inspector-fold
              className="se-foldBtn"
            >
              {c.propertyToggle}
            </button>
            <button
              type="button"
              onClick={() => setInspectorOpen((v) => !v)}
              className="se-inspectorToggle"
              aria-label={c.inspectorAria}
            >
              {inspectorOpen ? c.collapseInspectorBar : c.inspectToggle}
            </button>
            <PropertiesPanel />
          </div>
        </aside>
      </Profiler>
      </div>
    </>
  );
}
