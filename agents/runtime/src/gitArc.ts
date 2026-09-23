import type { Checkpoint, ToolRegistry } from './registry.js';
import type { Step, ToolResult } from './types.js';

/**
 * The git arc as ONE piece of data (M2 v47, ADR 0016 amendment 47).
 *
 * v36/38/44/45 nested four §28-gated git doors into the demo plan — staged → commit →
 * confirm(log) → inspect(show) — and the nesting rules lived inline in `planTask`. v24 of the
 * role side (§24) had no idea they existed: no demo role carried a git capability, so a
 * role-chain run could never walk the arc at all. The fix is not to widen `editor` (that would
 * hand commit power to every chained run by accident); it is to name the arc once so BOTH faces
 * — the single-registry plan and a role-scoped release stage — derive the same order, the same
 * args and the same nesting from the same source. Two copies of an order drift; this is the copy.
 */
export const GIT_ARC_TOOLS = ['git.staged', 'git.commit', 'git.log', 'git.show'] as const;

export type GitArcTool = (typeof GIT_ARC_TOOLS)[number];

/** Which door each tool is called as inside a plan (and in a chain handoff). */
const STEP_ID: Record<GitArcTool, string> = {
  'git.staged': 'staged',
  'git.commit': 'commit',
  'git.log': 'confirm',
  'git.show': 'inspect',
};

export type GitArcPresence = Record<GitArcTool, boolean>;

/**
 * The nesting, stated once: the arc belongs to `git.commit` (v36 — no commit door, no arc);
 * the hash confirm trails the commit (v38); the content read trails the hash confirm (v44);
 * the intent read precedes the commit it informs (v45). A host with a SUBSET of doors therefore
 * walks a shorter arc that is still correctly ordered — never a content read with no hash to
 * agree with, never a commit nobody was shown the intent of.
 */
export function gitArcDoors(present: GitArcPresence): GitArcTool[] {
  if (!present['git.commit']) return [];
  const doors: GitArcTool[] = present['git.staged'] ? ['git.staged', 'git.commit'] : ['git.commit'];
  if (!present['git.log']) return doors;
  doors.push('git.log');
  if (present['git.show']) doors.push('git.show');
  return doors;
}

export interface GitArcStepOptions {
  present: GitArcPresence;
  /** The commit message the arc would record — the CALLER's wording, never git's. */
  message: string;
  /**
   * What `git.show` reads back. The demo planner passes a LIVE `@ref` token (the path is only
   * known once the search step ran); a role-scoped walker passes the path its own earlier stage
   * already produced. Either way the planner never invents a path (v44).
   */
  showPath: string;
}

/** The arc's plan steps, in canonical order, for exactly the doors that are present. */
export function gitArcSteps(opts: GitArcStepOptions): Step[] {
  return gitArcDoors(opts.present).map((tool): Step => {
    switch (tool) {
      case 'git.staged':
        // `git diff` cannot see a staged change (v43), so a plan without this door is handed a
        // permission to record contents it has no way to read. Refusing THIS read stops the walk
        // before the commit, so a human who withholds the intent also withholds the write.
        // The plan has no conditionals, so an EMPTY index still walks into the commit — and
        // git's own "nothing staged" answer is the data the run carries (§60: the read makes
        // that gap visible, it does not paper over it).
        return {
          stepId: STEP_ID[tool],
          tool,
          args: { stat: false },
          rationale: 'read what the HUMAN staged — the intent the next step would record, read before it is recorded',
        };
      case 'git.commit':
        // Reached only after green verification, and it commits whatever the HUMAN staged —
        // the plan proposes, §28 disposes.
        return { stepId: STEP_ID[tool], tool, args: { message: opts.message }, rationale: 'commit the human-staged index — reached only after green verification' };
      case 'git.log':
        // The plan's last word is git's own echo, not our claim.
        return { stepId: STEP_ID[tool], tool, args: { count: 2 }, rationale: 'read the log back — the newest entry must equal the commit record' };
      case 'git.show':
        return { stepId: STEP_ID[tool], tool, args: { path: opts.showPath }, rationale: 'read HEAD\'s change for the target path — reached only after commit AND confirm' };
    }
  });
}

export interface GitArcOptions {
  /** Prefix for each door's callId, so a cold reader can join results to the stage that ran them. */
  callId: string;
  message: string;
  /** The live path to read back; absent ⇒ the content door is skipped and STATED in `notes`. */
  showPath?: string;
  /** The SAME human Checkpoint the plan faces uses — one gate per door, never one for the arc. */
  checkpoint?: Checkpoint;
}

export interface GitArcOutcome {
  /** Doors this role's scope could even attempt, in order — empty means the arc belongs to nobody. */
  doors: GitArcTool[];
  /** The exact step data walked (callIds and args included), so the walk is auditable, not narrated. */
  steps: Step[];
  results: ToolResult[];
  status: 'completed' | 'stopped' | 'no-arc';
  /** Door that did not pass, and the registry's own words about it. */
  stoppedAt?: string;
  reason?: string;
  /** What the arc deliberately did NOT do, and why — never a silent omission. */
  notes: string[];
}

/**
 * Walk the git arc through whatever registry the caller holds — used by the role-chain release
 * stage, where the registry is a role's scoped projection rather than the host's whole tool set.
 * Nothing here plans or invents: doors absent from the scope are absent from the walk (§24
 * capability-by-absence), the first refusal or red answer ends it, and every door asks §28 for
 * itself. The arc's results are NOT merged into any `RunOutcome` — this walk is a separate stage
 * with its own callIds, and rewriting a stage's plan to include another stage's steps would be a
 * lie about what that stage planned (§60).
 */
export async function runGitArc(registry: ToolRegistry, opts: GitArcOptions): Promise<GitArcOutcome> {
  const present: GitArcPresence = {
    'git.staged': registry.has('git.staged'),
    'git.commit': registry.has('git.commit'),
    'git.log': registry.has('git.log'),
    'git.show': registry.has('git.show'),
  };
  const notes: string[] = [];
  if (present['git.show'] && opts.showPath === undefined) {
    present['git.show'] = false;
    notes.push('git.show skipped: no live target path was handed to the arc, and a path the walker invented would be a guess');
  }
  const doors = gitArcDoors(present);
  if (doors.length === 0) {
    return { doors, steps: [], results: [], status: 'no-arc', notes, reason: 'no git.commit in this scope — the arc belongs to no role by absence (§24)' };
  }
  const steps = gitArcSteps({ present, message: opts.message, showPath: opts.showPath ?? '' });
  const results: ToolResult[] = [];
  for (const step of steps) {
    const res = await registry.invoke({ callId: `${opts.callId}:${step.stepId}`, tool: step.tool, args: step.args }, { checkpoint: opts.checkpoint });
    results.push(res);
    if (!res.ok) {
      const denied = (res.error ?? '').includes('checkpoint');
      return { doors, steps, results, status: 'stopped', stoppedAt: step.stepId, notes, reason: denied ? `denied at ${step.stepId}: ${res.error}` : `${step.stepId} did not pass: ${res.error}` };
    }
  }
  return { doors, steps, results, status: 'completed', notes };
}
