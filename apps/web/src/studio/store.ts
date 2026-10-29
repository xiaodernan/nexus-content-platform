import { useSyncExternalStore } from 'react';
import {
  BREAKPOINT_WIDTH,
  CONTAINER_TYPES,
  DesignStore,
  TokenStore,
  clone,
  createNode,
  createPage,
  diffDocuments,
  findPage,
  hitTest,
  isDescendant,
  manualCommand,
  resolveLayout,
  resolveLayoutIncremental,
  type MeasureCache,
  type AssetRef,
  type BreakpointName,
  type DesignDocument,
  type DesignNode,
  type DesignPatch,
  type DocumentDiff,
  type HistoryEntry,
  type NodeId,
  type NodeState,
  type NodeStateStyle,
  type NodeType,
  type Page,
  type PatchOp,
  type ResolvedLayout,
  type VisualDna,
} from '@nexus/design-model';
import type { Annotation } from '@/server/domain/annotations';
import {
  ModerationScanSchema,
  ProjectHealthReportSchema,
  VisualBenchmarkResponseSchema,
  VisualDnaSchema,
  type DesignPatchPayload,
  type ModerationScan,
  type VisualBenchmarkResponse,
} from '@nexus/schemas';
import type { SnapshotEntry, SnapshotMeta } from '@/server/domain/snapshots';
import type { BranchMeta } from '@/server/domain/branches';
import type { VariantEntry } from '@/server/domain/variants';
import type { Publication, Visibility } from '@/server/domain/publish';
import { apiAssetUrl, assetContextFor, type AssetUrlContext } from './assets';
import { csrfHeaders } from '@/lib/csrf';
import { STATE_LABELS } from './state-labels';
import { isStudioReadOnly } from './read-only';

/**
 * Studio 客户端状态：唯一真值仍然是 DesignStore 里的 DesignDocument（§9/§16）。
 * 这里只加"视图态"（选区 / viewport / zoom / pan / 保存状态），
 * 任何几何或样式的改动都必须走 patch → execute，不允许直接改 DOM 再同步（§16）。
 *
 * 文本测量刻意沿用模型的 heuristicMeasure：如果渲染层注入 DOM 测量，
 * 画布、代码生成与预览三套投影就会漂移。
 */

export type ViewportMode = 'design' | BreakpointName;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * 历史面板要看的范围（§27）。
 *
 * 只有这两个值，没有"某条指定分支"：筛选条件由服务端每次现算「当前分支」，
 * 而不是客户端记住一个 uuid。客户端记 uuid 会在切分支后继续用旧 id 查——
 * 面板上高亮的已经是新分支，列表却还是旧分支的那一份，两句互相打脸。
 */
export type SnapshotScope = 'all' | 'current';

/**
 * §124 状态补丁的剪贴板（ADR-0062 part ⑤ 的续）：一条**视图态**，不落库、不进撤销栈。
 * 只存一份补丁 + 它来自哪个节点的哪个状态，粘贴时整通道覆盖（与面板逐通道写入同一语义）。
 */
export interface StatesClipboard {
  state: NodeState;
  patch: NodeStateStyle;
  sourceNodeId: NodeId;
  sourceName: string;
}

/** Compare（§27）的一份结果：比较的快照 + 与当前文档的字段级差异 */
export interface CompareResult {
  snapshotId: string;
  label: string | null;
  createdAt: string;
  diff: DocumentDiff;
}

export interface StudioSnapshot {
  ready: boolean;
  projectId: string;
  loadError: string | null;
  document: DesignDocument | null;
  page: Page | null;
  layout: ResolvedLayout | null;
  tokens: TokenStore;
  selection: readonly NodeId[];
  viewport: ViewportMode;
  zoom: number;
  pan: { x: number; y: number };
  grid: boolean;
  guides: readonly { axis: 'x' | 'y'; at: number }[];
  dirty: boolean;
  saveState: SaveState;
  saveError: string | null;
  savedAt: string | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  history: readonly HistoryEntry[];
  lastEntry: HistoryEntry | null;
  /** §27 服务端快照：与本地事务栈分开，恢复后本地栈会清空 */
  snapshots: readonly SnapshotMeta[];
  snapshotBusy: boolean;
  snapshotError: string | null;
  /** §27 列表范围：'current' 时服务端只回当前那条分支上的快照 */
  snapshotScope: SnapshotScope;
  /** §27 Compare：某份快照与当前文档的字段级差异（方向是"从快照到现在"） */
  compare: CompareResult | null;
  /** §28 分支线；当前分支 = head 停在 currentSnapshotId 的那条，由服务端推导 */
  branches: readonly BranchMeta[];
  /** §29 多方案：每条分支 head 上的文档，用于并排比较 */
  variants: readonly VariantEntry[];
  /** 上一次生成/合成时"没能落上去"的部分（§159：不静默丢弃） */
  variantNotes: readonly string[];
  /** §56/§57 发布状态：null 表示从没发布过 */
  publication: Publication | null;
  /** §111 画布批注：钉在节点上的评论。服务端算得出它挂在哪个页面，客户端不猜 */
  annotations: Annotation[];
  publishBusy: boolean;
  publishError: string | null;
  /** §131 最近一次发布的机检结果（含 limits）。null = 这次会话里还没发布过，不是"机检说没问题" */
  publishScan: ModerationScan | null;
  /** §38 资产清单（文档级）：字节在对象存储，这里只有目录 */
  assets: readonly AssetRef[];
  /**
   * 投影用的 assetId → URL 解析器。清单里没有的 id 一律返回 null，
   * 渲染层据此跳过该层——不画破图占位（§159）。
   */
  assetContext: AssetUrlContext;
  assetBusy: boolean;
  assetError: string | null;
  /** 上传成功后的一次性回执，例如"已剥离 EXIF"；下一次动作即清除 */
  assetNotice: string | null;
  /** §124 状态补丁剪贴板：null = 还没复制过（粘贴入口据此禁用，不是"贴了个空补丁"） */
  statesClipboard: StatesClipboard | null;
  /** §86 视觉基准上一次比较的结果：纯计算不进模型，换项目即清（下面两个入口都清） */
  visualBenchmarkResult: VisualBenchmarkResponse | null;
  revision: number;
  activeMode: string | null;
}

const EMPTY_DOCUMENT_KEY = 'empty';

/**
 * #62②：一次补丁保存的 ops 总数超过它就退回整份 PUT。契约上单个补丁 ops ≤4000
 * （`DesignPatchSchema`），这里留一倍余量——攒到这种量级说明命令栈之外出了大事，
 * 全量替换反而是更诚实的一条路（缺失即删的语义把两边拉齐）。
 */
const AUTOSAVE_PATCH_MAX_OPS = 2000;

function emptyDocument(): DesignDocument {
  return {
    id: EMPTY_DOCUMENT_KEY,
    schemaVersion: 1,
    name: '',
    pages: [],
    activePageId: '',
    components: [],
    tokens: [],
    assets: [],
    variables: [],
    metadata: { createdAt: '', updatedAt: '', modes: [] },
  };
}

export class StudioStore {
  private design = new DesignStore(emptyDocument());
  private selection: NodeId[] = [];
  private viewport: ViewportMode = 'design';
  private zoomValue = 0.5;
  private panValue = { x: 40, y: 40 };
  private gridOn = false;
  private guideLines: { axis: 'x' | 'y'; at: number }[] = [];
  private dirty = false;
  private saveStateValue: SaveState = 'idle';
  private saveError: string | null = null;
  private savedAt: string | null = null;
  private ready = false;
  private loadError: string | null = null;
  private projectId = '';
  private listeners = new Set<() => void>();
  private snapshot!: StudioSnapshot;
  private layoutCache: { key: string; doc: DesignDocument; gen: number; pageId: string; value: ResolvedLayout | null } | null = null;
  /**
   * §147 增量解：自上一次布局求解以来，改动碰到过哪些节点。
   *
   * 收集得**保守**（op 里提到的每个 id 都算）：多收几个只是那几条路径少复用一点，
   * 不会算错——而少收一个（漏了真正被改的那个）会让它被当成"没动过"而沿用上一帧，
   * 那才是错的。所以宁可多收，不可漏收。
   */
  private layoutChangedNodeIds = new Set<NodeId>();
  /**
   * §147 增量解：**这一刀的改动集合算不全** → 那一轮只能走全量。
   *
   * 什么时候算不全：`removeComponent` / `removeAsset` 会**扫遍所有页面**去解引用
   * （组件定义没了，所有引用它的实例一起解开；资产下架了，所有页面上引用它的填充一起剥掉），
   * 而那些被解开的节点**不在 op 里**（op 只带一个 componentId / assetId）。
   * 改动集合算不全 → 增量路会把它们当成"没动过"而沿用上一帧那个对象
   * （那个对象**内嵌旧的节点**）→ 画布还画着已删资产/已解开的实例。
   *
   * 算不全就不假装算全：这一刀走全量（宁可多算一次，不画错）。
   */
  private layoutForceFull = false;
  /**
   * §147 增量解：**跨帧**的测量缓存（"量文字"是布局里最贵的一截，而它与位置变没变无关）。
   *
   * 扁平的一万节点文档里改一个节点，其余 9999 个兄弟会全部移位（位置变了 → 上一帧的
   * resolved 沿用不上），但它们的**尺寸没变** → 测量结果可以留着，只重算坐标。
   * 这份缓存归这里持有：增量路把它传进去（并把**被改到的**那些条目作废），
   * 全量路走之前整份清空（内容可能整体换过，旧的测量不再可信）。
   */
  private layoutMeasureCache: MeasureCache = { entries: new Map(), signature: '' };
  /**
   * §147 选中响应：TokenStore / 资产上下文 / 撤销栈都只随文档变，以前每次 commit
   * （包括纯选中）都重建 → 身份每次都变 → CanvasStage 的 Node memo 比较 `tokens` /
   * `assets` 恒为不等，memo 整个失效，节点照样全量重算 nodeStyle。
   * 按文档对象身份缓存后，选中提交里这三个身份稳定，memo 才真的生效。
   * 用 document 身份而不是 revision 当键：事务内（applyWithinTransaction）文档变了
   * 但 revision 没跳，身份判据在这种半程提交上也不会拿到过期的 token 表。
   */
  private derivedCache: {
    document: DesignDocument;
    tokens: TokenStore;
    assetContext: AssetUrlContext;
    history: ReturnType<DesignStore['history']>;
    historyFlat: HistoryEntry[];
  } | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  /**
   * #62② 自动保存的补丁队列：自上次成功落库以来还没送到服务端的命令补丁（按时间序）。
   * 空 = 当前改动用全量 PUT 就能表达；非空 = 下一次保存走 `PATCH …/design` 只发这些 ops。
   */
  private pendingPatches: DesignPatch[] = [];
  /** 每次 markDirty 递增：保存在途时又有编辑，靠它判"能不能清 dirty"（补丁路径没有文档身份可比） */
  private editSeq = 0;
  /** 有补丁词汇表表达不了的文档改动（setMode / setPage / jumpTo…）：下一次保存必须整份 PUT */
  private forceFullSave = false;
  private loadedFor: string | null = null;
  private snapshotList: SnapshotMeta[] = [];
  private snapshotBusyValue = false;
  private snapshotErrorValue: string | null = null;
  /** §27 历史面板的筛选：'current' 让服务端只回当前那条线上的快照 */
  private snapshotScopeValue: SnapshotScope = 'all';
  private compareValue: CompareResult | null = null;
  private branchList: BranchMeta[] = [];
  private variantList: VariantEntry[] = [];
  private variantNotes: string[] = [];
  private publicationValue: Publication | null = null;
  private annotationsValue: Annotation[] = [];
  private publishBusyValue = false;
  private publishErrorValue: string | null = null;
  private publishScanValue: ModerationScan | null = null;
  private assetBusyValue = false;
  private assetErrorValue: string | null = null;
  private assetNoticeValue: string | null = null;
  private statesClipboardValue: StatesClipboard | null = null;
  private vbenchResultValue: VisualBenchmarkResponse | null = null;

  constructor() {
    this.design.subscribe(() => this.commit());
    this.commit();
  }

  // ---- 对外读取面（useSyncExternalStore） ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StudioSnapshot => this.snapshot;

  private commit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): StudioSnapshot {
    const t0 = performance.now();
    const state = this.design.getState();
    const document = state.document;
    const page = document.pages.length ? (findPage(document, document.activePageId) ?? document.pages[0]!) : null;
    // 补丁可能删掉被选中的节点：先收敛选区，再产出快照，渲染层就不会引用不存在的节点
    if (this.selection.length) this.selection = this.selection.filter((id) => id && page?.nodes[id]);
    // token 表只随文档变；资产上下文与撤销栈同理。
    // 按文档身份缓存 → 纯选中提交复用同一身份，CanvasStage 的 Node memo（比较
    // tokens/assets）才不会每次都被判为"变了"而全量重算 nodeStyle（§147 选中响应）。
    if (this.derivedCache?.document !== document) {
      this.derivedCache = {
        document,
        tokens: new TokenStore(document.tokens),
        // 资产解析器按清单构造：清单来自文档（§16），所以"能不能显示"与
        // "设计里有没有这条资产"是同一件事，不需要再问一次网络。
        assetContext: assetContextFor(document, apiAssetUrl),
        history: this.design.history(),
        historyFlat: [],
      };
      this.derivedCache.historyFlat = [
        ...this.derivedCache.history.undo,
        // history() 已经是拷贝；保持原来的"redo 倒序跟在 undo 后面"的展示顺序
        ...this.derivedCache.history.redo.reverse(),
      ];
    }
    const derived = this.derivedCache;
    const tokens = derived.tokens;
    const tTokens = performance.now();
    // layout 缓存键用"文档代数"而非对象身份：applyPatch 每次都返新对象（写时拷贝），
    // 若缓存判 `doc === document` 则永远 miss → 选中只改 selection 也会重算整页布局（§147 常数级开销）。
    const layout = page ? this.resolveFor(page, document, tokens) : null;
    const tLayout = performance.now();
    const assetContext = derived.assetContext;
    const tAssets = performance.now();
    // §147 的常驻诊断：一次"改属性 → 画布重绘"要 1.2 秒，而模型层的基准说 resolveLayout
    // 在 10000 节点只要 57ms——那 1.2 秒不在求解上。到底是哪一段、以及一次按键到底跑了几次
    // buildSnapshot，靠猜没有意义，就在这里按段记下来。
    // 2026-10-10：原来是 dev-only，而 10000 档的生产读数恰恰需要它（prod 下 phases 读不到，
    // 「慢在哪一段」只能猜）——改成 opt-in：`NEXUS_PERF_SEGMENTS=1` 的生产构建也打
    // （next.config.ts 的 env 把它内联成 NEXT_PUBLIC_NEXUS_PERF_SEGMENTS），
    // 平时（dev 与未设变量的生产）照旧只在开发模式打。成本是 4 次 performance.now 与 4 个加法。
    if (
      process.env.NODE_ENV !== 'production' ||
      process.env.NEXT_PUBLIC_NEXUS_PERF_SEGMENTS === '1'
    ) {
      const bucket = (globalThis as unknown as { __studioPerf?: Record<string, number> }).__studioPerf ??= {};
      const add = (key: string, ms: number) => { bucket[key] = (bucket[key] ?? 0) + ms; };
      bucket.snapshots = (bucket.snapshots ?? 0) + 1;
      add('tokensMs', tTokens - t0);
      add('layoutMs', tLayout - tTokens);
      add('assetsMs', tAssets - tLayout);
      add('snapshotMs', performance.now() - t0);
    }
    return {
      ready: this.ready,
      projectId: this.projectId,
      loadError: this.loadError,
      document,
      page,
      layout,
      tokens,
      selection: this.selection,
      viewport: this.viewport,
      zoom: this.zoomValue,
      pan: this.panValue,
      grid: this.gridOn,
      guides: this.guideLines,
      dirty: this.dirty,
      saveState: this.saveStateValue,
      saveError: this.saveError,
      savedAt: this.savedAt,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      undoLabel: state.undoLabel,
      redoLabel: state.redoLabel,
      history: derived.historyFlat,
      lastEntry: state.lastEntry,
      snapshots: this.snapshotList,
      snapshotBusy: this.snapshotBusyValue,
      snapshotError: this.snapshotErrorValue,
      snapshotScope: this.snapshotScopeValue,
      compare: this.compareValue,
      branches: this.branchList,
      variants: this.variantList,
      variantNotes: this.variantNotes,
      publication: this.publicationValue,
      annotations: this.annotationsValue,
      publishBusy: this.publishBusyValue,
      publishError: this.publishErrorValue,
      publishScan: this.publishScanValue,
      assets: document.assets,
      assetContext,
      assetBusy: this.assetBusyValue,
      assetError: this.assetErrorValue,
      assetNotice: this.assetNoticeValue,
      statesClipboard: this.statesClipboardValue,
      visualBenchmarkResult: this.vbenchResultValue,
      revision: state.revision,
      activeMode: document.activeMode ?? null,
    };
  }

  private resolveFor(page: Page, document: DesignDocument, tokens: TokenStore): ResolvedLayout | null {
    const mode = document.activeMode ?? null;
    // 文档代数：整份换掉时 +1，打补丁时不变（见 DesignStore.generation）
    const gen = this.design.getDocumentGeneration();
    const key = `${this.design.getState().revision}|${gen}|${document.id}|${page.id}|${this.viewport}|${mode}`;
    // 命中判据是三样都对上：key（revision│代数│页│视口│模式）+ 代数 + **文档对象身份**。
    // - key + 代数：防“换了文档 / 换了页 / 换了视口”（代数只在整份替换时跳，`9dfe8b2`）；
    // - 文档对象身份：防“事务内文档变了而 revision 不跳”——`applyWithinTransaction`
    //   不跳 revision 也不跳代数，只比 key 会把事务中段那份**半成品文档的旧布局**交出去
    //   （画布画的是上一帧内容）。`derivedCache` 用身份判据防的是同一件事（过期 token 表）。
    //   `77404ed` 曾把这一条件换成“代数相同”，理由是“applyPatch 每次新对象、doc 身份永远 miss”——
    //   那个判断对纯选中帧是错的（选中不动文档，身份本来就一样），实际效果只是砍掉了这层护栏。
    if (
      this.layoutCache?.key === key &&
      this.layoutCache.gen === gen &&
      this.layoutCache.doc === document
    ) {
      return this.layoutCache.value;
    }
    // §147 增量解：这里**接过** `resolveLayoutIncremental`（2026-10-10），又把它撤回了（2026-10-12）——
    // 实测它与全量**不等**：`paintOrder` 不同（渲染次序会变，肉眼可见），而且没碰到的分支
    // 也没被复用（对象身份都不一样，"省下计算"这件事根本没发生）。证据是
    // `packages/design-model/test/layout-incremental.test.ts` 里那两条**真量相等**的用例
    // （不是之前那条只查"函数存在"的占位——占位守卫永远为真，typecheck/eslint 都看不见）。
    // 根因在 design-model：增量版没有共用全量的 place/measure 核心，自己复制了一套。
    // 2026-10-20（ROADMAP #133）：那份复制删掉了——两路现在共用同一份实现，
    // 于是"相等"由构造保证（不再靠两份实现碰巧一致），没碰到的分支也真的沿用同一个对象。
    // **红线是数**：同一口径（生产构建 / 10000 档）重跑，属性写入的总延迟要掉下来；
    // 掉不下来就说明"省下计算"没有发生，那时该看的是这一段而不是继续优化 10000 档。
    let layout: ResolvedLayout | null;
    const changed = this.layoutChangedNodeIds;
    // 上一帧那份解当增量基准的前提：**同一份文档、同一页**。
    // 换了项目、导入了文档、切了页，缓存里那份是**别的**文档/别的页的解，拿它当基准就是错的
    // （增量会以为那些节点没动过而沿用一份不相干的布局）。所以身份不符时基准为 null → 走全量。
    //
    // **这里原来比的是"文档对象身份"，那是错的**（2026-10-21 查出来的）：
    // 补丁走写时拷贝，`applyPatch` 每次都返回**新的文档对象** → 对象身份永远不同
    // → `prev` 永远是 null → **增量路在编辑器里从来没跑过**（跨帧的测量缓存也因此从没跨帧）。
    // 正确的判据是**文档代数**（DesignStore.generation）：整份换掉时 +1，打补丁时不变
    // → "同一代数 + 同一页"就等价于"同一份文档的上一帧" ✓
    const cache = this.layoutCache;
    const prev = cache && cache.gen === gen && cache.pageId === page.id ? cache.value : null;
    // 增量是**默认开的**，但留一个构建期开关能一键回退到全量（全量是唯一真值，§159 不假装）：
    // `NEXT_PUBLIC_NEXUS_INCREMENTAL_LAYOUT=0` 的生产构建走全量。设成别的值（含不设）都走增量。
    // 这个开关也是**量同一台机器上的 A/B**用的：同一个构建量两次（开/关），
    // 比"量两次不同的构建"可靠得多——后者的数会被机器当时的负载带偏（今天就吃过这个亏：
    // 接线前后两轮之间整台机器慢了 2.5 倍，属性写入 95.8 → 140ms 的差全在负载上）。
    // **运行期还能被覆盖**（`globalThis.__NEXUS_INCREMENTAL_LAYOUT__`）：为了能**同一个构建**量两次，
    // 而 NEXT_PUBLIC_* 是构建期内联的（要换一次值就得重新 build 一份 → 又变成"两次不同的构建"）。
    // 覆盖只在浏览器里有意义（客户端才有布局求解）；服务端没这个全局 → 用构建期那个。
    const runtimeOverride = (globalThis as { __NEXUS_INCREMENTAL_LAYOUT__?: boolean })
      .__NEXUS_INCREMENTAL_LAYOUT__;
    const incrementalOn =
      runtimeOverride === undefined
        ? process.env.NEXT_PUBLIC_NEXUS_INCREMENTAL_LAYOUT !== '0'
        : runtimeOverride;
    // 跨帧的测量缓存：增量路复用它（被改到的条目由增量路自己作废），
    // 全量路走之前整份清空——内容可能整体换过（导入/恢复），旧的测量不再可信。
    const measureCache = this.layoutMeasureCache;
    try {
      // `layoutForceFull`：这一刀的改动集合**算不全**（删组件/删资产会扫遍所有页面解引用）
      // → 宁可多算一次走全量，也不沿用上一帧那个对象（内嵌旧节点 → 画旧内容）
      if (incrementalOn && !this.layoutForceFull && changed.size > 0 && prev) {
        layout = resolveLayoutIncremental(page, {
          tokens,
          mode,
          breakpoint: this.viewport === 'design' ? undefined : this.viewport,
          prevLayout: prev,
          changedNodeIds: changed,
          measureCache,
        });
      } else {
        measureCache.entries.clear();
        layout = resolveLayout(page, {
          tokens,
          mode,
          breakpoint: this.viewport === 'design' ? undefined : this.viewport,
          measureCache,
        });
      }
    } catch (error) {
      // 布局求解失败（模型被改坏）：不渲染半成品，面板显示原因
      console.error('[studio] resolveLayout failed', error);
      layout = null;
    }
    this.layoutCache = { key, doc: document, gen, pageId: page.id, value: layout };
    // 这一轮的改动已经算进这一份布局了：清空，下一轮从新的起点开始
    this.layoutChangedNodeIds = new Set<NodeId>();
    // "这一刀算不全"的标记同理：这一轮已经走了全量（布局是新的），
    // 下一轮起改动集合又是准的，可以回到增量
    this.layoutForceFull = false;
    // 诊断：解算次数与命中次数分开记。一次编辑该解一次；两次说明复用没兜住
    if (
      process.env.NODE_ENV !== 'production' ||
      process.env.NEXT_PUBLIC_NEXUS_PERF_SEGMENTS === '1'
    ) {
      const bucket = (globalThis as unknown as { __studioPerf?: Record<string, number> }).__studioPerf ??= {};
      bucket.layoutSolves = (bucket.layoutSolves ?? 0) + 1;
    }
    return layout;
  }

  // ---- 载入 / 保存 ----

  /**
   * 首屏不再"水合完再去 fetch 一次"：服务端读到的那一份文档随 HTML 一起下来，这里直接装上。
   * 省的是接口那一趟往返（生产实测那一次项目接口是 152-206ms），
   * 代价是 HTML 变大——4000 节点那一档要带上整份文档，所以这不是白拿的收益。
   * 权威来源仍然是 GET 接口：这里只是让第一次渲染不必等它。
   */
  bootstrap(document: DesignDocument): void {
    if (this.ready && this.loadedFor === document.id) return;
    this.loadedFor = document.id;
    this.projectId = document.id;
    this.design.reset(document);
    this.selection = [];
    this.dirty = false;
    this.pendingPatches = [];
    this.forceFullSave = false;
    this.saveStateValue = 'idle';
    this.saveError = null;
    this.loadError = null;
    this.ready = true;
    this.vbenchResultValue = null;
    this.commit();
    // 这三份"随文档一起来的附属信息"一个都不能省：漏掉 refreshAnnotations 时，
    // 首屏不再 fetch 文档确实快了，但元素上的批注与发布状态整片消失——
    // 那是把一次性能改动做成一个功能回归（@smoke §111 第一次就是这么红的）。
    void this.refreshSnapshots();
    void this.refreshPublication();
    void this.refreshAnnotations();
  }

  async load(projectId: string): Promise<void> {
    if (this.loadedFor === projectId && this.ready) return;
    this.loadedFor = projectId;
    this.projectId = projectId;
    this.ready = false;
    this.loadError = null;
    this.vbenchResultValue = null;
    this.commit();
    try {
      const res = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { document: DesignDocument };
      // §147 流式首屏：这份 GET 在飞的那几百毫秒里，服务端随 HTML 下来的同一份文档
      // 可能已经 bootstrap 装上，用户也已经开始选元素/编辑。这里再 reset 一次会把
      // 选择和这段时间的编辑一起抹掉——表现是"刚点中的元素自己没了"。
      // loadedFor 仍是本项目且已 ready，说明装进来的就是同一份文档，保留会话状态。
      if (this.ready && this.loadedFor === projectId) return;
      this.design.reset(body.document);
      this.selection = [];
      this.dirty = false;
      this.pendingPatches = [];
      this.forceFullSave = false;
      this.saveStateValue = 'idle';
      this.ready = true;
      this.commit();
      void this.refreshSnapshots();
      void this.refreshPublication();
      void this.refreshAnnotations();
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
      this.ready = false;
      this.commit();
    }
  }

  markDirty(): void {
    // 只读：不标脏、不排下一次自动保存。少数"文档里的视图偏好"（切页/切模式）
    // 仍然在本地生效，但没有一行改动需要写出去——界面不该显示"未保存"，那是在等一次不会发生的写。
    if (isStudioReadOnly()) return;
    this.dirty = true;
    this.editSeq += 1;
    this.saveStateValue = 'idle';
    this.commit();
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 1800);
  }

  /**
   * #62②：自动保存优先发补丁（§150 的 Command ops）而不是整份文档。
   * - `pendingPatches` 非空且没有补丁词汇表表达不了的改动 → `PATCH …/design` 只发 ops；
   * - 否则（首存、setMode/快照恢复后的整份替换、ops 超上限）→ 旧的整份 PUT 原样兜底；
   * - 补丁被门挡下（409 ops_skipped / 400 document_rejected）→ 当场换全量 PUT 再试一次：
   *   全量发的是同一个人的同一份内存状态，是换一条路而不是把用户卡在 error 上。
   * 在途期间的新编辑累进新的队列，这一轮送走的那份在成功后才作废、失败则放回队头。
   */
  async save(): Promise<void> {
    if (isStudioReadOnly()) return;
    if (!this.projectId || !this.ready) return;
    if (this.inflight) await this.inflight;
    // 取走这一轮要送的补丁：在途期间的新编辑累进新的队列，成功后不会被误清
    const sentPatches = this.pendingPatches;
    this.pendingPatches = [];
    const seqAtSend = this.editSeq;
    const opCount = sentPatches.reduce((sum, patch) => sum + patch.ops.length, 0);
    // 报文上限（`ProjectDesignPatchRequestSchema`：patches ≤200、每个补丁 ops ≤4000）
    // 之内才走补丁；攒过头就整份 PUT——两顶帽子都按契约来，不靠服务端拒了再兜
    const usePatch =
      !this.forceFullSave && sentPatches.length > 0 && sentPatches.length <= 200 && opCount <= AUTOSAVE_PATCH_MAX_OPS;
    const document = this.design.getDocument();
    this.saveStateValue = 'saving';
    this.saveError = null;
    this.commit();
    const run = (async () => {
      try {
        const putBody = async (): Promise<Response> =>
          fetch(`/api/projects/${this.projectId}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json', ...csrfHeaders() },
            body: JSON.stringify(document),
          });
        let res: Response | null = usePatch
          ? await fetch(`/api/projects/${this.projectId}/design`, {
              method: 'PATCH',
              headers: { 'content-type': 'application/json', ...csrfHeaders() },
              body: JSON.stringify({ patches: sentPatches }),
            })
          : null;
        if (res && (res.status === 409 || res.status === 400)) res = await putBody();
        if (!res) res = await putBody();
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          issues?: string[];
          message?: string;
          error?: string;
          savedAt?: string;
        } | null;
        if (!res.ok || !body?.ok) {
          const detail = body?.issues?.join('；') ?? body?.message ?? body?.error ?? `HTTP ${res.status}`;
          // 没送上去的补丁放回队头：下一轮还得带着它们再试（§159 不静默丢编辑）
          this.pendingPatches = [...sentPatches, ...this.pendingPatches];
          this.saveStateValue = 'error';
          this.saveError = detail;
          this.commit();
          return;
        }
        if (!usePatch) this.forceFullSave = false;
        // 清 dirty 的判据：这一轮送出后没有新编辑、队列也空了。
        // 全量 PUT 以前用文档对象身份，补丁路径没有"发出时的那份文档"可比，统一按 editSeq。
        if (this.editSeq === seqAtSend && this.pendingPatches.length === 0) this.dirty = false;
        this.saveStateValue = 'saved';
        this.savedAt = body.savedAt ?? new Date().toISOString();
        this.commit();
      } catch (error) {
        this.pendingPatches = [...sentPatches, ...this.pendingPatches];
        this.saveStateValue = 'error';
        this.saveError = error instanceof Error ? error.message : String(error);
        this.commit();
      } finally {
        this.inflight = null;
      }
    })();
    this.inflight = run;
    await run;
  }

  flushSave(): void {
    if (isStudioReadOnly()) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) void this.save();
  }

  /**
   * §68：AI 请求的上下文由服务端从**库里那份**装配，客户端不再上传整份文档。
   * 于是编辑器里未保存的改动对 AI 是不可见的 —— "我明明刚改了它却按旧的生成"
   * 是这类架构最难查的一种不一致，所以发请求前先把脏数据落库，落不进去就明说。
   */
  async flushBeforeAi(): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty || this.inflight) await this.save();
    // save() 只在成功时清 dirty：仍然脏就是没存上，绝不能拿旧版本去生成
    if (this.dirty) {
      return { ok: false, reason: `还有未保存的改动，已停止本次 AI 请求：${this.saveError ?? '保存失败'}` };
    }
    return { ok: true };
  }

  // ---- 服务端快照（§27 / §108：用户项目历史，不是 git 开发历史） ----

  /** 失败只记录原因，不打断编辑（§159 不静默失败）。§28 的分支列表随快照一起回来 */
  async refreshSnapshots(): Promise<void> {
    if (!this.projectId || !this.ready) return;
    try {
      // 筛选放在服务端做：listSnapshots 带着 200 行上限，客户端筛得到的是"最近 200 条里属于这一分支的"，
      // 服务端筛到的才是"这一分支最近的 200 条"。分支切换越勤，这两句话越不是同一个列表。
      const query = this.snapshotScopeValue === 'current' ? '?branch=current' : '';
      const res = await fetch(`/api/projects/${this.projectId}/snapshots${query}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { snapshots?: SnapshotMeta[]; branches?: BranchMeta[] };
      this.snapshotList = body.snapshots ?? [];
      this.branchList = body.branches ?? [];
      this.snapshotErrorValue = null;
    } catch (error) {
      this.snapshotList = [];
      this.branchList = [];
      this.snapshotErrorValue = error instanceof Error ? error.message : String(error);
    }
    this.commit();
  }

  /**
   * 切换列表范围（全部 / 只看当前分支）。
   * "当前"由服务端每次现算，客户端不记分支 id，所以切分支之后这一条勾选跟着的是新的那一条线。
   * 换范围时清掉展开着的 Compare：它比的是上一份列表里那条快照，留着会把旧差异挂在新列表上。
   */
  async setSnapshotScope(scope: SnapshotScope): Promise<void> {
    if (this.snapshotScopeValue === scope) return;
    this.snapshotScopeValue = scope;
    this.compareValue = null;
    // 先把用户要的那个范围画上去，再去取列表：这一格是"你想看什么范围"的开关，
    // 等一次 fetch 才让勾选亮起来，屏幕上那段空白看起来就是按钮坏了。
    // 列表什么时候回来由 refreshSnapshots 说，失败照旧落进 snapshotError（§159 不静默失败）。
    this.commit();
    await this.refreshSnapshots();
  }

  /** 命名快照：先确保当前状态已落库，快照与保存状态不能分叉 */
  async createSnapshot(label: string): Promise<SnapshotMeta | null> {
    if (!this.projectId || !this.ready) return null;
    this.snapshotBusyValue = true;
    this.snapshotErrorValue = null;
    this.commit();
    try {
      await this.save();
      if (this.saveStateValue === 'error') throw new Error(this.saveError ?? '保存失败');
      const res = await fetch(`/api/projects/${this.projectId}/snapshots`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          document: this.design.getDocument(),
          label: label.slice(0, 120),
          source: 'manual',
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { snapshot?: SnapshotMeta; issues?: string[] }
        | null;
      if (!res.ok || !body?.snapshot) throw new Error(body?.issues?.join('；') ?? `HTTP ${res.status}`);
      await this.refreshSnapshots();
      return body.snapshot;
    } catch (error) {
      this.snapshotErrorValue = error instanceof Error ? error.message : String(error);
      return null;
    } finally {
      this.snapshotBusyValue = false;
      this.commit();
    }
  }

  /**
   * 恢复：服务端先把当前状态存成快照，再用目标文档覆盖项目。
   * 本地撤销栈随之清空 —— 这是恢复的语义，不假装还能 Ctrl+Z 回去。
   */
  async restoreSnapshot(snapshotId: string): Promise<boolean> {
    if (!this.projectId || !this.ready) return false;
    this.snapshotBusyValue = true;
    this.snapshotErrorValue = null;
    this.commit();
    try {
      // 先把未保存的编辑落库再恢复：否则服务端的"当前状态"是旧的，
      // 这次点击会静默丢掉用户刚改的东西（§159 不静默丢失）
      this.flushSave();
      await this.save();
      if (this.saveStateValue === 'error') throw new Error(this.saveError ?? '保存失败');
      const res = await fetch(
        `/api/projects/${this.projectId}/snapshots/${snapshotId}/restore`,
        { method: 'POST', headers: csrfHeaders() },
      );
      const body = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            document?: DesignDocument;
            issues?: string[];
            message?: string;
            error?: string;
          }
        | null;
      if (!res.ok || !body?.ok || !body.document) {
        throw new Error(
          body?.issues?.join('；') ?? body?.message ?? body?.error ?? `HTTP ${res.status}`,
        );
      }
      this.design.reset(body.document);
      this.selection = [];
      this.dirty = false;
      // 换上来的文档是服务端那一版：之前攒的补丁属于旧工作区，一条都不能再送
      this.pendingPatches = [];
      this.forceFullSave = false;
      this.saveStateValue = 'saved';
      this.savedAt = new Date().toISOString();
      // 恢复之后当前文档已经变了，之前的比较结果不再对应任何东西
      this.compareValue = null;
      await this.refreshSnapshots();
      // 工作区换了版本：比较板上的 head 与"当前"标记都要跟着刷新
      await this.refreshVariants();
      return true;
    } catch (error) {
      this.snapshotErrorValue = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.snapshotBusyValue = false;
      this.commit();
    }
  }

  /**
   * §27 Compare：取一份快照的全量文档，与当前文档做字段级比较。
   * 方向是"从那份快照到现在改了什么"，和 AI Diff 用同一套条目，所以展示也共用。
   */
  async compareSnapshot(snapshotId: string): Promise<void> {
    if (!this.projectId || !this.ready) return;
    if (this.compareValue?.snapshotId === snapshotId) {
      this.compareValue = null;
      this.commit();
      return;
    }
    this.snapshotBusyValue = true;
    this.snapshotErrorValue = null;
    this.commit();
    try {
      const res = await fetch(`/api/projects/${this.projectId}/snapshots/${snapshotId}`, {
        cache: 'no-store',
      });
      const body = (await res.json().catch(() => null)) as { snapshot?: SnapshotEntry } | null;
      if (!res.ok || !body?.snapshot?.document) throw new Error(`HTTP ${res.status}`);
      this.compareValue = {
        snapshotId,
        label: body.snapshot.label,
        createdAt: body.snapshot.createdAt,
        diff: diffDocuments(body.snapshot.document, this.design.getDocument()),
      };
    } catch (error) {
      this.compareValue = null;
      this.snapshotErrorValue = error instanceof Error ? error.message : String(error);
    } finally {
      this.snapshotBusyValue = false;
      this.commit();
    }
  }

  // ---- 分支与副本（§28 / §27 Duplicate） ----

  /**
   * 开分支并切过去继续做（等价于 checkout -b）。
   * 当前没进快照的改动会先被服务端存回原分支，所以不会因为这个动作消失。
   */
  async createBranch(name: string): Promise<BranchMeta | null> {
    if (!this.projectId || !this.ready) return null;
    this.snapshotBusyValue = true;
    this.snapshotErrorValue = null;
    this.commit();
    try {
      await this.save();
      if (this.saveStateValue === 'error') throw new Error(this.saveError ?? '保存失败');
      const res = await fetch(`/api/projects/${this.projectId}/branches`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ name: name.slice(0, 40) }),
      });
      const body = (await res.json().catch(() => null)) as
        | { branch?: BranchMeta; message?: string; issues?: string[] }
        | null;
      if (!res.ok || !body?.branch) {
        throw new Error(body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`);
      }
      // 工作区内容没变（就是带着现场过来的），所以只刷列表，不 reset 文档
      await this.refreshSnapshots();
      return body.branch;
    } catch (error) {
      this.snapshotErrorValue = error instanceof Error ? error.message : String(error);
      return null;
    } finally {
      this.snapshotBusyValue = false;
      this.commit();
    }
  }

  /**
   * 切分支：服务端先存当前现场再落到目标分支的 head 上。
   * 文档整体换了，所以本地撤销栈清空——这和恢复一样是如实结果。
   */
  async switchBranch(branchId: string): Promise<boolean> {
    if (!this.projectId || !this.ready) return false;
    this.snapshotBusyValue = true;
    this.snapshotErrorValue = null;
    this.commit();
    try {
      this.flushSave();
      await this.save();
      if (this.saveStateValue === 'error') throw new Error(this.saveError ?? '保存失败');
      const res = await fetch(
        `/api/projects/${this.projectId}/branches/${branchId}/switch`,
        { method: 'POST', headers: csrfHeaders() },
      );
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; document?: DesignDocument; issues?: string[]; message?: string; error?: string }
        | null;
      if (!res.ok || !body?.ok || !body.document) {
        throw new Error(body?.issues?.join('；') ?? body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }
      this.design.reset(body.document);
      this.selection = [];
      this.dirty = false;
      // 换上来的文档是服务端那一版：之前攒的补丁属于旧工作区，一条都不能再送
      this.pendingPatches = [];
      this.forceFullSave = false;
      this.saveStateValue = 'saved';
      this.savedAt = new Date().toISOString();
      this.compareValue = null;
      await this.refreshSnapshots();
      // 工作区换了版本：比较板上的 head 与"当前"标记都要跟着刷新
      await this.refreshVariants();
      return true;
    } catch (error) {
      this.snapshotErrorValue = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.snapshotBusyValue = false;
      this.commit();
    }
  }

  /** Duplicate（§27）：整份项目复制成新项目并跳过去编辑副本 */
  async duplicateProject(name: string): Promise<string | null> {
    if (!this.projectId || !this.ready) return null;
    this.snapshotBusyValue = true;
    this.snapshotErrorValue = null;
    this.commit();
    try {
      this.flushSave();
      await this.save();
      if (this.saveStateValue === 'error') throw new Error(this.saveError ?? '保存失败');
      const res = await fetch(`/api/projects/${this.projectId}/duplicate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ name: name.slice(0, 80) }),
      });
      const body = (await res.json().catch(() => null)) as
        | { projectId?: string; issues?: string[]; message?: string; error?: string }
        | null;
      if (!res.ok || !body?.projectId) {
        throw new Error(body?.issues?.join('；') ?? body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }
      return body.projectId;
    } catch (error) {
      this.snapshotErrorValue = error instanceof Error ? error.message : String(error);
      this.commit();
      return null;
    } finally {
      this.snapshotBusyValue = false;
      this.commit();
    }
  }

  // ---- 多方案（§29：一条方案 = 一条分支 + 它 head 上的文档） ----

  /** 比较板要的是每份方案的完整文档，所以列表与文档一次拿全，不分两次请求 */
  async refreshVariants(): Promise<void> {
    if (!this.projectId || !this.ready) return;
    try {
      const res = await fetch(`/api/projects/${this.projectId}/variants`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { variants?: VariantEntry[] };
      this.variantList = body.variants ?? [];
      this.snapshotErrorValue = null;
    } catch (error) {
      this.variantList = [];
      this.snapshotErrorValue = error instanceof Error ? error.message : String(error);
    }
    this.commit();
  }

  /** 生成候选方案：工作区不动，所以本地撤销栈与画布都不该有任何变化 */
  async generateVariants(count: number): Promise<number> {
    if (!this.projectId || !this.ready) return 0;
    this.snapshotBusyValue = true;
    this.snapshotErrorValue = null;
    this.commit();
    try {
      await this.save();
      if (this.saveStateValue === 'error') throw new Error(this.saveError ?? '保存失败');
      const res = await fetch(`/api/projects/${this.projectId}/variants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ count }),
      });
      const body = (await res.json().catch(() => null)) as
        | { variants?: VariantEntry[]; notes?: string[]; message?: string; issues?: string[] }
        | null;
      if (!res.ok) throw new Error(body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`);
      this.variantNotes = body?.notes ?? [];
      // POST 只回来刚生成的那几条：比较板要的是全部方向（含 main 上的当前版本），重新拉一次
      await this.refreshVariants();
      await this.refreshSnapshots();
      return this.variantList.length;
    } catch (error) {
      this.snapshotErrorValue = error instanceof Error ? error.message : String(error);
      return 0;
    } finally {
      this.snapshotBusyValue = false;
      this.commit();
    }
  }

  /** §29 "Combine A's layout with C's visual style"：结果同样落在一条新分支上 */
  async mergeVariants(
    layoutBranchId: string,
    visualBranchId: string,
    name?: string,
  ): Promise<VariantEntry | null> {
    if (!this.projectId || !this.ready) return null;
    this.snapshotBusyValue = true;
    this.snapshotErrorValue = null;
    this.commit();
    try {
      const res = await fetch(`/api/projects/${this.projectId}/variants/merge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ layoutBranchId, visualBranchId, name: name?.trim() || null }),
      });
      const body = (await res.json().catch(() => null)) as
        | { variant?: VariantEntry; notes?: string[]; message?: string; issues?: string[] }
        | null;
      if (!res.ok || !body?.variant) {
        throw new Error(body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`);
      }
      this.variantNotes = body.notes ?? [];
      await this.refreshVariants();
      await this.refreshSnapshots();
      return body.variant;
    } catch (error) {
      this.snapshotErrorValue = error instanceof Error ? error.message : String(error);
      this.commit();
      return null;
    } finally {
      this.snapshotBusyValue = false;
      // 不 commit 的话，refreshVariants 期间产出的最后一次快照会带着 busy=true 留在界面上，
      // 按钮就永远停在"生成中…"
      this.commit();
    }
  }

  // ---- 发布与分享（§56 / §57） ----

  async refreshPublication(): Promise<void> {
    if (!this.projectId || !this.ready) return;
    try {
      const res = await fetch(`/api/projects/${this.projectId}/publish`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { publication?: Publication | null };
      this.publicationValue = body.publication ?? null;
    } catch {
      // 读不到发布状态不该挡住编辑：顶栏显示"未发布"，真正发布时会再问一次
      this.publicationValue = null;
    }
    this.commit();
  }

  /** §111：批注单独一条请求。它不属于设计文档，改文档不该把它冲掉 */
  async refreshAnnotations(): Promise<void> {
    if (!this.projectId) return;
    try {
      const res = await fetch(`/api/projects/${this.projectId}/annotations`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as { items?: Annotation[] } | null;
      if (!res.ok || !body?.items) return;
      this.annotationsValue = body.items;
      this.commit();
    } catch {
      // 列不出来就不显示：批注是辅助信息，不能因为它把画布卡住；面板上会显示"没有批注"
    }
  }

  async addAnnotation(nodeId: string, text: string): Promise<string | null> {
    if (!this.projectId) return '还没载入项目';
    const res = await fetch(`/api/projects/${this.projectId}/annotations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify({ nodeId, text }),
    });
    const body = (await res.json().catch(() => null)) as { annotation?: Annotation; issues?: string[]; message?: string } | null;
    if (!res.ok || !body?.annotation) return body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`;
    this.annotationsValue = [body.annotation, ...this.annotationsValue];
    this.commit();
    return null;
  }

  async removeAnnotation(annotationId: string): Promise<string | null> {
    const res = await fetch(`/api/annotations/${annotationId}`, { method: 'DELETE', headers: csrfHeaders() });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return body?.message ?? `HTTP ${res.status}`;
    }
    this.annotationsValue = this.annotationsValue.filter((a) => a.id !== annotationId);
    this.commit();
    return null;
  }

  /**
   * §111 批注的「已解决」。本地更新，和另外两条同一条纪律：服务端说它成了才算成，
   * 回填用的是响应里的 `resolvedAt`（服务端时钟），不是本地 `new Date()`——
   * 否则"什么时候解决的"取决于谁的机器，两个设备会看到两个时间。
   */
  async resolveAnnotation(annotationId: string, resolved: boolean): Promise<string | null> {
    const res = await fetch(`/api/annotations/${annotationId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify({ resolved }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { issues?: string[]; message?: string } | null;
      return body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`;
    }
    const body = (await res.json().catch(() => null)) as { resolvedAt?: string | null } | null;
    this.annotationsValue = this.annotationsValue.map((a) =>
      a.id === annotationId ? { ...a, resolvedAt: body?.resolvedAt ?? null } : a,
    );
    this.commit();
    return null;
  }

  /**
   * 发布 = 把当前这一版存成快照，并让公开 URL 指向它。
   * 先 save 再 publish：发出去的和屏幕上看到的必须是同一份（§16）。
   */
  async publish(visibility: Visibility): Promise<Publication | null> {
    if (!this.projectId || !this.ready) return null;
    this.publishBusyValue = true;
    this.publishErrorValue = null;
    this.publishScanValue = null;
    this.commit();
    try {
      this.flushSave();
      await this.save();
      if (this.saveStateValue === 'error') throw new Error(this.saveError ?? '保存失败');
      const res = await fetch(`/api/projects/${this.projectId}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ visibility }),
      });
      const body = (await res.json().catch(() => null)) as
        | { publication?: Publication; gate?: unknown; scan?: unknown; message?: string; issues?: string[] }
        | null;
      // 机检结果同样过 zod：挡下发布的那次回话里，reason 是不是来自真扫描要能核对
      if (body?.scan !== undefined) {
        const parsedScan = ModerationScanSchema.safeParse(body.scan);
        if (!parsedScan.success) {
          throw new Error(
            `机检结果不符合契约：${parsedScan.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('；')}`,
          );
        }
        this.publishScanValue = parsedScan.data;
      }
      // 门禁报告照样过 zod：契约不符就说明两端算的不是同一件事，宁可报错也不猜
      if (body?.gate !== undefined) {
        const parsed = ProjectHealthReportSchema.safeParse(body.gate);
        if (!parsed.success) {
          throw new Error(
            `门禁结果不符合契约：${parsed.error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('；')}`,
          );
        }
      }
      if (!res.ok || !body?.publication) {
        throw new Error(body?.issues?.join('；') ?? body?.message ?? `HTTP ${res.status}`);
      }
      this.publicationValue = body.publication;
      await this.refreshSnapshots();
      return body.publication;
    } catch (error) {
      this.publishErrorValue = error instanceof Error ? error.message : String(error);
      return null;
    } finally {
      this.publishBusyValue = false;
      this.commit();
    }
  }

  async unpublish(): Promise<boolean> {
    if (!this.projectId || !this.ready) return false;
    this.publishBusyValue = true;
    this.publishErrorValue = null;
    this.commit();
    try {
      const res = await fetch(`/api/projects/${this.projectId}/publish`, { method: 'DELETE', headers: csrfHeaders() });
      const body = (await res.json().catch(() => null)) as { unpublished?: boolean; message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      this.publicationValue = null;
      return !!body?.unpublished;
    } catch (error) {
      this.publishErrorValue = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.publishBusyValue = false;
      this.commit();
    }
  }

  // ---- 视图态 ----

  setViewport(viewport: ViewportMode): void {
    this.viewport = viewport;
    this.commit();
  }

  setZoom(zoom: number, anchor?: { x: number; y: number }): void {
    const next = Math.min(4, Math.max(0.1, zoom));
    if (anchor) {
      // 保持锚点下的画布坐标不动：screen = pan + canvas * zoom
      const k = next / this.zoomValue;
      this.panValue = {
        x: anchor.x - (anchor.x - this.panValue.x) * k,
        y: anchor.y - (anchor.y - this.panValue.y) * k,
      };
    }
    this.zoomValue = next;
    this.commit();
  }

  zoomBy(factor: number, anchor?: { x: number; y: number }): void {
    this.setZoom(this.zoomValue * factor, anchor);
  }

  panBy(dx: number, dy: number): void {
    this.panValue = { x: this.panValue.x + dx, y: this.panValue.y + dy };
    this.commit();
  }

  setPan(pan: { x: number; y: number }): void {
    this.panValue = pan;
    this.commit();
  }

  toggleGrid(): void {
    this.gridOn = !this.gridOn;
    this.commit();
  }

  setGuides(guides: { axis: 'x' | 'y'; at: number }[]): void {
    if (guides.length === 0 && this.guideLines.length === 0) return;
    this.guideLines = guides;
    this.commit();
  }

  /**
   * activeMode / activePageId 不是节点编辑，补丁词汇表里没有对应 op：写回文档并标脏，不进撤销栈。
   * 只读（viewer）时这两条**仍然在本地生效**——翻别的页面、看别的模式是看而不是改；
   * `markDirty` 的闸让它们只停在本地，既不标脏也不排保存。
   */
  setMode(mode: string | null): void {
    const document = clone(this.design.getDocument());
    document.activeMode = mode;
    this.design.reset(document, true);
    this.forceFullSave = true;
    this.markDirty();
  }

  setPage(pageId: string): void {
    const current = this.design.getDocument();
    if (!current.pages.some((p) => p.id === pageId)) return;
    const document = clone(current);
    document.activePageId = pageId;
    this.design.reset(document, true);
    this.forceFullSave = true;
    this.selection = [];
    this.markDirty();
  }

  // ---- 选区 ----

  select(ids: readonly NodeId[]): void {
    // §147 归因用的分段标记：pointerdown → 进 select → commit 完 → 手柄画出来。
    // 2026-10-10 的 CPU 采样证明选中窗口里 >80% 是 idle——延迟在浏览器的输入→绘制流水线，
    // 不在界面自己的 JS。把界面这一段单独量出来，<16ms 那扇门才有一个可归因的数。
    // 原来只 dev 打，而选中响应恰恰要量生产构建（界面在生产里才 6ms 上下）——
    // 照快照分段同款改成 opt-in：`NEXUS_PERF_SEGMENTS=1` 的生产构建也打。
    if (
      process.env.NODE_ENV !== 'production' ||
      process.env.NEXT_PUBLIC_NEXUS_PERF_SEGMENTS === '1'
    ) performance.mark('nexus:sel:store');
    this.selection = [...new Set(ids)];
    this.commit();
    if (
      process.env.NODE_ENV !== 'production' ||
      process.env.NEXT_PUBLIC_NEXUS_PERF_SEGMENTS === '1'
    ) performance.mark('nexus:sel:commit');
  }

  toggleSelection(id: NodeId): void {
    this.selection = this.selection.includes(id)
      ? this.selection.filter((x) => x !== id)
      : [...this.selection, id];
    this.commit();
  }

  clearSelection(): void {
    if (!this.selection.length) return;
    this.selection = [];
    this.commit();
  }

  /** 补丁应用后节点可能被删除：用它把选区收敛到仍存在的节点，避免悬空引用 */
  replaceSelection(ids: readonly NodeId[]): void {
    const next = [...new Set(ids)];
    if (next.length === this.selection.length && next.every((id, i) => id === this.selection[i])) return;
    this.selection = next;
    this.commit();
  }

  hitAt(canvasX: number, canvasY: number): NodeId | null {
    const layout = this.snapshot.layout;
    if (!layout) return null;
    return hitTest(layout, canvasX, canvasY);
  }

  /** 选区中剔除他人后代，得到可独立操作的顶层节点 */
  selectedRoots(): NodeId[] {
    const page = this.snapshot.page;
    const set = new Set(this.selection);
    if (!page) return [];
    const hasSelectedAncestor = (node: DesignNode): boolean => {
      let parent = node.parentId ? page.nodes[node.parentId] : null;
      while (parent) {
        if (set.has(parent.id)) return true;
        parent = parent.parentId ? page.nodes[parent.parentId] ?? null : null;
      }
      return false;
    };
    return this.selection.filter((id) => {
      const node = page.nodes[id];
      return node ? !hasSelectedAncestor(node) : false;
    });
  }

  // ---- 编辑：全部经 patch → execute（§148-150） ----

  execute(label: string, ops: PatchOp[]): void {
    if (!ops.length) return;
    // viewer 只读：编辑在本地就按下，不排队、不进撤销栈——否则界面会先"改成功"，
    // 再由服务端 403 把同一次改动打成失败（§159 不让界面假装能改）
    if (isStudioReadOnly()) return;
    // §147 增量解：**先**登记这次改动碰到哪些节点。
    // 为什么必须先：`design.execute` 会**同步**触发 commit → 布局就在那一刻求解，
    // 登记晚了这一帧的改动集合是空的 → 走全量 → 增量路**从来没在编辑器里跑过**
    // （2026-10-21 用探针查出来的：改一个节点后，没被改的节点不是同一个对象）。
    // 登记早了就有了"这一帧改了谁"这份账，增量路才有基准可用。
    this.noteLayoutOps(ops);
    const document = this.design.getDocument();
    const entry = this.design.execute(manualCommand(label, { pageId: document.activePageId, ops }));
    // #62②：这次命令的补丁进待发队列，自动保存从此发 ops 而不是整份文档
    this.pendingPatches.push(...entry.applied);
    this.markDirty();
  }

  setProp(nodeId: NodeId, path: string, value: unknown, label?: string): void {
    this.setProps([nodeId], path, value, label);
  }

  /** 多选时把同一属性广播给全部选中节点，仍然是单个可撤销事务（§6） */
  setProps(nodeIds: readonly NodeId[], path: string, value: unknown, label?: string): void {
    const ids = nodeIds.filter((id) => this.snapshot.page?.nodes[id]);
    if (!ids.length) return;
    this.execute(label ?? `修改 ${path}`, ids.map((id) => ({ op: 'set', nodeId: id, path, value })));
  }

  /**
   * §124：复制某个状态补丁到剪贴板。空补丁没有可贴的东西，返回 false 而不是复制一份空对象——
   * 否则"粘贴"看着成功、生成器一个类都不多（§159）。
   */
  copyStates(nodeId: NodeId, state: NodeState): boolean {
    const node = this.snapshot.page?.nodes[nodeId];
    const patch = node?.states?.[state];
    if (!node || !patch || !Object.keys(patch).length) return false;
    this.statesClipboardValue = {
      state,
      patch: structuredClone(patch),
      sourceNodeId: nodeId,
      sourceName: node.name,
    };
    this.commit();
    return true;
  }

  /**
   * §124：把剪贴板里的状态补丁整份贴到这些节点上，返回真正落到的节点数。
   *
   * 整通道替换（ADR-0062 withState）：贴过去的补丁覆盖目标节点该状态原有的全部通道，
   * 不会与它已有的通道逐项合并。所有节点合成**一条**命令，撤销一次全回去（§149）。
   * 同一份补丁值传给每个 op 是安全的：applyPatch 对每个 set 都会 clone 一次（§16 的唯一写入方），
   * 贴完的节点之间、以及它们与剪贴板之间不共享可变对象。
   */
  pasteStates(nodeIds: readonly NodeId[]): number {
    const clip = this.statesClipboardValue;
    if (!clip) return 0;
    const ids = nodeIds.filter((id) => this.snapshot.page?.nodes[id]);
    if (!ids.length) return 0;
    this.execute(
      `粘贴${STATE_LABELS[clip.state]}状态补丁`,
      ids.map((id) => ({ op: 'set', nodeId: id, path: `states.${clip.state}`, value: clip.patch })),
    );
    return ids.length;
  }

  setPosition(nodeId: NodeId, x: number, y: number): void {
    this.execute('移动', [
      { op: 'set', nodeId, path: 'position.x', value: Math.round(x) },
      { op: 'set', nodeId, path: 'position.y', value: Math.round(y) },
    ]);
  }

  setSize(nodeId: NodeId, width: number, height: number): void {
    this.execute('调整尺寸', [
      { op: 'set', nodeId, path: 'size.width', value: Math.round(width) },
      { op: 'set', nodeId, path: 'size.height', value: Math.round(height) },
    ]);
  }

  setSizeValue(nodeId: NodeId, axis: 'width' | 'height', value: number | 'hug' | 'fill'): void {
    this.execute(`设置${axis === 'width' ? '宽' : '高'}`, [{ op: 'set', nodeId, path: `size.${axis}`, value }]);
  }

  /**
   * §38 上传一张图片，并把它作为最上层填充贴到指定元素上。
   *
   * 一次点击 = 一次事务：`addAsset`（进清单）与 `set(style.fills)`（贴上去）绑在
   * 一起撤销，不会出现"清单里有图但没人引用"或反过来的半截状态（§149）。
   * 上传失败不产生任何事务，原因原样摊在面板上，不静默（§159）。
   */
  async uploadImageAsFill(
    nodeId: NodeId,
    file: File,
    fit: 'cover' | 'contain' | 'fill' | 'tile' = 'cover',
  ): Promise<boolean> {
    if (!this.projectId) return false;
    this.assetBusyValue = true;
    this.assetErrorValue = null;
    this.assetNoticeValue = null;
    this.commit();
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/projects/${this.projectId}/assets`, { method: 'POST', headers: csrfHeaders(), body: form });
      const body = (await res.json().catch(() => null)) as
        | { asset?: AssetRef; removed?: string[]; reason?: string; issues?: string[] }
        | null;
      if (!res.ok || !body?.asset) {
        throw new Error(body?.issues?.join('；') ?? body?.reason ?? `HTTP ${res.status}`);
      }
      const node = this.snapshot.page?.nodes[nodeId];
      if (!node) throw new Error(`图片已存进项目资产，但目标元素不在了，没有贴上去`);
      const asset = body.asset;
      if (body.removed?.length) this.assetNoticeValue = `已存入并剥离元数据：${body.removed.join('、')}`;
      this.execute(`填充图片 ${asset.name}`, [
        { op: 'addAsset', asset },
        {
          op: 'set',
          nodeId,
          path: 'style.fills',
          value: [{ kind: 'image', assetId: asset.id, fit }, ...(node.style.fills as unknown[])],
        },
      ]);
      return true;
    } catch (error) {
      this.assetErrorValue = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.assetBusyValue = false;
      this.commit();
    }
  }

  /**
   * §38 Image Studio（Text → Image）：把一句话交给服务端生成一张图，进资产清单。
   *
   * 与上传一样，一次点击 = 一个事务：`addAsset`（进清单）与选中元素的 `style.fills`
   * 绑在一起撤销，不会留下"清单里有图但没人引用"的半截状态（§149/§150）。
   * 没选中元素时只进清单——生成一张图不等于必须贴到某处，硬贴反而是猜用户意图。
   *
   * 失败原因原样摊在面板上（额度用尽 429 / 规格不合 400），不静默也不改写（§159）。
   * 这一格给的是 **DEMO 本地合成**（本机没有图像 provider），所以回执里写清来源（§160）。
   */
  async generateImageFromPrompt(
    prompt: string,
    source?: { referenceAssetId?: string; characterId?: string; generateCharacterPortrait?: boolean },
  ): Promise<boolean> {
    if (!this.projectId) return false;
    const referenceAssetId = source?.referenceAssetId;
    const characterId = source?.characterId;
    const generateCharacterPortrait = source?.generateCharacterPortrait;
    this.assetBusyValue = true;
    this.assetErrorValue = null;
    this.assetNoticeValue = null;
    this.commit();
    try {
      const res = await fetch(`/api/projects/${this.projectId}/images`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          prompt,
          ...(referenceAssetId ? { referenceAssetId } : {}),
          ...(characterId ? { characterId } : {}),
          ...(generateCharacterPortrait ? { generateCharacterPortrait: true } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { asset?: AssetRef; message?: string; issues?: string[] }
        | null;
      if (!res.ok || !body?.asset) {
        throw new Error(body?.issues?.filter(Boolean).join('；') || body?.message || `HTTP ${res.status}`);
      }
      const asset = body.asset;
      const targetId = this.selection[0];
      const node = targetId ? this.snapshot.page?.nodes[targetId] : undefined;
      const ops: PatchOp[] = [{ op: 'addAsset', asset }];
      if (node) {
        ops.push({
          op: 'set',
          nodeId: node.id,
          path: 'style.fills',
          value: [{ kind: 'image', assetId: asset.id, fit: 'cover' }, ...(node.style.fills as unknown[])],
        });
      }
      this.execute(`生成图片 ${asset.name}`, ops);
      // 回执要说清"这一张是什么"。肖像不是场景：把它说成"那个角色的一个场景"就是给用户
      // 一个与事实不符的交代（§159），所以肖像单独一档
      const origin = generateCharacterPortrait
        ? '，这是那个角色自己的参考图（由档案里的身份/穿着/画风/特征与视觉标识驱动）'
        : characterId && referenceAssetId
          ? // 这一档的色调不是档案里声明的那份，是那张肖像**量出来**的——回执别说成"取自视觉标识"
            '，这是清单里那个角色的一个场景（色调取自它那张肖像量出来的主色）'
          : characterId
            ? '，这是清单里那个角色的一个场景（色调取自它的视觉标识）'
            : referenceAssetId
              ? '，以清单里那张为参考的变体'
              : '';
      this.assetNoticeValue = `已生成一张 ${asset.width ?? '?'}×${asset.height ?? '?'} 的图（DEMO 本地合成${origin}，扣 image 额度 2 点）${
        node ? '，并已贴到选中的元素上' : '；选中元素后生成才会同时贴上'
      }。`;
      return true;
    } catch (error) {
      this.assetErrorValue = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.assetBusyValue = false;
      this.commit();
    }
  }

  /**
   * §38 Sketch → Image：把本地画的草图存进项目，再让它以测量值参与生成。
   *
   * 一次点击 = 一次事务：草图与生成图两条 `addAsset`（加可选的贴合）绑在一起撤销，
   * 不会出现"清单里有草图但没人引用它参与了哪次生成"的半截状态（§149）。
   *
   * 但上传成功那一刻字节就已落在服务端：若生成那步失败（互斥、量不出像素、额度），
   * 草图字节成了孤儿而清单里还没有它——这条非对称如实写进错误回执，不假装能回滚
   * 服务器（§159）。草图只喂构图（落墨→明暗、笔画密度→元素数），不钉色相，回执照实说。
   */
  async generateImageFromSketch(prompt: string, sketchFile: File): Promise<boolean> {
    if (!this.projectId) return false;
    this.assetBusyValue = true;
    this.assetErrorValue = null;
    this.assetNoticeValue = null;
    this.commit();
    let sketchAsset: AssetRef | null = null;
    try {
      const form = new FormData();
      form.append('file', sketchFile);
      const upRes = await fetch(`/api/projects/${this.projectId}/assets`, { method: 'POST', headers: csrfHeaders(), body: form });
      const upBody = (await upRes.json().catch(() => null)) as { asset?: AssetRef; reason?: string; issues?: string[] } | null;
      if (!upRes.ok || !upBody?.asset) {
        throw new Error(upBody?.issues?.filter(Boolean).join('；') || upBody?.reason || `草图上传失败：HTTP ${upRes.status}`);
      }
      sketchAsset = upBody.asset;

      const res = await fetch(`/api/projects/${this.projectId}/images`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ prompt, sketchAssetId: sketchAsset.id }),
      });
      const body = (await res.json().catch(() => null)) as { asset?: AssetRef; message?: string; issues?: string[] } | null;
      if (!res.ok || !body?.asset) {
        throw new Error(body?.issues?.filter(Boolean).join('；') || body?.message || `HTTP ${res.status}`);
      }
      const asset = body.asset;
      const targetId = this.selection[0];
      const node = targetId ? this.snapshot.page?.nodes[targetId] : undefined;
      const ops: PatchOp[] = [{ op: 'addAsset', asset: sketchAsset }, { op: 'addAsset', asset }];
      if (node) {
        ops.push({
          op: 'set',
          nodeId: node.id,
          path: 'style.fills',
          value: [{ kind: 'image', assetId: asset.id, fit: 'cover' }, ...(node.style.fills as unknown[])],
        });
      }
      this.execute(`从草图生成图片 ${asset.name}`, ops);
      this.assetNoticeValue = `已生成一张 ${asset.width ?? '?'}×${asset.height ?? '?'} 的图（DEMO 本地合成：明暗与元素密度取自草图「${sketchAsset.name}」的测量值，不管形状本身、不钉色相，扣 image 额度 2 点）${
        node ? '，并已贴到选中的元素上' : '；选中元素后生成才会同时贴上'
      }。`;
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.assetErrorValue = sketchAsset
        ? `草图「${sketchAsset.name}」已存进项目存储，但生成那一步没成：${reason}。两张图都没进清单，那份草图字节目前没人引用，可在资产清理时一并处理。`
        : reason;
      return false;
    } finally {
      this.assetBusyValue = false;
      this.commit();
    }
  }

  /**
   * Asset Library 删除（M2 line 227）：一次可撤销事务把资产移出清单，并让模型顺带剥掉
   * 所有页面上引用它的图片填充 / 节点（removeAsset 有 document 全域可达，§149）。
   *
   * 字节删除是尽力而为的第二步：撤销能恢复清单里的引用，但服务端删掉的字节回不来——
   * 这一非对称如实写进回执，不假装撤销万能的（§159）。purge 失败也不回滚已生效的移除，
   * 只把原因摊在面板上，让用户知道清单已干净、字节成了孤儿可稍后重试。
   */
  async deleteAssetFromLibrary(assetId: string): Promise<boolean> {
    if (!this.projectId) return false;
    const asset = this.design.getDocument().assets.find((a) => a.id === assetId);
    if (!asset) return false;
    this.assetBusyValue = true;
    this.assetErrorValue = null;
    this.assetNoticeValue = null;
    this.commit();
    this.execute(`删除资产 ${asset.name}`, [{ op: 'removeAsset', assetId }]);
    try {
      const res = await fetch(`/api/assets/${assetId}`, { method: 'DELETE', headers: csrfHeaders() });
      const body = (await res.json().catch(() => null)) as { removed?: string; message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      this.assetNoticeValue = `已删除「${asset.name}」并从画布移除引用。注意：撤销可恢复引用，但存储里的文件字节不会回来。`;
      return true;
    } catch (error) {
      this.assetErrorValue = `引用已从项目移除（可撤销），但服务器删除文件失败：${
        error instanceof Error ? error.message : String(error)
      }`;
      return false;
    } finally {
      this.assetBusyValue = false;
      this.commit();
    }
  }

  /**
   * §30 从一张参考图提取 Visual DNA：服务端只算不写，结果在这里落成一个可撤销事务。
   *
   * 响应先过 `VisualDnaSchema` 再打进模型——服务端返回什么形状不由它自己说了算（§159）。
   */
  async extractVisualDnaFromAsset(assetId: string): Promise<boolean> {
    if (!this.projectId) return false;
    this.assetBusyValue = true;
    this.assetErrorValue = null;
    this.assetNoticeValue = null;
    this.commit();
    try {
      const res = await fetch(`/api/projects/${this.projectId}/visual-dna`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ assetId }),
      });
      const payload = (await res.json().catch(() => null)) as { dna?: unknown; message?: string } | null;
      if (!res.ok) throw new Error(payload?.message ?? `HTTP ${res.status}`);
      const parsed = VisualDnaSchema.safeParse(payload?.dna);
      if (!parsed.success) {
        throw new Error(`提取结果不符合契约：${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`);
      }
      this.execute('从参考图提取 Visual DNA', [{ op: 'setVisualDna', dna: parsed.data as VisualDna }]);
      this.assetNoticeValue = `已提取视觉语言：${parsed.data.descriptors.join('、')}。它现在约束后续生成，可撤销。`;
      return true;
    } catch (error) {
      this.assetErrorValue = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.assetBusyValue = false;
      this.commit();
    }
  }

  /**
   * §86 视觉基准：参考图 × 生成图 → 结构化指标。比较是纯计算、不写模型，
   * 所以不走 execute——结果只落在面板状态里，由面板把 notMeasured 一并渲染出来。
   * 响应先过 `VisualBenchmarkResponseSchema` 再进状态：形状不符如实报错，
   * 不渲染服务端说了算的半份数（§159）。
   */
  async compareVisualBenchmark(referenceAssetId: string, candidateAssetId: string): Promise<boolean> {
    if (!this.projectId) return false;
    this.assetBusyValue = true;
    this.assetErrorValue = null;
    this.assetNoticeValue = null;
    this.vbenchResultValue = null;
    this.commit();
    try {
      const res = await fetch(`/api/projects/${this.projectId}/visual-benchmark`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ referenceAssetId, candidateAssetId }),
      });
      const payload: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const body = payload as { message?: string; issues?: string[] } | null;
        throw new Error(body?.message ?? body?.issues?.join('；') ?? `HTTP ${res.status}`);
      }
      const parsed = VisualBenchmarkResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(
          `基准结果不符合契约：${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('；')}`,
        );
      }
      this.vbenchResultValue = parsed.data;
      return true;
    } catch (error) {
      this.assetErrorValue = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.assetBusyValue = false;
      this.commit();
    }
  }

  rename(nodeId: NodeId, name: string): void {
    this.execute('重命名', [{ op: 'set', nodeId, path: 'name', value: name.slice(0, 80) }]);
  }

  /** 拖拽改父级（§5）：只允许放进容器，且不允许放进自己的子树 */
  reparentNode(nodeId: NodeId, parentId: NodeId): void {
    const page = this.snapshot.page;
    const node = page?.nodes[nodeId];
    const parent = page?.nodes[parentId];
    if (!page || !node || !parent || node.parentId === parentId) return;
    if (!CONTAINER_TYPES.includes(parent.type) || parent.locked) return;
    if (isDescendant(page, parentId, nodeId)) return;
    this.execute('移动图层', [{ op: 'reparent', nodeId, parentId }]);
  }

  addPage(name: string): Page | null {
    const document = this.design.getDocument();
    if (document.pages.length >= 64) return null;
    const page = createPage(name.trim().slice(0, 60) || `Page ${document.pages.length + 1}`);
    this.execute(`新建页面 ${page.name}`, [{ op: 'addPage', page }]);
    this.setPage(page.id);
    return page;
  }

  removePage(pageId: string): void {
    const document = this.design.getDocument();
    if (document.pages.length <= 1) return;
    this.execute('删除页面', [{ op: 'removePage', pageId }]);
    this.selection = [];
  }

  /** 项目名存在 documents.name（不是节点），与 activePageId 一样走文档级写入 */
  renameDocument(name: string): void {
    // 改名不是"浏览"：它改的是项目对外的名字，只读角色不该在本地先改出一个假名字
    if (isStudioReadOnly()) return;
    const document = clone(this.design.getDocument());
    document.name = name.slice(0, 120);
    this.design.reset(document, true);
    this.markDirty();
  }

  setText(nodeId: NodeId, text: string): void {
    this.execute('编辑文本', [{ op: 'set', nodeId, path: 'text', value: text }]);
  }

  setVisible(nodeId: NodeId, visible: boolean): void {
    this.execute(visible ? '显示' : '隐藏', [{ op: 'set', nodeId, path: 'visible', value: visible }]);
  }

  setLocked(nodeId: NodeId, locked: boolean): void {
    this.execute(locked ? '锁定' : '解锁', [{ op: 'set', nodeId, path: 'locked', value: locked }]);
  }

  /** 只有父级为绝对定位（layout.mode=none）时才能按像素移动；自动布局下改为重排 */
  canFreeMove(nodeId: NodeId): boolean {
    const page = this.snapshot.page;
    const node = page?.nodes[nodeId];
    if (!node?.parentId) return false;
    return (page as Page).nodes[node.parentId]?.layout.mode === 'none';
  }

  moveSelectionBy(dx: number, dy: number): void {
    const page = this.snapshot.page;
    if (!page) return;
    for (const id of this.selectedRoots()) {
      const node = page.nodes[id];
      if (!node || node.locked) continue;
      if (this.canFreeMove(id)) this.setPosition(id, node.position.x + dx, node.position.y + dy);
    }
  }

  reorderWithinParent(nodeId: NodeId, to: number): void {
    const page = this.snapshot.page;
    const node = page?.nodes[nodeId];
    if (!page || !node?.parentId) return;
    const parent = page.nodes[node.parentId];
    if (!parent) return;
    const from = parent.children.indexOf(nodeId);
    const target = Math.max(0, Math.min(parent.children.length - 1, to));
    if (from < 0 || from === target) return;
    this.execute('重排', [{ op: 'reorder', parentId: parent.id, from, to: target }]);
  }

  deleteSelection(): void {
    const page = this.snapshot.page;
    if (!page) return;
    const roots = this.selectedRoots().filter((id) => id !== page.rootId);
    if (!roots.length) return;
    this.execute(roots.length === 1 ? '删除元素' : `删除 ${roots.length} 个元素`, roots.map((id) => ({ op: 'remove', nodeId: id })));
    this.selection = [];
    this.markDirty();
  }

  addNode(type: NodeType, name?: string): NodeId | null {
    const page = this.snapshot.page;
    if (!page) return null;
    const root = page.nodes[page.rootId]!;
    const last = this.selection.length ? page.nodes[this.selection[this.selection.length - 1]!] : null;
    // 选中容器就插入其内；否则插入其父级；再否则插入页面根
    const parent =
      (last && CONTAINER_TYPES.includes(last.type) ? last : null) ??
      (last?.parentId ? page.nodes[last.parentId] ?? root : root);
    const node = createNode({ type, name, parentId: parent.id });
    this.execute(`添加 ${node.name}`, [{ op: 'insert', node, parentId: parent.id }]);
    this.selection = [node.id];
    this.markDirty();
    return node.id;
  }

  /** §8 align：按当前布局几何对齐到选区包围盒 */
  alignSelection(edge: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'): void {
    const snapshot = this.snapshot;
    const page = snapshot.page;
    const layout = snapshot.layout;
    if (!page || !layout) return;
    const ids = this.selectedRoots().filter((id) => this.canFreeMove(id));
    if (ids.length < 2) return;
    const boxes = ids.map((id) => layout.nodes[id]!).filter(Boolean);
    const minX = Math.min(...boxes.map((b) => b.x));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    const ops: PatchOp[] = [];
    for (const box of boxes) {
      const node = page.nodes[box.id];
      if (!node) continue;
      const position = { ...node.position };
      if (edge === 'left') position.x = minX;
      if (edge === 'right') position.x = maxX - box.width;
      if (edge === 'hcenter') position.x = Math.round((minX + maxX) / 2 - box.width / 2);
      if (edge === 'top') position.y = minY;
      if (edge === 'bottom') position.y = maxY - box.height;
      if (edge === 'vcenter') position.y = Math.round((minY + maxY) / 2 - box.height / 2);
      ops.push({ op: 'set', nodeId: box.id, path: 'position', value: position });
    }
    this.execute(`对齐（${edge}）`, ops);
  }

  undo(): void {
    if (isStudioReadOnly()) return;
    // §147 增量解：撤销动过的节点也要进"改动集合"——撤销不走 execute()，
    // 不登记的话，下一轮增量会以为那些节点"没动过"而沿用撤销前那一份几何（错的）。
    // **同样要"先登记后变更"**：`design.undo()` 会同步触发 commit → 布局就在那一刻求解。
    // 逆补丁在撤销之前就能从历史里取到（要撤销的那一条就在栈顶）。
    const stack = this.design.history().undo;
    const top = stack[stack.length - 1];
    if (top) this.noteLayoutChanges(top.inverse);
    const entry = this.design.undo();
    if (!entry) return;
    // 撤销在服务端也是补丁（逆补丁），不是"把旧文档再发一遍"
    this.pendingPatches.push(...entry.inverse);
    this.markDirty();
  }

  redo(): void {
    if (isStudioReadOnly()) return;
    // 同上：重做也要先登记（要重做的那一条在 redo 栈顶）
    const stack = this.design.history().redo;
    const top = stack[stack.length - 1];
    if (top) this.noteLayoutChanges(top.applied);
    const entry = this.design.redo();
    if (!entry) return;
    this.pendingPatches.push(...entry.applied);
    this.markDirty();
  }

  /**
   * 记下这批补丁动过哪些节点（增量的"改动集合"）。
   *
   * 保守收集：op 里提到的每个 id 都算上——多收几条只是那几条路径少复用一点，
   * 少收一条（漏了真正被改的那个）会让它被当成"没动过"而沿用上一帧，那才是错的。
   */
  private noteLayoutOps(ops: readonly PatchOp[]): void {
    for (const op of ops) {
      if ('nodeId' in op && op.nodeId) this.layoutChangedNodeIds.add(op.nodeId);
      if ('node' in op && op.node?.id) this.layoutChangedNodeIds.add(op.node.id);
      if ('parentId' in op && op.parentId) this.layoutChangedNodeIds.add(op.parentId);
      // 撤销/重做会把**引用**与**实例**一起放回来（restoreAsset / restoreComponent），
      // op 里**带着**那些节点 → 登记进改动集合就够（不登记的话增量路会沿用旧对象 → 画旧内容）
      if ('nodes' in op && Array.isArray(op.nodes)) {
        for (const r of op.nodes) {
          if (r && typeof r === 'object' && 'nodeId' in r && r.nodeId) {
            this.layoutChangedNodeIds.add(r.nodeId);
          }
        }
      }
      if ('paints' in op && Array.isArray(op.paints)) {
        for (const r of op.paints) {
          if (r && typeof r === 'object' && 'nodeId' in r && r.nodeId) {
            this.layoutChangedNodeIds.add(r.nodeId);
          }
        }
      }
      // 删组件 / 删资产会**扫遍所有页面**解引用：被解开的节点不在 op 里 → 改动集合算不全
      // → 那一刀只能走全量（见 layoutForceFull）
      if (op.op === 'removeComponent' || op.op === 'removeAsset') this.layoutForceFull = true;
    }
  }

  /** 同上，但收的是一批补丁（撤销/重做给的是补丁列表，每条补丁各有自己的 ops） */
  private noteLayoutChanges(patches: readonly DesignPatch[]): void {
    for (const patch of patches) this.noteLayoutOps(patch.ops);
  }

  jumpTo(entryId: string): void {
    // 历史跳转会换掉文档内容（与撤销同一族），只读下不许动：不是浏览，是一次重建
    if (isStudioReadOnly()) return;
    if (!this.design.jumpTo(entryId)) return;
    // 跳转可能一次跨多条历史（每条各有正/逆补丁集），补丁词汇表不追这种批量：
    // 如实走整份替换
    this.forceFullSave = true;
    // §147 增量解：那一批逆补丁动过的节点**没有**逐个登记（批量跳转不追）
    // → 改动集合算不全 → 那一轮只能走全量（见 layoutForceFull）
    this.layoutForceFull = true;
    this.markDirty();
  }

  /** AI 一次操作 = 一个可撤销事务（§149）；补丁词汇与手工编辑完全一致（§20） */
  applyAiTransaction(
    summary: string,
    patches: readonly DesignPatch[],
    capability?: { provider: string; model: string; demoMode: boolean },
  ): HistoryEntry | null {
    if (!patches.length) return null;
    // AI 事务也是一次编辑：只读下不落到模型上，调用方拿 null 就知道"没发生"
    if (isStudioReadOnly()) return null;
    const document = this.design.getDocument();
    // §147 增量解：AI 事务的改动也要进"改动集合"（与手工编辑同一条路）。
    // **先登记**：`applyWithinTransaction` / `commitTransaction` 会同步触发 commit → 布局就在那一刻求解。
    this.noteLayoutChanges(patches);
    this.design.beginTransaction({ label: summary, source: 'ai', patches: [], capability });
    for (const patch of patches) {
      this.design.applyWithinTransaction({ ...patch, pageId: patch.pageId ?? document.activePageId });
    }
    const entry = this.design.commitTransaction();
    // #62②：AI 事务的补丁与手工命令同一条待发队列——服务端看到的动词词汇完全一致
    if (entry) this.pendingPatches.push(...entry.applied);
    this.markDirty();
    return entry;
  }
  /** 只读预览与代码投影用：拿当前模型快照 */
  currentDocument(): DesignDocument {
    return this.design.getDocument();
  }

  /** 视口适配：把整页居中并按可用空间缩放 */
  fitToView(size: { width: number; height: number }): void {
    const layout = this.snapshot.layout;
    if (!layout || !size.width) return;
    const pad = 64;
    const zoom = Math.min(
      1,
      Math.max(0.1, Math.min((size.width - pad) / layout.width, (size.height - pad) / layout.height)),
    );
    this.zoomValue = Number(zoom.toFixed(2));
    this.panValue = {
      x: (size.width - layout.width * this.zoomValue) / 2,
      y: Math.max(24, (size.height - layout.height * this.zoomValue) / 2),
    };
    this.commit();
  }

  viewportWidth(): number {
    const layout = this.snapshot.layout;
    if (this.viewport === 'design') return layout?.width ?? 0;
    return BREAKPOINT_WIDTH[this.viewport];
  }
}

export const studio = new StudioStore();

/**
 * wire 补丁 → 模型补丁。schemas 包不依赖 design-model，节点在 wire 上只能是 record；
 * 调用方必须先经 DesignPatchSchema 校验，这里只做类型层面的桥接。
 */
export function toModelPatches(patches: readonly DesignPatchPayload[]): DesignPatch[] {
  return patches.map((patch) => ({ ...patch, ops: patch.ops as unknown as PatchOp[] }));
}
export function useStudio(): StudioSnapshot {
  return useSyncExternalStore(studio.subscribe, studio.getSnapshot, studio.getSnapshot);
}

/** 载入完成后 document / page / layout 必然存在（StudioShell 以此为挂载门） */
export type ReadyStudioSnapshot = Omit<StudioSnapshot, 'document' | 'page' | 'layout'> & {
  document: DesignDocument;
  page: Page;
  layout: ResolvedLayout;
};

export function useStudioReady(): ReadyStudioSnapshot {
  const state = useStudio();
  if (!state.ready || !state.document || !state.page || !state.layout) {
    throw new Error('Studio 子组件在 load 完成前被挂载');
  }
  return state as ReadyStudioSnapshot;
}
