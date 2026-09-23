/**
 * Shared contracts for the NEXUS agent runtime (M2 v0).
 * §25 handoff artifacts: Task → Plan → tool calls/results → Events, each stamped
 * with provenance so nothing produced here can masquerade as live-model output (§60).
 */

export type PermissionClass = 'read' | 'write' | 'exec' | 'network';

export type ArgType = 'string' | 'number' | 'boolean' | 'string[]';

export interface ToolArgSpec {
  name: string;
  type: ArgType;
  required?: boolean;
}

export interface ToolSpec {
  name: string;
  description: string;
  permissions: PermissionClass[];
  args: ToolArgSpec[];
}

export interface ToolCall {
  callId: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  tool: string;
  ok: boolean;
  output?: unknown;
  error?: string;
}

export interface Step {
  stepId: string;
  tool: string;
  args: Record<string, unknown>;
  rationale: string;
}

export interface Plan {
  goal: string;
  seed: number;
  steps: Step[];
}

export interface AgentTask {
  id: string;
  goal: string;
  /** Optional explicit file the task targets; the planner falls back to its search hit. */
  targetPath?: string;
  seed?: number;
}

export interface Provenance {
  mode: 'demo';
  runtime: 'nexus-agent-runtime';
  version: '0.1.0';
}

export type AgentEvent =
  | { at: number; type: 'plan'; plan: Plan }
  | { at: number; type: 'step_start'; stepId: string; tool: string }
  | { at: number; type: 'step_result'; stepId: string; result: ToolResult }
  | { at: number; type: 'checkpoint'; stepId: string; tool: string; granted: boolean }
  | { at: number; type: 'verify'; ok: boolean; detail: string }
  | { at: number; type: 'fix'; stepId: string; attempt: number }
  | { at: number; type: 'budget_exhausted'; stepsUsed: number }
  | { at: number; type: 'done'; status: TaskStatus };

export type TaskStatus = 'completed' | 'failed_verification' | 'denied' | 'budget_exhausted';

/** Distributive "without the sequence field" view of the event union, for emitters. */
type WithAt<T> = T extends { at: number } ? Omit<T, 'at'> : never;
export type AgentEventBody = WithAt<AgentEvent>;

export interface RunOutcome {
  task: AgentTask;
  provenance: Provenance;
  plan: Plan;
  results: ToolResult[];
  events: AgentEvent[];
  status: TaskStatus;
  /** v7: present when the host supplied a workspace snapshot fn; observed file effects. */
  changeSet?: import('./changes.js').ChangeSet;
  /** v17: which planning backend produced the plan (and any explicit fallback). */
  planner?: { backend: string; fellBack?: { from: string; reason: string } };
  /**
   * v28: structured TestReports from every `test.run` step that answered with one,
   * in execution order (verify, re-verifies, plain calls). Absent when no report ran.
   */
  testReports?: import('./testRunner.js').TestReport[];
  /**
   * v54: the §28 receipts for the calls THIS run issued, in ask order — each naming the rule (or
   * `default`) that decided and quoting its reason. Only present on a run headed for a ledger, and
   * only ever for this run's own calls: the release arc's doors (v50) and a chaining stage's brief
   * belong to their own records, so one file cannot paste one stage's yes onto another's work (§60).
   */
  decisions?: import('./checkpointPolicy.js').CheckpointDecision[];
  /**
   * v54: why `decisions` is empty although this run gated calls — the checkpoint face keeps no
   * readable audit list. Absent when the list arrived, when nothing was gated, or when not durable.
   */
  decisionsNote?: string;
}
