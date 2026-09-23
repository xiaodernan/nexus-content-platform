import { DANGEROUS, matchesTool } from './registry.js';
import type { Checkpoint, CheckpointRequest, ToolRegistry } from './registry.js';
import type { ToolCall } from './types.js';

/**
 * v40 (§28 as DATA): the Human Checkpoint has always been a callback — which means the
 * "human" was whatever ad-hoc closure the host happened to pass. This module turns the
 * DECISION into inspectable, testable, diffable data: ordered rules, first match wins,
 * and an EXPLICIT default (no implicit allow or deny — a policy says what it does, §60).
 * A policy auto-approving is exactly as trusted as the human who wrote it; the audit
 * trail keeps every receipt so nobody can later claim the machine decided silently.
 */
export interface CheckpointRule {
  /** Tool name pattern: exact, trailing glob (`fs.*`) or `*`, same semantics as role scoping. */
  tool: string;
  /** What this rule DOES when it matches. Required — a rule that grants nothing grants by silence. */
  grant: boolean;
  /** Why — REQUIRED so every decision can state its reason; the audit trail carries it verbatim. */
  reason: string;
}

export interface CheckpointPolicy {
  rules: CheckpointRule[];
  /** Used ONLY when no rule matched. Explicit by design: there is no default default. */
  default: { grant: boolean; reason: string };
}

export interface CheckpointDecision {
  call: ToolCall;
  granted: boolean;
  /** The matched rule's tool pattern, or 'default'. */
  matched: string;
  reason: string;
}

/** Validate a policy BEFORE it ever gates a call — malformed policy is a loud throw, never a silent rule. */
export function validateCheckpointPolicy(policy: CheckpointPolicy): CheckpointPolicy {
  const seen = new Set<string>();
  for (const r of policy.rules) {
    if (typeof r.tool !== 'string' || r.tool === '') throw new Error('checkpoint policy rule needs a non-empty tool pattern');
    if (typeof r.grant !== 'boolean') throw new Error(`checkpoint policy rule "${r.tool}" must state grant true/false`);
    if (typeof r.reason !== 'string' || r.reason === '') throw new Error(`checkpoint policy rule "${r.tool}" must state a reason (§60)`);
    if (seen.has(r.tool)) throw new Error(`duplicate tool pattern "${r.tool}" — first match would make the later rule dead code`);
    seen.add(r.tool);
  }
  if (typeof policy.default?.grant !== 'boolean' || typeof policy.default?.reason !== 'string' || policy.default.reason === '') {
    throw new Error('checkpoint policy needs an explicit default { grant, reason } — no implicit verdicts');
  }
  return policy;
}

/** Pure decision: first matching rule wins; unmatched calls land on the EXPLICIT default. Never mutates. */
export function decide(policy: CheckpointPolicy, req: CheckpointRequest): CheckpointDecision {
  const rule = policy.rules.find((r) => matchesTool(r.tool, req.call.tool));
  const hit = rule ?? policy.default;
  return { call: req.call, granted: rule ? rule.grant : policy.default.grant, matched: rule ? rule.tool : 'default', reason: hit.reason };
}

/**
 * Adapt a policy into the registry's Checkpoint. Every verdict is appended, in order, to
 * the returned checkpoint's `decisions` — so a host (or a proof) can later show EXACTLY
 * which rule let (or vetoed) each gated call, with the stated reason.
 */
export function policyCheckpoint(policy: CheckpointPolicy): Checkpoint & { decisions: CheckpointDecision[] } {
  validateCheckpointPolicy(policy);
  const decisions: CheckpointDecision[] = [];
  const cp: Checkpoint & { decisions: CheckpointDecision[] } = (req) => {
    const d = decide(policy, req);
    decisions.push(structuredClone(d));
    return d.granted;
  };
  cp.decisions = decisions;
  return cp;
}

/** Stated in a durable record when its face cannot name the decider — never a silent empty list. */
export const NO_RECEIPTS_NOTE =
  '§28 receipts unavailable: the checkpoint handed to this walk keeps no audit list the runtime can read, so this line carries the tools\' answers without the decider\'s reason (§60)';

export interface ReceiptState {
  decisions: CheckpointDecision[];
  /** Set ONLY when something was gated and the face keeps no list — an unasked walk owes nothing. */
  note?: string;
}

/**
 * Which of these calls the registry would have taken to §28 at all (v54). Read-permission tools are
 * not here, and neither are tools the scope does not have: a capability that is ABSENT asks nothing
 * (§24), so it must not be counted as a gate this record failed to explain.
 */
export function gatedCallIds(registry: ToolRegistry, calls: readonly { callId: string; tool: string }[]): string[] {
  return calls
    .filter((c) => (registry.get(c.tool)?.permissions ?? []).some((p) => DANGEROUS.includes(p)))
    .map((c) => c.callId);
}

/**
 * The receipts belonging to ONE record's own calls (M2 v54, ADR 0016 amendment 54), taken from a
 * checkpoint that keeps them (v40's `policyCheckpoint` exposes `.decisions`; a bare closure does
 * not). Matched by CALL ID, not by tool name: the same tool can be gated by another stage of the
 * same chain, and a receipt from the editor's `test.run` pasted onto the release arc — or onto the
 * run line from the arc's `git.commit` — would be a borrowed alibi.
 *
 * Three answers, deliberately distinct: a face with a list gives the matching receipts (possibly
 * none); a face without one gives an empty list PLUS the sentence saying why, when something really
 * was gated; and a walk that gated nothing gives an empty list and owes no explanation.
 */
export function receiptsOrNote(checkpoint: Checkpoint | undefined, callIds: readonly string[]): ReceiptState {
  const decisions = (checkpoint as (Checkpoint & { decisions?: CheckpointDecision[] }) | undefined)?.decisions;
  if (Array.isArray(decisions)) {
    const owned = new Set(callIds);
    return { decisions: decisions.filter((d) => owned.has(d.call?.callId)).map((d) => structuredClone(d)) };
  }
  return callIds.length > 0 ? { decisions: [], note: NO_RECEIPTS_NOTE } : { decisions: [] };
}
