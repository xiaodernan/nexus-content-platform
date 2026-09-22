import { matchesTool } from './registry.js';
import type { Checkpoint, CheckpointRequest } from './registry.js';
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
