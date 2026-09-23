import { goalKeyword } from './planner.js';
import { runGitArc, RELEASE_ROLE, type GitArcOutcome } from './gitArc.js';
import { runTask } from './orchestrator.js';
import { saveMemory, type FsWriteLike } from './durability.js';
import { appendLedger } from './ledger.js';
import { runVisualQa, type QaInput, type QaReport } from './visualQa.js';
import type { MemoryRef, MemoryStore } from './memory.js';
import type { Checkpoint, ToolRegistry } from './registry.js';
import type { RoleRegistry } from './roles.js';
import { appendEvaluation, scoreRun, type RunEvaluation } from './evaluate.js';
import { registerUiTools, type UiDriver } from './domkit.js';
import type { AgentTask, Provenance, RunOutcome } from './types.js';

/**
 * M2 v9 (§25): a two-role pipeline as DATA. A researcher tool-session produces a structured
 * handoff (refs only — never chat), the host persists it into §26 memory, and an editor
 * `runTask` picks the task up memory-first. Files are optional: give `memoryFile` +
 * `fsLike` and the handoff survives into a separate process (the pipeline-proof child).
 */
const PROVENANCE: Provenance = { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' };

export interface HandoffRecord {
  from: 'researcher';
  to: 'editor';
  goal: string;
  via: string; // research tool that produced the hits
  refs: MemoryRef[];
  runId: string;
}

export interface PipelineOptions {
  roles: RoleRegistry;
  /** Full host registry; the pipeline scopes it per role (§24 capability-by-absence). */
  registry: ToolRegistry;
  store: MemoryStore;
  scope?: string;
  checkpoint?: Checkpoint;
  /** Optional durable handoff: memory JSON + ledger/evaluation JSONL via the injected fs. */
  fsLike?: FsWriteLike;
  memoryFile?: string;
  ledgerFile?: string;
  evaluationFile?: string;
  snapshot?: () => Record<string, string>;
  maxSteps?: number;
  maxFixRounds?: number;
}

export type PipelineResult =
  | { ok: false; reason: string; handoff?: HandoffRecord }
  | {
      ok: true;
      provenance: Provenance;
      handoff: HandoffRecord;
      editorOutcome: RunOutcome;
      evaluation: RunEvaluation;
    };

interface RawHit {
  path?: string;
  startLine?: number;
  line?: number;
}

export async function runRolePipeline(task: AgentTask, opts: PipelineOptions): Promise<PipelineResult> {
  const scope = opts.scope ?? 'pipeline';
  const research = opts.roles.scopedRegistry('researcher', opts.registry);
  const via = research.has('fs.index') ? 'fs.index' : research.has('fs.search') ? 'fs.search' : null;
  if (!via) return { ok: false, reason: 'researcher role has no research tool (fs.index/fs.search absent)' };

  const args = via === 'fs.search' ? { term: goalKeyword(task.goal) } : { query: task.goal };
  const res = await research.invoke({ callId: `${task.id}:research`, tool: via, args }, { checkpoint: opts.checkpoint });
  if (!res.ok) return { ok: false, reason: `research failed: ${res.error}`, };

  const hits = ((res.output as { hits?: RawHit[] }).hits ?? []).slice(0, 3);
  const refs = hits.filter((h) => typeof h.path === 'string').map((h): MemoryRef => ({ path: h.path!, startLine: h.startLine ?? h.line }));
  if (refs.length === 0) return { ok: false, reason: 'research produced no refs' };

  const handoff: HandoffRecord = { from: 'researcher', to: 'editor', goal: task.goal, via, refs, runId: task.id };

  // The host — not the researcher — persists the handoff into scoped memory (§26 governance).
  opts.store.save({ scope, runId: task.id, query: task.goal, summary: `handoff from ${handoff.from}: ${refs.map((r) => r.path).join(', ')}`, refs });
  if (opts.memoryFile && opts.fsLike) saveMemory(opts.store, opts.fsLike, opts.memoryFile);

  const editor = opts.roles.scopedRegistry('editor', opts.registry);
  const editorOutcome = await runTask(task, {
    registry: editor,
    checkpoint: opts.checkpoint,
    snapshot: opts.snapshot,
    maxSteps: opts.maxSteps,
    maxFixRounds: opts.maxFixRounds,
  });
  const evaluation = scoreRun(editorOutcome);

  if (opts.fsLike) {
    if (opts.ledgerFile) appendLedger(opts.fsLike, opts.ledgerFile, editorOutcome);
    if (opts.evaluationFile) appendEvaluation(opts.fsLike, opts.evaluationFile, evaluation);
  }

  return { ok: true, provenance: PROVENANCE, handoff, editorOutcome, evaluation };
}

/* ---- v14: four-role chain (researcher → designer → qa → editor), §24/§25; v47 adds an opt-in fifth stage ---- */

export interface ChainStageHandoff {
  from: string;
  to: string;
  goal: string;
  via: string;
  refs: MemoryRef[];
  runId: string;
}

export interface ChainOptions extends PipelineOptions {
  /** Host-supplied rect data for the QA stage; absent ⇒ QA honestly checks nothing. */
  qaInput?: QaInput;
  /**
   * v22: when the host provides a UI driver, the editor stage gains the gated `ui.*` tools
   * (capability by presence, §24). Every click/type still passes the Human Checkpoint (§28).
   */
  uiDriver?: UiDriver;
  uiInputLabel?: string;
  uiButtonLabel?: string;
  /**
   * v47: hand a GREEN chain to the `releaser` role so the git arc (v36/38/44/45) has a role face
   * at all — until now no demo role carried a git capability, so a chained run could verify and
   * annotate but never read the index, commit, or read anything back.
   * EXPLICITLY opt-in: commit power is never granted by mere presence, and the role's scope is
   * still only four doors (no `git.add`, no push, no memory). Each door asks §28 for itself.
   * Absent ⇒ the chain is byte-for-byte the v14/v22 chain, including its handoffs.
   */
  release?: boolean;
}

export type ChainResult =
  | { ok: false; stage: string; reason: string; handoffs: ChainStageHandoff[] }
  | {
      ok: true;
      provenance: Provenance;
      handoffs: ChainStageHandoff[];
      qa: QaReport;
      editorOutcome: RunOutcome;
      evaluation: RunEvaluation;
      /** v47: present only when `release` was asked for — the arc's own walk, door by door. */
      release?: GitArcOutcome;
    };

export async function runRoleChain(task: AgentTask, opts: ChainOptions): Promise<ChainResult> {
  const scope = opts.scope ?? 'pipeline';
  const handoffs: ChainStageHandoff[] = [];

  // v22: a host-supplied driver grants the chain UI capabilities on a copy (scope(['*']) is
  // the existing full projection) — the caller's registry is never mutated. Roles without
  // `ui.*` in their definition (researcher/designer/qa) still cannot see these tools (§24).
  const host = opts.uiDriver && !opts.registry.has('ui.click') ? opts.registry.scope(['*']) : opts.registry;
  if (opts.uiDriver && host !== opts.registry) registerUiTools(host, opts.uiDriver);

  // 1) researcher: discovery through the read-only scope.
  const research = opts.roles.scopedRegistry('researcher', host);
  const via = research.has('fs.index') ? 'fs.index' : research.has('fs.search') ? 'fs.search' : null;
  if (!via) return { ok: false, stage: 'researcher', reason: 'no research tool in scope', handoffs };
  const rArgs = via === 'fs.search' ? { term: goalKeyword(task.goal) } : { query: task.goal };
  const rRes = await research.invoke({ callId: `${task.id}:research`, tool: via, args: rArgs }, { checkpoint: opts.checkpoint });
  if (!rRes.ok) return { ok: false, stage: 'researcher', reason: `research failed: ${rRes.error}`, handoffs };
  const rawHits = ((rRes.output as { hits?: { path?: string; startLine?: number; line?: number }[] }).hits ?? []).slice(0, 3);
  const refs = rawHits.filter((h) => typeof h.path === 'string').map((h): MemoryRef => ({ path: h.path!, startLine: h.startLine ?? h.line }));
  if (refs.length === 0) return { ok: false, stage: 'researcher', reason: 'research produced no refs', handoffs };
  handoffs.push({ from: 'researcher', to: 'designer', goal: task.goal, via, refs, runId: task.id });
  opts.store.save({ scope, runId: task.id, query: `${task.goal} — research`, summary: `research refs: ${refs.map((p) => p.path).join(', ')}`, refs });

  // 2) designer: records the layout intent (a write ⇒ checkpoint-gated).
  const designer = opts.roles.scopedRegistry('designer', host);
  const brief = `DESIGN (DEMO MODE · ${task.id}): plan for "${task.goal}" over ${refs.map((p) => p.path).join(', ')}`;
  const dRes = await designer.invoke({ callId: `${task.id}:brief`, tool: 'fs.append', args: { path: refs[0]!.path, text: brief } }, { checkpoint: opts.checkpoint });
  if (!dRes.ok) return { ok: false, stage: 'designer', reason: `designer blocked: ${dRes.error}`, handoffs };
  handoffs.push({ from: 'designer', to: 'qa', goal: task.goal, via: 'fs.append', refs, runId: task.id });
  opts.store.save({ scope, runId: task.id, query: `${task.goal} — design`, summary: `brief appended to ${refs[0]!.path}`, refs });

  // 3) qa: computed structural report over host-supplied rects (checks nothing if none given).
  const qa = opts.qaInput ? runVisualQa(opts.qaInput) : { verdict: 'ok' as const, checked: 0, flags: [] };
  const flagged = qa.flags.flatMap((f) => f.ids);
  handoffs.push({ from: 'qa', to: 'editor', goal: task.goal, via: 'runVisualQa', refs: flagged.length ? flagged.map((path) => ({ path })) : refs, runId: task.id });
  // QA records the FILES (refs) plus what it found (summary) — flag ids are rect labels, not paths.
  opts.store.save({ scope, runId: task.id, query: `${task.goal} — qa`, summary: `qa ${qa.verdict}: ${qa.flags.map((f) => f.code).join(', ') || 'clean'} on ${refs.map((p) => p.path).join(', ')}`, refs });

  // 4) editor: full loop, memory-first thanks to the three records above. With a UI driver
  // present, the planner switches to the observe→type→click(→verify) template (v20/v22).
  const editor = opts.roles.scopedRegistry('editor', host);
  const editorOutcome = await runTask(task, { registry: editor, checkpoint: opts.checkpoint, snapshot: opts.snapshot, maxSteps: opts.maxSteps, maxFixRounds: opts.maxFixRounds, uiInputLabel: opts.uiInputLabel, uiButtonLabel: opts.uiButtonLabel });
  const evaluation = scoreRun(editorOutcome);
  // The engine the editor actually acted through is recorded, not assumed (§60).
  const uiUsed = editorOutcome.results.filter((r) => r.ok && r.tool.startsWith('ui.')).map((r) => r.tool);
  if (uiUsed.length > 0) {
    handoffs.push({ from: 'editor', to: 'host', goal: task.goal, via: `ui:${[...new Set(uiUsed)].join('+')}`, refs, runId: task.id });
  }

  // 5) v47 releaser: the git arc, now with a role that owns it. POSITION still carries the
  // safety (a red chain never reaches this line as an arc — it reaches it as a stated refusal),
  // the scope carries the privilege (four doors, nothing else), and §28 carries the consent
  // (one gate per door, never one for the arc). The arc's results are NOT folded into
  // `editorOutcome`: that plan never contained them, and rewriting it would be a lie (§60).
  let release: GitArcOutcome | undefined;
  if (opts.release) {
    // v50: a walk headed for the ledger answers for its own gates, so the durable line and the
    // returned one carry the receipts together (v49's identity: the durable walk IS the returned
    // walk). Not durable ⇒ the v47/v49 outcome shape, byte for byte.
    const durableArc = Boolean(opts.fsLike && opts.ledgerFile);
    release = editorOutcome.status !== 'completed'
      ? { doors: [], steps: [], results: [], status: 'no-arc', notes: [], ...(durableArc ? { decisions: [] } : {}), reason: `the editor stage ended ${editorOutcome.status} — the arc lives behind verification (v36)` }
      : await runGitArc(opts.roles.scopedRegistry(RELEASE_ROLE, host), {
          callId: `${task.id}:release`,
          message: `chore(agent): verified chain ${task.id} · seed ${editorOutcome.plan.seed}`,
          // Same priority the plan's own ref follows: the task's stated target, else the LIVE
          // hit the editor's search step actually returned. Never a path this stage invents.
          showPath: task.targetPath ?? (editorOutcome.results.filter((r) => r.callId.endsWith(':search')).at(-1)?.output as { hits?: RawHit[] } | undefined)?.hits?.[0]?.path,
          checkpoint: opts.checkpoint,
          recordReceipts: durableArc,
        });
    const walked = release.steps.map((s) => s.stepId).join('→');
    handoffs.push({ from: 'editor', to: RELEASE_ROLE, goal: task.goal, via: `git.arc:${release.doors.join('+') || 'none'}`, refs, runId: task.id });
    if (release.doors.length > 0) {
      handoffs.push({ from: RELEASE_ROLE, to: 'host', goal: task.goal, via: `git:${walked || 'nothing'}${release.status === 'completed' ? '' : `!${release.status}`}`, refs, runId: task.id });
    }
    // §26 keeps its own governance: the HOST records what the arc did; the releaser role cannot.
    opts.store.save({
      scope,
      runId: task.id,
      query: `${task.goal} — release`,
      summary: `release ${release.status}: ${walked || 'no doors walked'}${release.reason ? ` — ${release.reason}` : ''}${release.notes.length ? ` (${release.notes.join('; ')})` : ''}`,
      refs,
    });
  }

  if (opts.fsLike) {
    if (opts.ledgerFile) {
      appendLedger(opts.fsLike, opts.ledgerFile, editorOutcome);
      // v49: the arc is a record too, written RIGHT AFTER the run it followed and joined to it by
      // `runId`. It is NOT merged into the run line above — that plan never held a git step (§60).
      // `release: true` is journaled even when it walked nothing: a cold reader should be able to
      // see that a release was asked for and refused, not just the arcs that succeeded.
      if (release) appendLedger(opts.fsLike, opts.ledgerFile, { kind: 'git-arc', provenance: PROVENANCE, runId: task.id, goal: task.goal, role: RELEASE_ROLE, arc: release });
    }
    if (opts.evaluationFile) appendEvaluation(opts.fsLike, opts.evaluationFile, evaluation);
  }
  if (opts.memoryFile && opts.fsLike) saveMemory(opts.store, opts.fsLike, opts.memoryFile);
  return { ok: true, provenance: PROVENANCE, handoffs, qa, editorOutcome, evaluation, ...(release ? { release } : {}) };
}
