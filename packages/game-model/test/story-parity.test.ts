import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  type StoryState,
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
 *
 * 第十七片补的是这张门自己的账本（第十六片给 `sim` / `rpg` 砌的同一一样东西，欠账第 2 条）：
 * 十四串线全绿（11 条底稿 + 跑满 60 轮那一条 + 反事实两条），证明的是"这些串下两边一样"，不是"对话的哪几条判定被走过"。所以
 * `drive` 现在逐步记下模型那侧的状态（`Trace.history`），两张清单读它——播放那 15 条
 * （重访把 loop 由假变真、打不中返回同一个对象、事件挤到上限后丢最旧、守卫那两支……）与投影那 11 句
 * （`story.ts` 里每处 `notes.push(` 都要有一句在清单上，源码计数哨兵钉这一句）。
 * 两条门：任何一条没人踩过就红，红得指名道姓。
 *
 * 清单顺带抓到两处上一片看不见的东西：① 那条叫「脚本把每一条选择都踩过至少一次」的门
 * 扫的其实是**脚本里有没有这个 id**，而轮转脚本永远在多条出边那段拿第一条——
 * "按 id 挑中第二条"那一支一次都没走过。补了一条自选脚本的线，并把那条改了口。
 * ② `storyStep` 开头两支守卫（当前段落不在计划里、选择的 target 不在计划里）**正常投影产不出触发它的计划**，
 * 所以它们只能用**被人改过的计划**反事实地喂——那两行写的是"守卫是活的"，不是"投影会产出这种计划"。
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
  /**
   * 模型那侧**逐步**的状态，第 0 格是开场。
   * 与 `support/artifact-vm.ts` 里 `ReplayTrace.history` 同一件事、同一个理由：
   * 只留最后一个状态问得出"走到哪了"，问不出"中间那一格走过没有"。而这条链的账本还多承担一样——
   * "打不中原样返回同一个对象"在账本里就是**相邻两格是同一个引用**，那是值比看不出来的一格。
   */
  history: StoryState[];
}

function drive(plan: StoryPlan, shipped: StoryPlan, engine: StoryEngineView, ids: string[]): Trace {
  let model = storyInitial(plan);
  let view = engine.initialState(shipped);
  const trace: Trace = { divergence: null, steps: 0, hits: 0, misses: 0, sawLoop: false, sawEnding: false, maxEvents: 0, history: [model] };

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
    trace.history.push(model);
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

/**
 * 一条线跑完之后留下的三样东西：它自己那串选择跑出的**账本**、它对账的结果、以及它读的那份计划。
 * 规则清单读的是 `h`（逐步的模型状态）与 `plan`，不读人写的注释。
 */
interface StoryRun {
  name: string;
  plan: StoryPlan;
  h: StoryState[];
  trace: Trace;
  /** 这一串实际喂进去的选择 id（`h[i+1]` 就是拿 `ids[i]` 走出来的）——守卫那一支要点名"第几步点的是哪条选择" */
  ids: string[];
  /** scenario = 一份真底稿；counterfactual = 计划被人改过的那一格（正常投影产不出它，只能反事实地喂） */
  origin: "scenario" | "counterfactual";
  /** 投影那张清单读的是**文档里的形状**（引用指向谁、有几个终点），不是 `notes` 的字 */
  document: GameDocument;
}

function walk(scenario: Scenario): StoryRun {
  const plan = compileStory(scenario.document);
  const output = generateGameCode(scenario.document);
  const ids = scenario.script ? scenario.script(plan) : scriptFor(plan);
  const trace = drive(plan, shippedPlan(output), storyEngineFrom(output), ids);
  return { name: scenario.name, plan, h: trace.history, trace, ids, origin: "scenario", document: scenario.document };
}

/**
 * 反事实的那两串：`storyStep` 开头那两支守卫（当前段落不在计划里、选择的 target 不在计划里）
 * **正常投影永远产不出触发它的计划**——起点必然在 `beats` 里，选择必然指向 `beats` 里的一段。
 * 它们守的是"下载下来的 `plan.json` 被人动过"这一格，所以只能照着那个形状**当场改一份计划**再喂给两边：
 * 模型与产物读同一份被改过的对象，守卫有没有生效就还是能比的（生效=原样返回同一个对象）。
 * 说清楚这一点很重要：这两行见证的是"守卫是活的"，不是"投影会产出这种计划"。
 */
function walkDoctored(name: string, document: GameDocument, doctor: (plan: StoryPlan) => StoryPlan, ids: string[]): StoryRun {
  const plan = doctor(compileStory(document));
  const output = generateGameCode(document);
  const trace = drive(plan, doctor(shippedPlan(output)), storyEngineFrom(output), ids);
  return { name, plan, h: trace.history, trace, ids, origin: "counterfactual", document };
}

interface Scenario {
  name: string;
  document: GameDocument;
  /** 见证不许空跑：这条线必须真走通至少一步 */
  mustHit: boolean;
  mustLoop: boolean;
  mustEnd?: boolean;
  /**
   * 默认那串选择是**轮转**的（`scriptFor`），够用但不覆盖所有形状：
   * 一个段落有多条出边时，轮转总是先撞第一条，走回来时下一条又落在别的段落上——
   * "按 id 精确挑中第二条"那一支就这样一格都走不到。要走到它的线自己给一串。
   */
  script?: (plan: StoryPlan) => string[];
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
    name: "两条出边都真走得到：按选项 id 挑中第二条，不是永远拿第一条",
    document: storyDoc("左右两条", "interactive-story", [
      { id: "d1", name: "开场", refs: [{ to: "d2", role: "向左" }, { to: "d3", role: "向右" }] },
      { id: "d2", name: "左边", refs: [{ to: "d1", role: "回来" }] },
      { id: "d3", name: "右边", refs: [{ to: "d1", role: "回来" }] },
    ]),
    // 轮转那串永远在开场拿"向左"（走回开场时正好又轮到第一条），所以这一串自己点：
    // 先向右、再从不存在的 id 上打空、回来、向左、回来、再向右（那一步是重访，环也在这一步）
    script: () => ["d1-ref-1", "根本没有这个选项", "d3-ref-0", "d1-ref-0", "d2-ref-0", "d1-ref-1"],
    mustHit: true,
    mustLoop: true,
    premise: (plan) => {
      const d1 = plan.beats.find((b) => b.id === "d1");
      return d1 && d1.choices.length === 2 && d1.choices[1]!.to === "d3" ? null : "开场不是两条出边、第二条通向右边";
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
    // 第十八片：覆盖率仪器点名 `story.ts:156` 那个 `unreachable.length > 5` 的臂**从没被走过**——
    // 前面那份「断线」只有两条走不到，落在 `: ""` 那一臂。名字截到第五个之后那句
    // 「等 N 条」是这句披露的一部分，没人编出来过就等于没人知道它在不在。
    name: "八条线里七条互不相连：走不到的那六条要换成「等 6 条」，不是列满五个名字就完事",
    document: storyDoc("八个孤岛", "interactive-story", [
      { id: "d1", name: "甲", refs: [{ to: "d2", role: "接" }] },
      { id: "d2", name: "乙" },
      { id: "d3", name: "丙" },
      { id: "d4", name: "丁" },
      { id: "d5", name: "戊" },
      { id: "d6", name: "己" },
      { id: "d7", name: "庚" },
      { id: "d8", name: "辛" },
    ]),
    mustHit: true,
    mustLoop: false,
    premise: (plan) => (plan.beats.length === 8 ? null : `八条对话没都编进计划（${String(plan.beats.length)} 段）`),
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

/**
 * 十七片：这条链的**规则清单**（第十六片给 `sim.ts` / `rpg.ts` 砌的那同一样东西，欠账第 2 条就是它）。
 *
 * 上一片的门绿着说的是"这十一串选择下两边一样"，不是"对话的哪几条判定被走过"。
 * 这一张表把 `storyInitial` / `storyStep` / `storySummary` 里每一条带分支的规则写成
 * "逐步账本里出现过这一格"的谓词，任何一条没人踩过就红。播放那 15 条读的是 `h`（逐帧的模型状态），
 * 投影那 11 句读的是 `plan.notes` / `plan.blockers`——`story.ts` 里每处 `notes.push(` 都必须在清单上，
 * 那条源码计数哨兵就是钉这一句的：源码加了一句而清单没加，红。
 */
interface RuleRow {
  rule: string;
  seen: (r: StoryRun) => boolean;
}

const beatOf = (plan: StoryPlan, id: string | null) => plan.beats.find((entry) => entry.id === id);

/** 每一步都比过摘要，所以摘要里那三句在清单里读的是**模型自己的** `storySummary`，不是我抄的字 */
const saidAt = (r: StoryRun, needle: string): boolean => r.h.some((state) => storySummary(r.plan, state).includes(needle));

const STORY_RULES: RuleRow[] = [
  {
    rule: "开场把起点记进 visited（不记这一次，绕回起点要绕两圈才认得出环）",
    seen: (r) => {
      const first = r.h[0]!;
      return first.beatId !== null && first.visited[first.beatId] === 1 && first.trail.length === 1;
    },
  },
  { rule: "开不了场那一支：起点为 null、visited 与 trail 都空、开场就 ended", seen: (r) => r.h[0]!.beatId === null && Object.keys(r.h[0]!.visited).length === 0 && r.h[0]!.status === "ended" },
  {
    rule: "走通一步：beatId 换到目标段、steps 前进一格、trail 变长",
    seen: (r) => r.h.some((s, i) => i > 0 && s !== r.h[i - 1] && s.beatId !== r.h[i - 1]!.beatId && s.steps === r.h[i - 1]!.steps + 1 && s.trail.length === r.h[i - 1]!.trail.length + 1),
  },
  { rule: "第一次重访那一步就把 loop 由假变真（不是绕到第二圈才标）", seen: (r) => r.h.some((s, i) => i > 0 && s.loop && !r.h[i - 1]!.loop && s.beatId !== null && s.visited[s.beatId] === 2) },
  { rule: "重访那句事件写的是「又回到」（不是另起一句）", seen: (r) => r.h.some((s) => s.events.some((e) => e.text.includes("又回到"))) },
  { rule: "loop 一旦为真就不落回（它后面每一步都还是真）", seen: (r) => r.h.some((s, i) => s.loop && i < r.h.length - 1 && r.h.slice(i).every((later) => later.loop)) },
  { rule: "打不中那一支：状态原样返回同一个对象（账本里相邻两格是同一引用，而当时还在 playing）", seen: (r) => r.h.some((s, i) => i > 0 && s === r.h[i - 1] && s.status === "playing") },
  { rule: "已经开不了场之后每步都不许动（status 不是 playing 就原样返回）", seen: (r) => r.h[0]!.status !== "playing" && r.h.every((s) => s === r.h[0]) },
  {
    rule: "事件挤到上限之后丢弃最旧那一步真的发生（同一长度下第一条的步号在涨）",
    seen: (r) => r.h.some((s, i) => i > 0 && s.events.length === EVENT_CAP && r.h[i - 1]!.events.length === EVENT_CAP && s.events.length > 0 && s.events[0]!.t > r.h[i - 1]!.events[0]!.t),
  },
  { rule: "摘要说出「这一段没有出边」（走到终点那一句是从段落自己算的）", seen: (r) => saidAt(r, "这一段没有出边") },
  { rule: "摘要说出「这段对话成环了」", seen: (r) => saidAt(r, "这段对话成环了") },
  { rule: "段落找不到时摘要说「当前段落：（没有）」而不是空白", seen: (r) => saidAt(r, "当前段落：（没有）") },
  {
    rule: "守卫：当前那一段不在计划里时原样返回同一个对象（反事实：正常投影产不出这种计划）",
    seen: (r) => r.origin === "counterfactual" && r.h.some((s, i) => i > 0 && !beatOf(r.plan, r.h[i - 1]!.beatId) && s === r.h[i - 1]),
  },
  {
    rule: "守卫：选择指向的那一段不在计划里时原样返回（反事实，点到的是一条真选择）",
    seen: (r) =>
      r.origin === "counterfactual" &&
      r.h.some((s, i) => {
        if (i === 0 || s !== r.h[i - 1]) return false;
        const from = beatOf(r.plan, r.h[i - 1]!.beatId);
        if (!from) return false;
        const chosen = from.choices.find((c) => c.id === r.ids[i - 1]);
        return !!chosen && !beatOf(r.plan, chosen.to);
      }),
  },
  {
    rule: "一段有多条出边时按 id 精确挑中：某一步走的不是第一条",
    seen: (r) =>
      r.h.some((s, i) => {
        if (i === 0 || s === r.h[i - 1]) return false;
        const from = beatOf(r.plan, r.h[i - 1]!.beatId);
        return !!from && from.choices.length >= 2 && s.beatId !== from.choices[0]!.to;
      }),
  },
];

/**
 * 投影那 11 句的门——第十七片在这里改了形，理由是臂 Z。
 *
 * 第一版写的是"每一句至少被一份底稿编出来过"（这一句的 needle 有没有在一个 hit 里出现）。
 * 变异臂 Z 拿它一试就露馅：`if (endings)` 改成 `if (endings > 1)` 之后，"没有任何出边"那句只在
 * **恰好一个终点**的底稿上闭嘴，而「两条互不相连的线」那份有两个终点、照旧说——hit 还在，门照绿
 * （读数 `Tests 19 passed (19)`，见 `docs/EVALUATION.md` 第十七片）。
 *
 * 所以这里不读 needle 出现没出现过，读的是**这句该不该说**：每行带一个从文档形状独立算出来的谓词
 * （几个终点、几条悬空引用、有没有非对话实体……），再拿投影实际说了没有**逐份底稿正反比一遍**。
 * 三种红法：该说没说=漏报（臂 Z 撞的就是这一格）、不该说说了=误报、没一份底稿落到这一格=这一行是空的。
 * 反事实那两串不参与：它们被人删过段落，终点数与投影当时说的那句本来就对不上，那是播放守卫的见证、不是投影的。
 *
 * 第十八片又加了一行 `inner`：它不是第十二句，是第十一句**内部**那个 `unreachable.length > 5` 的臂——
 * 覆盖率读数点出来的（`story.ts:156` 那一臂从没走过）。它不进下面那条 push 等式，所以它得当场证明自己
 * 确实挂在那句话上，而不是绕过等式混进来的一句新话。
 */
/** 一句话说在哪：notes 与 blockers 两处，按**单条**留着——臂要验的是"它混在哪一句里"，拼成一大串就看不出来了 */
const notesOf = (r: StoryRun): string[] => [...r.plan.notes, ...r.plan.blockers];

/** 认一句话：定长的找子串，带可变数字的那句给它自己的正则 */
type Phrase = string | RegExp;
const matches = (note: string, phrase: Phrase): boolean => (typeof phrase === "string" ? note.includes(phrase) : phrase.test(note));
const spoken = (r: StoryRun, phrase: Phrase): boolean => notesOf(r).some((note) => matches(note, phrase));
/** 两句是不是**同一条 note** 里的：主话与臂的关系就靠这个钉住 */
const spokenTogether = (r: StoryRun, a: Phrase, b: Phrase): boolean => notesOf(r).some((note) => matches(note, a) && matches(note, b));

interface NoteRow {
  rule: string;
  /**
   * 这句说了没有——在投影某一条 note 的字里认。
   * 「等 N 条」那一行给的是正则：写死成字串就成了「只有这一份底稿的那个数」，
   * 换一份走不到的条数不同的底稿就会假报漏报。
   */
  phrase: Phrase;
  /** 该不该说：只读文档与计划里的形状，不读 `notes` 的字 */
  triggers: (r: StoryRun) => boolean;
  /** 同一句 note 内部的臂填上它挂在**哪句主话**上（那句的 `rule`）；主话留空，因为它们各占一处 push */
  inner?: string;
}

/** 引用怎么数：从**原始文档**数，不读投影自己跳过了什么——读它的输出就等于信它的输出 */
function refShape(document: GameDocument) {
  const entities = document.entities;
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const dialogues = entities.filter((entity) => entity.kind === "dialogue");
  const dialogueIds = new Set(dialogues.map((entity) => entity.id));
  const refs = dialogues.flatMap((entity) => entity.refs ?? []);
  return {
    nonDialogueEntities: entities.length - dialogues.length,
    dangling: refs.filter((ref) => !byId.has(ref.to)).length,
    offKind: refs.filter((ref) => {
      const target = byId.get(ref.to);
      return !!target && !dialogueIds.has(target.id);
    }).length,
    blankRole: refs.filter((ref) => dialogueIds.has(ref.to) && !ref.role.trim()).length,
  };
}

/** 起点那两句的前提：没人指向的段落有几个（自指也算被指向——与投影同一条取法） */
function rootCount(plan: StoryPlan): number {
  const pointed = new Set(plan.beats.flatMap((beat) => beat.choices.map((choice) => choice.to)));
  return plan.beats.filter((beat) => !pointed.has(beat.id)).length;
}

const STORY_NOTE_RULES: NoteRow[] = [
  { rule: "起手那句「投影不扩写、不生成、不补对话」", phrase: "投影不扩写、不生成、不补对话", triggers: () => true },
  { rule: "有非对话实体时那句「这条管线一个都不读」", phrase: "这条管线一个都不读", triggers: (r) => refShape(r.document).nonDialogueEntities > 0 },
  { rule: "一条对话都没有时 blocker 那句", phrase: "这份设计里一条对话实体都没有", triggers: (r) => r.plan.beats.length === 0 },
  { rule: "全都被人指时那句「没有天然入口」", phrase: "没有天然入口", triggers: (r) => r.plan.beats.length > 0 && rootCount(r.plan) === 0 },
  { rule: "多条互不相连的线时那句「从这里走不到的 N 条」", phrase: "条互不相连的对话线", triggers: (r) => rootCount(r.plan) > 1 },
  {
    // 上面那句的尾巴：名字只列五个，第六个起改成「等 N 条」。这一臂在两份对账都绿的读数里从没被走过
    // （`coverage:models` 点名 story.ts:156），列满五个名字与截断成一句，读者看到的是同一类披露、
    // 得到的是不同数量的信息——所以它单独占一行，而不是跟在上面那句里蒙一次 hit。
    rule: "走不到的超过五个名字时那句「等 N 条」",
    phrase: / 等 \d+ 条/,
    triggers: (r) => rootCount(r.plan) - 1 > 5,
    inner: "多条互不相连的线时那句「从这里走不到的 N 条」",
  },
  { rule: "引用指着非对话时那句「指向的不是对话」", phrase: "指向的不是对话", triggers: (r) => refShape(r.document).offKind > 0 },
  { rule: "悬空引用那句「这些选项被跳过」", phrase: "指向的实体不在文档里", triggers: (r) => refShape(r.document).dangling > 0 },
  { rule: "没写关系文字时那句「拿目标对话的名字顶上」", phrase: "没写关系文字", triggers: (r) => refShape(r.document).blankRole > 0 },
  { rule: "正文为空时那句「投影不替作者补一句开场白」", phrase: "设计说明是空的", triggers: (r) => r.plan.beats.some((beat) => beat.textEmpty) },
  { rule: "有终点段时那句「没有任何出边，走到那里就结束了」", phrase: "没有任何出边", triggers: (r) => r.plan.beats.length > 0 && r.plan.beats.some((beat) => beat.ending) },
  { rule: "收尾那句「对话之间可以互相指成环」", phrase: "对话之间可以互相指成环", triggers: (r) => r.plan.beats.length > 0 },
];

const built = scenarios.map((scenario) => ({ scenario, run: walk(scenario) }));

/**
 * 事件上限那一格默认那 20 轮堆不满（第十四片首跑就是在这格上抓到空转的）：
 * 成环那条线单独跑 60 轮，它既喂这一行的谓词，也是那条"真的挤到上限"的见证——一份底稿一次跑。
 */
const longLoopRun: StoryRun = (() => {
  const scenario = scenarios.find((s) => s.name.startsWith("绕回起点"))!;
  const plan = compileStory(scenario.document);
  const output = generateGameCode(scenario.document);
  const ids = scriptFor(plan, 60);
  const trace = drive(plan, shippedPlan(output), storyEngineFrom(output), ids);
  return { name: "绕回起点跑满 60 轮（只为把事件挤到上限）", plan, h: trace.history, trace, ids, origin: "scenario", document: scenario.document };
})();

const straightLineDoc = scenarios.find((s) => s.name.startsWith("直线走到终点"))!.document;

/** 起点那一段被人删掉：`storyStep` 第一道守卫那支只有这种计划能喂出来 */
const missingBeatRun = walkDoctored(
  "反事实：当前那一段被人从计划里删了（第一道守卫）",
  straightLineDoc,
  (plan) => ({ ...plan, beats: plan.beats.filter((entry) => entry.id !== plan.startId) }),
  ["d1-ref-0", "根本没有这个选项"],
);

/** 选择指向的那一段被人删掉：第二道守卫那支 */
const missingTargetRun = walkDoctored(
  "反事实：选择指向的那一段被人从计划里删了（第二道守卫）",
  straightLineDoc,
  (plan) => ({ ...plan, beats: plan.beats.filter((entry) => entry.id !== "d3") }),
  ["d1-ref-0", "d2-ref-0", "根本没有这个选项"],
);

const runs: StoryRun[] = [...built.map((entry) => entry.run), longLoopRun, missingBeatRun, missingTargetRun];

describe("模型与产物转写的对账（跑在 npm test 里，不再靠人记得跑脚本）", () => {
  for (const { scenario, run: r } of built) {
    it(scenario.name, () => {
      if (scenario.premise) expect(scenario.premise(r.plan), `${scenario.name}：底稿没搭对`).toBeNull();
      const trace = r.trace;
      expect(trace.divergence, `模型与产物在同一串选择后分叉（这条线跑了 ${trace.steps} 步）`).toBeNull();
      expect(trace.steps, "这条线一步都没跑，见证是空的").toBeGreaterThan(0);
      expect(trace.misses, "一串里没有一次打不中的选择：引用契约没被检验").toBeGreaterThan(0);
      if (scenario.mustHit) expect(trace.hits, "一条选择都没走通：这份底稿的分支没接上").toBeGreaterThan(0);
      if (scenario.mustLoop) expect(trace.sawLoop, "说好会成环的线没成环，后面的比较没走到那一格").toBe(true);
      if (scenario.mustEnd) expect(trace.sawEnding, "没走到过「没有出边」那段").toBe(true);
    });
  }

  it("成环那条线真的把事件挤到上限（不挤就没人检验过丢弃最旧那一步）", () => {
    // 这一串就是清单里那条 60 轮的线，不再另跑一遍：读数与谓词读同一份账本
    expect(longLoopRun.trace.divergence).toBeNull();
    expect(longLoopRun.trace.maxEvents, `事件只堆到 ${longLoopRun.trace.maxEvents} 条，从没到 ${EVENT_CAP} 的上限`).toBe(EVENT_CAP);
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

  it("脚本把每一条选择都点到至少一次（点到不等于走到）", () => {
    const branching = scenarios.find((s) => s.name.startsWith("多分支"))!;
    const plan = compileStory(branching.document);
    const tried = new Set(scriptFor(plan, 2));
    for (const beat of plan.beats) {
      for (const choice of beat.choices) {
        expect(tried.has(choice.id), `${beat.name} 的选项「${choice.label}」从没被点到`).toBe(true);
      }
    }
    // 这条的名字为什么改口：它扫的是**脚本里有没有这个 id**，不是"那一步真走到了第二条"。
    // 轮转的脚本会在走回开场时又轮到第一条，所以"按 id 挑中第二条"那一支它钉不住——
    // 那一格由规则清单里「一段有多条出边时按 id 精确挑中」那行管，靠的是新加的那条自选脚本的线。
    expect(STORY_RULES.some((row) => row.rule.includes("按 id 精确挑中")), "清单里那行被删了，这条就只剩半句真话").toBe(true);
  });

  it("反事实两串：被人改过的计划喂给两边，守卫都生效且一致", () => {
    for (const r of [missingBeatRun, missingTargetRun]) {
      expect(r.trace.divergence, `${r.name}：两边对同一份被改过的计划反应不一样`).toBeNull();
    }
    // 串一：起点那一段被删。前提不立就是比空气，所以先钉"它真的不在计划里"
    expect(beatOf(missingBeatRun.plan, missingBeatRun.h[0]!.beatId), "第一串里起点还在计划里，第一道守卫压根没跑到").toBeUndefined();
    expect(missingBeatRun.h[1], "第一道守卫没返回同一个对象").toBe(missingBeatRun.h[0]);
    expect(missingBeatRun.h[1]!.status, "是'结束'挡的不是'守卫'挡的——这一格就不是那一支了").toBe("playing");
    // 串二：选择指向的那一段被删。第一步要真走通（不然第二步走的不是 target 那支），第二步才撞守卫
    expect(beatOf(missingTargetRun.plan, "d3"), "第二串里 d3 还在计划里，第二道守卫跑不到").toBeUndefined();
    expect(missingTargetRun.h[1], "第一步没走通：第二步返回同一个对象是'打不中'那一支，不是 target 那支").not.toBe(missingTargetRun.h[0]);
    expect(missingTargetRun.h[2], "第二道守卫没返回同一个对象").toBe(missingTargetRun.h[1]);
    expect(missingTargetRun.h[2]!.steps, "steps 涨了就不是'原样返回'那一支").toBe(missingTargetRun.h[1]!.steps);
  });

  it(`规则清单：${STORY_RULES.length} 条播放规则里每一条都至少被一次逐步对账踩过`, () => {
    const missed = STORY_RULES.map((row) => ({ row, hit: runs.filter((r) => row.seen(r)).map((r) => r.name) })).filter((x) => x.hit.length === 0);
    expect(missed.map((m) => `${m.row.rule}（哪一串选择都没走过这一格）`).join("；"), `${missed.length} / ${STORY_RULES.length} 条规则从没被踩过`).toBe("");
  });

  it(`投影那 ${STORY_NOTE_RULES.length} 个读数该不该说逐份底稿正反比一遍（漏报、误报、空行三种都红）`, () => {
    const scenarioRuns = runs.filter((r) => r.origin === "scenario");
    const rows = STORY_NOTE_RULES.map((row) => {
      const cases = scenarioRuns.map((r) => ({ name: r.name, want: row.triggers(r), got: spoken(r, row.phrase) }));
      return { row, cases };
    });
    const inert = rows.filter((x) => !x.cases.some((c) => c.want)).map((x) => `${x.row.rule}：没有一份底稿落到这一格`);
    expect(inert.join("；"), `${inert.length} / ${STORY_NOTE_RULES.length} 行的门是空的`).toBe("");
    const silent = rows
      .map((x) => `${x.row.rule}：该说没说 → ${x.cases.filter((c) => c.want && !c.got).map((c) => c.name).join("、")}`)
      .filter((s) => !s.endsWith("→ "));
    expect(silent.join("；"), "投影在有的底稿上悄悄闭嘴了（臂 Z 那种改阈值就落在这里）").toBe("");
    const noisy = rows
      .map((x) => `${x.row.rule}：不该说却说 → ${x.cases.filter((c) => !c.want && c.got).map((c) => c.name).join("、")}`)
      .filter((s) => !s.endsWith("→ "));
    expect(noisy.join("；"), "投影在不该报的底稿上报了一句").toBe("");
  });

  it("投影那句数与源码对得上：story.ts 里每处 notes.push / blockers.push 都在清单上", () => {
    // 这条哨兵问的是"清单列全了没有"——上一片说过清单证明不了这一点，但它可以证明"源码多了一句而清单没跟着多"
    const source = readFileSync(fileURLToPath(new URL("../src/story.ts", import.meta.url)), "utf8");
    const notePushes = (source.match(/notes\.push\(/g) ?? []).length;
    const blockerPushes = (source.match(/blockers\.push\(/g) ?? []).length;
    const sentences = STORY_NOTE_RULES.filter((row) => !row.inner);
    expect(
      sentences.length,
      `清单 ${sentences.length} 句（另有 ${STORY_NOTE_RULES.length - sentences.length} 行数的是同一句内部的臂），源码那边是 notes.push ×${notePushes} + blockers.push ×${blockerPushes} + 起手数组里那 1 句 = ${notePushes + blockerPushes + 1}（对不上就是有一方在说谎）`,
    ).toBe(notePushes + blockerPushes + 1);
    // `inner` 是这条哨兵唯一的旁路，所以旁路得自己证明挂得住——读的是**投影实际说的话**，不是谓词：
    // ① 它点名的那句主话必须在清单上（改名、指错句都算断）；
    // ② 那段字每出现一次都得和主话的字**在同一条 note 里**（跑到别的话里去了，它就是另一句，正该进等式、不该绕）；
    // ③ 至少一份底稿主话说了而那段字没说（同进同出就等于第二句主话，也不该挂在别人身上）。
    const drafts = runs.filter((r) => r.origin === "scenario");
    const broken = STORY_NOTE_RULES.filter((row) => row.inner)
      .map((arm) => {
        const parent = sentences.find((row) => row.rule === arm.inner);
        if (!parent) return `${arm.rule}：它挂的主话「${String(arm.inner)}」不在清单上`;
        if (drafts.some((r) => spoken(r, arm.phrase) && !spokenTogether(r, arm.phrase, parent.phrase)))
          return `${arm.rule}：有底稿把这段尾巴说在了别的话里——它不是那句的臂`;
        if (drafts.every((r) => !spoken(r, parent.phrase) || spoken(r, arm.phrase)))
          return `${arm.rule}：主话说了它必定说，同进同出就是第二句主话`;
        return null;
      })
      .filter((s): s is string => !!s);
    expect(broken.join("；"), "清单里的 inner 行不再是「同一句里的臂」了").toBe("");
  });
});
