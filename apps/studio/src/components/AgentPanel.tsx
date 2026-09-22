'use client';
import { useState } from 'react';
import { useStudio } from '@/lib/store';
import { browserStorage } from '@/lib/storage';
import {
  appendLedgerLine,
  ledgerLine,
  planAgentRun,
  planRepairs,
  qaForDoc,
  readAgentLedger,
  studioMemoryForget,
  studioMemoryOverview,
  type AgentPlan,
  type MemoryOverview,
  type RepairPlan,
} from '@/lib/agentDock';
import type { QaReport } from '@nexus/agent-runtime';

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
  const [qa, setQa] = useState<QaReport | null>(null);
  const [repair, setRepair] = useState<RepairPlan | null>(null);
  const [ledgerLen, setLedgerLen] = useState(0);
  const [memory, setMemory] = useState<MemoryOverview | null>(null);

  const refreshMemory = () => setMemory(studioMemoryOverview());
  const forget = (id: string) => {
    studioMemoryForget(id);
    refreshMemory();
  };

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
    const report = qaForDoc(useStudio.getState().doc, plan.pageId);
    setQa(report);
    appendLedgerLine(browserStorage(), ledgerLine(plan, true, undefined, report));
    setLedgerLen(readAgentLedger(browserStorage()).entries.length);
    setStatus(`Agent banner applied (undoable) · ${plan.targetName} · QA ${report.verdict === 'ok' ? 'clean' : `${report.flags.length} flag(s)`}`);
    setPhase('done');
  };

  const proposeRepairs = () => {
    if (!plan) return;
    setRepair(planRepairs(useStudio.getState().doc, plan.pageId, plan.goal));
  };

  const approveRepairs = () => {
    if (!repair || !plan || repair.repairs.length === 0) return;
    commitOps(repair.batch.ops, repair.batch.summary ?? 'Agent repair', repair.batch.provenance);
    const after = qaForDoc(useStudio.getState().doc, plan.pageId);
    setQa(after);
    appendLedgerLine(browserStorage(), ledgerLine(plan, true, undefined, after, repair.repairs.length));
    setLedgerLen(readAgentLedger(browserStorage()).entries.length);
    setStatus(`Agent repairs applied (undoable) · QA now ${after.verdict}`);
    setRepair(null);
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
      {phase === 'done' && qa && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, border: '1px solid var(--nexus-border)' }}>
            visual QA: {qa.verdict} · {qa.checked} checked
          </span>
          {qa.flags.slice(0, 3).map((f) => (
            <span key={f.code + f.ids.join()} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, border: '1px solid var(--nexus-border)', color: f.severity === 'error' ? '#ff7a7a' : '#ffd24a' }}>
              {f.code}
            </span>
          ))}
          {qa.verdict === 'flagged' && !repair && (
            <button className="btn" style={{ fontSize: 10, padding: '1px 8px' }} onClick={proposeRepairs} data-testid="agent-repair">
              Propose repairs
            </button>
          )}
        </div>
      )}
      {phase === 'done' && repair && (
        <div style={{ border: '1px solid var(--nexus-border)', borderRadius: 8, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11 }}>
            {repair.repairs.length === 0 ? 'Nothing safely fixable — flags remain by design.' : `${repair.repairs.length} deterministic repair move(s):`}
          </div>
          {repair.repairs.slice(0, 4).map((p) => (
            <div key={p.targetId} style={label}>
              {p.targetId.slice(0, 10)}… {p.action} → ({Math.round(p.to.x)}, {Math.round(p.to.y)}) · {p.reason}
            </div>
          ))}
          {repair.repairs.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" onClick={approveRepairs} data-testid="repair-approve">Approve repairs</button>
              <button className="btn" onClick={() => setRepair(null)}>Dismiss</button>
            </div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button className="btn" style={{ fontSize: 10, padding: '1px 8px' }} onClick={refreshMemory} data-testid="memory-refresh">Memory (§26)</button>
        <span style={label}>ledger: {ledgerLen} decision(s)</span>
      </div>
      {memory && (
        <div style={{ border: '1px solid var(--nexus-border)', borderRadius: 8, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11 }}>{memory.total === 0 ? 'No stored findings yet — durable across refresh once a plan runs.' : `${memory.total} durable record(s):`}</div>
          {memory.records.slice(0, 6).map((r) => (
            <div key={r.id} style={{ ...label, display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ flex: 1 }}>{r.query.slice(0, 34)} · {r.paths.length} ref(s)</span>
              <button className="btn" style={{ fontSize: 10, padding: '0 6px' }} onClick={() => forget(r.id)} data-testid={`forget-${r.id}`}>forget</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
