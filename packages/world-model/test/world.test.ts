import { describe, expect, it } from "vitest";
import {
  WORLD_KINDS,
  WORLD_KIND_LABELS,
  addWorldNode,
  createWorld,
  findWorldNode,
  nodesOfKind,
  removeWorldNode,
  updateWorldNode,
  validateWorld,
  worldCounts,
  type WorldDocument,
} from "../src/index";

/**
 * §44 世界模型。守两件事：模板不是内容（不许替用户编世界观，§159），
 * 以及所有改动都是**换出新文档**而不是原地改（面板与后续事务栈都依赖这条）。
 */

describe("createWorld（模板骨架）", () => {
  it("九类各一条，正文全空：那是脚手架，不是生成的内容", () => {
    const world = createWorld("黑暗奇幻", "proj-1");
    expect(world.nodes.map((n) => n.kind)).toEqual([...WORLD_KINDS]);
    expect(world.nodes.every((n) => n.body === "")).toBe(true);
    expect(world.nodes.map((n) => n.title)).toEqual(WORLD_KINDS.map((k) => WORLD_KIND_LABELS[k]));
    expect(world.projectId).toBe("proj-1");
    expect(validateWorld(world)).toEqual([]);
  });

  it("名字空白时不假装有个名字", () => {
    expect(createWorld("   ").name).toBe("未命名世界");
  });

  it("id 不重复", () => {
    const ids = new Set(createWorld("x").nodes.map((n) => n.id));
    expect(ids.size).toBe(WORLD_KINDS.length);
  });
});

describe("增删改", () => {
  it("每次都换出新文档，原文档不动（真值只有一份，但历史不能靠原地改）", () => {
    const world = createWorld("不可变");
    const next = addWorldNode(world, { kind: "items", title: "会唱歌的钥匙" });
    expect(next).not.toBe(world);
    expect(world.nodes).toHaveLength(WORLD_KINDS.length);
    expect(next.nodes).toHaveLength(WORLD_KINDS.length + 1);
    expect(findWorldNode(world, next.nodes[next.nodes.length - 1]!.id)).toBeUndefined();
  });

  it("改标题会刷新条目与文档两级时间戳", () => {
    const world = createWorld("时间戳");
    const target = world.nodes[0]!;
    const next = updateWorldNode(world, target.id, { title: "起源新说" });
    const after = findWorldNode(next, target.id)!;
    expect(after.title).toBe("起源新说");
    expect(Date.parse(after.updatedAt)).toBeGreaterThanOrEqual(Date.parse(target.updatedAt));
    expect(Date.parse(next.updatedAt)).toBeGreaterThanOrEqual(Date.parse(world.updatedAt));
  });

  it("改一个不存在的条目：文档原样返回，不产生假的时间戳变化", () => {
    const world = createWorld("没这条");
    const next = updateWorldNode(world, "wn-不存在", { title: "算了" });
    expect(next).toBe(world);
    expect(removeWorldNode(world, "wn-不存在")).toBe(world);
  });

  it("删掉一类是合法选择：九类骨架不是不可减的清单", () => {
    let world = createWorld("删空");
    const creatures = nodesOfKind(world, "creatures")[0]!;
    world = removeWorldNode(world, creatures.id);
    expect(nodesOfKind(world, "creatures")).toEqual([]);
    expect(validateWorld(world)).toEqual([]);
    expect(worldCounts(world).creatures).toBe(0);
  });

  it("空白标题回落到类名：条目总得有名字，但不因此拒绝用户的保存", () => {
    const world = addWorldNode(createWorld("回落"), { kind: "quests", title: "   " });
    expect(world.nodes[world.nodes.length - 1]!.title).toBe(WORLD_KIND_LABELS.quests);
  });
});

describe("validateWorld", () => {
  const broken = (patch: Partial<WorldDocument>): WorldDocument => ({
    ...createWorld("坏数据"),
    ...patch,
  });

  it("未知类型、空标题、重复 id、坏时间戳都会报出来", () => {
    const world = broken({});
    const first = world.nodes[0]!;
    const issues = validateWorld({
      ...world,
      nodes: [
        { ...first, kind: "vibes" as WorldDocument["nodes"][number]["kind"] },
        { ...first },
        { ...world.nodes[1]!, title: "  " },
        { ...world.nodes[2]!, updatedAt: "昨天" },
      ],
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("bad-kind");
    expect(codes).toContain("duplicate-id");
    expect(codes).toContain("empty-title");
    expect(codes).toContain("bad-timestamp");
  });

  it("没名字的世界是结构性问题，单独报一条", () => {
    expect(validateWorld(broken({ name: "  " })).map((i) => i.code)).toContain("missing-name");
  });
});
