'use client';
import { useRef, useState } from 'react';
import { useStudio } from '@/lib/store';
import { browserStorage } from '@/lib/storage';
import {
  appendLedgerLine,
  ledgerLine,
  planAgentChain,
  planAgentRun,
  planRepairs,
  qaForDoc,
  readAgentLedger,
  studioMemoryForget,
  studioMemoryOverview,
  testChipsFor,
  type AgentPlan,
  type LedgerEntry,
  type MemoryOverview,
  type RepairPlan,
  type TestChip,
} from '@/lib/agentDock';
import type { ChainStageHandoff, QaReport } from '@nexus/agent-runtime';
import { createDomDriver, runUiTask } from '@/lib/uiRun';

type Phase = 'idle' | 'planning' | 'awaiting' | 'done';

const label: React.CSSProperties = { fontSize: 11, color: 'var(--nexus-muted)' };

/** v33: verification chips — every §63 report on a RunOutcome, stated by its engine. */
function TestChips({ chips }: { chips: TestChip[] }) {
  if (chips.length === 0) return <div style={label}>verified by: (no test.run in this host)</div>;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} data-testid="agent-test-chips">
      {chips.map((c, i) => (
        <span
          key={`${c.engine}-${i}`}
          data-testid="agent-test-chip"
          title={c.firstFailure ?? 'all predicates passed'}
          style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, border: '1px solid var(--nexus-border)', color: c.ok ? '#7dd97d' : '#ff7a7a' }}
        >
          {c.ok ? '✓' : '✗'} {c.engine} {c.passed}/{c.total}
        </span>
      ))}
    </div>
  );
}

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
  const [chainMode, setChainMode] = useState(false);
  const [handoffList, setHandoffList] = useState<ChainStageHandoff[]>([]);
  const [previewQa, setPreviewQa] = useState<QaReport | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [uiAsk, setUiAsk] = useState<{ tool: string; label: string; detail: string } | null>(null);
  const [uiLog, setUiLog] = useState<string[]>([]);
  const [uiReports, setUiReports] = useState<TestChip[]>([]);
  const [uiBusy, setUiBusy] = useState(false);
  const decider = useRef<(v: boolean) => void>(() => {});

  const agentUiRun = async () => {
    if (uiBusy) return;
    setUiBusy(true);
    setUiLog([]);
    const decide = (plan: { tool: string; label: string; detail: string }) =>
      new Promise<boolean>((resolve) => {
        decider.current = resolve;
        setUiAsk(plan);
      });
    const driver = { ...createDomDriver(), layerCount: () => Object.keys(useStudio.getState().doc.nodes).length };
    const { outcome, actions } = await runUiTask(driver, goal || 'an analytics dashboard', decide, undefined, browserStorage());
    setUiAsk(null);
    setUiBusy(false);
    setUiLog(actions);
    setUiReports(testChipsFor(outcome));
    setNote(outcome.status === 'completed' ? 'Agent UI task finished — every action passed your checkpoint.' : `UI task stopped: ${outcome.status}`);
  };

  const answerUi = (v: boolean) => {
    decider.current(v);
    if (!v) setUiLog((l) => [...l, '(denied — the run stops here)']);
  };

  const syncLedger = () => setEntries(readAgentLedger(browserStorage()).entries.slice(-8).reverse());

  const refreshMemory = () => setMemory(studioMemoryOverview());
  const forget = (id: string) => {
    studioMemoryForget(id);
    refreshMemory();
  };

  const runPlan = async () => {
    setPhase('planning');
    setNote('');
    const res = chainMode ? await planAgentChain(doc, activePageId, goal) : await planAgentRun(doc, activePageId, goal);
    if ('ok' in res && res.ok === false) {
      setPhase('idle');
      setNote(res.reason);
      return;
    }
    if (chainMode) {
      const c = res as import('@/lib/agentDock').ChainPlan;
      const first = c.handoffs[0]!;
      setHandoffList(c.handoffs);
      setPreviewQa(c.qa);
      setPlan({
        goal: c.goal,
        pageId: c.pageId,
        handoff: { from: 'researcher', to: 'editor', goal: c.goal, via: first.via, refs: first.refs, runId: 'chain' },
        targetId: first.refs[0]?.path ?? '',
        targetName: doc.nodes[first.refs[0]?.path ?? '']?.name ?? first.refs[0]?.path ?? '?',
        outcome: c.outcome,
        evaluation: c.evaluation,
        batch: c.batch,
      });
    } else {
      setHandoffList([]);
      setPreviewQa(null);
      setPlan(res as AgentPlan);
    }
    setPhase('awaiting');
  };

  const approve = () => {
    if (!plan) return;
    commitOps(plan.batch.ops, plan.batch.summary ?? 'Agent proposal', plan.batch.provenance);
    const report = qaForDoc(useStudio.getState().doc, plan.pageId);
    setQa(report);
    appendLedgerLine(browserStorage(), ledgerLine(plan, true, undefined, report));
    setLedgerLen(readAgentLedger(browserStorage()).entries.length);
    syncLedger();
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
    syncLedger();
    setStatus(`Agent repairs applied (undoable) · QA now ${after.verdict}`);
    setRepair(null);
  };

  const deny = () => {
    if (plan) {
      appendLedgerLine(browserStorage(), ledgerLine(plan, false, 'denied at human checkpoint'));
      setLedgerLen(readAgentLedger(browserStorage()).entries.length);
    }
    syncLedger();
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
      <button className="btn" onClick={() => void agentUiRun()} disabled={uiBusy} data-testid="agent-ui-run" style={{ alignSelf: 'flex-start' }}>
        {uiBusy ? 'Agent acting…' : 'Agent UI run (§63 · you gate each action)'}
      </button>
      {uiAsk && (
        <div style={{ border: '1px solid #ffd24a', borderRadius: 8, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11 }}>Agent wants to <b>{uiAsk.tool === 'ui.click' ? 'click' : 'type into'}</b> &ldquo;{uiAsk.label}&rdquo; ({uiAsk.detail}). Allow this single action?</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-primary" onClick={() => answerUi(true)} data-testid="ui-allow">Allow once</button>
            <button className="btn" onClick={() => answerUi(false)} data-testid="ui-deny">Deny</button>
          </div>
        </div>
      )}
      {uiLog.length > 0 && <div style={label}>gated actions: {uiLog.join(' → ')}</div>}
      {uiReports.length > 0 && <TestChips chips={uiReports} />}
      <label style={{ ...label, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
        <input type="checkbox" checked={chainMode} onChange={(e) => setChainMode(e.target.checked)} />
        role chain (researcher → designer → qa → editor, §24)
      </label>
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
          <TestChips chips={testChipsFor(plan.outcome)} />
          {chainMode && handoffList.length > 0 && (
            <div style={{ borderTop: '1px solid var(--nexus-border)', paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={label}>stage handoffs (the designer brief stays in the sandbox corpus — only the banner is proposed to your document):</div>
              {handoffList.map((h) => (
                <div key={h.from + h.to} style={label}>· {h.from} → {h.to} via {h.via} [{h.refs.map((r) => r.path).join(', ')}]</div>
              ))}
              {previewQa && (
                <div style={label}>pre-approval QA: {previewQa.verdict} {previewQa.flags.map((f) => f.code).slice(0, 3).join(', ')}</div>
              )}
            </div>
          )}
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
      {entries.length > 0 && (
        <div style={{ borderTop: '1px solid var(--nexus-border)', paddingTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 10, letterSpacing: 1, color: 'var(--nexus-muted)' }}>RECENT DECISIONS</div>
          {entries.map((e, i) => (
            <div key={i} style={{ ...label, display: 'flex', gap: 6 }}>
              <span style={{ color: e.approved ? '#7dd97d' : '#ff7a7a' }}>{e.approved ? 'approved' : 'denied'}</span>
              <span style={{ flex: 1 }}>{e.goal.slice(0, 26)}{e.qa ? ` · qa:${e.qa}` : ''}{e.repairs !== undefined ? ` · fix×${e.repairs}` : ''}{e.tests ? ` · ${e.tests}` : ''}</span>
            </div>
          ))}
        </div>
      )}
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
