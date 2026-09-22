import { createChangeSet } from './changes.js';
import { demoPlanner, type PlanBackend } from './planBackend.js';
import type { Checkpoint, ToolRegistry } from './registry.js';
import type { TestReport } from './testRunner.js';
import type {
  AgentEvent,
  AgentEventBody,
  AgentTask,
  Plan,
  Provenance,
  RunOutcome,
  Step,
  TaskStatus,
  ToolResult,
} from './types.js';

export interface RunOptions {
  registry: ToolRegistry;
  /** Human Checkpoint gate (ADR 0013). Omitted = deny: non-read tools never run. */
  checkpoint?: Checkpoint;
  maxSteps?: number;
  maxFixRounds?: number;
  /** v7: workspace snapshot hook; when given, the outcome carries an observed ChangeSet. */
  snapshot?: () => Record<string, string>;
  /** v17: planning backend (default: the deterministic demo planner). */
  planner?: PlanBackend;
  uiInputLabel?: string;
  uiButtonLabel?: string;
}

const PROVENANCE: Provenance = { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' };

function dig(root: unknown, path: readonly (string | number)[]): unknown {
  let cur = root;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
    if (cur === undefined) return undefined;
  }
  return cur;
}

/**
 * The §63 loop for M2 v0: plan → act (registry-gated) → observe (`@ref` dataflow) →
 * verify → bounded auto-fix. Deterministic and hermetic; every run carries demo
 * provenance and a full event log so nothing is claimable beyond what actually ran.
 */
export async function runTask(task: AgentTask, opts: RunOptions): Promise<RunOutcome> {
  const { registry, checkpoint } = opts;
  const maxSteps = opts.maxSteps ?? 12;
  const maxFixRounds = opts.maxFixRounds ?? 2;
  const events: AgentEvent[] = [];
  const results: ToolResult[] = [];
  const byStep = new Map<string, ToolResult>();
  const testReports: TestReport[] = [];
  const beforeSnapshot = opts.snapshot?.();
  const finishRun = (status: TaskStatus): RunOutcome => {
    const out = finish(task, plan, results, events, status);
    if (opts.snapshot && beforeSnapshot) out.changeSet = createChangeSet(task.id, beforeSnapshot, opts.snapshot());
    out.planner = plannerMeta;
    if (testReports.length > 0) out.testReports = [...testReports];
    return out;
  };
  let at = 0;
  let stepsUsed = 0;
  const emit = (e: AgentEventBody): void => {
    events.push({ ...e, at: at++ } as AgentEvent);
  };

  const plannerBackend = opts.planner ?? demoPlanner;
  const planned = await plannerBackend.plan(
    task,
    { hasVerify: registry.has('test.run'), hasIndex: registry.has('fs.index'), hasMemory: registry.has('memory.recall'), hasUi: registry.has('ui.click'), hasCommit: registry.has('git.commit'), hasConfirm: registry.has('git.log'), hasRemember: registry.has('memory.save'), uiInputLabel: opts.uiInputLabel, uiButtonLabel: opts.uiButtonLabel },
    (name) => registry.has(name),
  );
  const plan: Plan = planned.plan;
  const plannerMeta: RunOutcome['planner'] = planned.fellBack
    ? { backend: planned.backend, fellBack: planned.fellBack }
    : { backend: planned.backend };
  emit({ type: 'plan', plan });

  const resolveArgs = (step: Step): Record<string, unknown> => {
    const resolve = (v: unknown): unknown => {
      if (typeof v === 'string' && v.startsWith('@')) {
        const [stepId, ...path] = v.slice(1).split('.');
        return dig(byStep.get(stepId!)?.output, path);
      }
      // v39: @refs resolve INSIDE array args too (memory.save refs carry the live search hit).
      return Array.isArray(v) ? v.map(resolve) : v;
    };
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(step.args)) out[k] = resolve(v);
    return out;
  };

  const invoke = async (step: Step): Promise<ToolResult> => {
    stepsUsed++;
    emit({ type: 'step_start', stepId: step.stepId, tool: step.tool });
    const res = await registry.invoke(
      { callId: `${task.id}:${step.stepId}`, tool: step.tool, args: resolveArgs(step) },
      { checkpoint },
    );
    byStep.set(step.stepId, res);
    results.push(res);
    if (res.ok && step.tool === 'test.run') {
      const rep = (res.output as { report?: TestReport } | undefined)?.report;
      if (rep) testReports.push(rep);
    }
    emit({ type: 'step_result', stepId: step.stepId, result: res });
    return res;
  };

  for (const step of plan.steps) {
    if (byStep.has(step.stepId)) continue; // v36: fix-round steps already ran inline — never twice
    if (stepsUsed >= maxSteps) {
      emit({ type: 'budget_exhausted', stepsUsed });
      emit({ type: 'done', status: 'budget_exhausted' });
      return finishRun( 'budget_exhausted');
    }
    const res = await invoke(step);
    if (!res.ok) {
      const denied = (res.error ?? '').includes('checkpoint');
      emit({ type: 'checkpoint', stepId: step.stepId, tool: step.tool, granted: false });
      const status: TaskStatus = denied ? 'denied' : 'failed_verification';
      emit({ type: 'done', status });
      return finishRun( status);
    }
    if (step.stepId !== 'verify') continue;
    const verdict = res.output as { ok?: boolean; detail?: string };
    emit({ type: 'verify', ok: verdict.ok === true, detail: String(verdict.detail ?? '') });
    let green = verdict.ok === true;
    let attempt = 0;
    while (!green && attempt < maxFixRounds && stepsUsed < maxSteps) {
      attempt++;
      const fixStep: Step = {
        stepId: `fix-${attempt}`,
        tool: 'fs.append',
        args: {
          path: task.targetPath ?? dig(byStep.get('search')?.output, ['hits', 0, 'path']),
          text: `FIX (DEMO MODE · attempt ${attempt}): goal "${task.goal}"`,
        },
        rationale: `auto-fix round ${attempt} after failed verification`,
      };
      plan.steps.push(fixStep);
      emit({ type: 'fix', stepId: fixStep.stepId, attempt });
      await invoke(fixStep);
      const rerun: Step = { stepId: `verify-${attempt + 1}`, tool: 'test.run', args: {}, rationale: 're-verify' };
      plan.steps.push(rerun);
      const again = await invoke(rerun);
      const v2 = again.output as { ok?: boolean; detail?: string };
      emit({ type: 'verify', ok: v2.ok === true, detail: String(v2.detail ?? '') });
      if (again.ok && v2.ok === true) green = true;
    }
    if (!green) {
      emit({ type: 'done', status: 'failed_verification' });
      return finishRun( 'failed_verification');
    }
    // v36: green — keep walking the plan. A `git.commit` step was only ever appended
    // after verify, so it is reached on green runs (first try OR after a fix round).
    // v38: the trailing `git.log` confirm rides that same walk — a denial there yields
    // status `denied` while the landed commit's result honestly STANDS in `results`.
    // v39: the trailing `memory.save` remember rides it too — §26 memory only ever sees
    // an arc that verified, committed AND confirmed; a denial there says so, loudly.
  }
  emit({ type: 'done', status: 'completed' });
  return finishRun( 'completed');
}

function finish(
  task: AgentTask,
  plan: Plan,
  results: ToolResult[],
  events: AgentEvent[],
  status: TaskStatus,
): RunOutcome {
  return { task, provenance: PROVENANCE, plan, results, events, status };
}
