import {
  createWorld,
  validateWorld,
  type WorldDocument,
} from '@nexus/world-model';
import { useSyncExternalStore } from 'react';
import { csrfHeaders } from '@/lib/csrf';
import { isStudioReadOnly } from './read-only';

/**
 * 世界文档的客户端真值：面板（§44）与图视图（§45）都读这一份，
 * 两处各存一份状态迟早会各说一套（§16）。
 *
 * 保存策略：编辑先落本地（`setLocal`），离散动作与拖拽结束时 `commit()` 写库。
 * 不做"永远自动保存"——世界编辑没进撤销栈，静默覆盖历史是不可逆的，
 * 所以每次写库都对应一个明确的动作（失焦、删除、连线、拖完松手）。
 */

export type WorldSaveState = 'idle' | 'loading' | 'dirty' | 'saving' | 'saved' | 'error';

export interface WorldSnapshot {
  ready: boolean;
  projectId: string;
  world: WorldDocument | null;
  /** 服务端确认"这个项目还没有世界"——和"读失败了"是两件事 */
  missing: boolean;
  saveState: WorldSaveState;
  error: string | null;
  /** 图视图里选中的端点（最多两个，先进先出） */
  picked: string[];
  /** 一次性的动作回执（"这两个已经连过了"）：不是保存错误，别混进 error */
  notice: string | null;
}

const SAVE_DEBOUNCE_MS = 500;

class WorldStore {
  private snapshotValue: WorldSnapshot = {
    ready: false,
    projectId: '',
    world: null,
    missing: false,
    saveState: 'idle',
    error: null,
    picked: [],
    notice: null,
  };

  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  /** 在飞期间又改了：前一次落地后立刻补发，不等防抖定时器（页面可能先被 unload 掉） */
  private pending = false;
  /** 正在为哪个项目读库：同一个项目的第二次 load 直接忽略（StrictMode 会把 effect 跑两遍） */
  private loadingFor = '';
  private loadedFor = '';

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): WorldSnapshot => this.snapshotValue;

  private commit_(next: Partial<WorldSnapshot>): void {
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
      world: null,
      missing: false,
      saveState: 'loading',
      error: null,
      picked: [],
      notice: null,
    });
    try {
      const res = await fetch(`/api/projects/${projectId}/world`, { cache: 'no-store' });
      const body = (await res.json().catch(() => null)) as
        | { world?: WorldDocument | null; message?: string }
        | null;
      if (!res.ok) throw new Error(body?.message ?? `HTTP ${res.status}`);
      const local = this.snapshotValue;
      // 读库期间用户可能已经建好/改过这份世界（骨架就是点一下才有的）：
      // 迟到的读结果不能把更新的本地真值擦掉
      if (local.projectId === projectId && local.world) {
        this.commit_({ ready: true, missing: false, saveState: local.saveState });
        return;
      }
      this.commit_({
        ready: true,
        world: body?.world ?? null,
        missing: !body?.world,
        saveState: 'idle',
      });
    } catch (error) {
      this.commit_({
        ready: true,
        world: null,
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

  /**
   * 切页签不该把没保存的编辑冲掉：已经载入过这个项目就直接返回。
   * 真需要重读走 `reload()`（目前只有载入失败时用户手动重试会用到）。
   */
  ensure(projectId: string): void {
    if (this.loadedFor === projectId && (this.loadingFor === projectId || this.snapshotValue.ready)) return;
    void this.load(projectId);
  }

  /** 建一份模板骨架并立刻写库：这是用户点出来的动作，不是页面加载的副作用 */
  async createSkeleton(name: string): Promise<void> {
    const { projectId } = this.snapshotValue;
    if (!projectId) return;
    this.setLocal(createWorld(name, projectId));
    await this.commit();
  }

  setLocal(next: WorldDocument): void {
    // 只读（viewer）：本地也不落。写库虽然会被按下（`commit` 的闸），但先把界面改掉
    // 再永远存不上，等于让用户以为改成功了（§159）
    if (isStudioReadOnly()) return;
    this.commit_({ world: next, ready: true, saveState: 'dirty' });
  }

  showNotice(message: string): void {
    this.commit_({ notice: message });
  }

  clearNotice(): void {
    if (this.snapshotValue.notice) this.commit_({ notice: null });
  }

  /** 只改图上的选择，不碰文档 */
  togglePick(nodeId: string): void {
    const picked = this.snapshotValue.picked;
    const next = picked.includes(nodeId)
      ? picked.filter((id) => id !== nodeId)
      : [...picked.slice(-1), nodeId];
    this.commit_({ picked: next });
  }

  clearPick(): void {
    this.commit_({ picked: [] });
  }

  /** 写库。同一时刻只让一次请求在飞；在飞期间的改动记一笔"还欠一次"，前一次落地后立刻补发 */
  async commit(): Promise<void> {
    if (isStudioReadOnly()) return;
    const { projectId, world } = this.snapshotValue;
    if (!projectId || !world) return;
    if (this.saving) {
      this.pending = true;
      return;
    }
    const issues = validateWorld(world);
    if (issues.length) {
      // 不完整的文档不往库里塞，但也不静默：面板上就是这条原因
      this.commit_({ saveState: 'error', error: issues.map((i) => i.message).join('；') });
      return;
    }
    const sent = world;
    this.saving = this.put(projectId, sent).finally(() => {
      this.saving = null;
      if (this.pending) {
        this.pending = false;
        void this.commit();
      }
    });
    await this.saving;
  }

  /**
   * 发一次 PUT。成功与失败都只在"这份文档还是当前那份"时才改状态：
   * 旧请求的响应回来得晚，不能把用户刚敲进去的内容盖回去。
   */
  private async put(projectId: string, document: WorldDocument): Promise<void> {
    this.commit_({ saveState: 'saving', error: null });
    const payload = JSON.stringify({ document });
    const stillCurrent = () => this.snapshotValue.world === document;
    try {
      const res = await fetch(`/api/projects/${projectId}/world`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...csrfHeaders() },
        body: payload,
        /**
         * 拖完就刷新页面是常见动作，而普通 fetch 会在页面卸载时被浏览器掐掉——
         * 用户看到"已保存"其实没落库。keepalive 让请求活过 unload；
         * 它只有 ~64KB 的额度，超了就退回普通请求（那种文档也不是一秒能改完的）。
         */
        keepalive: payload.length < 60_000,
      });
      const body = (await res.json().catch(() => null)) as
        | { world?: WorldDocument; message?: string }
        | null;
      if (!res.ok || !body?.world) throw new Error(body?.message ?? `HTTP ${res.status}`);
      if (stillCurrent()) this.commit_({ world: body.world, saveState: 'saved', missing: false });
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
    const { projectId, world } = this.snapshotValue;
    if (!projectId || !world) return;
    if (this.saving) {
      // 链式补发等不到下一个响应了，直接再发一次 keepalive 请求。
      // 两个请求乱序到达时由服务端按 updatedAt 拒掉旧的那份，所以不会把新改动盖掉。
      void this.put(projectId, world);
      return;
    }
    void this.commit();
  }
}

export const worldStore = new WorldStore();

export function useWorld(): WorldSnapshot {
  return useSyncExternalStore(worldStore.subscribe, worldStore.getSnapshot, worldStore.getSnapshot);
}
