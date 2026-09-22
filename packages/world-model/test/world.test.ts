import { describe, expect, it } from "vitest";
import {
  WORLD_KINDS,
  WORLD_KIND_LABELS,
  addWorldNode,
  GRAPH_COLUMN_GAP,
  GRAPH_ORIGIN,
  GRAPH_ROW_GAP,
  autoLayout,
  countLinksFor,
  createWorld,
  findWorldNode,
  linkWorldNodes,
  setWorldNodePosition,
  worldGraph,
  worldPositions,
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

describe("§45 关系与图投影", () => {
  const withCast = () => {
    let world = createWorld("诸王纪元");
    world = addWorldNode(world, { kind: "characters", title: "守夜人" });
    world = addWorldNode(world, { kind: "factions", title: "苍雪盟约" });
    return {
      world,
      character: world.nodes.find((n) => n.title === "守夜人")!,
      faction: world.nodes.find((n) => n.title === "苍雪盟约")!,
    };
  };

  it("连一条有向边：文档换新的，端点与标签都记下来", () => {
    const { world, character, faction } = withCast();
    const { document, reason } = linkWorldNodes(world, character.id, faction.id, "效忠");
    expect(reason).toBeNull();
    expect(document.links).toHaveLength(1);
    expect(document.links[0]).toMatchObject({ from: character.id, to: faction.id, label: "效忠" });
    expect(world.links).toHaveLength(0);
  });

  it("自环、端点不存在、重复关系都不写库，但一定给出原因（§159 不静默丢弃）", () => {
    const { world, character, faction } = withCast();
    const self = linkWorldNodes(world, character.id, character.id);
    expect(self.reason).toContain("自己");
    expect(self.document).toBe(world);

    const ghost = linkWorldNodes(world, character.id, "wn-不存在");
    expect(ghost.reason).toContain("不在这个世界");
    expect(ghost.document).toBe(world);

    const once = linkWorldNodes(world, character.id, faction.id, "效忠").document;
    const twice = linkWorldNodes(once, character.id, faction.id, "效忠");
    expect(twice.reason).toContain("已经这样连着");
    expect(twice.document.links).toHaveLength(1);
    // 反向是另一条关系：有向图不把它当重复
    expect(linkWorldNodes(once, faction.id, character.id, "册封").reason).toBeNull();
  });

  it("删条目会带走挂在它身上的边和位置", () => {
    const { world, character, faction } = withCast();
    let doc = linkWorldNodes(world, character.id, faction.id, "效忠").document;
    doc = setWorldNodePosition(doc, character.id, { x: 10, y: 20 });
    doc = setWorldNodePosition(doc, faction.id, { x: 30, y: 40 });
    expect(countLinksFor(doc, character.id)).toBe(1);
    const after = removeWorldNode(doc, character.id);
    expect(after.links).toEqual([]);
    expect(after.positions[character.id]).toBeUndefined();
    expect(after.positions[faction.id]).toEqual({ x: 30, y: 40 });
    expect(validateWorld(after)).toEqual([]);
  });

  it("autoLayout 是确定的：同类同列、按加入顺序往下堆，两次调用一模一样", () => {
    const { world } = withCast();
    const a = autoLayout(world);
    const b = autoLayout(world);
    expect(a).toEqual(b);
    const lore = world.nodes.filter((n) => n.kind === "lore").map((n) => a[n.id]!);
    const history = world.nodes.filter((n) => n.kind === "history").map((n) => a[n.id]!);
    const characters = world.nodes.filter((n) => n.kind === "characters").map((n) => a[n.id]!);
    expect(lore[0]!.x).toBe(GRAPH_ORIGIN.x);
    expect(history[0]!.x).toBe(GRAPH_ORIGIN.x + GRAPH_COLUMN_GAP);
    // 同一类里的第二条排在第一条下面
    expect(characters).toHaveLength(2);
    expect(characters[1]!.y - characters[0]!.y).toBe(GRAPH_ROW_GAP);
    expect(characters[1]!.x).toBe(GRAPH_ORIGIN.x + WORLD_KINDS.indexOf("characters") * GRAPH_COLUMN_GAP);
  });

  it("拖过的位置优先于 autoLayout", () => {
    const { world, character } = withCast();
    const moved = setWorldNodePosition(world, character.id, { x: 999, y: 888 });
    expect(worldPositions(moved)[character.id]).toEqual({ x: 999, y: 888 });
    // 没拖过的仍然按自动排布给坐标，图不会空
    const untouched = moved.nodes.find((n) => n.id !== character.id)!;
    expect(worldPositions(moved)[untouched.id]).toEqual(autoLayout(moved)[untouched.id]);
    expect(setWorldNodePosition(moved, "wn-不存在", { x: 1, y: 2 })).toBe(moved);
  });

  it("worldGraph 给出带坐标的节点与边；断链画不出来，但校验会报", () => {
    const { world, character, faction } = withCast();
    const linked = linkWorldNodes(world, character.id, faction.id, "效忠").document;
    const graph = worldGraph(linked);
    expect(graph.nodes.length).toBe(linked.nodes.length);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]!.from.title).toBe("守夜人");
    expect(graph.edges[0]!.to.x).toBeGreaterThan(0);

    const dangling: WorldDocument = {
      ...linked,
      nodes: linked.nodes.filter((n) => n.id !== faction.id),
    };
    expect(worldGraph(dangling).edges).toEqual([]);
    expect(validateWorld(dangling).map((i) => i.code)).toContain("missing-endpoint");
  });
});
