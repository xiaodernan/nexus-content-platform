import type { AgentRegistry } from './agentRegistry.js';
import { runTask } from './orchestrator.js';
import { saveMemory, type FsWriteLike } from './durability.js';
import { appendLedger } from './ledger.js';
import { appendEvaluation, scoreRun, type RunEvaluation } from './evaluate.js';
import type { MemoryRef, MemoryStore } from './memory.js';
import type { Checkpoint } from './registry.js';
import type { AgentTask, Provenance, RunOutcome } from './types.js';

/**
 * M2 v91 (§25 structured handoffs, multi-agent edition). The first draft of this file ran the
 * chain's LAST agent twice — once as the receiver of the final edge and once again in a
 * post-loop "final stage" block — and, worse, filed that final run under the name of the
 * PREVIOUS agent, so a record naming `researcher` carried a run `archivist` produced. Both are
 * gone: the chain is one walk over the EDGES, the receiver runs once per edge, and every stage
 * record names the agent that actually ran it (`runner`).
 *
 * What a stage is: the `from` agent uses its own scoped registry to FIND refs (the research
 * tier the planner would use), then hands `{refs, summary}` to the `to` agent, which runs the
 * task through ITS scoped registry. A handoff with nothing found carries the previous edge's
 * refs forward and says so, rather than inventing any.
 *
 * The checkpoint gate is the registry's, memory is §26's, the ledger/evaluation files are the
 * host's: this file decides ORDER and nothing else. DEMO MODE throughout (§60).
 */
const PROVENANCE: Provenance = { mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' };

export interface MultiAgentHandoff {
  from: string;
  to: string;
  goal: string;
  summary: string;
  refs: MemoryRef[];
  runId: string;
  timestamp: number;
}

export interface MultiAgentStageResult {
  /** The §25 edge this stage carried. */
  from: string;
  to: string;
  /** The agent whose scoped registry produced `outcome` — always `to`. Named so a record cannot say otherwise. */
  runner: string;
  outcome: RunOutcome;
  evaluation: RunEvaluation;
  handoff: MultiAgentHandoff;
}

export interface MultiAgentPipelineOptions {
  agentRegistry: AgentRegistry;
  memoryStore: MemoryStore;
  checkpoint?: Checkpoint;
  fsLike?: FsWriteLike;
  memoryFile?: string;
  ledgerFile?: string;
  evaluationFile?: string;
  snapshot?: () => Record<string, string>;
  maxSteps?: number;
  maxFixRounds?: number;
  uiInputLabel?: string;
  uiButtonLabel?: string;
}

export type MultiAgentPipelineResult =
  | { ok: false; reason: string; completedStages: MultiAgentStageResult[] }
  | { ok: true; provenance: Provenance; stages: MultiAgentStageResult[]; refs: MemoryRef[] };

const RESEARCH_DOORS = ['fs.index', 'fs.search'] as const;

export async function runMultiAgentPipeline(
  task: AgentTask,
  agentChain: string[],
  opts: MultiAgentPipelineOptions,
): Promise<MultiAgentPipelineResult> {
  if (agentChain.length < 2) {
    return { ok: false, reason: 'agent chain must have at least 2 agents', completedStages: [] };
  }

  const stages: MultiAgentStageResult[] = [];
  const scope = `multi-agent:${task.id}`;
  let carried: MemoryRef[] = [];

  for (let i = 0; i < agentChain.length - 1; i++) {
    const fromId = agentChain[i]!;
    const toId = agentChain[i + 1]!;
    const from = opts.agentRegistry.getAgent(fromId);
    const to = opts.agentRegistry.getAgent(toId);
    if (!from) return { ok: false, reason: `unknown agent in chain: ${fromId}`, completedStages: stages };
    if (!to) return { ok: false, reason: `unknown agent in chain: ${toId}`, completedStages: stages };

    const research = opts.agentRegistry.getScopedRegistry(fromId);
    const door = RESEARCH_DOORS.find((name) => research.has(name));
    if (!door) {
      return { ok: false, reason: `${from.name} has no research door (${RESEARCH_DOORS.join(' / ')})`, completedStages: stages };
    }

    // v91: the two research doors take DIFFERENT arguments (`fs.index` {query}, `fs.search`
    // {term}). The first draft always sent `query`, so a `reviewer`-shaped agent (fs.search but
    // no fs.index) could never research and the failure read as a research failure rather than
    // as the wrong request.
    const found = await research.invoke(
      {
        callId: `${task.id}:${i}:${fromId}`,
        tool: door,
        args: door === 'fs.index' ? { query: task.goal } : { term: task.goal.split(/\s+/)[0] ?? task.goal },
      },
      { checkpoint: opts.checkpoint },
    );
    if (!found.ok) {
      return { ok: false, reason: `${from.name} research failed: ${found.error}`, completedStages: stages };
    }

    const hits = ((found.output as { hits?: { path?: string; startLine?: number; line?: number }[] }).hits ?? []).slice(0, 3);
    const refs = hits
      .filter((h) => typeof h.path === 'string')
      .map((h): MemoryRef => ({ path: h.path!, ...(h.startLine !== undefined || h.line !== undefined ? { startLine: h.startLine ?? h.line! } : {}) }));
    const effective = refs.length > 0 ? refs : carried;
    if (effective.length === 0) {
      return { ok: false, reason: `${from.name} found no refs and none were carried in`, completedStages: stages };
    }

    const handoff: MultiAgentHandoff = {
      from: fromId,
      to: toId,
      goal: task.goal,
      summary:
        refs.length > 0
          ? `${from.name} found ${refs.length} ref(s) for ${to.name}`
          : `${from.name} found nothing; ${effective.length} ref(s) carried from the previous handoff to ${to.name}`,
      refs: effective,
      runId: task.id,
      timestamp: Date.now(),
    };

    opts.memoryStore.save({ scope, runId: task.id, query: task.goal, summary: handoff.summary, refs: effective });

    const outcome = await runTask(task, {
      registry: opts.agentRegistry.getScopedRegistry(toId),
      ...(opts.checkpoint ? { checkpoint: opts.checkpoint } : {}),
      ...(opts.snapshot ? { snapshot: opts.snapshot } : {}),
      ...(opts.maxSteps !== undefined ? { maxSteps: opts.maxSteps } : {}),
      ...(opts.maxFixRounds !== undefined ? { maxFixRounds: opts.maxFixRounds } : {}),
      ...(opts.uiInputLabel !== undefined ? { uiInputLabel: opts.uiInputLabel } : {}),
      ...(opts.uiButtonLabel !== undefined ? { uiButtonLabel: opts.uiButtonLabel } : {}),
    });
    const evaluation = scoreRun(outcome);

    if (opts.fsLike) {
      if (opts.ledgerFile) appendLedger(opts.fsLike, opts.ledgerFile, outcome);
      if (opts.evaluationFile) appendEvaluation(opts.fsLike, opts.evaluationFile, evaluation);
    }

    stages.push({ from: fromId, to: toId, runner: toId, outcome, evaluation, handoff });
    carried = effective;
  }

  if (opts.fsLike && opts.memoryFile) saveMemory(opts.memoryStore, opts.fsLike, opts.memoryFile);
  return { ok: true, provenance: PROVENANCE, stages, refs: carried };
}
