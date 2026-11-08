import { describe, expect, it } from "vitest";
import {
  createDocument,
  createPage,
  hasClickNavigation,
  isTerminalInteractivePage,
  navigateTargetsOnPage,
  type DesignDocument,
} from "../src";

/** 起手文档 + 一页空白 Next；把第一页第一个非根节点接上一条交互（目标页 id 由回调给） */
function withFlow(make: (nextPageId: string) => Record<string, unknown>): {
  document: DesignDocument;
  fromNodeId: string;
  nextPageId: string;
} {
  const document = createDocument("互动测试");
  const next = createPage("Next");
  document.pages.push(next);
  const home = document.pages[0]!;
  const fromNodeId = Object.keys(home.nodes).find((id) => id !== home.rootId)!;
  home.nodes[fromNodeId]!.interactions = [{ id: "i1", ...make(next.id) } as never];
  return { document, fromNodeId, nextPageId: next.id };
}

describe("§167 互动流程的模型判定", () => {
  it("click + navigate + 指向另一页 ⇒ 这一页有下一跳，目标页是终点", () => {
    const { document, fromNodeId, nextPageId } = withFlow((target) => ({ trigger: "click", action: "navigate", target }));
    expect(navigateTargetsOnPage(document, document.activePageId)).toEqual({ [fromNodeId]: nextPageId });
    expect(hasClickNavigation(document)).toBe(true);
    expect(isTerminalInteractivePage(document, document.activePageId)).toBe(false);
    expect(isTerminalInteractivePage(document, nextPageId)).toBe(true);
  });

  it("默认文档没有交互 ⇒ 不是互动作品，首页也不是终点（没有终点可言）", () => {
    const document = createDocument("静态");
    expect(hasClickNavigation(document)).toBe(false);
    expect(navigateTargetsOnPage(document, document.activePageId)).toEqual({});
    expect(isTerminalInteractivePage(document, document.activePageId), "静态页不能被当成互动流程的终点").toBe(false);
  });

  it("只认 click + navigate：hover / submit / open-modal / 自指 / 断链都不算下一跳", () => {
    const document = createDocument("各种交互");
    const next = createPage("Next");
    document.pages.push(next);
    const home = document.pages[0]!;
    const ids = Object.keys(home.nodes).filter((id) => id !== home.rootId);
    const put = (nodeId: string, interaction: Record<string, unknown>): void => {
      home.nodes[nodeId]!.interactions = [{ id: `i-${nodeId}`, ...interaction } as never];
    };
    put(ids[0]!, { trigger: "hover-in", action: "navigate", target: next.id });
    put(ids[1]!, { trigger: "click", action: "open-modal", target: next.id });
    put(ids[2]!, { trigger: "submit", action: "submit" });
    put(ids[3]!, { trigger: "click", action: "navigate", target: home.id });
    put(ids[4]!, { trigger: "click", action: "navigate", target: "page-does-not-exist" });
    expect(navigateTargetsOnPage(document, home.id), "这些都不是公开页今天能做的换页").toEqual({});
    expect(hasClickNavigation(document)).toBe(false);
    expect(isTerminalInteractivePage(document, next.id), "文档没有可走通的流程 ⇒ 任何页都不是互动终点").toBe(false);
  });

  it("一个节点挂多条：前面的都不成立时取第一条成立的那条", () => {
    const { document, fromNodeId, nextPageId } = withFlow(() => ({ trigger: "hover-in", action: "navigate" }));
    const home = document.pages[0]!;
    home.nodes[fromNodeId]!.interactions = [
      { id: "i1", trigger: "hover-in", action: "navigate", target: nextPageId },
      { id: "i2", trigger: "click", action: "navigate", target: nextPageId },
    ];
    expect(navigateTargetsOnPage(document, home.id)).toEqual({ [fromNodeId]: nextPageId });
  });

  it("不存在的页既没有下一跳也不是终点（读不到的东西不能算走通）", () => {
    const { document } = withFlow(() => ({ trigger: "click", action: "navigate" }));
    expect(navigateTargetsOnPage(document, "no-such-page")).toEqual({});
    expect(isTerminalInteractivePage(document, "no-such-page")).toBe(false);
  });
});
