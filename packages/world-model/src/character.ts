/**
 * §46 Character System：角色档案。
 *
 * 和 §44 的世界文档同一条纪律：档案是唯一真值，面板、角色对话（§47）、
 * 视觉一致性（§39）都是它的投影。纯 TS、无 IO。
 *
 * 两条刻意的"不做"：
 * - **不替用户编性格**。`createCharacter` 只给空档案（名字之外全空），
 *   填内容是用户的事；AI 生成档案要真 provider，没接之前那是假生成（§159）。
 * - **没有 `memory` 字段**。§48 的记忆是独立存储（按 scope + subjectId 索引，可查看可删除），
 *   在档案里塞一个文本框当"记忆"会造出第二个记忆真值，两边迟早对不上。
 */

import type { WorldDocument } from "./index";

export interface CharacterRelationship {
  /** 另一个角色 id，或世界里的条目 id（§44/§45）；空字符串表示还没指向任何东西 */
  target: string;
  /** 关系叫什么：效忠 / 仇恨 / 师徒…… 由用户写，不给预设枚举 */
  kind: string;
  note: string;
}

export interface CharacterVoice {
  /** 语域：低沉 / 尖利 / 书面腔…… */
  register: string;
  pace: string;
  catchphrases: string[];
  notes: string;
}

export interface CharacterVisualIdentity {
  /** 十六进制色值，§39 的一致性锚点之一 */
  palette: string[];
  silhouette: string;
  motifs: string[];
  /** 指向项目资产库里的参考图（§38）；没有就是 null */
  referenceAssetId: string | null;
}

export interface CharacterProfile {
  name: string;
  appearance: string;
  personality: string;
  backstory: string;
  goals: string[];
  fears: string[];
  relationships: CharacterRelationship[];
  voice: CharacterVoice;
  visualIdentity: CharacterVisualIdentity;
  /** §39：稳定不变的那部分——五官、疤痕、标记。换场景换衣服也不改这一栏 */
  identity: string;
  /** §39：画这个角色的方式（渲染/笔触/媒介），与"长什么样"分开存 */
  style: string;
  /** §39：穿什么。场景之间可以换，但换过要记下来，下一张才接得上 */
  clothing: string;
  /** §39：几个短标签式的显著特征，供检索与生成时点名 */
  traits: string[];
}

export interface Character {
  id: string;
  projectId: string | null;
  worldId: string | null;
  profile: CharacterProfile;
  createdAt: string;
  updatedAt: string;
}

export type CharacterIssueCode =
  | "missing-name"
  | "empty-relationship-target"
  | "empty-relationship-kind"
  | "duplicate-relationship"
  | "bad-palette"
  | "unknown-world-kind"
  | "dangling-relationship";

export interface CharacterIssue {
  code: CharacterIssueCode;
  message: string;
  path: string;
}

let counter = 0;
function uid(prefix: string): string {
  counter += 1;
  const now = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1679616)
    .toString(36)
    .padStart(4, "0");
  return `${prefix}_${now}${counter.toString(36)}${rand}`;
}

const stamp = (): string => new Date().toISOString();

export function emptyProfile(name = ""): CharacterProfile {
  return {
    name,
    appearance: "",
    personality: "",
    backstory: "",
    goals: [],
    fears: [],
    relationships: [],
    voice: { register: "", pace: "", catchphrases: [], notes: "" },
    visualIdentity: { palette: [], silhouette: "", motifs: [], referenceAssetId: null },
    identity: "",
    style: "",
    clothing: "",
    traits: [],
  };
}

/** 只建骨架：除了名字，其它字段一律留空等用户填 */
export function createCharacter(input: {
  name: string;
  projectId?: string | null;
  worldId?: string | null;
}): Character {
  const at = stamp();
  return {
    id: uid("chr"),
    projectId: input.projectId ?? null,
    worldId: input.worldId ?? null,
    profile: emptyProfile(input.name.trim()),
    createdAt: at,
    updatedAt: at,
  };
}

/** 改档案：换出新对象并刷新时间戳，不原地改（同 §44 的纪律） */
export function withProfile(
  character: Character,
  patch: Partial<CharacterProfile>,
): Character {
  return {
    ...character,
    profile: { ...character.profile, ...patch },
    updatedAt: stamp(),
  };
}

/** 多行文本 ↔ 列表字段：面板里用 textarea，模型里存数组，空行不算条目 */
export function linesToList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function listToLines(list: readonly string[]): string {
  return list.join("\n");
}

export function addRelationship(
  character: Character,
  input: { target: string; kind: string; note?: string },
): Character {
  const relationship: CharacterRelationship = {
    target: input.target.trim(),
    kind: input.kind.trim(),
    note: (input.note ?? "").trim(),
  };
  return withProfile(character, {
    relationships: [...character.profile.relationships, relationship],
  });
}

export function removeRelationshipAt(character: Character, index: number): Character {
  if (index < 0 || index >= character.profile.relationships.length) return character;
  return withProfile(character, {
    relationships: character.profile.relationships.filter((_, i) => i !== index),
  });
}

const HEX = /^#[0-9a-f]{3,8}$/i;

export function validateCharacter(character: Character): CharacterIssue[] {
  const issues: CharacterIssue[] = [];
  const profile = character.profile;
  if (!profile.name.trim()) {
    issues.push({ code: "missing-name", message: "角色没有名字", path: "profile.name" });
  }
  const seen = new Set<string>();
  profile.relationships.forEach((rel, index) => {
    const path = `profile.relationships.${index}`;
    if (!rel.target.trim()) {
      issues.push({
        code: "empty-relationship-target",
        message: "有条关系没有指向任何对象",
        path: `${path}.target`,
      });
    }
    if (!rel.kind.trim()) {
      issues.push({
        code: "empty-relationship-kind",
        message: "有条关系没有名字：谁和谁，但不知道是什么关系",
        path: `${path}.kind`,
      });
    }
    const key = `${rel.target}→${rel.kind}`;
    if (seen.has(key)) {
      issues.push({
        code: "duplicate-relationship",
        message: `重复的关系：${key}`,
        path,
      });
    }
    seen.add(key);
  });
  profile.visualIdentity.palette.forEach((color, index) => {
    if (!HEX.test(color)) {
      issues.push({
        code: "bad-palette",
        message: `色板第 ${index + 1} 项「${color}」不是十六进制色值`,
        path: `profile.visualIdentity.palette.${index}`,
      });
    }
  });
  return issues;
}

/**
 * 关系指向世界条目时，目标必须真的存在（§44/§45 之后才有意义）。
 * 目标 id 既可能是世界条目，也可能是另一个角色——角色那半边由调用方给 `knownCharacterIds`，
 * 不给就不判（避免把"我还没加载完角色列表"误报成断链）。
 */
export function validateCharacterAgainstWorld(
  character: Character,
  world: WorldDocument | null,
  knownCharacterIds?: Iterable<string>,
): CharacterIssue[] {
  const issues = validateCharacter(character);
  if (!world) return issues;
  const nodeIds = new Set(world.nodes.map((n) => n.id));
  const characterIds = knownCharacterIds ? new Set(knownCharacterIds) : null;
  character.profile.relationships.forEach((rel, index) => {
    const target = rel.target.trim();
    if (!target || nodeIds.has(target)) return;
    // 没给角色名单时不判：目标可能是另一个还没加载出来的角色，报断链是冤枉
    if (characterIds === null || characterIds.has(target)) return;
    issues.push({
      code: "dangling-relationship",
      message: `「${character.profile.name || "这个角色"}」的一条关系指向不存在的世界条目（${target}）`,
      path: `profile.relationships.${index}.target`,
    });
  });
  return issues;
}
