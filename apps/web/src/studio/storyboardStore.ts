import { useSyncExternalStore } from 'react';
import { planStoryboard, splitShotAt, storyboardTransaction, type Storyboard, type StoryboardOp } from '@nexus/video-model';
import { csrfHeaders } from '@/lib/csrf';
import { isStudioReadOnly } from './read-only';

/**
 * §40-42 分镜的客户端真值：面板读这一份，写库走 `/api/projects/[id]/storyboard`。
 * 策略照 `gameStore` / `worldStore`：编辑先落本地，离散动作与失焦时 `commit()`。
 *
 * 与那两个不一样的地方：**这里的每次编辑都是 `patch.ts` 的一个事务**（§150）。
 * 撤销栈因此是真的（`undo()` / `redo()`），不是"重打一遍"。栈放在客户端是刻意的：
 * 库里那份始终是当前状态，撤销改的是本地真值，随后照常 PUT 一次——
 * 与画布那条"Command 改文档、持久层只看到最终形态"的分工一致。
 *
 * `baseUpdatedAt` 是服务端给的并发基准：写库时原样带回去，服务端用来拒"更旧的写"。
 * 本地没读过就不带（第一次建档手里没有基准），绝不拿 Date.now() 编一个。
 */

export type StoryboardSaveState = 'idle' | 'loading' | 'dirty' | 'saving' | 'saved' | 'error';

export interface StoryboardSnapshot {
  ready: boolean;
  projectId: string;
  storyboard: Storyboard | null;
  /** 服务端确认"这个项目还没有分镜"——和"读失败了"是两件事 */
  missing: boolean;
  saveState: StoryboardSaveState;
  error: string | null;
  notice: string | null;
  /** 撤销/重做有没有东西可做：界面上靠它决定按钮灰不灰 */
  canUndo: boolean;
  canRedo: boolean;
}

interface Txn {
  undo: StoryboardOp[];
  redo: StoryboardOp[];
}

const SAVE_DEBOUNCE_MS = 500;

class StoryboardStore {
  private snapshotValue: StoryboardSnapshot = {
    ready: false,
    projectId: '',
    storyboard: null,
    missing: false,
    saveState: 'idle',
    error: null,
    notice: null,
    canUndo: false,
    canRedo: false,
  };

  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private pending = false;
  private loadingFor = '';
  private loadedFor = '';
  private baseUpdatedAt = '';
  private undoStack: Txn[] = [];
  private redoStack: Txn[] = [];

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StoryboardSnapshot => this.snapshotValue;

  private commit_(next: Partial<StoryboardSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...next };
    for (const listener of this.listeners) listener();
  }

  async load(projectId: string): Promise<void> {
    if (this.loadingFor === projectId) return;
    this.loadingFor = projectId;
    this.loadedFor = projectId;
    this.undoStack = [];
    this.redoStack = [];
    this.baseUpdatedAt = '';
    this.commit_({
      ready: false,
      projectId,
      storyboard: null,
      missing: false,
      saveState: 'loading',
      error: null,
      notice: null,
      canUndo: false,
      canRedo: false,
    });
    try {
      const res = await fetch(`/api/projects/${projectId}/storyboard`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as
        | { storyboard?: Storyboard | null; updatedAt?: string | null; message?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      const local = this.snapshotValue;
      // 读库期间用户可能已经切好一版分镜：迟到的读结果不能把更新的本地真值擦掉
      if (local.projectId === projectId && local.storyboard) {
        this.commit_({ ready: true, missing: false, saveState: local.saveState });
        return;
      }
      this.baseUpdatedAt = body?.updatedAt ?? '';
      this.commit_({
        ready: true,
        storyboard: body?.storyboard ?? null,
        missing: !body?.storyboard,
        saveState: 'idle',
      });
    } catch (error) {
      this.commit_({
        ready: true,
        storyboard: null,
        missing: false,
        saveState: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (this.loadingFor === projectId) this.loadingFor = '';
    }
  }

  /** 切页签不该把没保存的编辑冲掉；真需要重读走 `reload()` */
  ensure(projectId: string): void {
    if (this.loadedFor === projectId && (this.loadingFor === projectId || this.snapshotValue.ready)) return;
    void this.load(projectId);
  }

  reload(): void {
    if (this.loadedFor) void this.load(this.loadedFor);
  }

  showNotice(message: string): void {
    this.commit_({ notice: message });
  }

  /**
   * 从一句话切一版分镜并立刻写库。切分本身是 `planStoryboard` 的**本地确定性断句**，
   * 界面上要把这句说清楚（notes 里已经带着"不是模型给的镜头语言"）。
   */
  async planFrom(prompt: string): Promise<void> {
    // 只读（viewer）：切出的一版分镜落不进库，也就不该先换掉界面（§159 不假装改成了）
    if (isStudioReadOnly()) return;
    const { projectId } = this.snapshotValue;
    if (!projectId) return;
    const sb = planStoryboard(prompt);
    if (!sb.shots.length) {
      // 切不出镜头就明说，不写一份 0 镜的文档进库冒充"生成好了"
      this.commit_({ notice: sb.notes.join(' ') });
      return;
    }
    this.pushTxn();
    this.setLocal(sb);
    await this.commit();
  }

  /**
   * 走一个补丁事务：正做进撤销栈，改的是本地真值。
   * 补丁本身由 `@nexus/video-model/patch` 算逆，这里只管栈与写库。
   */
  applyOps(ops: StoryboardOp[], save = true): void {
    // 只读：不进撤销栈、不改本地真值——撤销栈里留一条撤不动的编辑比没有更糟
    if (isStudioReadOnly()) return;
    const current = this.snapshotValue.storyboard;
    if (!current) return;
    let tx;
    try {
      tx = storyboardTransaction(current, ops);
    } catch (error) {
      // 找不到镜头一类：说清为什么这一格没动，而不是让按钮看起来"点了没反应"
      this.commit_({ notice: error instanceof Error ? error.message : String(error) });
      return;
    }
    this.pushTxn(tx);
    this.setLocal(tx.applied);
    if (save) void this.commit();
  }

  /**
   * §41 片段级裁切：一镜在 `atMs`（相对它自己左边缘）处切成两镜。
   *
   * 不新增补丁形状——切分就是既有的 `updateShot`（前半改短）+ `addShot`（后半插进下一位），
   * 逆补丁由 patch.ts 现算：删掉后半、恢复前半长度，一步撤销回到切之前（§150）。
   * 被拒时原因进 `notice` 那同一格：静默的拒绝与"点了没反应"分不开（§159）。
   */
  splitShot(shotId: string, atMs: number, secondId: string): boolean {
    // 只读：下面走 applyOps，但 applyOps 的闸不会把"切成功"的回执也挡掉——
    // 这里先返回 false，别在什么都没切的时候弹一句"切成两镜了"（§159）
    if (isStudioReadOnly()) return false;
    const sb = this.snapshotValue.storyboard;
    if (!sb) return false;
    const at = sb.shots.findIndex((shot) => shot.id === shotId);
    if (at < 0) {
      this.commit_({ notice: `镜头 ${shotId} 不在这份分镜里，没有切` });
      return false;
    }
    const shot = sb.shots[at]!;
    const split = splitShotAt(shot, atMs, secondId);
    if (!split.ok) {
      this.commit_({ notice: split.reason });
      return false;
    }
    this.applyOps([
      { op: 'updateShot', id: shot.id, before: { durationMs: shot.durationMs }, after: { durationMs: split.headMs } },
      { op: 'addShot', index: at + 1, shot: split.tail },
    ]);
    this.commit_({
      notice: `第 ${at + 1} 镜在 ${split.headMs} 毫秒处切成两镜（前半 ${split.headMs} + 后半 ${split.tail.durationMs} = 原 ${shot.durationMs}）。两半共享同一句描述与同一张参考帧——切的是时间线，不是像素。`,
    });
    return true;
  }

  private pushTxn(tx?: Txn): void {
    if (!tx) {
      // 建档不是"一次可撤销的编辑"，它换掉了整份真值：栈清空比留一个撤不回原状的空步诚实
      this.undoStack = [];
      this.redoStack = [];
      this.commit_({ canUndo: false, canRedo: false });
      return;
    }
    this.undoStack = [...this.undoStack, tx];
    this.redoStack = [];
    this.commit_({ canUndo: true, canRedo: false });
  }

  private stepBack(ops: StoryboardOp[]): void {
    const current = this.snapshotValue.storyboard;
    if (!current) return;
    const next = storyboardTransaction(current, ops).applied;
    this.setLocal(next);
    void this.commit();
  }

  undo(): void {
    if (isStudioReadOnly()) return;
    const tx = this.undoStack[this.undoStack.length - 1];
    if (!tx) return;
    this.undoStack = this.undoStack.slice(0, -1);
    this.redoStack = [...this.redoStack, tx];
    this.commit_({ canUndo: this.undoStack.length > 0, canRedo: true });
    this.stepBack(tx.undo);
  }

  redo(): void {
    if (isStudioReadOnly()) return;
    const tx = this.redoStack[this.redoStack.length - 1];
    if (!tx) return;
    this.redoStack = this.redoStack.slice(0, -1);
    this.undoStack = [...this.undoStack, tx];
    this.commit_({ canUndo: true, canRedo: this.redoStack.length > 0 });
    this.stepBack(tx.redo);
  }

  /** 一次新的本地编辑就是上一条回执的终点：不擦掉的话，用户会以为刚改的那格还被拒着 */
  setLocal(next: Storyboard): void {
    this.commit_({ storyboard: next, ready: true, saveState: 'dirty', notice: null });
  }

  async commit(): Promise<void> {
    if (isStudioReadOnly()) return;
    const { projectId, storyboard } = this.snapshotValue;
    if (!projectId || !storyboard) return;
    if (this.saving) {
      this.pending = true;
      return;
    }
    const sent = storyboard;
    this.saving = this.put(projectId, sent).finally(() => {
      this.saving = null;
      if (this.pending) {
        this.pending = false;
        void this.commit();
      }
    });
    await this.saving;
  }

  private async put(projectId: string, document: Storyboard): Promise<void> {
    this.commit_({ saveState: 'saving', error: null });
    const base = this.baseUpdatedAt;
    const payload = JSON.stringify(base ? { document, baseUpdatedAt: base } : { document });
    const stillCurrent = () => this.snapshotValue.storyboard === document;
    try {
      const res = await fetch(`/api/projects/${projectId}/storyboard`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: payload,
        keepalive: payload.length < 60_000,
      });
      const body = (await res.json().catch(() => null)) as
        | { storyboard?: Storyboard; updatedAt?: string; message?: string }
        | null;
      if (!res.ok || !body?.storyboard) throw new Error(body?.message ?? `HTTP ${res.status}`);
      // 服务端回来的时间戳就是下一次写的基准
      this.baseUpdatedAt = body.updatedAt ?? '';
      if (stillCurrent()) this.commit_({ storyboard: body.storyboard, saveState: 'saved', missing: false });
    } catch (error) {
      if (stillCurrent()) {
        this.commit_({
          saveState: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  scheduleSave(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.commit();
    }, SAVE_DEBOUNCE_MS);
  }

  flushSave(): void {
    if (isStudioReadOnly()) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const { projectId, storyboard } = this.snapshotValue;
    if (!projectId || !storyboard) return;
    if (this.saving) {
      void this.put(projectId, storyboard);
      return;
    }
    void this.commit();
  }
}

export const storyboardStore = new StoryboardStore();

export function useStoryboard(): StoryboardSnapshot {
  return useSyncExternalStore(storyboardStore.subscribe, storyboardStore.getSnapshot, storyboardStore.getSnapshot);
}
