import { describe, expect, it } from "vitest";
import {
  addEntity,
  compileForKind,
  compileStory,
  createGame,
  entitiesOfKind,
  linkEntities,
  removeEntity,
  updateEntity,
  EVENT_CAP,
  STORY_NO_BEATS_OUTCOME,
  storyInitial,
  storyStep,
  storySummary,
  GAME_KIND_STATUS,
  type GameDocument,
  type StoryPlan,
} from "../src/index";

/**
 * §51 的对话管线。这里钉的全是"会不会说谎"，与 play.test.ts 同一套纪律：
 * 正文是不是作者写的那份、没接的东西有没有被说成接了、跳过的选项有没有被藏起来。
 *
 * 每条负面断言都配一个同一次运行里的正向对照——一个恒返回 `playable: true`、
 * 或一个把悬空引用吞掉不报数的实现，只有对照能抓出来。
 */

/** 造一份只有对话的文档：删光模板那 11 个空实体，避免模板名字混进断言 */
function emptyStory(name: string): GameDocument {
  let doc = createGame(name);
  for (const entity of [...doc.entities]) {
    doc = removeEntity(doc, entity.id);
  }
  return doc;
}

/** 加一条对话（正文可选），返回新文档与它的 id */
function talk(doc: GameDocument, name: string, notes = ""): { document: GameDocument; id: string } {
  const next = addEntity(doc, { kind: "dialogue", name, notes });
  const created = entitiesOfKind(next, "dialogue").find((e) => e.name === name)!;
  return { document: next, id: created.id };
}

function link(doc: GameDocument, from: string, to: string, role: string): GameDocument {
  const result = linkEntities(doc, from, to, role);
  if (result.reason) throw new Error(`前置引用失败：${result.reason}`);
  return result.document;
}

describe("compileStory：正文与选项从哪来", () => {
  it("正文就是对话实体的 notes，一个字都不改；空 notes 标成 textEmpty 而不是补开场白", () => {
    let doc = emptyStory("正文");
    const written = talk(doc, "开场", "你终于来了。");
    doc = written.document;
    doc = talk(doc, "沉默").document; // 没写正文

    const plan = compileStory(doc);
    const spoken = plan.beats.find((b) => b.id === written.id)!;
    expect(spoken.text).toBe("你终于来了。");
    expect(spoken.textEmpty).toBe(false);
    const silent = plan.beats.find((b) => b.name === "沉默")!;
    expect(silent.textEmpty).toBe(true);
    expect(silent.text).toBe("");
    // 正文为空必须被说出来，否则界面上那片空白会被读成"加载中"
    expect(plan.notes.join(" ")).toContain("设计说明是空的");
    // 正向对照：写了正文的那条，投影没有替它添一个字
    expect(spoken.text).not.toContain("投影");
  });

  it("选项 = 指向其它对话的引用；role 是选项文字，role 空时拿目标名字顶上并报数", () => {
    let doc = emptyStory("选项");
    const a = talk(doc, "第一句");
    doc = a.document;
    const b = talk(doc, "第二句");
    doc = b.document;
    const c = talk(doc, "另一句");
    doc = c.document;
    doc = link(doc, a.id, b.id, "继续"); // 写了 role
    doc = link(doc, a.id, c.id, ""); // 没写 role

    const plan = compileStory(doc);
    const first = plan.beats.find((beat) => beat.id === a.id)!;
    expect(first.choices).toHaveLength(2);
    expect(first.choices[0]).toMatchObject({ label: "继续", to: b.id });
    // 没写 role 的那条：顶成目标名字，并且顶替这件事被报出来（顶替来自投影，不是作者写的词）
    expect(first.choices[1]!.label).toBe("另一句");
    expect(plan.notes.join(" ")).toContain("1 个选项没写关系文字");
    // 正向对照：写了 role 的那条不参与"顶替"计数——报 1，不是 2
    expect(plan.notes.join(" ")).not.toContain("2 个选项没写关系文字");
  });

  it("指向非对话的引用不算选项（报数）；悬空引用被跳过（单独报数）", () => {
    let doc = emptyStory("不该算的边");
    const withEnemy = addEntity(doc, { kind: "enemy", name: "站岗的" });
    const a = talk(withEnemy, "起点");
    doc = a.document;
    const enemy = entitiesOfKind(doc, "enemy").find((e) => e.name === "站岗的")!;
    doc = link(doc, a.id, enemy.id, "聊两句"); // 指向敌人：不是对话
    // 悬空引用手工塞：模型层（linkEntities 端点存在 + removeEntity 两头清）造不出这种数据，
    // 但库里可能躺着历史脏文档——投影读到它不能崩，也不能把这条边悄悄当有效选项
    doc = {
      ...doc,
      entities: doc.entities.map((entity) =>
        entity.id === a.id
          ? { ...entity, refs: [...entity.refs, { id: "r-ghost", to: "已删除的实体", role: "去看看" }] }
          : entity,
      ),
    };

    const plan = compileStory(doc);
    const beat = plan.beats.find((b) => b.id === a.id)!;
    expect(beat.choices).toHaveLength(0);
    expect(beat.ending).toBe(true);
    const text = plan.notes.join(" ");
    expect(text).toContain("1 条引用指向的不是对话");
    expect(text).toContain("1 条引用指向的实体不在文档里");
    // 正向对照：两类各有各的计数，没有混成一笔
    expect(text).not.toContain("2 条引用指向的不是对话");
    expect(text).not.toContain("2 条引用指向的实体不在文档里");
  });
});

describe("compileStory：起点与形状", () => {
  it("起点取没有入边的第一条（文档顺序）；多于一条入口时把走不到的那几条说出来", () => {
    let doc = emptyStory("两条线");
    const a = talk(doc, "甲线开头");
    doc = a.document;
    const b = talk(doc, "乙线开头");
    doc = b.document;
    const mid = talk(doc, "甲线中段");
    doc = mid.document;
    doc = link(doc, a.id, mid.id, "继续");

    const plan = compileStory(doc);
    expect(plan.startId).toBe(a.id); // 甲线在前
    expect(plan.notes.join(" ")).toContain("2 条互不相连的对话线");
    expect(plan.notes.join(" ")).toContain("乙线开头");
    // 反向对照 A：只有一条线时不许出现"另一条线走不到"这种话。
    // 真正的控制是**少一条线**——给乙线改个名不会把两条线变成一条（上一版在这里就是这么写的）
    let single = emptyStory("一条线");
    const only = talk(single, "甲线开头");
    single = only.document;
    const tail = talk(single, "甲线中段");
    single = link(tail.document, only.id, tail.id, "继续");
    expect(compileStory(single).notes.join(" ")).not.toContain("互不相连");

    // 反向对照 B：走不到的那条按**当前名字**报出来，所以改名要跟着变
    const renamed = compileStory(updateEntity(doc, b.id, { name: "乙线改过名" }));
    expect(renamed.notes.join(" ")).toContain("乙线改过名");
    expect(renamed.notes.join(" ")).not.toContain("乙线开头");
  });

  it("每条对话都有入边（成环）时按文档顺序取第一条，并说明没有天然入口", () => {
    let doc = emptyStory("成环");
    const a = talk(doc, "环一");
    doc = a.document;
    const b = talk(doc, "环二");
    doc = b.document;
    doc = link(doc, a.id, b.id, "走");
    doc = link(doc, b.id, a.id, "回");

    const plan = compileStory(doc);
    expect(plan.startId).toBe(a.id);
    expect(plan.notes.join(" ")).toContain("成环了");
    expect(plan.playable).toBe(true); // 成环不是不能玩，只是要靠播放器标注重复
  });

  it("一条对话都没有：开不了场，blocker 指名原因而不是给一个空页面", () => {
    const plan = compileStory(emptyStory("没有对话"));
    expect(plan.playable).toBe(false);
    expect(plan.startId).toBeNull();
    expect(plan.beats).toHaveLength(0);
    expect(plan.blockers[0]).toContain("一条对话实体都没有");
    expect(plan.blockers[0]).toContain("改回 2D"); // 给一条出路，不是死胡同
  });

  it("其它 10 类实体一个都不读，并把忽略的个数说出来", () => {
    // createGame 的模板正好是 11 类各一个：删掉那条对话，剩 10 个非对话实体
    let doc = createGame("只读对话");
    const [templateTalk] = entitiesOfKind(doc, "dialogue");
    doc = removeEntity(doc, templateTalk!.id);

    const plan = compileStory(doc);
    expect(plan.playable).toBe(false); // 对话被删光了
    expect(plan.notes.join(" ")).toContain("10 个非对话实体");
    // 正向对照：不是"什么都没读所以什么都不说"——忽略了多少是报了数的
    expect(plan.notes.join(" ")).not.toContain("有 0 个非对话实体");
  });

  it("同一份文档两次编译逐字段相同（纯函数）", () => {
    let doc = emptyStory("确定性");
    const a = talk(doc, "第一句", "正文");
    doc = a.document;
    const b = talk(doc, "第二句", "正文二");
    doc = b.document;
    doc = link(doc, a.id, b.id, "继续");
    expect(compileStory(doc)).toEqual(compileStory(doc));
  });
});

describe("compileForKind：类型 → 管线的唯一分派点", () => {
  it("2d 走俯视关卡、2.5d 走同一份计划的等轴测画法，互动故事/视觉小说走对话，RPG 原型走成长循环——八种全部派得出真管线", () => {
    const base = createGame("分派");

    const topdown = compileForKind({ ...base, kind: "2d" });
    expect(topdown.pipeline).toBe("topdown");

    // 2.5D 不是第二条规则：还是 topdown 那条计划，只换画法
    const iso = compileForKind({ ...base, kind: "2.5d" });
    expect(iso.pipeline).toBe("topdown");
    if (iso.pipeline === "topdown" && topdown.pipeline === "topdown") {
      expect(iso.view).toBe("isometric");
      expect(topdown.view).toBe("topdown");
      expect(iso.plan).toEqual(topdown.plan);
    }

    // 3D 同理：three.js 只是另一种画法，规则与数值必须与 2D 逐字段相同（§16）
    const three = compileForKind({ ...base, kind: "3d" });
    expect(three.pipeline).toBe("topdown");
    if (three.pipeline === "topdown" && topdown.pipeline === "topdown") {
      expect(three.view).toBe("3d");
      expect(three.plan).toEqual(topdown.plan);
    }

    // 探索同理（2026-10-06 接上）：走近才看得见是画法，规则与 2D 是同一个 step
    const exploration = compileForKind({ ...base, kind: "exploration" });
    expect(exploration.pipeline).toBe("topdown");
    if (exploration.pipeline === "topdown" && topdown.pipeline === "topdown") {
      expect(exploration.view).toBe("exploration");
      expect(exploration.plan).toEqual(topdown.plan);
    }

    // 解谜同理（2026-10-06 接上）：机关连线是画法，任务判定多了「激活」这一格但规则仍是同一个 step
    const puzzle = compileForKind({ ...base, kind: "puzzle" });
    expect(puzzle.pipeline).toBe("topdown");
    if (puzzle.pipeline === "topdown" && topdown.pipeline === "topdown") {
      expect(puzzle.view).toBe("puzzle");
      expect(puzzle.plan).toEqual(topdown.plan);
    }

    const story = compileForKind({ ...base, kind: "interactive-story" });
    expect(story.pipeline).toBe("story");
    const novel = compileForKind({ ...base, kind: "visual-novel" });
    expect(novel.pipeline).toBe("story");

    // RPG 原型（2026-10-06 接上，§51 最后一种）：新管线，不是 topdown 的画法——
    // 它带成长循环（经验/等级），所以 plan 类型不同；但战斗跑在同一个 step 上，
    // 底层计划与 2D 的逐字段相同（同一个 compileGame 编出来的）
    const rpg = compileForKind({ ...base, kind: "rpg-prototype" });
    expect(rpg.pipeline).toBe("rpg");
    if (rpg.pipeline === "rpg" && topdown.pipeline === "topdown") {
      expect(rpg.plan.base).toEqual(topdown.plan);
      expect(rpg.plan.playable).toBe(true);
    }
  });

  it('状态表说"已接入"的类型，这里一定派得出真管线（表与实现不许各说各话）', () => {
    const doc = createGame("对齐");
    for (const [kind, status] of Object.entries(GAME_KIND_STATUS)) {
      const projection = compileForKind({ ...doc, kind: kind as never });
      if (status.pipeline === null) {
        expect(projection.pipeline).toBeNull();
      } else {
        // 表说有管线 → 分派结果必须是那条管线，不许回落成 null
        expect(projection.pipeline).toBe(status.pipeline);
        // 画法也一样：表说等轴测，分派出来就不许是俯视
        if (projection.pipeline === "topdown") expect(projection.view).toBe(status.view ?? "topdown");
      }
    }
  });
});



/** 一条两段的环：甲 → 乙 → 甲。起点按"文档顺序第一条"取，用来钉重访与成环 */
function loopPlan(): { plan: StoryPlan; a: string; b: string } {
  let doc = emptyStory("环");
  const a = talk(doc, "甲", "第一段");
  doc = a.document;
  const b = talk(doc, "乙", "第二段");
  doc = b.document;
  doc = link(doc, a.id, b.id, "去乙");
  doc = link(doc, b.id, a.id, "回甲");
  return { plan: compileStory(doc), a: a.id, b: b.id };
}

describe("storyInitial / storyStep：播放语义收回模型层（ADR-0046）", () => {
  it("开场就是走过的一段：起点同时记进 trail 与 visited，步数为 0", () => {
    const { plan, a } = loopPlan();
    expect(storyInitial(plan)).toEqual({
      beatId: a,
      trail: [a],
      visited: { [a]: 1 },
      steps: 0,
      loop: false,
      status: "playing",
      outcome: null,
      events: [],
    });
  });

  it("一条对话都没有：状态直接是 ended，摘要说得出当前没有段落", () => {
    const plan = compileStory(emptyStory("没有对话"));
    const state = storyInitial(plan);
    expect(state).toMatchObject({
      beatId: null,
      trail: [],
      visited: {},
      steps: 0,
      loop: false,
      status: "ended",
      outcome: STORY_NO_BEATS_OUTCOME,
    });
    // 结束之后点什么都没用：返回同一个对象，不给"点下去好像动了"的假动作
    expect(storyStep(plan, state, "随便")).toBe(state);
    expect(storySummary(plan, state)).toContain("当前段落：（没有）");
  });

  it("选一项就跳到目标段、记一步并保留走过的顺序；传入的 state 一个字段都不改", () => {
    const { plan, a, b } = loopPlan();
    const state = storyInitial(plan);
    Object.freeze(state.trail);
    Object.freeze(state.visited);
    Object.freeze(state.events);
    const choice = plan.beats.find((beat) => beat.id === a)!.choices.find((entry) => entry.to === b)!;

    const next = storyStep(plan, state, choice.id);
    expect(next).not.toBe(state);
    expect(next.beatId).toBe(b);
    expect(next.steps).toBe(1);
    expect(next.trail).toEqual([a, b]);
    expect(next.visited).toEqual({ [a]: 1, [b]: 1 });
    expect(next.loop).toBe(false);
    expect(next.events).toEqual([]);
    // 原状态没有被这次的推进改掉（React 里可以直接 setState，回放也才可复现）
    expect(state.beatId).toBe(a);
    expect(state.steps).toBe(0);
    expect(state.trail).toEqual([a]);
  });

  it("打不中的选择状态不动：id 不存在、目标段不在计划里，都返回同一个对象", () => {
    const { plan } = loopPlan();
    const state = storyInitial(plan);
    expect(storyStep(plan, state, "根本没有这个选项")).toBe(state);

    // 历史脏数据：选择指向一个不在计划里的段落——不能崩，也不能假装跳了过去
    const startId = plan.startId!;
    const ghost: StoryPlan = {
      ...plan,
      beats: plan.beats.map((beat) =>
        beat.id === startId ? { ...beat, choices: [{ id: "c-ghost", label: "去不存在", to: "不在计划里" }] } : beat,
      ),
    };
    expect(storyStep(ghost, state, "c-ghost")).toBe(state);
  });

  it("走回走过的一段：计数 +1、loop 置真、事件说出回到哪一段；loop 不会落回 false", () => {
    const { plan, a, b } = loopPlan();
    const beatA = plan.beats.find((beat) => beat.id === a)!;
    const beatB = plan.beats.find((beat) => beat.id === b)!;
    let state = storyInitial(plan);
    state = storyStep(plan, state, beatA.choices[0]!.id); // 甲 → 乙
    state = storyStep(plan, state, beatB.choices[0]!.id); // 乙 → 甲（重访）

    expect(state.beatId).toBe(a);
    expect(state.steps).toBe(2);
    expect(state.visited).toEqual({ [a]: 2, [b]: 1 });
    expect(state.loop).toBe(true);
    expect(state.trail).toEqual([a, b, a]);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({ t: 2 });
    expect(state.events[0]!.text).toContain("又回到「甲」");
    expect(state.events[0]!.text).toContain("成环");

    // 再走一步（甲 → 乙，乙也是重访）：loop 仍是 true，计数继续涨
    state = storyStep(plan, state, beatA.choices[0]!.id);
    expect(state.loop).toBe(true);
    expect(state.visited[b]).toBe(2);
    expect(state.events).toHaveLength(2);
  });

  it("事件流有上限（与 sim 同一个 EVENT_CAP）：一圈圈走不会攒下无界事件", () => {
    const { plan, a, b } = loopPlan();
    const beatA = plan.beats.find((beat) => beat.id === a)!;
    const beatB = plan.beats.find((beat) => beat.id === b)!;
    let state = storyInitial(plan);
    const rounds = EVENT_CAP + 12;
    for (let i = 0; i < rounds; i += 1) {
      state = storyStep(plan, state, (state.beatId === a ? beatA : beatB).choices[0]!.id);
    }
    expect(state.steps).toBe(rounds);
    expect(state.events).toHaveLength(EVENT_CAP);
    // 重访计数不被事件上限截断：走了几遍就是几遍
    expect(state.visited[a]! + state.visited[b]!).toBe(rounds + 1);
  });

  it("摘要由状态现算：当前段、步数、成环与终点各说各的", () => {
    const { plan, a, b } = loopPlan();
    const beatA = plan.beats.find((beat) => beat.id === a)!;
    const beatB = plan.beats.find((beat) => beat.id === b)!;
    expect(storySummary(plan, storyInitial(plan))).toBe("当前段落：甲 · 已走 0 步");

    const atB = storyStep(plan, storyInitial(plan), beatA.choices[0]!.id);
    expect(storySummary(plan, atB)).toBe("当前段落：乙 · 已走 1 步");

    const back = storyStep(plan, atB, beatB.choices[0]!.id);
    expect(storySummary(plan, back)).toContain("当前段落：甲");
    expect(storySummary(plan, back)).toContain("成环");

    let doc = emptyStory("终点");
    const only = talk(doc, "唯一一段", "正文");
    doc = only.document;
    const endPlan = compileStory(doc);
    expect(storySummary(endPlan, storyInitial(endPlan))).toBe(
      "当前段落：唯一一段 · 已走 0 步 · 这一段没有出边：走到这里就结束了",
    );
  });

  it("同一状态同一选择两次跑出同一结果（纯函数）", () => {
    const { plan, a, b } = loopPlan();
    const state = storyInitial(plan);
    const choice = plan.beats.find((beat) => beat.id === a)!.choices.find((entry) => entry.to === b)!;
    expect(storyStep(plan, state, choice.id)).toEqual(storyStep(plan, state, choice.id));
  });
});
