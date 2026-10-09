import { describe, expect, it } from 'vitest';
import { auditGateHistory, auditLineFor, recordFromDecision, recordsFromDecisions, type GateRecord } from '../src/policyAudit.js';
import { policyCheckpoint, type CheckpointPolicy } from '../src/checkpointPolicy.js';

/**
 * v58 — auditing a checkpoint table against the human decisions it was written to replace.
 *
 * The interesting property is not "does it count" but "does it refuse to prove things it
 * cannot know": policy-made history must be skipped rather than counted as agreement, and an
 * empty history must report no agreement at all rather than a vacuous 100%.
 */

const openPolicy: CheckpointPolicy = {
  rules: [
    { tool: 'fs.*', grant: true, reason: 'reading the workspace is the agent’s job' },
    { tool: 'git.commit', grant: false, reason: 'committing is a human act (v35)' },
  ],
  default: { grant: false, reason: 'unlisted capabilities default-deny' },
};

const human = (tool: string, granted: boolean, reason?: string): GateRecord => ({ tool, granted, by: 'human', ...(reason ? { reason } : {}) });
const policyRec = (tool: string, granted: boolean, reason?: string): GateRecord => ({ tool, granted, by: 'policy', ...(reason ? { reason } : {}) });

describe('auditGateHistory — counting', () => {
  it('grades only the human records and reports the rest as skipped', () => {
    const audit = auditGateHistory(openPolicy, [
      human('fs.read', true),
      policyRec('fs.read', true),
      human('git.commit', false),
      policyRec('git.commit', false),
    ]);
    expect(audit.total).toBe(4);
    expect(audit.audited).toBe(2);
    expect(audit.skippedPolicyRecords).toBe(2);
    expect(audit.agreed).toBe(2);
    expect(audit.agreement).toBe(1);
    expect(audit.divergences).toEqual([]);
  });

  it('reports 0 agreement for a history with nothing to grade, never a vacuous 1', () => {
    const audit = auditGateHistory(openPolicy, []);
    expect(audit.audited).toBe(0);
    expect(audit.agreement).toBe(0);
    expect(audit.total).toBe(0);
  });

  it('a history of ONLY policy records proves nothing about people', () => {
    const audit = auditGateHistory(openPolicy, [policyRec('fs.read', true), policyRec('git.commit', true)]);
    expect(audit.audited).toBe(0);
    expect(audit.agreement).toBe(0);
    expect(audit.skippedPolicyRecords).toBe(2);
    // The policy record that granted git.commit is NOT evidence of a divergence either.
    expect(audit.divergences).toEqual([]);
  });

  it('computes agreement as a ratio over audited calls', () => {
    const audit = auditGateHistory(openPolicy, [human('fs.read', true), human('git.commit', true)]);
    expect(audit.audited).toBe(2);
    expect(audit.agreed).toBe(1);
    expect(audit.agreement).toBe(0.5);
  });
});

describe('auditGateHistory — divergences', () => {
  it('flags too-strict: the table would BLOCK what a person allowed', () => {
    const audit = auditGateHistory(openPolicy, [human('git.commit', true)]);
    expect(audit.divergences).toHaveLength(1);
    expect(audit.divergences[0]).toMatchObject({ index: 0, tool: 'git.commit', human: true, policy: false, kind: 'too-strict' });
  });

  it('flags too-permissive when the table lets through a human veto', () => {
    const permissive: CheckpointPolicy = {
      rules: [{ tool: 'git.commit', grant: true, reason: 'we trust the agent here' }],
      default: { grant: false, reason: 'default-deny' },
    };
    const audit = auditGateHistory(permissive, [human('git.commit', false)]);
    expect(audit.divergences).toHaveLength(1);
    expect(audit.divergences[0]).toMatchObject({ tool: 'git.commit', human: false, policy: true, matched: 'git.commit', kind: 'too-permissive' });
    expect(audit.divergences[0]!.reason).toBe('we trust the agent here');
  });

  it('records the exact index, the matched pattern and the table’s own reason', () => {
    const audit = auditGateHistory(openPolicy, [human('fs.read', true), human('git.commit', true), human('fs.read', true)]);
    expect(audit.divergences.map((d) => d.index)).toEqual([1]);
    expect(audit.divergences[0]!.matched).toBe('git.commit');
    expect(audit.divergences[0]!.reason).toBe('committing is a human act (v35)');
  });

  it('names the DEFAULT row when no rule spoke', () => {
    const audit = auditGateHistory(openPolicy, [human('net.fetch', true)]);
    expect(audit.divergences[0]).toMatchObject({ matched: 'default', kind: 'too-strict', tool: 'net.fetch' });
    expect(audit.divergences[0]!.reason).toBe('unlisted capabilities default-deny');
  });

  it('a wildcard rule that grants everything shows up as one too-permissive per vetoed call', () => {
    const wild: CheckpointPolicy = { rules: [{ tool: '*', grant: true, reason: 'ship it' }], default: { grant: false, reason: 'unreachable' } };
    const audit = auditGateHistory(wild, [human('git.commit', false), human('fs.write', false), human('fs.read', true)]);
    expect(audit.divergences).toHaveLength(2);
    expect(audit.divergences.every((d) => d.kind === 'too-permissive' && d.matched === '*')).toBe(true);
    expect(audit.agreed).toBe(1);
  });
});

describe('auditGateHistory — silent approvals', () => {
  it('names tools the table grants only through its DEFAULT row', () => {
    const permissiveDefault: CheckpointPolicy = {
      rules: [{ tool: 'git.commit', grant: false, reason: 'human act' }],
      default: { grant: true, reason: 'everything else is fine' },
    };
    const audit = auditGateHistory(permissiveDefault, [human('fs.read', true), human('net.fetch', true), human('git.commit', false)]);
    expect(audit.silentApprovals).toEqual(['fs.read', 'net.fetch']);
    expect(audit.agreed).toBe(3);
  });

  it('deduplicates a tool used many times, keeping first-seen order', () => {
    const permissiveDefault: CheckpointPolicy = { rules: [], default: { grant: true, reason: 'blanket yes' } };
    const audit = auditGateHistory(permissiveDefault, [human('b.tool', true), human('a.tool', true), human('b.tool', true)]);
    expect(audit.silentApprovals).toEqual(['b.tool', 'a.tool']);
  });

  it('does NOT call a rule-granted approval silent — someone wrote that rule', () => {
    const audit = auditGateHistory(openPolicy, [human('fs.read', true)]);
    expect(audit.silentApprovals).toEqual([]);
    expect(audit.agreed).toBe(1);
  });

  it('covers every default-granted call exactly once across the two lists (no gap, no overlap)', () => {
    const permissiveDefault: CheckpointPolicy = {
      rules: [{ tool: 'fs.read', grant: false, reason: 'reads must be requested' }],
      default: { grant: true, reason: 'blanket yes' },
    };
    // net.fetch: default-granted, human approved  → silent approval
    // fs.read:   rule-DENIED, human approved      → too-strict divergence (not silent)
    const audit = auditGateHistory(permissiveDefault, [human('net.fetch', true), human('fs.read', true)]);
    expect(audit.silentApprovals).toEqual(['net.fetch']);
    expect(audit.divergences.map((d) => d.tool)).toEqual(['fs.read']);
  });
});

describe('auditGateHistory — validation and purity', () => {
  it('refuses to grade a malformed table (loud throw, never a silent rule)', () => {
    const bad = { rules: [{ tool: 'fs.*', grant: true, reason: 'ok' }, { tool: 'fs.*', grant: false, reason: 'dup' }], default: { grant: false, reason: 'x' } };
    expect(() => auditGateHistory(bad, [human('fs.read', true)])).toThrow(/duplicate tool pattern/);
  });

  it('refuses a policy with an implicit (missing) default', () => {
    const bad = { rules: [] } as unknown as CheckpointPolicy;
    expect(() => auditGateHistory(bad, [])).toThrow(/explicit default/);
  });

  it('never mutates the policy or the history', () => {
    const policy: CheckpointPolicy = JSON.parse(JSON.stringify(openPolicy));
    const history: GateRecord[] = [human('fs.read', true), human('git.commit', false)];
    const policyBefore = JSON.stringify(policy);
    const historyBefore = JSON.stringify(history);
    auditGateHistory(policy, history);
    expect(JSON.stringify(policy)).toBe(policyBefore);
    expect(JSON.stringify(history)).toBe(historyBefore);
  });

  it('is deterministic: the same inputs give byte-identical reports', () => {
    const history = [human('fs.read', true), human('git.commit', true), policyRec('fs.read', true)];
    expect(JSON.stringify(auditGateHistory(openPolicy, history))).toBe(JSON.stringify(auditGateHistory(openPolicy, history)));
  });
});

describe('bridging real v40 receipts into an audit', () => {
  it('reduces a policyCheckpoint’s decisions to policy-made records', () => {
    const cp = policyCheckpoint(openPolicy);
    cp({ call: { callId: 'c1', tool: 'fs.read', args: {} }, permissions: ['write'] });
    cp({ call: { callId: 'c2', tool: 'git.commit', args: {} }, permissions: ['exec'] });

    const records = recordsFromDecisions(cp.decisions);
    expect(records).toEqual([
      { tool: 'fs.read', granted: true, by: 'policy', reason: 'reading the workspace is the agent’s job' },
      { tool: 'git.commit', granted: false, by: 'policy', reason: 'committing is a human act (v35)' },
    ]);
    expect(recordFromDecision(cp.decisions[0]!)).toEqual(records[0]);

    // Those records are then SKIPPED by the audit, not mistaken for human agreement.
    const audit = auditGateHistory(openPolicy, records);
    expect(audit.audited).toBe(0);
    expect(audit.skippedPolicyRecords).toBe(2);
  });

  it('audits a history that mixes real receipts with human verdicts', () => {
    const cp = policyCheckpoint(openPolicy);
    cp({ call: { callId: 'c1', tool: 'git.commit', args: {} }, permissions: ['exec'] });
    const mixed = [human('fs.read', true), ...recordsFromDecisions(cp.decisions), human('git.commit', true)];
    const audit = auditGateHistory(openPolicy, mixed);
    expect(audit.total).toBe(3);
    expect(audit.audited).toBe(2);
    expect(audit.agreed).toBe(1);
    expect(audit.divergences.map((d) => d.tool)).toEqual(['git.commit']);
  });
});

describe('auditLineFor', () => {
  it('says nothing is proven when there are no human decisions', () => {
    expect(auditLineFor(auditGateHistory(openPolicy, [policyRec('fs.read', true)]))).toBe(
      'audit: no human decisions in 1 record(s) — nothing to grade',
    );
  });

  it('reports agreement and names each failure class', () => {
    const permissive: CheckpointPolicy = {
      rules: [{ tool: 'git.commit', grant: true, reason: 'trust' }],
      default: { grant: true, reason: 'blanket' },
    };
    const line = auditLineFor(auditGateHistory(permissive, [human('git.commit', false), human('fs.read', true)]));
    expect(line).toContain('audit: 1/2 agreed');
    expect(line).toContain('would ALLOW what a human vetoed: git.commit');
    expect(line).toContain('default-only for: fs.read');
  });

  it('reports a clean table as a clean line', () => {
    expect(auditLineFor(auditGateHistory(openPolicy, [human('fs.read', true), human('git.commit', false)]))).toBe('audit: 2/2 agreed');
  });

  it('counts skipped policy records in the line', () => {
    const line = auditLineFor(auditGateHistory(openPolicy, [human('fs.read', true), policyRec('fs.read', true)]));
    expect(line).toContain('1 policy record(s) not counted');
  });
});
