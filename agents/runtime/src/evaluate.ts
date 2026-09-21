import type { FsWriteLike } from './durability.js';
import type { Provenance, RunOutcome } from './types.js';

/**
 * M2 v8 evaluation slice (§63 "evaluation"): a deterministic rubric over the DATA of a
 * RunOutcome — statuses, event counts, change-set size. No model judging a model (§60);
 * every mark states the plain check that ran.
 */
export interface EvaluationMark {
  name: string;
  ok: boolean;
  detail: string;
  weight: number;
}

export interface RunEvaluation {
  runId: string;
  provenance: Provenance;
  score: number;
  marks: EvaluationMark[];
}

const PROVENANCE: Provenance = { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' };

export interface RubricOptions {
  /** changeSet added-line budget for the economy mark (default 40). */
  maxAddedLines?: number;
}

export function scoreRun(outcome: RunOutcome, opts: RubricOptions = {}): RunEvaluation {
  const maxAdded = opts.maxAddedLines ?? 40;
  const marks: EvaluationMark[] = [];
  const push = (name: string, ok: boolean, detail: string, weight: number): void => {
    marks.push({ name, ok, detail, weight });
  };

  push('completed', outcome.status === 'completed', `status=${outcome.status}`, 0.4);
  const allOk = outcome.results.every((r) => r.ok);
  push('all-steps-ok', allOk, `${outcome.results.filter((r) => !r.ok).length} failed of ${outcome.results.length}`, 0.15);
  const verifies = outcome.events.filter((e) => e.type === 'verify');
  const finalVerify = verifies[verifies.length - 1];
  push(
    'verified',
    finalVerify !== undefined && finalVerify.type === 'verify' && finalVerify.ok,
    `${verifies.length} verify event(s)`,
    0.25,
  );
  const fixes = outcome.events.filter((e) => e.type === 'fix').length;
  push('needed-no-rework', fixes <= 1, `${fixes} fix round(s)`, 0.1);
  const added = outcome.changeSet ? outcome.changeSet.files.reduce((s, f) => s + f.added, 0) : 0;
  push('change-economy', added <= maxAdded, `${added} added lines (budget ${maxAdded})`, 0.1);

  const total = marks.reduce((s, m) => s + m.weight, 0);
  const got = marks.reduce((s, m) => s + (m.ok ? m.weight : 0), 0);
  return { runId: outcome.task.id, provenance: PROVENANCE, score: total === 0 ? 0 : got / total, marks };
}

export function formatEvaluationLine(ev: RunEvaluation): string {
  return JSON.stringify(ev);
}

export type EvalLoad = { ok: true; evaluations: RunEvaluation[] } | { ok: false; reason: string };

export function appendEvaluation(fsLike: FsWriteLike, file: string, ev: RunEvaluation): void {
  let existing = '';
  try {
    existing = fsLike.readFileSync(file, 'utf8');
  } catch {
    existing = '';
  }
  const dir = file.slice(0, file.lastIndexOf('/'));
  if (dir && dir !== file) fsLike.mkdirSync(dir, { recursive: true });
  fsLike.writeFileSync(file, (existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`) + formatEvaluationLine(ev) + '\n', 'utf8');
}

export function loadEvaluations(fsLike: { readFileSync(p: string, e: 'utf8'): string }, file: string): EvalLoad {
  let text: string;
  try {
    text = fsLike.readFileSync(file, 'utf8');
  } catch {
    return { ok: false, reason: `no such file: ${file}` };
  }
  const evaluations: RunEvaluation[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return { ok: false, reason: 'not valid JSON' };
    }
    const e = raw as Partial<RunEvaluation>;
    if (typeof e.runId !== 'string' || typeof e.score !== 'number' || !Array.isArray(e.marks) || e.provenance?.mode !== 'demo') {
      return { ok: false, reason: 'not a RunEvaluation record' };
    }
    evaluations.push(e as RunEvaluation);
  }
  return { ok: true, evaluations };
}
