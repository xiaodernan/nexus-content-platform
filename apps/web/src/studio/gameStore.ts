import { useSyncExternalStore } from 'react';
import { createGame, validateGame, type GameDocument } from '@nexus/game-model';
import { csrfHeaders } from '@/lib/csrf';
import { isStudioReadOnly } from './read-only';

/**
 * §54 游戏设计文档的客户端真值：面板读这一份。与设计文档（画布 store）、
 * 世界文档（`worldStore`）是三份互不覆盖的投影源，各自有各自的写库队列（§16）。
 *
 * 写库策略照 `worldStore`：编辑先落本地，离散动作与失焦时 `commit()`。
 * 游戏编辑同样没进画布的撤销栈（§150 只覆盖设计文档），所以不做静默自动保存——
 * 每次写库都对应一个用户明确做过的动作。
 */

export type GameSaveState = 'idle' | 'loading' | 'dirty' | 'saving' | 'saved' | 'error';

export interface GameSnapshot {
  ready: boolean;
  projectId: string;
  game: GameDocument | null;
  /** 服务端确认"这个项目还没有游戏"——和"读失败了"是两件事 */
  missing: boolean;
  saveState: GameSaveState;
  error: string | null;
  /** 一次性的动作回执（"这条数值不是有限数，没写进去"）：不是保存错误，别混进 error */
  notice: string | null;
}

const SAVE_DEBOUNCE_MS = 500;

class GameStore {
  private snapshotValue: GameSnapshot = {
    ready: false,
    projectId: '',
    game: null,
    missing: false,
    saveState: 'idle',
    error: null,
    notice: null,
  };

  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  /** 在飞期间又改了：前一次落地后立刻补发，不等防抖定时器（页面可能先被 unload 掉） */
  private pending = false;
  private loadingFor = '';
  private loadedFor = '';

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GameSnapshot => this.snapshotValue;

  private commit_(next: Partial<GameSnapshot>): void {
    this.snapshotValue = { ...this.snapshotValue, ...next };
    for (const listener of this.listeners) listener();
  }

  async load(projectId: string): Promise<void> {
    if (this.loadingFor === projectId) return;
    this.loadingFor = projectId;
    this.loadedFor = projectId;
    this.commit_({
      ready: false,
      projectId,
      game: null,
      missing: false,
      saveState: 'loading',
      error: null,
      notice: null,
    });
    try {
      const res = await fetch(`/api/projects/${projectId}/game`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as
        | { game?: GameDocument | null; message?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      const local = this.snapshotValue;
      // 读库期间用户可能已经建好/改过这份游戏：迟到的读结果不能把更新的本地真值擦掉
      if (local.projectId === projectId && local.game) {
        this.commit_({ ready: true, missing: false, saveState: local.saveState });
        return;
      }
      this.commit_({
        ready: true,
        game: body?.game ?? null,
        missing: !body?.game,
        saveState: 'idle',
      });
    } catch (error) {
      this.commit_({
        ready: true,
        game: null,
        missing: false,
        saveState: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (this.loadingFor === projectId) this.loadingFor = '';
    }
  }

  reload(): void {
    if (this.loadedFor) void this.load(this.loadedFor);
  }

  /** 切页签不该把没保存的编辑冲掉；真需要重读走 `reload()` */
  ensure(projectId: string): void {
    if (this.loadedFor === projectId && (this.loadingFor === projectId || this.snapshotValue.ready)) return;
    void this.load(projectId);
  }

  /** 建一份模板骨架并立刻写库：这是用户点出来的动作，不是页面加载的副作用 */
  async createSkeleton(name: string): Promise<void> {
    const { projectId } = this.snapshotValue;
    if (!projectId) return;
    this.setLocal(createGame(name, projectId));
    await this.commit();
  }

  showNotice(message: string): void {
    this.commit_({ notice: message });
  }

  /**
   * 一次新的本地编辑就是上一条回执的终点：不擦掉的话，用户会以为
   * 刚改好的那条数值还是被拒了。
   */
  setLocal(next: GameDocument): void {
    // 只读（viewer）：本地也不落——界面先改掉、写库却被按下，等于让用户以为改成功了
    if (isStudioReadOnly()) return;
    this.commit_({ game: next, ready: true, saveState: 'dirty', notice: null });
  }

  /** 写库。同一时刻只让一次请求在飞；在飞期间的改动记一笔"还欠一次"，前一次落地后立刻补发 */
  async commit(): Promise<void> {
    if (isStudioReadOnly()) return;
    const { projectId, game } = this.snapshotValue;
    if (!projectId || !game) return;
    if (this.saving) {
      this.pending = true;
      return;
    }
    const issues = validateGame(game);
    if (issues.length) {
      // 不完整的文档不往库里塞，但也不静默：面板上就是这条原因
      this.commit_({ saveState: 'error', error: issues.map((i) => i.message).join('；') });
      return;
    }
    const sent = game;
    this.saving = this.put(projectId, sent).finally(() => {
      this.saving = null;
      if (this.pending) {
        this.pending = false;
        void this.commit();
      }
    });
    await this.saving;
  }

  /** 发一次 PUT。成功与失败都只在"这份文档还是当前那份"时才改状态 */
  private async put(projectId: string, document: GameDocument): Promise<void> {
    this.commit_({ saveState: 'saving', error: null });
    const payload = JSON.stringify({ document });
    const stillCurrent = () => this.snapshotValue.game === document;
    try {
      const res = await fetch(`/api/projects/${projectId}/game`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: payload,
        // 改完就刷新是常见动作，keepalive 让请求活过页面卸载；它只有 ~64KB 额度，超了退回普通请求
        keepalive: payload.length < 60_000,
      });
      const body = (await res.json().catch(() => null)) as
        | { game?: GameDocument; message?: string }
        | null;
      if (!res.ok || !body?.game) throw new Error(body?.message ?? `HTTP ${res.status}`);
      if (stillCurrent()) this.commit_({ game: body.game, saveState: 'saved', missing: false });
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

  /** 页面要走了（关标签 / 刷新 / 切项目）：把还欠着的那次写发出去 */
  flushSave(): void {
    if (isStudioReadOnly()) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const { projectId, game } = this.snapshotValue;
    if (!projectId || !game) return;
    if (this.saving) {
      // 链式补发等不到下一个响应了，直接再发一次 keepalive 请求；
      // 两个请求乱序到达时由服务端按 updatedAt 拒掉旧的那份
      void this.put(projectId, game);
      return;
    }
    void this.commit();
  }
}

export const gameStore = new GameStore();

export function useGame(): GameSnapshot {
  return useSyncExternalStore(gameStore.subscribe, gameStore.getSnapshot, gameStore.getSnapshot);
}
