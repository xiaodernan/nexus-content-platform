import { hashString } from '@nexus/ai-providers';
import { planBuildArc, type BuildArcSpec } from './buildArc.js';

/**
 * M6 v175 (ADR 0016 amendment 175, DEVELOPMENT_PLAN item 8): the BUILD-ARC PLANNER — the
 * seam that picks an arc's steps from a goal, so the walk (v173) can be fed by a function
 * of (goal, world) instead of one hand-pinned constant. The door and the §28 gate are
 * UNCHANGED: a plan is still inert data, and `runBuildArc` still opens one gate per step.
 *
 * The honesty that keeps this a template planner and not a claim of reasoning (§60/§63):
 * the planner NEVER writes an argv string. The host declares a step CATALOG — frozen argv
 * templates the container policy has already validated — and the planner's entire freedom
 * is WHICH templates it summons, by keyword match against the goal, in catalog order. A
 * goal that summons nothing is a REFUSAL with its reason, never a fallback arc invented
 * out of the planner's own imagination. The seed is provenance (the same §63 stamp
 * `planTask` carries), not a shuffle: given (catalog, goal) the draft is fully
 * deterministic, and the provenance travels with the draft so no arc can masquerade as
 * anything but what planned it.
 */

/** One frozen step the host offers. The planner instantiates it; it never edits it. */
export interface BuildStepTemplate {
  /** Also the stepId the instantiated step walks under — callIds join on it. */
  id: string;
  /** The exact argv, frozen at declaration (policy-validated by the host's own duty). */
  argv: readonly string[];
  rationale: string;
  /** Verifier-side relative workdir, as `BuildArcStepSpec.cwd`. Absent = the root. */
  cwd?: string;
  /**
   * Goal tokens (lowercased, compared against the goal's own tokens) that summon this
   * template. ABSENT = summoned by every goal — the baseline steps a lane always runs.
   */
  keywords?: readonly string[];
}

export interface BuildArcRequest {
  goal: string;
  arcId?: string;
}

/** WHERE the steps came from — stamped onto every draft (§4/§63 provenance discipline). */
export interface BuildArcProvenance {
  backend: 'template';
  seed: number;
  goal: string;
  /** The template ids actually summoned, in catalog order. */
  picked: string[];
}

export interface BuildArcDraft {
  spec: BuildArcSpec;
  provenance: BuildArcProvenance;
}

export type BuildArcDraftDecision = { ok: true; draft: BuildArcDraft } | { ok: false; reason: string };

export type BuildArcPlanner = (request: BuildArcRequest) => BuildArcDraftDecision;

function goalTokens(goal: string): string[] {
  return goal.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

function validateCatalog(catalog: readonly BuildStepTemplate[]): string | null {
  if (!Array.isArray(catalog) || catalog.length === 0) return 'a step catalog without templates plans nothing';
  const seen = new Set<string>();
  for (const t of catalog) {
    if (typeof t.id !== 'string' || t.id === '') return 'every template needs a non-empty id';
    if (seen.has(t.id)) return `duplicate template id "${t.id}" — a later pick would collide with the earlier callId`;
    seen.add(t.id);
    if (!Array.isArray(t.argv) || t.argv.length === 0 || t.argv.some((a: string) => typeof a !== 'string' || a === '')) {
      return `template "${t.id}" argv must be a non-empty array of non-empty strings`;
    }
  }
  return null;
}

/**
 * The FIRST build-arc planner: deterministic template instantiation. `catalog` is the
 * host's declared freedom; the goal only ever SELECTS among it. The draft's spec is
 * self-checked through `planBuildArc` — the SAME decision function the walk will use — so
 * a draft that cannot plan is refused here, at planning time, with the same reason.
 */
export function templateBuildPlanner(catalog: readonly BuildStepTemplate[], fixedArcId?: string): BuildArcPlanner {
  const invalid = validateCatalog(catalog);
  if (invalid) throw new Error(`step catalog invalid: ${invalid}`);
  return (request) => {
    if (typeof request.goal !== 'string' || request.goal.trim() === '') return { ok: false, reason: 'goal must be a non-empty string' };
    const tokens = goalTokens(request.goal);
    const picks = catalog.filter((t) => t.keywords === undefined || t.keywords.some((k) => tokens.includes(k.toLowerCase())));
    if (picks.length === 0) {
      return { ok: false, reason: `no step template matches the goal "${request.goal}" — the planner invents nothing (§60); widen the catalog or restate the goal` };
    }
    const seed = hashString(`${fixedArcId ?? 'build-arc'}|${request.goal}`);
    const spec: BuildArcSpec = {
      arcId: fixedArcId ?? `build-arc-${seed.toString(36)}`,
      goal: request.goal,
      steps: picks.map((t) => ({
        stepId: t.id,
        argv: [...t.argv], // a copy: mutating a draft can never reach back into the catalog
        rationale: `${t.rationale} (template "${t.id}")`,
        ...(t.cwd === undefined ? {} : { cwd: t.cwd }),
      })),
    };
    const planned = planBuildArc(spec);
    if (!planned.ok) return { ok: false, reason: `planned draft refused by the arc's own decision function: ${planned.reason}` };
    return {
      ok: true,
      draft: {
        spec,
        provenance: { backend: 'template', seed, goal: request.goal, picked: picks.map((t) => t.id) },
      },
    };
  };
}
