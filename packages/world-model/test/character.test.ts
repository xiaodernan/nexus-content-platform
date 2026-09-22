import { describe, expect, it } from "vitest";
import {
  addRelationship,
  createCharacter,
  createWorld,
  emptyProfile,
  linesToList,
  listToLines,
  removeRelationshipAt,
  validateCharacter,
  validateCharacterAgainstWorld,
  withProfile,
  type Character,
} from "../src/index";

/**
 * §46 角色档案。守的仍然是那两条：模板不是内容（建档不许替用户编性格），
 * 以及改动换出新对象（面板与后续事务都依赖这条）。
 */

const character = (): Character => createCharacter({ name: "守夜人", projectId: "p-1", worldId: "w-1" });

describe("createCharacter（只给骨架）", () => {
  it("名字之外全空：性格、目标、色板一个都不预设", () => {
    const c = character();
    expect(c.profile.name).toBe("守夜人");
    expect(c.profile).toEqual(emptyProfile("守夜人"));
    expect(c.profile.goals).toEqual([]);
    expect(c.profile.relationships).toEqual([]);
    expect(c.profile.visualIdentity.palette).toEqual([]);
    expect(validateCharacter(c).map((i) => i.code)).toEqual([]);
  });

  it("名字空白不假装建好了", () => {
    expect(createCharacter({ name: "  陈  " }).profile.name).toBe("陈");
    expect(createCharacter({ name: "   " }).profile.name).toBe("");
    expect(validateCharacter(createCharacter({ name: "   " })).map((i) => i.code)).toContain("missing-name");
  });
});

describe("档案改动", () => {
  it("withProfile 换出新对象，原角色不动", () => {
    const c = character();
    const next = withProfile(c, { personality: "话少，记得路" });
    expect(next).not.toBe(c);
    expect(c.profile.personality).toBe("");
    expect(next.profile.personality).toBe("话少，记得路");
    expect(Date.parse(next.updatedAt)).toBeGreaterThanOrEqual(Date.parse(c.updatedAt));
  });

  it("多行文本与列表字段互为逆运算，空行不算条目", () => {
    expect(linesToList(" 看到日出\n\n失去更多\n")).toEqual(["看到日出", "失去更多"]);
    expect(listToLines(["a", "b"])).toBe("a\nb");
    expect(linesToList("")).toEqual([]);
  });

  it("关系：加一条、删一条；删越界不动文档", () => {
    let c = character();
    c = addRelationship(c, { target: "wn-faction", kind: "效忠", note: "  盟约的私生子  " });
    expect(c.profile.relationships[0]).toEqual({ target: "wn-faction", kind: "效忠", note: "盟约的私生子" });
    const without = removeRelationshipAt(c, 0);
    expect(without.profile.relationships).toEqual([]);
    expect(removeRelationshipAt(c, 9).profile.relationships).toHaveLength(1);
    // 原对象不受影响
    expect(c.profile.relationships).toHaveLength(1);
  });
});

describe("validateCharacter", () => {
  it("空目标、空关系名、重复关系、非十六进制色值都报出来", () => {
    let c = character();
    c = withProfile(c, {
      relationships: [
        { target: "", kind: "效忠", note: "" },
        { target: "wn-1", kind: "  ", note: "" },
        { target: "wn-2", kind: "师徒", note: "" },
        { target: "wn-2", kind: "师徒", note: "" },
      ],
      visualIdentity: { palette: ["#1b1205", "红色"], silhouette: "", motifs: [], referenceAssetId: null },
    });
    const codes = validateCharacter(c).map((i) => i.code);
    expect(codes).toContain("empty-relationship-target");
    expect(codes).toContain("empty-relationship-kind");
    expect(codes).toContain("duplicate-relationship");
    expect(codes).toContain("bad-palette");
  });
});

describe("关系与世界文档的连通性（§44/§45 之后才有意义）", () => {
  it("指向世界条目的关系算有效；指向不存在条目的报断链", () => {
    const world = createWorld("低语诸王");
    const faction = world.nodes.find((n) => n.kind === "factions")!;
    const c = addRelationship(character(), { target: faction.id, kind: "效忠" });
    expect(validateCharacterAgainstWorld(c, world, [])).toEqual([]);

    const dangling = addRelationship(c, { target: "wn-不存在", kind: "仇恨" });
    const issues = validateCharacterAgainstWorld(dangling, world, []);
    expect(issues.map((i) => i.code)).toContain("dangling-relationship");
    // 目标是另一个角色时不算断链（名单里有它就行）
    expect(validateCharacterAgainstWorld(dangling, world, ["wn-不存在"])).toHaveLength(0);
    // 没给角色名单时不判（避免把"还没加载完"报成断链）
    expect(validateCharacterAgainstWorld(dangling, world)).toEqual([]);
  });

  it("没有世界时只做档案内的校验，不冤枉关系字段", () => {
    const c = addRelationship(character(), { target: "wn-any", kind: "效忠" });
    expect(validateCharacterAgainstWorld(c, null).map((i) => i.code)).toEqual([]);
  });
});
