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
  type AssetRef,
  type BreakpointName,
  type DesignDocument,
  type DesignNode,
  type DesignPatch,
  type DocumentDiff,
  type HistoryEntry,
  type NodeId,
  type NodeType,
  type Page,
  type PatchOp,
  type ResolvedLayout,
} from '@nexus/design-model';
import type { DesignPatchPayload } from '@nexus/schemas';
import type { SnapshotEntry, SnapshotMeta } from '@/server/domain/snapshots';
import type { BranchMeta } from '@/server/domain/branches';
import type { VariantEntry } from '@/server/domain/variants';
import type { GateReport, Publication, Visibility } from '@/server/domain/publish';
import { apiAssetUrl, assetContextFor, type AssetUrlContext } from './assets';
import { csrfHeaders } from '@/lib/csrf';

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
  publishBusy: boolean;
  publishError: string | null;
  /** 最近一次门禁报告：通过与否都要摊开给用户看 */
  publishGate: GateReport | null;
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
  revision: number;
  activeMode: string | null;
}

const EMPTY_DOCUMENT_KEY = 'empty';

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
  private layoutCache: { key: string; value: ResolvedLayout | null } | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;
  private loadedFor: string | null = null;
  private snapshotList: SnapshotMeta[] = [];
  private snapshotBusyValue = false;
  private snapshotErrorValue: string | null = null;
  private compareValue: CompareResult | null = null;
  private branchList: BranchMeta[] = [];
  private variantList: VariantEntry[] = [];
  private variantNotes: string[] = [];
  private publicationValue: Publication | null = null;
  private publishBusyValue = false;
  private publishErrorValue: string | null = null;
  private publishGateValue: GateReport | null = null;
  private assetBusyValue = false;
  private assetErrorValue: string | null = null;
  private assetNoticeValue: string | null = null;

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
    const state = this.design.getState();
    const document = state.document;
    const page = document.pages.length ? (findPage(document, document.activePageId) ?? document.pages[0]!) : null;
    // 补丁可能删掉被选中的节点：先收敛选区，再产出快照，渲染层就不会引用不存在的节点
    if (this.selection.length) this.selection = this.selection.filter((id) => id && page?.nodes[id]);
    // token 表可能随补丁增长（addToken），每次快照重建，代价与 token 数成正比
    const tokens = new TokenStore(document.tokens);
    const layout = page ? this.resolveFor(page, document, tokens) : null;
    const history = this.design.history();
    // 资产解析器按清单构造：清单来自文档（§16），所以"能不能显示"与
    // "设计里有没有这条资产"是同一件事，不需要再问一次网络。
    const assetContext = assetContextFor(document, apiAssetUrl);
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
      history: [...history.undo, ...history.redo.reverse()],
      lastEntry: state.lastEntry,
      snapshots: this.snapshotList,
      snapshotBusy: this.snapshotBusyValue,
      snapshotError: this.snapshotErrorValue,
      compare: this.compareValue,
      branches: this.branchList,
      variants: this.variantList,
      variantNotes: this.variantNotes,
      publication: this.publicationValue,
      publishBusy: this.publishBusyValue,
      publishError: this.publishErrorValue,
      publishGate: this.publishGateValue,
      assets: document.assets,
      assetContext,
      assetBusy: this.assetBusyValue,
      assetError: this.assetErrorValue,
      assetNotice: this.assetNoticeValue,
      revision: state.revision,
      activeMode: document.activeMode ?? null,
    };
  }

  private resolveFor(page: Page, document: DesignDocument, tokens: TokenStore): ResolvedLayout | null {
    const mode = document.activeMode ?? null;
    const key = `${this.design.getState().revision}|${document.id}|${page.id}|${this.viewport}|${mode}`;
    if (this.layoutCache?.key === key) return this.layoutCache.value;
    let layout: ResolvedLayout | null = null;
    try {
      layout = resolveLayout(page, {
        tokens,
        mode,
        breakpoint: this.viewport === 'design' ? undefined : this.viewport,
      });
    } catch (error) {
      // 布局求解失败（模型被改坏）：不渲染半成品，面板显示原因
      console.error('[studio] resolveLayout failed', error);
      layout = null;
    }
    this.layoutCache = { key, value: layout };
    return layout;
  }

  // ---- 载入 / 保存 ----

  async load(projectId: string): Promise<void> {
    if (this.loadedFor === projectId && this.ready) return;
    this.loadedFor = projectId;
    this.projectId = projectId;
    this.ready = false;
    this.loadError = null;
    this.commit();
    try {
      const res = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
        throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { document: DesignDocument };
      this.design.reset(body.document);
      this.selection = [];
      this.dirty = false;
      this.saveStateValue = 'idle';
      this.ready = true;
      this.commit();
      void this.refreshSnapshots();
      void this.refreshPublication();
    } catch (error) {
      this.loadError = error instanceof Error ? error.message : String(error);
      this.ready = false;
      this.commit();
    }
  }

  markDirty(): void {
    this.dirty = true;
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

  async save(): Promise<void> {
    if (!this.projectId || !this.ready) return;
    if (this.inflight) await this.inflight;
    const document = this.design.getDocument();
    this.saveStateValue = 'saving';
    this.saveError = null;
    this.commit();
    const run = (async () => {
      try {
        const res = await fetch(`/api/projects/${this.projectId}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json', ...csrfHeaders() },
          body: JSON.stringify(document),
        });
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          issues?: string[];
          message?: string;
          error?: string;
          savedAt?: string;
        } | null;
        if (!res.ok || !body?.ok) {
          const detail = body?.issues?.join('；') ?? body?.message ?? body?.error ?? `HTTP ${res.status}`;
          this.saveStateValue = 'error';
          this.saveError = detail;
          this.commit();
          return;
        }
        // 保存期间又有编辑时不能清 dirty：用文档引用比对（补丁总是产生新文档对象）
        if (this.design.getDocument() === document) this.dirty = false;
        this.saveStateValue = 'saved';
        this.savedAt = body.savedAt ?? new Date().toISOString();
        this.commit();
      } catch (error) {
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
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) void this.save();
  }

  // ---- 服务端快照（§27 / §108：用户项目历史，不是 git 开发历史） ----

  /** 失败只记录原因，不打断编辑（§159 不静默失败）。§28 的分支列表随快照一起回来 */
  async refreshSnapshots(): Promise<void> {
    if (!this.projectId || !this.ready) return;
    try {
      const res = await fetch(`/api/projects/${this.projectId}/snapshots`, { cache: 'no-store' });
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

  /**
   * 发布 = 把当前这一版存成快照，并让公开 URL 指向它。
   * 先 save 再 publish：发出去的和屏幕上看到的必须是同一份（§16）。
   */
  async publish(visibility: Visibility): Promise<Publication | null> {
    if (!this.projectId || !this.ready) return null;
    this.publishBusyValue = true;
    this.publishErrorValue = null;
    this.publishGateValue = null;
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
        | { publication?: Publication; gate?: GateReport; message?: string; issues?: string[] }
        | null;
      this.publishGateValue = body?.gate ?? null;
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
      const body = (await res.json().catch(() => null)) as { removed?: boolean; message?: string } | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      this.publicationValue = null;
      return !!body?.removed;
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

  /** activeMode / activePageId 不是节点编辑，补丁词汇表里没有对应 op：写回文档并标脏，不进撤销栈 */
  setMode(mode: string | null): void {
    const document = clone(this.design.getDocument());
    document.activeMode = mode;
    this.design.reset(document, true);
    this.markDirty();
  }

  setPage(pageId: string): void {
    const current = this.design.getDocument();
    if (!current.pages.some((p) => p.id === pageId)) return;
    const document = clone(current);
    document.activePageId = pageId;
    this.design.reset(document, true);
    this.selection = [];
    this.markDirty();
  }

  // ---- 选区 ----

  select(ids: readonly NodeId[]): void {
    this.selection = [...new Set(ids)];
    this.commit();
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
    const document = this.design.getDocument();
    this.design.execute(manualCommand(label, { pageId: document.activePageId, ops }));
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
    if (!this.design.undo()) return;
    this.markDirty();
  }

  redo(): void {
    if (!this.design.redo()) return;
    this.markDirty();
  }

  jumpTo(entryId: string): void {
    if (!this.design.jumpTo(entryId)) return;
    this.markDirty();
  }

  /** AI 一次操作 = 一个可撤销事务（§149）；补丁词汇与手工编辑完全一致（§20） */
  applyAiTransaction(
    summary: string,
    patches: readonly DesignPatch[],
    capability?: { provider: string; model: string; demoMode: boolean },
  ): HistoryEntry | null {
    if (!patches.length) return null;
    const document = this.design.getDocument();
    this.design.beginTransaction({ label: summary, source: 'ai', patches: [], capability });
    for (const patch of patches) {
      this.design.applyWithinTransaction({ ...patch, pageId: patch.pageId ?? document.activePageId });
    }
    const entry = this.design.commitTransaction();
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
