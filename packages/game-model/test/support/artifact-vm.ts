import vm from "node:vm";
import type { GameCodeOutput, SimInput } from "../../src/index";

/**
 * 产物引擎的对账工具：把 `codegen.ts` 自己生成的 `engine.js` 放进一个**新建的** `vm` 上下文，
 * 取回里面那段纯逻辑（`NexusSim` / `NexusRpg` / `NexusStory`），与模型层的函数逐步比状态。
 *
 * 为什么允许在主机里跑它：跑的是**我们的模板**，不是作者或 AI 写的代码——作者写的字只进
 * `plan.json`（数据），一个字都不进 `engine.js`，那句话由 `story-parity.test.ts` 逐字扫着。
 * 上下文里也没有 `require` / `process` / `fs`。§81 那条"产物不在主机执行"说的是产品的运行路径。
 *
 * 三个链的文件各写各的驱动（对话比选择 id、两条实时链比 `(input, dt)` 帧），共用的是这里这几把
 * 尺子：字节取文件、加载全局、序列化比较、字段集合比较。**同一件事只有一处供给**——
 * 对账工具本身写两份，就跟转写写两份一样会说谎。
 */

export function artifactFile(output: GameCodeOutput, path: string): string {
  const found = output.files.find((f) => f.path === path);
  if (!found) throw new Error(`产物里没有 ${path}：只生成了 ${output.files.map((f) => f.path).join("、")}`);
  return found.contents;
}

/** 产物里那一段引擎的全局名与它所在的文件 */
export function loadArtifactEngine<T>(output: GameCodeOutput, globalName: string): T {
  const context = vm.createContext({}) as Record<string, unknown>;
  vm.runInContext(artifactFile(output, "engine.js"), context, { filename: "engine.js" });
  const engine = context[globalName];
  if (!engine || typeof engine !== "object") throw new Error(`产物 engine.js 里没有 ${globalName}——对账无从跑起`);
  return engine as T;
}

/** 喂给产物的计划取它**自己要念的那份**（plan.json 的字节），不是主机手里那个对象：载荷少带一个字段也会在这里红 */
export function shippedPlan(output: GameCodeOutput): unknown {
  return JSON.parse(artifactFile(output, "plan.json")) as unknown;
}

/** 按键排序后再序列化：比的是值，不是键序 */
export function canon(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    return `{${entries.map(([k, v]) => `${k}:${canon(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/** 字段集合先比一轮：模型加了字段而转写漏了，这条报得比 JSON 差异精确 */
export function fieldDiff(model: object, view: object): string | null {
  const a = Object.keys(model).sort();
  const b = Object.keys(view).sort();
  if (a.join(",") === b.join(",")) return null;
  const onlyModel = a.filter((k) => !b.includes(k));
  const onlyView = b.filter((k) => !a.includes(k));
  return `模型独有 [${onlyModel.join(",")}]、产物独有 [${onlyView.join(",")}]`;
}

export const clip = (text: string): string => (text.length > 320 ? `${text.slice(0, 320)}…` : text);

/** 一条驱动指令：`walk` 朝某个实体的**当前**位置走，`push` 朝固定方向顶，`idle` 站着 */
export type Directive =
  | { op: "walk"; to: string; frames: number; dt: number; attack?: boolean }
  | { op: "push"; dx: number; dy: number; frames: number; dt: number; attack?: boolean }
  | { op: "idle"; frames: number; dt: number; attack?: boolean };

export interface Frame {
  input: SimInput;
  dt: number;
}

/** 对账两边的调用形状：模型侧的函数与产物侧转写的三个方法 */
export interface Harness<TState, TPlan> {
  initial(plan: TPlan): TState;
  step(plan: TPlan, state: TState, input: SimInput, dt: number): TState;
  summary(plan: TPlan, state: TState): string;
  /** 玩家此刻在哪：算 walk 的方向 */
  playerAt(state: TState): { x: number; y: number };
  /** 某个实体此刻在哪（会追击的敌人要读活的位置；查不到返回 null，那一帧就站着） */
  actorAt(state: TState, plan: TPlan, id: string): { x: number; y: number } | null;
  /** 事件流放在哪一层（两条链的状态形状不一样） */
  eventsAt(state: TState): unknown[];
}

export interface ArtifactView<TState> {
  initialState(plan: unknown): TState;
  step(plan: unknown, state: TState, input: SimInput, dt: number): TState;
  summary(plan: unknown, state: TState): string;
}

/**
 * 输入流一律由**模型那侧**的状态算出来，然后原样喂给两边重放。
 * 若各算各的，一旦两边分叉，输入也跟着分叉，差异就自己把自己抹平了——那是假的绿。
 */
export function framesFor<TState, TPlan>(harness: Harness<TState, TPlan>, plan: TPlan, directives: Directive[]): Frame[] {
  let state = harness.initial(plan);
  const frames: Frame[] = [];
  for (const directive of directives) {
    for (let i = 0; i < directive.frames; i += 1) {
      let dx = 0;
      let dy = 0;
      if (directive.op === "walk") {
        const here = harness.playerAt(state);
        const target = harness.actorAt(state, plan, directive.to);
        if (target) {
          const gap = Math.hypot(target.x - here.x, target.y - here.y) || 1;
          dx = (target.x - here.x) / gap;
          dy = (target.y - here.y) / gap;
        }
      } else if (directive.op === "push") {
        dx = directive.dx;
        dy = directive.dy;
      }
      const input: SimInput = { dx, dy, attack: directive.attack ?? false };
      frames.push({ input, dt: directive.dt });
      state = harness.step(plan, state, input, directive.dt);
    }
  }
  return frames;
}

export interface ReplayTrace<TState> {
  divergence: string | null;
  frames: number;
  /** 状态有没有真的动过（`t` 前进过）——没动过的对账是空转 */
  moved: boolean;
  maxEvents: number;
  /** 走完这一串之后模型那侧的状态：场景"到底有没有走到那一格"读它，不靠人眼看 */
  final: TState;
}

/** 逐步重放：每一帧都比字段集合、逐字段的值与摘要，第一条不吻合就带着两边的读数停下 */
export function replay<TState, TPlan>(
  label: string,
  harness: Harness<TState, TPlan>,
  plan: TPlan,
  shipped: unknown,
  engine: ArtifactView<TState>,
  frames: Frame[],
): ReplayTrace<TState> {
  let model = harness.initial(plan);
  let view = engine.initialState(shipped);
  const trace: ReplayTrace<TState> = { divergence: null, frames: 0, moved: false, maxEvents: 0, final: model };

  const compare = (at: string): boolean => {
    const fields = fieldDiff(model as object, view as object);
    if (fields) {
      trace.divergence = `${label} ${at}：状态字段集合对不上——${fields}`;
      trace.final = model;
      return false;
    }
    if (canon(model) !== canon(view)) {
      trace.divergence = `${label} ${at}：同一串输入跑出来状态不同\n  模型 ${clip(canon(model))}\n  产物 ${clip(canon(view))}`;
      trace.final = model;
      return false;
    }
    const modelSummary = harness.summary(plan, model);
    const viewSummary = engine.summary(shipped, view);
    if (modelSummary !== viewSummary) {
      trace.divergence = `${label} ${at}：摘要对不上\n  模型「${modelSummary}」\n  产物「${viewSummary}」`;
      trace.final = model;
      return false;
    }
    return true;
  };

  if (!compare("开场")) return trace;

  for (const frame of frames) {
    const modelBefore = model;
    model = harness.step(plan, model, frame.input, frame.dt);
    view = engine.step(shipped, view, frame.input, frame.dt);
    trace.frames += 1;
    trace.final = model;
    if (model !== modelBefore) trace.moved = true;
    const events = harness.eventsAt(model);
    if (events.length > trace.maxEvents) trace.maxEvents = events.length;
    if (!compare(`第 ${trace.frames} 帧（dt=${frame.dt}、dx=${frame.input.dx.toFixed(3)}、dy=${frame.input.dy.toFixed(3)}、${frame.input.attack ? "挥击" : "收手"}）之后`)) {
      return trace;
    }
  }
  return trace;
}
