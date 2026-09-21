import type { DesignDocument } from "./types";
import {
  applyPatch,
  diffPatch,
  invertPatch,
  type DiffEntry,
  type DesignPatch,
} from "./patch";

/**
 * Command 系统（§150）：所有 Canvas 修改都经 Command 走。
 * Transaction（§149）：一次 AI 操作内的多个补丁合成单个可撤销单元。
 */
export type CommandSource = "manual" | "ai" | "system" | "import";

export interface HistoryEntry {
  id: string;
  label: string;
  source: CommandSource;
  /** 该事务包含的补丁数（AI 操作常为多补丁） */
  patchCount: number;
  applied: DesignPatch[];
  inverse: DesignPatch[];
  touchedNodeIds: string[];
  diff: DiffEntry[];
  createdAt: string;
  /** AI 事务携带 provider/mode，UI 据此显示 DEMO MODE 徽标（§160） */
  capability?: { provider: string; model: string; demoMode: boolean };
}

export interface Command {
  id: string;
  label: string;
  source: CommandSource;
  patches: DesignPatch[];
  capability?: HistoryEntry["capability"];
}

export type StoreListener = (state: StoreState) => void;

export interface StoreState {
  document: DesignDocument;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** 单调递增，供渲染层做增量判定 */
  revision: number;
  lastEntry: HistoryEntry | null;
}

function nextId(prefix: string): string {
  return `${prefix}_${(counter += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
let counter = 0;

/**
 * 设计编辑器状态容器。
 * 不变量：document 只能通过 execute/undo/redo 改变，任何外部写入都必须走 execute（保证可撤销，§148-150）。
 */
export class DesignStore {
  private document: DesignDocument;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private listeners = new Set<StoreListener>();
  private revision = 0;
  private openTransaction: {
    command: Command;
    snapshot: DesignDocument;
  } | null = null;

  constructor(document: DesignDocument, options?: { limit?: number }) {
    this.document = document;
    this.limit = options?.limit ?? 200;
  }

  private limit: number;

  getDocument(): DesignDocument {
    return this.document;
  }

  getState(): StoreState {
    const last = this.undoStack[this.undoStack.length - 1] ?? null;
    const next = this.redoStack[this.redoStack.length - 1] ?? null;
    return {
      document: this.document,
      canUndo: this.undoStack.length > 0 && !this.openTransaction,
      canRedo: this.redoStack.length > 0 && !this.openTransaction,
      undoLabel: last?.label ?? null,
      redoLabel: next?.label ?? null,
      revision: this.revision,
      lastEntry: last,
    };
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }

  /** 单条命令立即执行并入栈 */
  execute(command: Omit<Command, "id"> & { id?: string }): HistoryEntry {
    const full: Command = { ...command, id: command.id ?? nextId("cmd") };
    const entry = this.runPatches(full);
    if (entry) {
      this.undoStack.push(entry);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack = [];
    }
    this.revision += 1;
    this.emit();
    return (
      entry ?? {
        id: full.id,
        label: full.label,
        source: full.source,
        patchCount: 0,
        applied: [],
        inverse: [],
        touchedNodeIds: [],
        diff: [],
        createdAt: new Date().toISOString(),
      }
    );
  }

  /** 开启一个 AI 事务：期间多次 apply 合成一次 undo（§149） */
  beginTransaction(command: Omit<Command, "id"> & { id?: string }): string {
    if (this.openTransaction) throw new Error("transaction already open");
    const full: Command = { ...command, id: command.id ?? nextId("txn") };
    this.openTransaction = { command: full, snapshot: this.document };
    return full.id;
  }

  /** 事务内应用补丁（不发事件，避免半成品被渲染） */
  applyWithinTransaction(patch: DesignPatch): DiffEntry[] {
    if (!this.openTransaction) throw new Error("no open transaction");
    this.openTransaction.command.patches.push(patch);
    const result = applyPatch(this.document, patch);
    this.document = result.document;
    return diffPatch(this.openTransaction.snapshot, patch);
  }

  commitTransaction(): HistoryEntry | null {
    if (!this.openTransaction) throw new Error("no open transaction");
    const { command, snapshot } = this.openTransaction;
    this.openTransaction = null;
    const entry = this.buildEntry(command, snapshot);
    if (entry) {
      this.undoStack.push(entry);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack = [];
    }
    this.revision += 1;
    this.emit();
    return entry;
  }

  /** 放弃当前事务，回到事务开始前的文档 */
  abortTransaction(): void {
    if (!this.openTransaction) return;
    this.document = this.openTransaction.snapshot;
    this.openTransaction = null;
    this.revision += 1;
    this.emit();
  }

  private runPatches(command: Command): HistoryEntry | null {
    const snapshot = this.document;
    for (const patch of command.patches) {
      this.document = applyPatch(this.document, patch).document;
    }
    return this.buildEntry(command, snapshot);
  }

  /** 逆序求逆：事务内后做的补丁要先撤销 */
  private buildEntry(
    command: Command,
    before: DesignDocument,
  ): HistoryEntry | null {
    const applied: DesignPatch[] = [];
    const inverse: DesignPatch[] = [];
    const touched = new Set<string>();
    const diff: DiffEntry[] = [];
    let cursor = before;
    let anySkipped = false;
    for (const patch of command.patches) {
      const result = applyPatch(cursor, patch);
      if (result.skipped.length) anySkipped = true;
      applied.push(patch);
      inverse.unshift(invertPatch(cursor, patch));
      for (const id of result.touchedNodeIds) touched.add(id);
      diff.push(...diffPatch(cursor, patch));
      cursor = result.document;
    }
    if (!applied.length) return null;
    void anySkipped;
    return {
      id: command.id,
      label: command.label,
      source: command.source,
      patchCount: applied.length,
      applied,
      inverse,
      touchedNodeIds: [...touched],
      diff,
      createdAt: new Date().toISOString(),
      capability: command.capability,
    };
  }

  undo(): HistoryEntry | null {
    if (this.openTransaction || !this.undoStack.length) return null;
    const entry = this.undoStack.pop()!;
    let cursor = this.document;
    for (const patch of entry.inverse)
      cursor = applyPatch(cursor, patch).document;
    this.document = cursor;
    this.redoStack.push(entry);
    this.revision += 1;
    this.emit();
    return entry;
  }

  redo(): HistoryEntry | null {
    if (this.openTransaction || !this.redoStack.length) return null;
    const entry = this.redoStack.pop()!;
    let cursor = this.document;
    for (const patch of entry.applied)
      cursor = applyPatch(cursor, patch).document;
    this.document = cursor;
    this.undoStack.push(entry);
    this.revision += 1;
    this.emit();
    return entry;
  }

  /** 跳到历史中的某一条（Version History 面板用，§27） */
  jumpTo(entryId: string): boolean {
    if (this.openTransaction) return false;
    const undoIndex = this.undoStack.findIndex((e) => e.id === entryId);
    const redoIndex = this.redoStack.findIndex((e) => e.id === entryId);
    if (undoIndex >= 0) {
      while (this.undoStack.length > undoIndex + 1) {
        const entry = this.undoStack.pop()!;
        let cursor = this.document;
        for (const patch of entry.inverse)
          cursor = applyPatch(cursor, patch).document;
        this.document = cursor;
        this.redoStack.push(entry);
      }
      this.revision += 1;
      this.emit();
      return true;
    }
    if (redoIndex >= 0) {
      while (this.redoStack.length > redoIndex + 1) {
        const entry = this.redoStack.pop()!;
        let cursor = this.document;
        for (const patch of entry.applied)
          cursor = applyPatch(cursor, patch).document;
        this.document = cursor;
        this.undoStack.push(entry);
      }
      this.revision += 1;
      this.emit();
      return true;
    }
    return false;
  }

  history(): { undo: HistoryEntry[]; redo: HistoryEntry[] } {
    return { undo: [...this.undoStack], redo: [...this.redoStack] };
  }

  /** 加载外部文档（切换项目/恢复快照）：清空历史，明确告知调用方 */
  reset(document: DesignDocument, preserveHistory = false): void {
    this.document = document;
    if (!preserveHistory) {
      this.undoStack = [];
      this.redoStack = [];
    }
    this.openTransaction = null;
    this.revision += 1;
    this.emit();
  }
}

/** 便捷命令构造 */
export function manualCommand(label: string, patch: DesignPatch): Command {
  return { id: nextId("c"), label, source: "manual", patches: [patch] };
}

export function aiCommand(
  label: string,
  patches: DesignPatch[],
  capability: HistoryEntry["capability"],
): Command {
  return { id: nextId("ai"), label, source: "ai", patches, capability };
}
