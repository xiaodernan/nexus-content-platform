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
  /** Whether `memory.recall` is registered; prior findings beat re-researching (§26). */
  hasMemory?: boolean;
  /** v20: UI-driving capabilities registered; plans observe→type→click over labels. */
  hasUi?: boolean;
  /**
   * v36: whether the exec-host `git.commit` tool is registered. Only meaningful WITH
   * hasVerify — a commit step is appended AFTER verify and the loop only reaches it on
   * green. Staging itself remains a human act: the tool commits whatever the index holds.
   */
  hasCommit?: boolean;
  /**
   * v38: whether the exec-host `git.log` read-back tool is registered. Only meaningful
   * WITH hasCommit — a confirm step trails the commit so the plan itself ends
   * see→touch→confirm, letting the run read its own history back after green.
   */
  hasConfirm?: boolean;
  /**
   * v44: whether the exec-host `git.show` CONTENT read-back tool is registered. Only
   * meaningful WITH hasConfirm — an inspect step trails the hash confirm so the plan's
   * tail says not just THAT a commit landed but WHAT it recorded (git's own echo).
   */
  hasContent?: boolean;
  /**
   * v39: whether a `memory.save` tool is registered. Only meaningful WITH hasConfirm —
   * a remember step trails the confirmed commit so §26 memory only ever records an arc
   * that VERIFIED, LANDED and READ BACK AGREEING. Position in the plan is the safety:
   * no earlier failure or denial can produce a "remembered victory" that didn't happen.
   */
  hasRemember?: boolean;
  uiInputLabel?: string;
  uiButtonLabel?: string;
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
  const research: Step = opts.hasMemory
    ? { stepId: 'search', tool: 'memory.recall', args: { query: task.goal }, rationale: 'recall prior findings from memory' }
    : opts.hasIndex
      ? { stepId: 'search', tool: 'fs.index', args: { query: task.goal }, rationale: 'hybrid index query for the goal' }
      : { stepId: 'search', tool: 'fs.search', args: { term }, rationale: `locate content matching "${term}"` };
  if (opts.hasUi) {
    const uiSteps: Step[] = [
      { stepId: 'search', tool: 'ui.observe', args: {}, rationale: 'see what the page offers' },
      { stepId: 'annotate', tool: 'ui.type', args: { label: opts.uiInputLabel ?? 'prompt', text: task.goal }, rationale: 'type the goal into the composer' },
      { stepId: 'act', tool: 'ui.click', args: { label: opts.uiButtonLabel ?? 'Compose' }, rationale: 'press the action' },
    ];
    if (opts.hasVerify) uiSteps.push({ stepId: 'verify', tool: 'test.run', args: {}, rationale: 'host verification of the UI effect' });
    return { goal: task.goal, seed, steps: uiSteps };
  }
  const steps: Step[] = [
    research,
    { stepId: 'read', tool: 'fs.read', args: { path: target }, rationale: 'inspect the target file' },
    { stepId: 'annotate', tool: 'fs.append', args: { path: target, text: note }, rationale: 'record that the goal was addressed' },
  ];
  if (opts.hasVerify) {
    steps.push({ stepId: 'verify', tool: 'test.run', args: {}, rationale: 'host-injected verification hook' });
    // v36 "commit after green": a step appended AFTER verify is only ever reached when
    // the loop is green (a failed verify returns early), and the tool itself commits
    // whatever the HUMAN staged — the plan proposes, §28 disposes.
    if (opts.hasCommit) {
      steps.push({
        stepId: 'commit',
        tool: 'git.commit',
        args: { message: `chore(agent): verified run ${task.id} · seed ${seed}` },
        rationale: 'commit the human-staged index — reached only after green verification',
      });
      // v38 "confirm after commit": the plan's LAST word is git's own echo, not our claim.
      if (opts.hasConfirm) {
        steps.push({
          stepId: 'confirm',
          tool: 'git.log',
          args: { count: 2 },
          rationale: 'read the log back — the newest entry must equal the commit record',
        });
        // v44 "content confirmation": git's own diff echo for the target path trails the
        // hash confirm. A denial here stops the walk like any tail step; git answering
        // "HEAD touches nothing at <path>" is honest DATA — the run reads WHAT landed,
        // it does not choose it (staging remains the human act of v35).
        if (opts.hasContent) {
          steps.push({
            stepId: 'inspect',
            tool: 'git.show',
            args: { path: target },
            rationale: 'read HEAD\'s change for the target path — reached only after commit AND confirm',
          });
        }
        // v39 "remembered victory": the ONLY place a memory.save is ever planned is the
        // tail of the full verify→commit→confirm arc — position is the safety, so §26
        // memory can never hold a "victory" that didn't verify, land, and read back
        // agreeing. The record names its run; the ledger carries the hash it confirmed.
        if (opts.hasRemember) {
          steps.push({
            stepId: 'remember',
            tool: 'memory.save',
            args: {
              runId: task.id,
              query: task.goal,
              summary: `COMMITTED+CONFIRMED (DEMO MODE · seed ${seed}): goal "${task.goal}" — git.commit landed and git.log read-back agreed`,
              refs: [target],
            },
            rationale: 'journal the confirmed arc into §26 memory — reached only after commit AND confirm both passed',
          });
        }
      }
    }
  }
  return { goal: task.goal, seed, steps };
}
