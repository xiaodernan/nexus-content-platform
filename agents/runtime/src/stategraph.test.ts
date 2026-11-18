import { describe, expect, it } from 'vitest';
import {
  StateGraph,
  StateGraphRecursionError,
  StateGraphValidationError,
  START,
  END,
  appendSeq,
  binaryOp,
  lastValue,
} from './stategraph';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TestState extends Record<string, unknown> {
  counter: number;
  history: readonly string[];
  score: number;
  done: boolean;
}

const fresh = (): TestState => ({ counter: 0, history: [], score: 0, done: false });

describe('stategraph 核心语义', () => {
  it('线性链 A→B：B 读到 A 提交后的状态', async () => {
    const g = new StateGraph<TestState>()
      .addNode('a', (s) => ({ counter: (s.counter as number) + 1, history: ['a'] }))
      .addNode('b', (s) => ({ score: (s.counter as number) * 10 }))
      .addEdge(START, 'a')
      .addEdge('a', 'b')
      .addEdge('b', END)
      .addReducer('history', appendSeq<string>());
    const out = await g.compile().invoke(fresh());
    expect(out.counter).toBe(1);
    expect(out.score).toBe(10);
    expect(out.history).toEqual(['a']);
  });

  it('条件边：decide 按 state 分派到 bump / stop，未选中的分支不执行', async () => {
    const ran = { bump: 0, stop: 0 };
    const g = new StateGraph<TestState>()
      .addNode('decide', () => ({}))
      .addNode('bump', (s) => { ran.bump++; return { counter: s.counter + 1 }; })
      .addNode('stop', (_s) => { ran.stop++; return { done: true }; })
      .addEdge(START, 'decide')
      .addConditionalEdges('decide', (s) => (s.counter >= 2 ? 'stop' : 'bump'))
      .addEdge('bump', 'decide')
      .addEdge('stop', END);
    const out = await g.compile({ recursionLimit: 10 }).invoke(fresh());
    expect(ran.bump).toBe(2);
    expect(ran.stop).toBe(1);
    expect(out.done).toBe(true);
  });

  it('fan-out：START 同时激活两个节点，同一 super-step 并行执行并各自提交', async () => {
    const order: string[] = [];
    const g = new StateGraph<TestState>()
      .addNode('slow', async () => { await delay(25); order.push('slow'); return { score: 1 }; })
      .addNode('fast', async () => { order.push('fast'); return { score: 2 }; })
      .addEdge(START, 'slow')
      .addEdge(START, 'fast')
      .addEdge('slow', END)
      .addEdge('fast', END);
    const out = await g.compile().invoke(fresh());
    expect(order).toEqual(['fast', 'slow']);
    expect(out.score).toBe(2); // 提交顺序 = 激活顺序；后写覆盖先写（lastValue）
  });

  it('appendSeq reducer 在多个节点之间累积序列', async () => {
    const g = new StateGraph<TestState>()
      .addNode('a', () => ({ history: ['a1'] }))
      .addNode('b', () => ({ history: ['b1'] }))
      .addEdge(START, 'a')
      .addEdge('a', 'b')
      .addEdge('b', END)
      .addReducer('history', appendSeq<string>());
    const out = await g.compile().invoke(fresh());
    expect(out.history).toEqual(['a1', 'b1']);
  });

  it('binaryOp reducer：reducer 在同一 super-step 内也正确合并（不丢左值）', async () => {
    const g = new StateGraph<TestState>()
      .addNode('left', () => ({ score: 3 }))
      .addNode('right', () => ({ score: 4 }))
      .addEdge(START, 'left')
      .addEdge(START, 'right')
      .addEdge('left', END)
      .addEdge('right', END)
      .addReducer('score', binaryOp<number>((a, b) => a + b));
    const out = await g.compile().invoke(fresh());
    expect(out.score).toBe(7);
  });

  it('recursionLimit：自环不到 END → 抛 StateGraphRecursionError', async () => {
    const g = new StateGraph<TestState>()
      .addNode('loop', () => ({ counter: 1 }))
      .addEdge(START, 'loop')
      .addEdge('loop', 'loop');
    await expect(g.compile({ recursionLimit: 5 }).invoke(fresh())).rejects.toBeInstanceOf(StateGraphRecursionError);
  });

  it('校验：注册重复节点 / 未注册节点被 addEdge 引用 / 没有从 START 出发的边', () => {
    const g = new StateGraph<TestState>().addNode('a', () => ({}));
    expect(() => g.addNode('a', () => ({}))).toThrow(StateGraphValidationError);
    expect(() => new StateGraph<TestState>().addEdge(START, 'nope' as never)).toThrow(StateGraphValidationError);
    expect(() => new StateGraph<TestState>().addEdge('phantom' as never, END)).toThrow(StateGraphValidationError);
    expect(() => new StateGraph<TestState>().addNode('a', () => ({})).compile()).toThrow(StateGraphValidationError);
  });

  it('onStep：每个 super-step 提交后触发，参数含 stepIndex 与 active 节点', async () => {
    const steps: { stepIndex: number; active: readonly string[] }[] = [];
    const g = new StateGraph<TestState>()
      .addNode('a', () => ({ counter: 1 }))
      .addEdge(START, 'a')
      .addEdge('a', END);
    await g.compile({ onStep: (_s, stepIndex, active) => { steps.push({ stepIndex, active }); } }).invoke(fresh());
    expect(steps).toHaveLength(1);
    expect(steps[0]!.stepIndex).toBe(0);
    expect(steps[0]!.active).toEqual(['a']);
  });

  it('mermaid() 输出包含 START→节点与节点→END 的边', () => {
    const g = new StateGraph<TestState>()
      .addNode('a', () => ({}))
      .addEdge(START, 'a')
      .addEdge('a', END);
    const text = g.compile().mermaid();
    expect(text).toContain('graph TD');
    expect(text).toContain('S((start)) --> a');
    expect(text).toContain('a --> E((end))');
  });

  it('introspect() 暴露图结构（节点集 + 边表）', () => {
    const g = new StateGraph<TestState>()
      .addNode('a', () => ({}))
      .addNode('b', () => ({}))
      .addEdge(START, 'a')
      .addEdge('a', 'b')
      .addConditionalEdges('b', () => END);
    const info = g.compile().introspect();
    expect(info.nodes).toEqual(['a', 'b']);
    expect(info.edges).toContainEqual(['a', 'b']);
    expect(info.edges).toContainEqual(['b', '(conditional)']);
  });

  it('lastValue reducer 是默认通道行为（后写覆盖先写）', () => {
    const reducer = lastValue<number>();
    expect(reducer(1, 2)).toBe(2);
    expect(reducer(9, 4)).toBe(4);
  });
});
