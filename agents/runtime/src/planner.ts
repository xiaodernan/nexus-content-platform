import { hashString } from '@nexus/ai-providers';
import { gitArcSteps } from './gitArc.js';
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
   * v45: whether the exec-host `git.staged` index-read tool is registered. Only meaningful
   * WITH hasCommit — a staged step is inserted BEFORE the commit it informs, so the plan asks
   * "what did the human stage?" one step before §28 asks permission to record it. The agent
   * reads the index; it never writes it (staging stays the human act of v35).
   */
  hasStaged?: boolean;
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
   * that VERIFIED and walked BOTH git doors. Position in the plan is the safety: no
   * earlier failure or denial can produce a "remembered victory" that didn't happen.
   * v45's limit, stated: walking the commit door is not the same as git recording
   * something, so the planned summary names the ARC and cites git's answer for the rest.
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
    // v36 "commit after green": a step appended AFTER verify is only ever reached when the loop
    // is green (a failed verify returns early), and the tool itself commits whatever the HUMAN
    // staged — the plan proposes, §28 disposes. v38/44/45 nested the rest of the git doors here;
    // v47 moved that order into `gitArc.ts` so the role-chain release stage walks the SAME data.
    // The plan's shape is unchanged: every door the host registered, in canonical order, behind
    // green — and every one of them still has to ask §28 for itself.
    if (opts.hasCommit) {
      steps.push(...gitArcSteps({
        present: { 'git.staged': !!opts.hasStaged, 'git.commit': true, 'git.log': !!opts.hasConfirm, 'git.show': !!opts.hasContent },
        message: `chore(agent): verified run ${task.id} · seed ${seed}`,
        showPath: target,
      }));
      // v39 "remembered victory": the ONLY place a memory.save is ever planned is the
      // tail of the full verify→commit→confirm arc — position is the safety, so §26
      // memory can never hold a "victory" that didn't verify, land, and read back
      // agreeing. The record names its run; the ledger carries the hash it confirmed.
      // v45 corrects the SENTENCE: position guarantees the doors were walked, not that
      // git recorded anything (a granted commit of an EMPTY index exits 1), so the
      // summary says ARC-COMPLETE and leaves the landing to git's own answer in results.
      if (opts.hasConfirm && opts.hasRemember) {
        steps.push({
          stepId: 'remember',
          tool: 'memory.save',
          args: {
            runId: task.id,
            query: task.goal,
            summary: `ARC-COMPLETE (DEMO MODE · seed ${seed}): goal "${task.goal}" — verify, git.commit and git.log all ran under §28; whether anything LANDED is git's own answer, in this run's results`,
            refs: [target],
          },
          rationale: 'journal the confirmed arc into §26 memory — reached only after commit AND confirm both passed',
        });
      }
    }
  }
  return { goal: task.goal, seed, steps };
}
