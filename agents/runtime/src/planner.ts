import { hashString } from '@nexus/ai-providers';
import type { AgentTask, Plan, Step } from './types.js';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'into', 'onto', 'add', 'adds', 'all', 'any',
  'please', 'make', 'like', 'from', 'should', 'would', 'have', 'has', 'was', 'are', 'its',
]);

/** Deterministic keyword: first goal token ≥3 chars that isn't a stopword. */
export function goalKeyword(goal: string): string {
  const tokens = goal.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.find((t) => t.length >= 3 && !STOPWORDS.has(t)) ?? 'readme';
}

export interface PlannerOptions {
  /** Whether a `test.run` verification tool is registered (host decides). */
  hasVerify: boolean;
  /** Whether the hybrid `fs.index` tool is registered; without it, plain line search. */
  hasIndex?: boolean;
  seed?: number;
}

/**
 * The DEMO-MODE planner (§63 "planning"): a fixed, seed-stamped research → read →
 * annotate → verify template. Fully deterministic given (task, options); it is honest
 * template planning, *not* model-quality reasoning (§60).
 */
export function planTask(task: AgentTask, opts: PlannerOptions): Plan {
  const seed = opts.seed ?? hashString(`${task.id}|${task.goal}`);
  const term = goalKeyword(task.goal);
  const target = task.targetPath ?? '@search.hits.0.path';
  const note = `NOTE (DEMO MODE · agent ${task.id} · seed ${seed}): goal "${task.goal}"`;
  const steps: Step[] = [
    opts.hasIndex
      ? { stepId: 'search', tool: 'fs.index', args: { query: task.goal }, rationale: 'hybrid index query for the goal' }
      : { stepId: 'search', tool: 'fs.search', args: { term }, rationale: `locate content matching "${term}"` },
    { stepId: 'read', tool: 'fs.read', args: { path: target }, rationale: 'inspect the target file' },
    { stepId: 'annotate', tool: 'fs.append', args: { path: target, text: note }, rationale: 'record that the goal was addressed' },
  ];
  if (opts.hasVerify) {
    steps.push({ stepId: 'verify', tool: 'test.run', args: {}, rationale: 'host-injected verification hook' });
  }
  return { goal: task.goal, seed, steps };
}
