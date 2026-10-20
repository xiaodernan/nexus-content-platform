import { describe, expect, it } from "vitest";
import { DesignStore, manualCommand } from "../src/commands";
import { createDocument, findPage, getNode } from "../src/nodes";
import type { DesignPatch } from "../src/patch";

function setup() {
  const doc = createDocument("store-probe");
  const page = findPage(doc)!;
  const rootId = page.rootId;
  const store = new DesignStore(doc);
  return { store, rootId };
}

function renamePatch(rootId: string, name: string): DesignPatch {
  return { ops: [{ op: "set", nodeId: rootId, path: "name", value: name }] };
}

function nameOf(store: DesignStore, rootId: string): string {
  const page = findPage(store.getDocument())!;
  return getNode(page, rootId)!.name;
}

describe("DesignStore 基础 undo/redo", () => {
  it("execute 应用补丁并记入历史，且可撤销", () => {
    const { store, rootId } = setup();
    const before = nameOf(store, rootId);
    expect(before).toBe("Home");

    const entry = store.execute(manualCommand("rename", renamePatch(rootId, "Renamed")));
    expect(entry.patchCount).toBe(1);
    expect(nameOf(store, rootId)).toBe("Renamed");
    expect(store.getState().canUndo).toBe(true);
    expect(store.getState().canRedo).toBe(false);
  });

  it("undo 回到修改前，redo 重新应用", () => {
    const { store, rootId } = setup();
    store.execute(manualCommand("rename", renamePatch(rootId, "X")));

    const undone = store.undo();
    expect(undone?.id).toBeTruthy();
    expect(nameOf(store, rootId)).toBe("Home");
    expect(store.getState().canUndo).toBe(false);
    expect(store.getState().canRedo).toBe(true);

    store.redo();
    expect(nameOf(store, rootId)).toBe("X");
    expect(store.getState().canRedo).toBe(false);
  });

  it("空补丁的 execute 不进历史（不污染撤销栈）", () => {
    const { store } = setup();
    store.execute({ label: "noop", source: "manual", patches: [] });
    expect(store.getState().canUndo).toBe(false);
    expect(store.history().undo).toHaveLength(0);
  });
});

describe("DesignStore 事务（§149）", () => {
  it("begin/apply/commit 合成单条可撤销记录，patchCount 多补丁", () => {
    const { store, rootId } = setup();
    store.beginTransaction({ label: "ai-tx", source: "ai", patches: [] });
    store.applyWithinTransaction(renamePatch(rootId, "A"));
    store.applyWithinTransaction(renamePatch(rootId, "B"));
    const entry = store.commitTransaction();
    expect(entry?.patchCount).toBe(2);
    expect(nameOf(store, rootId)).toBe("B");
    expect(store.history().undo).toHaveLength(1);
    // 一次 undo 撤销整段事务
    store.undo();
    expect(nameOf(store, rootId)).toBe("Home");
  });

  it("abortTransaction 丢弃事务且不留记录，文档回到事务前", () => {
    const { store, rootId } = setup();
    store.beginTransaction({ label: "ai-tx", source: "ai", patches: [] });
    store.applyWithinTransaction(renamePatch(rootId, "A"));
    expect(nameOf(store, rootId)).toBe("A");
    store.abortTransaction();
    expect(nameOf(store, rootId)).toBe("Home");
    expect(store.getState().canUndo).toBe(false);
    expect(store.history().undo).toHaveLength(0);
  });
});

describe("DesignStore jumpTo / reset", () => {
  it("jumpTo 跳到历史中指定条目并改写文档", () => {
    const { store, rootId } = setup();
    store.execute(manualCommand("r1", renamePatch(rootId, "A")));
    store.execute(manualCommand("r2", renamePatch(rootId, "B")));
    expect(store.history().undo).toHaveLength(2);

    const firstId = store.history().undo[0]!.id;
    expect(store.jumpTo(firstId)).toBe(true);
    expect(nameOf(store, rootId)).toBe("A");
  });

  it("jumpTo 不存在的 id 返回 false，文档不变", () => {
    const { store, rootId } = setup();
    store.execute(manualCommand("r1", renamePatch(rootId, "A")));
    expect(store.jumpTo("nope")).toBe(false);
    expect(nameOf(store, rootId)).toBe("A");
  });

  it("reset 清空历史并加载新文档", () => {
    const { store, rootId } = setup();
    store.execute(manualCommand("r1", renamePatch(rootId, "A")));
    const fresh = createDocument("fresh");
    store.reset(fresh);
    expect(store.getState().canUndo).toBe(false);
    expect(store.history().undo).toHaveLength(0);
    expect(store.getDocument().name).toBe("fresh");
  });
});

describe("DesignStore 订阅", () => {
  it("execute 触发监听器，且携带单调递增的 revision", () => {
    const { store, rootId } = setup();
    const seen: number[] = [];
    let calls = 0;
    store.subscribe((s) => {
      calls += 1;
      seen.push(s.revision);
    });
    store.execute(manualCommand("r1", renamePatch(rootId, "A")));
    expect(calls).toBe(1);
    expect(seen[0]).toBeGreaterThan(0);
  });
});
