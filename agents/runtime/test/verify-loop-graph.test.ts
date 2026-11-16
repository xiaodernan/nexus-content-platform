import { describe, expect, it, vi } from 'vitest';
import { runVerifyFixLoop } from '../src/verifyFix.js';
import type { AgentEventBody, Plan, Step, ToolResult } from '../src/types.js';

const TASK = { id: 't-graph', goal: 'graph wiring test', targetPath: 'note.md' };
const makePlan = (): Plan => ({ goal: TASK.goal, seed: 1, steps: [] });

function makeHarness(opts: {
  initialGreen: boolean;
  /** 脚本化的复验结果（按轮次），不够的轮次尾随 false */
  verifySequence?: boolean[];
  maxFixRounds?: number;
  maxSteps?: number;
  startUsed?: number;
}) {
  const plan = makePlan();
  const stepsUsed = { value: opts.startUsed ?? 3 };
  const results: ToolResult[] = [];
  const events: AgentEventBody[] = [];
  const verifySeq = [...(opts.verifySequence ?? [])];
  const invoke = vi.fn(async (step: Step): Promise<ToolResult> => {
    stepsUsed.value += 1;
    if (step.tool === 'test.run') {
      const ok = verifySeq.length > 0 ? Boolean(verifySeq.shift()) : false;
      return { callId: `${TASK.id}:${step.stepId}`, tool: step.tool, ok: true, output: { ok, detail: ok ? 'passed' : 'failed' } };
    }
    const res: ToolResult = { callId: `${TASK.id}:${step.stepId}`, tool: step.tool, ok: true, output: { appended: true } };
    results.push(res);
    return res;
  });
  const emit = vi.fn((e: AgentEventBody) => { events.push(e); });
  return {
    plan,
    stepsUsed,
    invoke,
    emit,
    events,
    results,
    run: () =>
      runVerifyFixLoop({
        task: TASK,
        plan,
        maxFixRounds: opts.maxFixRounds ?? 2,
        maxSteps: opts.maxSteps ?? 12,
        byStep: new Map(),
        emit,
        invoke,
        stepsUsedRef: stepsUsed,
        dig: () => undefined,
        initialGreen: opts.initialGreen,
      }),
  };
}

describe('runVerifyFixLoop（StateGraph 接线）', () => {
  it('initialGreen=true → 一个修环都不跑（START 直接出 END）', async () => {
    const h = makeHarness({ initialGreen: true });
    const r = await h.run();
    expect(r).toEqual({ green: true, fixRoundsUsed: 0 });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(h.plan.steps).toEqual([]);
  });

  it('复验首轮转绿 → 恰好一轮修，事件序列 fix-1 → verify-2', async () => {
    const h = makeHarness({ initialGreen: false, verifySequence: [true] });
    const r = await h.run();
    expect(r).toEqual({ green: true, fixRoundsUsed: 1 });
    expect(h.plan.steps.map((s) => s.stepId)).toEqual(['fix-1', 'verify-2']);
    expect(h.events.map((e) => e.type)).toEqual(['fix', 'verify']);
  });

  it('复验持续失败：跑满 maxFixRounds，green=false，fix-N 与 verify-N+1 成对入计划', async () => {
    const h = makeHarness({ initialGreen: false, maxFixRounds: 2, verifySequence: [false, false] });
    const r = await h.run();
    expect(r).toEqual({ green: false, fixRoundsUsed: 2 });
    expect(h.plan.steps.map((s) => s.stepId)).toEqual(['fix-1', 'verify-2', 'fix-2', 'verify-3']);
    expect(h.invoke.mock.calls.map((c) => c[0].stepId)).toEqual(['fix-1', 'verify-2', 'fix-2', 'verify-3']);
  });

  it('预算耗尽时零修：stepsUsed 一到 maxSteps，环不进入', async () => {
    const h = makeHarness({ initialGreen: false, maxFixRounds: 2, maxSteps: 4, startUsed: 4, verifySequence: [true] });
    const r = await h.run();
    expect(r).toEqual({ green: false, fixRoundsUsed: 0 });
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('第二轮预算才耗尽：首轮跑到，第二轮不进', async () => {
    const h = makeHarness({ initialGreen: false, maxFixRounds: 3, maxSteps: 5, startUsed: 3, verifySequence: [false, true] });
    const r = await h.run();
    // 首轮：stepsUsed 3→5（fix-1 + verify-2），复验失败；5 ≥ 5 ⇒ 环退出
    expect(r).toEqual({ green: false, fixRoundsUsed: 1 });
    expect(h.plan.steps.map((s) => s.stepId)).toEqual(['fix-1', 'verify-2']);
  });

  it('maxFixRounds=0 → 一个修环都不跑', async () => {
    const h = makeHarness({ initialGreen: false, maxFixRounds: 0 });
    const r = await h.run();
    expect(r).toEqual({ green: false, fixRoundsUsed: 0 });
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
