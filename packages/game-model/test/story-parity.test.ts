import { describe, expect, it } from "vitest";
import {
  EVENT_CAP,
  STORY_NO_BEATS_OUTCOME,
  compileStory,
  generateGameCode,
  storyInitial,
  storyStep,
  storySummary,
  type GameCodeOutput,
  type GameDocument,
  type GameEntityKind,
  type GameKind,
  type StoryPlan,
} from "../src/index";
import {
  artifactFile,
  canon,
  clip,
  fieldDiff,
  loadArtifactEngine,
  shippedPlan as shippedPlanBytes,
} from "./support/artifact-vm";

/**
 * §85 第十四片：**模型 ↔ 产物转写**的对账，跑在 `npm test` 里。
 *
 * 这条门补的是一格存在了很久的心虚。ADR-0046 收尾时留下的原话：
 * "仍然欠的：产物侧是转写，不是 import——`story.ts` 改逻辑而产物不重新生成仍会分叉。"
 * 对账本身早就写过了，但它住在 `scripts/story-engine-proof.mts`——一个连 npm script
 * 都没有的手跑脚本。也就是说：**门是有的，只是没人踢就不响**。`story.ts` 改了重访计数
 * 或成环判定，产物转写没跟上，`npm test` 全绿。这跟"没有这条门"是同一件事。
 *
 * 现在把对账挪进来，并且把它从"一串 5 步"扩成**表驱动**：十条线各自跑一遍，
 * 每一步都比三样东西：
 * 1. 状态的**字段集合**（模型加字段而转写漏了 → 精确红，不用在 JSON 里找）；
 * 2. 逐字段**的值**（比较前按键排序，免得键序不同谎报分叉）；
 * 3. **摘要字符串**与**"打不中就原样返回同一个对象"的引用契约**——最后这条是两边
 *    各自"动没动"必须一致，转写若偷偷新建一份等值拷贝，值比看不出来、引用比看得出来。
 *
 * 关于 §81（"生成代码不得在主机执行"）：这里在 `vm` 里跑的**不是作者或 AI 写的代码**，
 * 是 `codegen.ts` 自己的模板——作者写的字只进 `plan.json`（数据），不进 `engine.js`。
 * 下面"作者的字不进代码只进数据"那条就是把这句话钉成断言：模板里出现名字或正文，
 * 意味着真的有内容被拼进了代码，那时这份对账也不该在主机跑。上下文是新建的，
 * 没有 `require` / `process` / `fs`，能用的只有引擎自己那份纯逻辑。
 *
 * 浏览器那一层（渲染、点击、`#story` 容器）不在这里，那是 `scripts/game-code-parity.mts`
 * 的 STORY_* 几条；这一片只管"转写的语义与模型同不同"。
 *
 * 取字节、加载全局、按键排序序列化、字段集合比较这四把尺子住在
 * `test/support/artifact-vm.ts`——`sim-parity.test.ts`（另外两条链）用的是同一把。
 * 对账工具本身写两份，就跟转写写两份一样会说谎。
 */

const AT = "2026-01-01T00:00:00.000Z";

interface DialogueSpec {
  id: string;
  name: string;
  /** 正文（投影读的是实体的 notes）。不给 = 有正文；给 "" = 刻意留空那一种 */
  text?: string;
  refs?: { to: string; role?: string }[];
}

function storyDoc(
  name: string,
  kind: GameKind,
  dialogues: DialogueSpec[],
  extras: { id: string; name: string; kind: GameEntityKind }[] = [],
): GameDocument {
  const entity = (id: string, kindOf: GameEntityKind, label: string, notes: string, refs: { id: string; to: string; role: string }[]) => ({
    id,
    kind: kindOf,
    name: label,
    notes,
    tags: ["story-parity"],
    stats: {},
    refs,
    updatedAt: AT,
  });
  return {
    id: `game_${name}`,
    projectId: null,
    name,
    summary: "为模型↔转写对账摆的对话",
    kind,
    entities: [
      ...dialogues.map((d) =>
        entity(
          d.id,
          "dialogue",
          d.name,
          d.text ?? `说明：${d.name}`,
          (d.refs ?? []).map((r, i) => ({ id: `${d.id}-ref-${i}`, to: r.to, role: r.role ?? "" })),
        ),
      ),
      ...extras.map((e) => entity(e.id, e.kind, e.name, `说明：${e.name}`, [])),
    ],
    createdAt: AT,
    updatedAt: AT,
  } as unknown as GameDocument;
}

type EngineState = Record<string, unknown>;

interface StoryEngineView {
  initialState: (plan: unknown) => EngineState;
  step: (plan: unknown, state: EngineState, choiceId: string) => EngineState;
  summary: (plan: unknown, state: EngineState) => string;
}

/**
 * 把产物自己的 `engine.js` 放进一个**新建的**上下文里取回 `NexusStory`——不重写一份逻辑，
 * 也不 import 模型。取字节、建上下文、查全局这三步是三条链共用的，住在 support 里。
 */
function storyEngineFrom(output: GameCodeOutput): StoryEngineView {
  return loadArtifactEngine<StoryEngineView>(output, "NexusStory");
}

/** 喂给产物的是**它自己要念的那份**（plan.json 的字节），不是主机手里那个对象：载荷少带一个字段也会在这里红 */
function shippedPlan(output: GameCodeOutput): StoryPlan {
  return shippedPlanBytes(output) as StoryPlan;
}

/**
 * 一串确定的选择：每轮把这份计划里的**每一条选择**都按同一顺序试一遍，中间夹打不中的 id。
 * 轮数给到 20 是为了越过事件条数上限（`EVENT_CAP`）——不满就没有"挤掉最旧那条"那一步，
 * 而那一步正是模型与转写最容易各写各的地方。
 */
function scriptFor(plan: StoryPlan, rounds = 20): string[] {
  const ids = plan.beats.flatMap((beat) => beat.choices.map((choice) => choice.id));
  const miss = "根本没有这个选项";
  if (!ids.length) return [miss, miss, miss];
  const out: string[] = [];
  for (let round = 0; round < rounds; round += 1) {
    for (const id of ids) {
      out.push(id);
      if (round % 4 === 0) out.push(miss);
    }
  }
  return out;
}

interface Trace {
  divergence: string | null;
  steps: number;
  hits: number;
  misses: number;
  sawLoop: boolean;
  sawEnding: boolean;
  maxEvents: number;
}

function drive(plan: StoryPlan, shipped: StoryPlan, engine: StoryEngineView, ids: string[]): Trace {
  let model = storyInitial(plan);
  let view = engine.initialState(shipped);
  const trace: Trace = { divergence: null, steps: 0, hits: 0, misses: 0, sawLoop: false, sawEnding: false, maxEvents: 0 };

  const compare = (label: string): boolean => {
    const fields = fieldDiff(model, view);
    if (fields) {
      trace.divergence = `${label}：状态字段集合对不上——${fields}`;
      return false;
    }
    if (canon(model) !== canon(view)) {
      trace.divergence =
        `${label}：同一串选择跑出来状态不同\n  模型 ${clip(canon(model))}\n  产物 ${clip(canon(view))}`;
      return false;
    }
    const modelSummary = storySummary(plan, model);
    if (modelSummary !== engine.summary(shipped, view)) {
      trace.divergence = `${label}：摘要对不上\n  模型「${modelSummary}」\n  产物「${engine.summary(shipped, view)}」`;
      return false;
    }
    return true;
  };

  if (!compare("开场")) return trace;

  for (const id of ids) {
    const modelBefore = model;
    const viewBefore = view;
    model = storyStep(plan, model, id);
    view = engine.step(shipped, view, id);
    trace.steps += 1;
    const movedModel = model !== modelBefore;
    const movedView = view !== viewBefore;
    if (movedModel !== movedView) {
      trace.divergence =
        `第 ${trace.steps} 步「${id}」：一边动了引用、一边没动（模型${movedModel ? "换新对象" : "原样返回"}、` +
        `产物${movedView ? "换新对象" : "原样返回"}）——"打不中就原样返回同一个对象"这条契约两边不一致`;
      return trace;
    }
    if (movedModel) trace.hits += 1;
    else trace.misses += 1;
    if (model.loop) trace.sawLoop = true;
    if (model.events.length > trace.maxEvents) trace.maxEvents = model.events.length;
    const beat = plan.beats.find((entry) => entry.id === model.beatId);
    if (beat?.ending) trace.sawEnding = true;
    if (!compare(`第 ${trace.steps} 步「${id}」之后`)) return trace;
  }
  return trace;
}

function run(document: GameDocument): Trace {
  const plan = compileStory(document);
  const output = generateGameCode(document);
  return drive(plan, shippedPlan(output), storyEngineFrom(output), scriptFor(plan));
}

interface Scenario {
  name: string;
  document: GameDocument;
  /** 见证不许空跑：这条线必须真走通至少一步 */
  mustHit: boolean;
  mustLoop: boolean;
  mustEnd?: boolean;
  /** 底稿的前提钉住：投影本身没长成这样，后面比的就是空气 */
  premise?: (plan: StoryPlan) => string | null;
}

const scenarios: Scenario[] = [
  {
    name: "直线走到终点（有一段明写「没有出边」）",
    document: storyDoc("三段直线", "interactive-story", [
      { id: "d1", name: "开场", refs: [{ to: "d2", role: "接话" }] },
      { id: "d2", name: "中段", refs: [{ to: "d3", role: "再问" }] },
      { id: "d3", name: "收尾" },
    ]),
    mustHit: true,
    mustLoop: false,
    mustEnd: true,
  },
  {
    name: "绕回起点（起点也算走过一次，否则要绕两圈才认得出环）",
    document: storyDoc("回圈", "interactive-story", [
      { id: "d1", name: "开场", refs: [{ to: "d2", role: "点头" }] },
      { id: "d2", name: "回应", refs: [{ to: "d1", role: "回头" }] },
    ]),
    mustHit: true,
    mustLoop: true,
  },
  {
    name: "自己指自己：一步就成环",
    document: storyDoc("自指", "interactive-story", [
      { id: "d1", name: "独白", refs: [{ to: "d1", role: "再说一遍" }] },
    ]),
    mustHit: true,
    mustLoop: true,
    premise: (plan) => (plan.startId === "d1" ? null : `起点不是 d1（是 ${String(plan.startId)}），这条线压根没跑起来`),
  },
  {
    name: "多分支汇合成环",
    document: storyDoc("岔路", "interactive-story", [
      { id: "d1", name: "开场", refs: [{ to: "d2", role: "向左" }, { to: "d3", role: "向右" }, { to: "d4", role: "直走" }] },
      { id: "d2", name: "左边", refs: [{ to: "d4" }] },
      { id: "d3", name: "右边", refs: [{ to: "d4", role: "汇合" }] },
      { id: "d4", name: "岔口", refs: [{ to: "d2", role: "回左边" }] },
    ]),
    mustHit: true,
    mustLoop: true,
    premise: (plan) => {
      const d1 = plan.beats.find((b) => b.id === "d1");
      return d1 && d1.choices.length === 3 ? null : `开场不是三条分支（${String(d1?.choices.length)} 条）`;
    },
  },
  {
    name: "正文留空的那一段（textEmpty 不影响播放语义）",
    document: storyDoc("空正文", "interactive-story", [
      { id: "d1", name: "没写字的开场", text: "", refs: [{ to: "d2", role: "还是接" }] },
      { id: "d2", name: "有字的回应" },
    ]),
    mustHit: true,
    mustLoop: false,
    premise: (plan) => {
      const d1 = plan.beats.find((b) => b.id === "d1");
      return d1?.textEmpty ? null : "第一段没被判成正文为空，这条场景就没测到那一格";
    },
  },
  {
    name: "悬空引用与指向非对话的引用：选择比引用少，少掉的那几条不该有按钮",
    document: storyDoc(
      "缺牙",
      "interactive-story",
      [
        { id: "d1", name: "开场", refs: [{ to: "d2", role: "能走" }, { to: "已经不在了", role: "悬空" }, { to: "e1", role: "指着敌人" }] },
        { id: "d2", name: "回应" },
      ],
      [{ id: "e1", name: "巡逻兵", kind: "enemy" }],
    ),
    mustHit: true,
    mustLoop: false,
    premise: (plan) => {
      const d1 = plan.beats.find((b) => b.id === "d1");
      const notes = plan.notes.join(" ");
      if (!d1 || d1.choices.length !== 1) return `开场该只剩 1 条能走的选择，实际 ${String(d1?.choices.length)} 条`;
      if (!notes.includes("1 条引用指向的实体不在文档里")) return "悬空那条引用没被投影报出来（跳过它而不报数=悄悄替作者改设计）";
      if (!notes.includes("1 条引用指向的不是对话")) return "指着敌人那条引用没被投影报出来";
      return null;
    },
  },
  {
    name: "全都互相指向：没有天然入口，起点按文档顺序取第一条",
    document: storyDoc("闭环", "interactive-story", [
      { id: "d1", name: "甲", refs: [{ to: "d2", role: "问" }] },
      { id: "d2", name: "乙", refs: [{ to: "d1", role: "答" }] },
    ]),
    mustHit: true,
    mustLoop: true,
    premise: (plan) =>
      plan.notes.some((note) => note.includes("没有天然入口")) ? null : "投影没说清起点是怎么挑的，这条场景的前提没立住",
  },
  {
    name: "两条互不相连的线：走不到的那条不是「没有内容」",
    document: storyDoc("断线", "interactive-story", [
      { id: "d1", name: "甲线开场", refs: [{ to: "d2", role: "接" }] },
      { id: "d2", name: "甲线收尾" },
      { id: "d3", name: "乙线（没人指到它）" },
    ]),
    mustHit: true,
    mustLoop: false,
    premise: (plan) => (plan.beats.length === 3 ? null : `三段对话没都编进计划（${String(plan.beats.length)} 段）`),
  },
  {
    name: "一条对话都没有：开不了场，两边念同一句拒绝",
    document: storyDoc("只有敌人", "interactive-story", [], [{ id: "e1", name: "巡逻兵", kind: "enemy" }]),
    mustHit: false,
    mustLoop: false,
    premise: (plan) => {
      const state = storyInitial(plan);
      return !plan.playable && state.outcome === STORY_NO_BEATS_OUTCOME && state.beatId === null
        ? null
        : `这份底稿没落到"开不了场"那一格（playable=${plan.playable}、拒绝句=${String(state.outcome)}）`;
    },
  },
  {
    name: "visual-novel 同一条链：换个性子不该换语义",
    document: storyDoc("漫画式", "visual-novel", [
      { id: "d1", name: "分镜一", refs: [{ to: "d2", role: "翻页" }, { to: "d3", role: "回想" }] },
      { id: "d2", name: "分镜二", refs: [{ to: "d1", role: "回到开头" }] },
      { id: "d3", name: "回想", refs: [{ to: "d2", role: "接着" }] },
    ]),
    mustHit: true,
    mustLoop: true,
  },
];

describe("模型与产物转写的对账（跑在 npm test 里，不再靠人记得跑脚本）", () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const plan = compileStory(scenario.document);
      if (scenario.premise) expect(scenario.premise(plan), `${scenario.name}：底稿没搭对`).toBeNull();
      const trace = run(scenario.document);
      expect(trace.divergence, `模型与产物在同一串选择后分叉（这条线跑了 ${trace.steps} 步）`).toBeNull();
      expect(trace.steps, "这条线一步都没跑，见证是空的").toBeGreaterThan(0);
      expect(trace.misses, "一串里没有一次打不中的选择：引用契约没被检验").toBeGreaterThan(0);
      if (scenario.mustHit) expect(trace.hits, "一条选择都没走通：这份底稿的分支没接上").toBeGreaterThan(0);
      if (scenario.mustLoop) expect(trace.sawLoop, "说好会成环的线没成环，后面的比较没走到那一格").toBe(true);
      if (scenario.mustEnd) expect(trace.sawEnding, "没走到过「没有出边」那段").toBe(true);
    });
  }

  it("成环那条线真的把事件挤到上限（不挤就没人检验过丢弃最旧那一步）", () => {
    const looping = scenarios.find((s) => s.name.startsWith("绕回起点"))!;
    const plan = compileStory(looping.document);
    const output = generateGameCode(looping.document);
    // 轮数按这条线自己算：一圈两个选择、其中一步才是重访，默认 20 轮堆不满上限
    const trace = drive(plan, shippedPlan(output), storyEngineFrom(output), scriptFor(plan, 60));
    expect(trace.divergence).toBeNull();
    expect(trace.maxEvents, `事件只堆到 ${trace.maxEvents} 条，从没到 ${EVENT_CAP} 的上限`).toBe(EVENT_CAP);
  });

  it("非对话的实体一个都不进对话那份载荷（指过去的那条引用只留下一句说明）", () => {
    const document = scenarios.find((s) => s.name.startsWith("悬空引用"))!.document;
    const output = generateGameCode(document);
    for (const path of ["plan.json", "plan.js", "engine.js"]) {
      expect(artifactFile(output, path), `${path} 里混进了非对话实体`).not.toContain("巡逻兵");
    }
    expect(compileStory(document).notes.join(" "), "投影没交代它忽略了多少条引用").toContain("1 个非对话实体");
  });

  it("作者写的字只进数据（plan.json），一个都不进代码（engine.js）", () => {
    const document = storyDoc("带独特字串的那份", "interactive-story", [
      { id: "d1", name: "名字ZZZ甲", text: "正文QQQ开场", refs: [{ to: "d2", role: "选项MMM" }] },
      { id: "d2", name: "名字ZZZ乙", text: "正文QQQ回应" },
    ]);
    const output = generateGameCode(document);
    const engine = artifactFile(output, "engine.js");
    for (const authored of ["名字ZZZ甲", "名字ZZZ乙", "正文QQQ开场", "选项MMM"]) {
      expect(engine, `产物代码里出现了作者写的「${authored}」——那意味着内容被拼进了代码，不只是数据`).not.toContain(authored);
      expect(artifactFile(output, "plan.json")).toContain(authored);
    }
  });

  it("脚本把每一条选择都踩过至少一次（漏一条就等于没对账）", () => {
    const branching = scenarios.find((s) => s.name.startsWith("多分支"))!;
    const plan = compileStory(branching.document);
    const tried = new Set(scriptFor(plan, 2));
    for (const beat of plan.beats) {
      for (const choice of beat.choices) {
        expect(tried.has(choice.id), `${beat.name} 的选项「${choice.label}」从没被踩过`).toBe(true);
      }
    }
  });
});
