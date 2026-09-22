'use client';
import { useState } from 'react';
import { useStudio } from '@/lib/store';
import { browserStorage } from '@/lib/storage';
import {
  appendLedgerLine,
  ledgerLine,
  planAgentRun,
  readAgentLedger,
  type AgentPlan,
} from '@/lib/agentDock';

type Phase = 'idle' | 'planning' | 'awaiting' | 'done';

const label: React.CSSProperties = { fontSize: 11, color: 'var(--nexus-muted)' };

export default function AgentPanel() {
  const doc = useStudio((s) => s.doc);
  const activePageId = useStudio((s) => s.activePageId);
  const commitOps = useStudio((s) => s.commitOps);
  const setStatus = useStudio((s) => s.setStatus);
  const [goal, setGoal] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [note, setNote] = useState('');
  const [ledgerLen, setLedgerLen] = useState(0);

  const runPlan = async () => {
    setPhase('planning');
    setNote('');
    const res = await planAgentRun(doc, activePageId, goal);
    if ('ok' in res && res.ok === false) {
      setPhase('idle');
      setNote(res.reason);
      return;
    }
    setPlan(res as AgentPlan);
    setPhase('awaiting');
  };

  const approve = () => {
    if (!plan) return;
    commitOps(plan.batch.ops, plan.batch.summary ?? 'Agent proposal', plan.batch.provenance);
    appendLedgerLine(browserStorage(), ledgerLine(plan, true));
    setLedgerLen(readAgentLedger(browserStorage()).entries.length);
    setStatus(`Agent banner applied (undoable) · ${plan.targetName}`);
    setPhase('done');
  };

  const deny = () => {
    if (plan) {
      appendLedgerLine(browserStorage(), ledgerLine(plan, false, 'denied at human checkpoint'));
      setLedgerLen(readAgentLedger(browserStorage()).entries.length);
    }
    setStatus('Agent proposal denied — nothing changed.');
    setPhase('idle');
    setPlan(null);
  };

  return (
    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, letterSpacing: 1, color: 'var(--nexus-muted)', textTransform: 'uppercase' }}>Agent dock</span>
        <span style={{ fontSize: 10, color: '#ffd24a' }}>DEMO MODE · §28 you approve</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="field"
          placeholder="goal, e.g. highlight the hero title"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void runPlan()}
          disabled={phase === 'planning'}
        />
        <button className="btn btn-primary" onClick={() => void runPlan()} disabled={phase === 'planning'}>
          {phase === 'planning' ? '…' : 'Plan'}
        </button>
      </div>
      {note && <div style={label}>{note}</div>}
      {phase === 'awaiting' && plan && (
        <div style={{ border: '1px solid var(--nexus-border)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 12 }}>Proposed for <b>{plan.targetName}</b></div>
          <div style={label}>
            research: {plan.handoff.via} → {plan.handoff.refs.map((r) => r.path).join(', ')}
          </div>
          <div style={label}>
            pipeline status {plan.outcome.status} · score {plan.evaluation.score.toFixed(2)} · {plan.batch.ops.length} op(s), reversible
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary" onClick={approve} data-testid="agent-approve">Approve</button>
            <button className="btn" onClick={deny} data-testid="agent-deny">Deny</button>
          </div>
        </div>
      )}
      {(phase === 'done' || ledgerLen > 0) && (
        <div style={label}>
          {phase === 'done' ? 'Applied — undo (Cmd/Ctrl+Z) reverts the banner. ' : ''}
          ledger: {ledgerLen} checkpoint decision(s) on this device.
        </div>
      )}
    </div>
  );
}
