import { decide, validateCheckpointPolicy, type CheckpointDecision, type CheckpointPolicy } from './checkpointPolicy.js';

/**
 * M2 v58 — a checkpoint table is only as good as the human decisions it was written to
 * stand in for, and v40/v41 made both sides of that claim inspectable as DATA: v40 gives
 * a policy, v41 gives receipts. This module joins them. `auditGateHistory` replays a
 * candidate policy over a recorded history of *human* verdicts and states, call by call,
 * where the table would have contradicted the person — the only honest way to discover
 * that a convenient-looking table is too permissive BEFORE it is ever trusted with a run.
 *
 * It never mutates the policy or the history, and it never invents a verdict: policy-made
 * records in the history are reported as skipped rather than treated as evidence, because
 * agreeing with a table's own past output proves nothing about people (§60).
 *
 * Honest bounds (§60), stated rather than implied:
 * - The audit replays **tool names only**, with `args: {}` and `permissions: []`. That is
 *   faithful to v40, whose rules match on the tool pattern and nothing else — but it means an
 *   audit says nothing about a future rule type that inspects arguments.
 * - A human record carries a boolean, not a rationale. Where the person's *reason* differed
 *   from the table's, this module cannot tell: it grades verdicts, not motives.
 * - `agreement` is a ratio over recorded calls, not a probability that the table is safe. A
 *   table that agrees 100% on a history containing nothing dangerous has proven very little,
 *   which is exactly why `total`/`audited`/`skippedPolicyRecords` ship alongside it.
 */

/** One gated call as some face recorded it — the reduced shape of a v41 GateVerdict or a v40 CheckpointDecision. */
export interface GateRecord {
  tool: string;
  granted: boolean;
  by: 'human' | 'policy';
  /** Why the deciding face said yes/no, if it stated one. */
  reason?: string;
}

/** 'too-permissive': the person STOPPED what this table would let through. 'too-strict': the person ALLOWED what it would block. */
export type DivergenceKind = 'too-permissive' | 'too-strict';

export interface AuditDivergence {
  /** Position in the audited history, so a report can point at the exact call. */
  index: number;
  tool: string;
  human: boolean;
  policy: boolean;
  /** The table's pattern that spoke for this call, or 'default'. */
  matched: string;
  reason: string;
  kind: DivergenceKind;
}

export interface PolicyAudit {
  /** Records in the history at all. */
  total: number;
  /** Records actually audited (the human ones). */
  audited: number;
  /** Records skipped because a table, not a person, decided them. */
  skippedPolicyRecords: number;
  /** Audited calls where the table would have decided exactly as the person did. */
  agreed: number;
  /** `agreed / audited`, or 0 for an empty history — nothing is proven about nothing. */
  agreement: number;
  divergences: AuditDivergence[];
  /**
   * Tools this table GRANTS only through its DEFAULT row — i.e. it approves something no rule
   * ever names. v40's own rule is that a policy must state what it does; a blanket default
   * doing a person's approvals is the shape of a table nobody actually read.
   *
   * Together with `divergences` this covers every default-granted call exactly once and without
   * overlap: if the person approved too it is a silent approval, and if the person vetoed it is
   * already a `too-permissive` divergence. Neither list can miss the case, and neither repeats it.
   */
  silentApprovals: string[];
}

/** A v40 policy receipt reduces to a policy-made record; the `reason` is the table's words. */
export function recordFromDecision(d: CheckpointDecision): GateRecord {
  return { tool: d.call.tool, granted: d.granted, by: 'policy', reason: d.reason };
}

export function recordsFromDecisions(decisions: readonly CheckpointDecision[]): GateRecord[] {
  return decisions.map(recordFromDecision);
}

/**
 * Replay `policy` over `history` and report where it disagrees with the humans. The policy
 * is validated first — a malformed table has no business being graded, let alone shipped.
 */
export function auditGateHistory(policy: CheckpointPolicy, history: readonly GateRecord[]): PolicyAudit {
  validateCheckpointPolicy(policy);
  const divergences: AuditDivergence[] = [];
  const silentApprovals: string[] = [];
  let audited = 0;
  let agreed = 0;
  let skippedPolicyRecords = 0;
  let index = 0;
  for (const record of history) {
    if (record.by !== 'human') {
      skippedPolicyRecords++;
      index++;
      continue;
    }
    audited++;
    const d = decide(policy, { call: { callId: `audit:${index}:${record.tool}`, tool: record.tool, args: {} }, permissions: [] });
    if (d.granted === record.granted) agreed++;
    else if (record.granted) {
      divergences.push({ index, tool: record.tool, human: true, policy: false, matched: d.matched, reason: d.reason, kind: 'too-strict' });
    } else {
      divergences.push({ index, tool: record.tool, human: false, policy: true, matched: d.matched, reason: d.reason, kind: 'too-permissive' });
    }
    if (record.granted && d.granted && d.matched === 'default' && !silentApprovals.includes(record.tool)) {
      silentApprovals.push(record.tool);
    }
    index++;
  }
  return { total: history.length, audited, skippedPolicyRecords, agreed, agreement: audited === 0 ? 0 : agreed / audited, divergences, silentApprovals };
}
/** The one-line, deterministic verdict for a ledger or a panel: agreement plus every named failure. */
export function auditLineFor(audit: PolicyAudit): string {
  if (audit.audited === 0) return `audit: no human decisions in ${audit.total} record(s) — nothing to grade`;
  const parts = [`audit: ${audit.agreed}/${audit.audited} agreed`];
  const permissive = audit.divergences.filter((d) => d.kind === 'too-permissive').map((d) => d.tool);
  const strict = audit.divergences.filter((d) => d.kind === 'too-strict').map((d) => d.tool);
  if (permissive.length > 0) parts.push(`would ALLOW what a human vetoed: ${permissive.join(', ')}`);
  if (strict.length > 0) parts.push(`would BLOCK what a human allowed: ${strict.join(', ')}`);
  if (audit.silentApprovals.length > 0) parts.push(`default-only for: ${audit.silentApprovals.join(', ')}`);
  if (audit.skippedPolicyRecords > 0) parts.push(`${audit.skippedPolicyRecords} policy record(s) not counted`);
  return parts.join(' · ');
}
