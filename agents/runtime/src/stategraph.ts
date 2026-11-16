/**
 * StateGraph —— LangGraph 语义的本仓实现（**不是**对 LangGraph 的 vendored 复刻）。
 *
 * 为什么存在（§23 §25 §AGENTS）：Agent Runtime 的 "多轮工具调用 → 修复 → 收敛" 本质是一个
 * 带状态的流程图，不是 pipeline。LangGraph 用「State + Channel reducers + BSP super-step」表达它；
 * 这个文件把同一套核心语义带进本仓的 agent-runtime，不引入 Python / LangChain 生态：
 *
 * - **State**：一个 JSON 形状的对象，节点之间只传递不可变视图（每个 super-step 提交一次合并）。
 * - **Channel reducers**：每个 key 默认 `lastValue`；
 *   - `lastValue` —— 后写覆盖先写（LangGraph 默认）；
 *   - `appendSeq` —— 数组追加（用 slice 不用引用，更新立刻可见）；
 *   - `binaryOp` —— 自定义二元 merge（数字求和、max、对象 merge……）。
 * - **Edges**：普通边 `A → B`；条件边 `A → (state) => nextNodeName(s)` —— 可以返回一个名字、
 *   一个数组、或者 `END`。`START`/`END` 是哨兵（`__start__`/`__end__`），编译期校验。
 * - **BSP super-step**：每个 super-step 内所有激活节点并行（Promise.all）读取**同一份**预状态，
 *   各自的 partial 按 channel 顺序合并提交；merge 完成后才启动下一个 super-step。
 * - **Recursion limit**：super-step 达到 `recursionLimit`（默认 25）抛 `StateGraphRecursionError`
 *   —— 不静默截断，不返回半成品（§159）。
 * - **Checkpoints**：`onStep(state, stepIndex, activeNodes)` 在每个 super-step 提交后触发（可选）——
 *   这就是 §25 "任务可中断、可审计、可恢复" 的最小缝，/tasks 或审计中间件挂这里。
 *
 * 明确不做的：Python/LangChain/LangSmith、token 流式、tool-call 协议本身（那些是模型层，不在这个文件里）。
 * 与 LangGraph 的对齐表见 `docs/adr/0270-stategraph-semantics-alias-langgraph.md`。
 */

export const START = '__start__';
export const END = '__end__';
export type NodeName = string | typeof START | typeof END;

export class StateGraphRecursionError extends Error {
  constructor(readonly step: number) {
    super(`StateGraph 执行达到 recursionLimit（${step} 步），终止——检查是否有无法到达 END 的条件边环。`);
    this.name = 'StateGraphRecursionError';
  }
}

export class StateGraphValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateGraphValidationError';
  }
}

export type ChannelReducer<T> = (left: T, right: T) => T;

export const lastValue = <T>(): ChannelReducer<T> => (_left, right) => right;

export const appendSeq = <T>(): ChannelReducer<readonly T[]> => (
  left,
  right,
): readonly T[] => [...(left ?? []), ...right];

export const binaryOp = <T>(fn: (left: T, right: T) => T): ChannelReducer<T> => fn;

export interface StateGraphNodeConfig {
  /** 每个 state key 的合并函数；缺省为 lastValue */
  reducers?: Partial<Record<string, ChannelReducer<unknown>>>;
  /** super-step 上限；默认 25 */
  recursionLimit?: number;
  /** 每步提交后的同步钩子（任务审计/中断缝） */
  onStep?: (state: Readonly<Record<string, unknown>>, stepIndex: number, activeNodes: readonly string[]) => void;
}

export type StateNode<State extends Record<string, unknown>> = (state: Readonly<State>) =>
  | Partial<State>
  | Promise<Partial<State>>;

type AnyState = Record<string, unknown>;
interface CompiledGraph<State extends AnyState> {
  invoke(input: Partial<State>): Promise<State>;
  mermaid(): string;
  /** 返回可达节点表（用于证明图结构，不用于执行） */
  introspect(): { nodes: readonly string[]; edges: readonly [string, string][] };
}

async function mergeUpdate(
  state: AnyState,
  partial: AnyState,
  reducers: Readonly<Record<string, ChannelReducer<unknown>>>,
): Promise<AnyState> {
  const next: AnyState = { ...state };
  for (const key of Object.keys(partial)) {
    const incoming = partial[key];
    const current = next[key];
    const reduce = reducers[key] ?? lastValue<unknown>();
    // 首次写入：没有 left 时取 incoming（而不是 "对 undefined 跑 reducer"，对象/undefined 组合会炸）
    next[key] = current === undefined
      ? (incoming as never)
      : (reduce as (l: unknown, r: unknown) => unknown)(current, incoming);
  }
  return next;
}

const deepFreeze = <T extends AnyState>(obj: T): Readonly<T> => Object.freeze({ ...obj }) as Readonly<T>;

export class StateGraph<State extends AnyState> {
  private readonly nodes = new Map<string, StateNode<State>>();
  private readonly edges = new Map<string, string[]>();
  private readonly conditionalEdges = new Map<string, (state: Readonly<State>) => string | string[] | typeof END>();
  private reducers: Record<string, ChannelReducer<unknown>> = {};
  private entryAdded = false;

  addNode(name: string, fn: StateNode<State>): this {
    if (!name || name === START || name === END) throw new StateGraphValidationError(`节点名不可用：${name || '(empty)'}`);
    if (this.nodes.has(name)) throw new StateGraphValidationError(`节点重复：${name}`);
    this.nodes.set(name, fn);
    return this;
  }

  addEdge(from: NodeName, to: NodeName): this {
    this.checkNode(from, false, true);
    this.checkNode(to, true, true);
    const key = from as string;
    const next = this.edges.get(key) ?? [];
    if (!next.includes(to as string)) next.push(to as string);
    this.edges.set(key, next);
    if (from === START) this.entryAdded = true;
    return this;
  }

  /** 条件边：`path(state)` 返回下一节点名（string）、一个数组（fan-out）或 `END`。 */
  addConditionalEdges(from: NodeName, path: (state: Readonly<State>) => string | string[] | typeof END): this {
    this.checkNode(from, false, true);
    if (from === START) this.entryAdded = true;
    this.conditionalEdges.set(from as string, path);
    return this;
  }

  addReducer<Key extends string & keyof State>(key: Key, reducer: ChannelReducer<State[Key]>): this {
    this.reducers[key as string] = reducer as unknown as ChannelReducer<unknown>;
    return this;
  }

  private checkNode(name: NodeName, allowEnd: boolean, allowStart: boolean): void {
    if (name === START) {
      if (!allowStart) throw new StateGraphValidationError('START 不允许作为该位置的目标');
      return;
    }
    if (name === END) {
      if (!allowEnd) throw new StateGraphValidationError('END 不允许作为该位置的源');
      return;
    }
    if (!this.nodes.has(name as string)) {
      throw new StateGraphValidationError(`未注册节点：${String(name)}（用 addNode 先注册）`);
    }
  }

  compile(config: StateGraphNodeConfig = {}): CompiledGraph<State> {
    if (!this.entryAdded) throw new StateGraphValidationError('没有从 START 出发的边（invoke 会从哪个节点开始？）');
    const recursionLimit = config.recursionLimit ?? 25;
    const reducers: Record<string, ChannelReducer<unknown>> = { ...this.reducers };
    for (const [key, reducer] of Object.entries(config.reducers ?? {})) {
      if (reducer) reducers[key] = reducer as ChannelReducer<unknown>;
    }
    const mermaidEdges: [string, string][] = [[START, '__']];

    const nodes = [...this.nodes.keys()];
    const edges: [string, string][] = [];
    for (const [from, targets] of this.edges.entries()) for (const to of targets) edges.push([from, to]);
    for (const [from] of this.conditionalEdges.entries()) edges.push([from, '(conditional)']);
    mermaidEdges.pop();

    const invoke = async (input: Partial<State>): Promise<State> => {
      let state: AnyState = { ...(input as AnyState) };
      let active = this.nextFrom(START as string, state as State);
      for (let step = 0; step < recursionLimit; step++) {
        if (active.length === 0) return state as State;
        const runAt = [...new Set(active)];
        const partials = await Promise.all(
          runAt.map(async (name) => {
            const fn = this.nodes.get(name);
            if (!fn) throw new StateGraphValidationError(`未注册节点：${name}`);
            return { name, partial: (await fn(deepFreeze({ ...state } as State))) as AnyState };
          }),
        );
        for (const { name, partial } of partials) {
          state = await mergeUpdate(state, partial, reducers);
        }
        config.onStep?.(state as Readonly<Record<string, unknown>>, step, runAt);
        active = runAt.flatMap((name) => this.nextFrom(name, state as State));
      }
      throw new StateGraphRecursionError(recursionLimit);
    };

    const mermaid = (): string => {
      const lines = ['graph TD'];
      for (const [from, to] of edges) lines.push(`  ${label(from)} --> ${label(to)}`);
      return lines.join('\n');
    };

    const introspect = () => ({ nodes: nodes as readonly string[], edges: edges as readonly [string, string][] });

    return { invoke, mermaid, introspect };
  }

  private nextFrom(from: string, state: State): string[] {
    const out: string[] = [];
    const plain = this.edges.get(from);
    if (plain) out.push(...plain);
    const cond = this.conditionalEdges.get(from);
    if (cond) {
      const decision = cond(state);
      if (Array.isArray(decision)) {
        out.push(...decision.map(String));
      } else if (decision && decision !== END) {
        out.push(String(decision));
      }
    }
    return out.filter((name) => name !== END);
  }
}

function label(node: string): string {
  if (node === START) return 'S((start))';
  if (node === END) return 'E((end))';
  return node;
}
