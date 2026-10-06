import {
  GAME_KIND_STATUS,
  type GameDocument,
  type GameKind,
} from "./index";
import { compileGame, type GamePlan } from "./play";

/**
 * §51 里 Interactive Story / Visual Novel 那两种类型的可玩投影：对话驱动。
 *
 * **这条管线先前只存在于一张状态表里**——`GAME_KIND_STATUS` 写着 `pipeline: "story"`
 * 与"已接入：对话管线的最小实现"，而仓库里没有任何实现，ROADMAP 同时写着
 * "八种类型里只有 2D 这一种有构建管线"。两句话不能同时为真（§159），
 * 所以这里把那句话变成真的：能跑的才算"已接入"。
 *
 * 输入只有 §54 的 `dialogue` 实体：正文来自它的 `notes`，选择来自它指向**其它对话**的引用。
 * 这是刻意的窄——§54 说了对话实体有什么（名字/说明/引用），没说对话有分支脚本语言、
 * 条件跳转、变量或立绘，所以这里一概不编。编不出来的都进 `notes` 对使用者讲明白。
 *
 * 和 `compileGame` 同一条纪律：纯函数、无 React、无 DOM，同一份文档两次编译逐字段相同。
 */

/** 一条可点的选择 */
export interface StoryChoice {
  /** 引用自己的 id（界面上当 key 用） */
  id: string;
  /** 显示文字：优先引用的 `role`，没写就拿目标对话的名字顶上（顶上的次数会在 notes 里报） */
  label: string;
  /** 目标对话的 id */
  to: string;
}

export interface StoryBeat {
  id: string;
  name: string;
  /** 正文 = 对话实体的 `notes`（原样，不做任何"扩写"） */
  text: string;
  /** 正文是空的：界面要说出"作者没写正文"，而不是留一片白让人以为是加载中 */
  textEmpty: boolean;
  choices: StoryChoice[];
  /** 一条有效选择都没有：走到这里就结束了 */
  ending: boolean;
}

export interface StoryPlan {
  name: string;
  summary: string;
  /** 起点：§54 没有"入口"字段，取法见下（取法本身写进 notes） */
  startId: string | null;
  beats: StoryBeat[];
  /** 能开跑吗：一条对话都没有就是不能，这是唯一的硬条件 */
  playable: boolean;
  blockers: string[];
  /** 限度与投影做的每一个解释，界面上要原样显示（与 GamePlan.notes 同一口径） */
  notes: string[];
}

/**
 * 把一份文档编译成对话投影。纯函数。
 *
 * 五条刻意的克制，每条都同时写进 `notes`（只写在注释里等于没说）：
 * 1. **只读 `dialogue`**：文档里其它 10 类实体一律不看，忽略了多少个要报数——
 *    作者标了"互动故事"却写了 60 个敌人时，页面得说"这条管线不读它们"，而不是装作没看见。
 * 2. **正文就是 `notes`**：为空就是空（`textEmpty`），不生成一句开场白。
 * 3. **选项 = 指向其它对话的引用**：指向 NPC/物品的引用不构成分支，报数；
 *    指向已删除实体的悬空引用报数并跳过，不给一个点下去没反应的按钮。
 * 4. **起点没有字段可依**：§54 没有 start/entry，所以取"没有被任何对话指向的第一条"
 *    （按文档顺序）；全都被人指 → 用第一条并说明；多于一个入口也说明取了哪个。
 * 5. **对话之间允许成环**：模型没有"防止死循环"的约束，播放器负责把重复走过的段落标出来，
 *    这里只负责如实把环画进图里。
 */
export function compileStory(document: GameDocument): StoryPlan {
  const notes: string[] = [
    "正文来自对话实体的「设计说明」（notes），选择来自它指向其它对话的引用——投影不扩写、不生成、不补对话（§159）。",
  ];
  const blockers: string[] = [];

  const dialogues = document.entities.filter((entity) => entity.kind === "dialogue");
  const others = document.entities.length - dialogues.length;
  if (others > 0) {
    notes.push(
      `这份设计里有 ${others} 个非对话实体（敌人/物品/任务/触发器…），这条管线一个都不读——它们只在 2D 关卡投影里有意义。`,
    );
  }

  if (!dialogues.length) {
    blockers.push(
      "这份设计里一条对话实体都没有：对话投影没有可读的内容。去 §54 的「对话」分组加至少一条，或把类型改回 2D 用俯视关卡试玩。",
    );
    return {
      name: document.name,
      summary: document.summary,
      startId: null,
      beats: [],
      playable: false,
      blockers,
      notes,
    };
  }

  const byId = new Map(document.entities.map((entity) => [entity.id, entity]));
  const dialogueIds = new Set(dialogues.map((entity) => entity.id));

  /** 被别的对话指向的 id（只算指向对话的引用） */
  const incoming = new Set<string>();
  let offKindRefs = 0;
  let danglingRefs = 0;
  let labelFallbacks = 0;

  const beats: StoryBeat[] = dialogues.map((entity) => {
    const choices: StoryChoice[] = [];
    for (const ref of entity.refs ?? []) {
      const target = byId.get(ref.to);
      if (!target) {
        danglingRefs += 1;
        continue;
      }
      if (!dialogueIds.has(ref.to)) {
        offKindRefs += 1;
        continue;
      }
      const explicit = ref.role.trim();
      if (!explicit) labelFallbacks += 1;
      choices.push({
        id: ref.id,
        label: explicit || target.name,
        to: ref.to,
      });
      incoming.add(ref.to);
    }
    const text = entity.notes ?? "";
    return {
      id: entity.id,
      name: entity.name,
      text,
      textEmpty: text.trim().length === 0,
      choices,
      ending: choices.length === 0,
    };
  });

  // 起点：没人指向的那几条（按文档顺序）。全都被人指 → 第一条并说明。
  const roots = beats.filter((beat) => !incoming.has(beat.id));
  const start = roots[0] ?? beats[0]!;
  if (!roots.length) {
    notes.push(
      "每一条对话都有别的对话指向它（成环了）：没有天然入口，起点按文档顺序取第一条。",
    );
  } else if (roots.length > 1) {
    const unreachable = roots.slice(1).map((beat) => beat.name);
    notes.push(
      `这份设计有 ${roots.length} 条互不相连的对话线，起点取第一条（${start.name}），从这里走不到的 ${unreachable.length} 条是：${unreachable
        .slice(0, 5)
        .join("、")}${unreachable.length > 5 ? ` 等 ${unreachable.length} 条` : ""}——` +
        `它们不是"没有内容"，是这条线没接上。`,
    );
  }

  if (offKindRefs) {
    notes.push(
      `有 ${offKindRefs} 条引用指向的不是对话（NPC、物品、任务…），对话投影不把它们当选项：§54 说了引用是谁，没说非对话实体在故事里怎么走。`,
    );
  }
  if (danglingRefs) {
    notes.push(`有 ${danglingRefs} 条引用指向的实体不在文档里（已被删除），这些选项被跳过——给一个点下去没反应的按钮更糟。`);
  }
  if (labelFallbacks) {
    notes.push(
      `有 ${labelFallbacks} 个选项没写关系文字（引用的 role 是空的），投影拿目标对话的名字顶上——顶替来自投影，不是作者写下的选项词。`,
    );
  }
  const emptyTexts = beats.filter((beat) => beat.textEmpty).length;
  if (emptyTexts) {
    notes.push(`有 ${emptyTexts} 条对话的设计说明是空的：正文照实为空白，投影不替作者补一句开场白。`);
  }
  const endings = beats.filter((beat) => beat.ending).length;
  if (endings) {
    notes.push(`${endings} 条对话没有任何出边，走到那里就结束了——没有"结局画面"这种东西，只是没有下一段。`);
  }
  notes.push("对话之间可以互相指成环：播放时重复走过的段落会被标出来，模型里没有防环约束。");

  return {
    name: document.name,
    summary: document.summary,
    startId: start.id,
    beats,
    playable: true,
    blockers,
    notes,
  };
}

/** 一份文档按它自己标的类型编译出来的投影；`pipeline: null` = 这个类型今天没接 */
export type GameProjection =
  | { pipeline: "topdown"; view: "topdown" | "isometric" | "3d"; plan: GamePlan }
  | { pipeline: "story"; plan: StoryPlan }
  | { pipeline: null; reason: string };

/**
 * 类型 → 管线的**唯一分派点**。两个试玩入口（作者自己的 `/game/<项目>` 与公开的
 * `/n/<handle>/<slug>/play`）都必须走这里：各写一遍判断，迟早变成"一个页面说没接、
 * 另一个页面硬跑 2D 关卡"（§16：同一份模型的投影不许各说各话）。
 *
 * 分派按 `document.kind`，不按"文档里有什么"——类型是作者的选择（§51），
 * 内容判断会让"标了 3D 却写了一堆对话"静默降级成对话游戏，那是替作者做决定。
 * 同一条管线有几种画法（2D 俯视 / 2.5D 等轴测）也由这张状态表决定，这里只负责原样带出去。
 */
export function compileForKind(document: GameDocument): GameProjection {
  const kind: GameKind = document.kind;
  const status = GAME_KIND_STATUS[kind];
  if (status.pipeline === "topdown") {
    return { pipeline: "topdown", view: status.view ?? "topdown", plan: compileGame(document) };
  }
  if (status.pipeline === "story") return { pipeline: "story", plan: compileStory(document) };
  return { pipeline: null, reason: status.note };
}
