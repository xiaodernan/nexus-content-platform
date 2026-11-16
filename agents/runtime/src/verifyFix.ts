import { StateGraph, START, END } from './stategraph.js';
import type { Step, ToolResult, AgentEventBody, AgentTask, Plan } from './types.js';

/**
 * §v816（ADR-0272）：§63 的 verify → 有界自动修 → 复验，被写成**显式状态图**，而不是
 * 一个 `while`。语义与原 while 逐字节对齐——外部事件序列、步骤预算、结果一致性不变——
 * 但图的形状现在是一等公民：
 *
 *   LOOP  := fix-N (fs.append 提案) → verify-N+1 (test.run 复验)
 *   END   := green（首次或某轮转绿）‖ 达到 maxFixRounds ‖ 达到 maxSteps 预算
 *
 * 为什么这个循环适合图而不是流水线：它是带环的（fix→verify→fix→verify），且环的退出
 * 有三条独立的条件边；写成 if/while 时三条线全揉在循环体里，一眼看不出"有几条出场方式、
 * 每条按什么停"。写成 StateGraph 之后，退出即条件边，递归上限由 recursionLimit 兜底
 *（不再可能手滑写出无限修），且 onStep 为审计/任务页（/tasks）提供天然检查点。
 *
 * 约定（与 stategraph.ts 同一套语法）：
 * - 绿是状态里的一个 flag，不是异常；
 * - 退出不返回半成品（§159）：green=true 意味着复验真的通过；
 * - 图实例**每次调用都新编译**：这个图有零共享状态，compile 成本是几次 Map 分配，
 *   不值得为它做"缓存编入"的复杂度。
 */

export interface VerifyFixContext {
  task: AgentTask;
  plan: Plan;
  /** 最多自动修几轮（§63 有界自修，默认走 RunOptions.maxFixRounds） */
  maxFixRounds: number;
  /** 与外部走查共享的总步数上限（fix 与 verify 都占预算） */
  maxSteps: number;
  /** 共享的 "search 之前的产物" 视图——fix 步骤要定位追加到哪个文件 */
  byStep: Map<string, ToolResult>;
  /** 与外部 `emit` 同一个函数（事件时间线必须只有一个作者） */
  emit: (e: AgentEventBody) => void;
  /**
   * 与外部 `invoke` 同一个函数——由它递增 stepsUsed（`invoke` 是预算的唯一写入方）；
   * 这里通过引用读预算，而不是复制一份数（复制就会再写一个陈旧的小预算计数器）。
   */
  invoke: (step: Step) => Promise<ToolResult>;
  /** 总预算的可变视图（外部闭包里的 `stepsUsed.value`） */
  stepsUsedRef: Readonly<{ value: number }>;
  dig: (root: unknown, path: readonly (string | number)[]) => unknown;
  /**
   * 首轮入图前的复验结果：true = 已绿（START 直接出 END，fix 一轮都不跑）；
   * false = 进入修→验环。传入而不是读状态，因为 verdict 是"上一步"的输出，
   * 不是图的一部分——图只管"再修几轮"。
   */
  initialGreen: boolean;
}

export interface VerifyFixResult {
  green: boolean;
  /** 本次真正执行的修轮数（测试钉的是行为，这个数给 /tasks 类审计用） */
  fixRoundsUsed: number;
}

interface VerifyFixState extends Record<string, unknown> {
  /** 第几轮 fix（0 = 还没修过） */
  attempt: number;
  /** 当前是否已绿（每轮复验后置） */
  green: boolean;
  /** 节点内自检发现的"不用再进环"信号（防御式；正常由条件边退出） */
  done: boolean;
}

const FIX_ROUND = 'fixRound';

export async function runVerifyFixLoop(ctx: VerifyFixContext): Promise<VerifyFixResult> {
  const { maxFixRounds, maxSteps, initialGreen } = ctx;

  const compiled = new StateGraph<VerifyFixState>()
    .addNode(FIX_ROUND, async (state) => {
      const attempt = state.attempt + 1;
      if (state.green || attempt > maxFixRounds || ctx.stepsUsedRef.value >= maxSteps) {
        // 防御式退出：条件边应当已经拦截住；到这里说明边和预算各管各的——以状态为准放行，不崩。
        return { attempt: state.attempt, green: state.green, done: true };
      }
      const fixStep: Step = {
        stepId: `fix-${attempt}`,
        tool: 'fs.append',
        args: {
          path: ctx.task.targetPath ?? ctx.dig(ctx.byStep.get('search')?.output, ['hits', 0, 'path']),
          text: `FIX (DEMO MODE · attempt ${attempt}): goal "${ctx.task.goal}"`,
        },
        rationale: `auto-fix round ${attempt} after failed verification`,
      };
      ctx.plan.steps.push(fixStep);
      ctx.emit({ type: 'fix', stepId: fixStep.stepId, attempt });
      await ctx.invoke(fixStep);
      const rerun: Step = { stepId: `verify-${attempt + 1}`, tool: 'test.run', args: {}, rationale: 're-verify' };
      ctx.plan.steps.push(rerun);
      const again = await ctx.invoke(rerun);
      const v2 = again.output as { ok?: boolean; detail?: string };
      ctx.emit({ type: 'verify', ok: v2.ok === true, detail: String(v2.detail ?? '') });
      return { attempt, green: again.ok === true && v2.ok === true, done: false };
    })
    .addConditionalEdges(START, (state) =>
      state.green || maxFixRounds <= 0 || ctx.stepsUsedRef.value >= maxSteps ? END : FIX_ROUND,
    )
    .addConditionalEdges(FIX_ROUND, (state) =>
      state.done || state.green || state.attempt >= maxFixRounds || ctx.stepsUsedRef.value >= maxSteps
        ? END
        : FIX_ROUND,
    )
    .compile({ recursionLimit: maxFixRounds + 2 });

  const final = await compiled.invoke({ attempt: 0, green: initialGreen, done: false });
  return { green: final.green, fixRoundsUsed: final.attempt };
}
