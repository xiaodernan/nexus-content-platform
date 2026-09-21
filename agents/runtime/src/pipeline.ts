import { goalKeyword } from './planner.js';
import { runTask } from './orchestrator.js';
import { saveMemory, type FsWriteLike } from './durability.js';
import { appendLedger } from './ledger.js';
import type { MemoryRef, MemoryStore } from './memory.js';
import type { Checkpoint, ToolRegistry } from './registry.js';
import type { RoleRegistry } from './roles.js';
import { appendEvaluation, scoreRun, type RunEvaluation } from './evaluate.js';
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
