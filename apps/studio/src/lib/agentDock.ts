import {
  DEMO_ROLES,
  InMemoryWorkspace,
  MemoryStore,
  RoleRegistry,
  ToolRegistry,
  registerMemoryTools,
  registerWorkspaceTools,
  runRolePipeline,
  runVisualQa,
  proposeRepairs,
  type HandoffRecord,
  type QaReport,
  type Repair,
  type RunEvaluation,
  type RunOutcome,
} from '@nexus/agent-runtime';
import {
  childIdList,
  layoutPage,
  newId,
  ops,
  textNode,
  type DesignDocument,
  type DesignNode,
  type OpBatch,
  type Paint,
  type TextStyle,
} from '@nexus/design-model';

/**
 * M2 v10 — the Studio Agent dock (§23/§25/§28). The @nexus/agent-runtime pipeline runs
 * over a *corpus view* of the Design Model (every layer → one text "file"), so research,
 * memory handoffs, scopes and scoring are the same tested machinery as the CLI proofs —
 * no second implementation (§8: the model stays canonical; the dock only proposes ops).
 * The user is the Human Checkpoint: nothing touches the op path without Approve.
 */
export const AGENT_LEDGER_KEY = 'nexus.agentLedger.v1';

export interface AgentPlan {
  goal: string;
  pageId: string;
  handoff: HandoffRecord;
  targetId: string;
  targetName: string;
  outcome: RunOutcome;
  evaluation: RunEvaluation;
  batch: OpBatch;
}

export type PlanFailure = { ok: false; reason: string };

const token = (ref: string): Paint => ({ kind: 'token', ref } as Paint);

const TEXT_STYLE: TextStyle = {
  fontFamilyToken: 'font.family.body',
  sizeToken: 'font.size.base',
  weight: 400,
  lineHeight: 1.35,
  letterSpacing: 0,
  align: 'left',
};

/** Deterministic corpus: one pseudo-file per layer on the page (recursive). */
export function corpusFromDoc(doc: DesignDocument, pageId: string): Record<string, string> {
  const page = doc.nodes[pageId];
  if (!page) return {};
  const out: Record<string, string> = {};
  const visit = (node: DesignNode, depth: number): void => {
    const chars = (node as { characters?: string }).characters;
    out[node.id] = [`layer ${node.name}`, `type ${node.type}`, `depth ${depth}`, ...(chars ? [`text ${chars}`] : [])].join('\n');
    for (const child of childIdList(node)) {
      const kid = doc.nodes[child];
      if (kid) visit(kid, depth + 1);
    }
  };
  for (const id of childIdList(page)) {
    const kid = doc.nodes[id];
    if (kid) visit(kid, 0);
  }
  return out;
}

/** The proposal batch: one agent banner naming the goal and the research handoff. */
export function agentBatchFor(doc: DesignDocument, pageId: string, goal: string, handoff: HandoffRecord): OpBatch {
  const page = doc.nodes[pageId]!;
  const banner = textNode('Agent Note', `AGENT · ${goal} · proposed for ${handoff.refs.map((r) => r.path).join(', ')}`, TEXT_STYLE, {
    id: newId(),
    x: 24,
    y: 24,
    width: 560,
    height: 28,
    fills: [token('color.text')],
  });
  return {
    id: newId(),
    ops: [ops.addSubtree(pageId, childIdList(page).length, [banner])],
    provenance: { mode: 'demo', provider: 'nexus-agent-runtime', label: 'studio agent dock' },
    timestamp: Date.now(),
    summary: `Agent proposal: ${goal}`,
  };
}

export async function planAgentRun(doc: DesignDocument, pageId: string, goal: string): Promise<AgentPlan | PlanFailure> {
  const trimmed = goal.trim();
  if (!trimmed) return { ok: false, reason: 'type a goal first' };
  const corpus = corpusFromDoc(doc, pageId);
  if (Object.keys(corpus).length === 0) return { ok: false, reason: 'this page has no layers to research' };

  const ws = new InMemoryWorkspace(corpus);
  const store = new MemoryStore();
  const registry = registerMemoryTools(registerWorkspaceTools(new ToolRegistry(), ws), store, 'studio');
  registry.register({ name: 'test.run', description: 'host verification', permissions: ['exec'], args: [] }, () => ({
    ok: Object.values(ws.snapshot()).some((c) => c.includes('NOTE (DEMO MODE')),
    detail: 'the annotation must land in the corpus view',
  }));
  const roles = new RoleRegistry();
  DEMO_ROLES.forEach((r) => roles.register(r));

  const res = await runRolePipeline({ id: `studio-${Date.now()}`, goal: trimmed }, {
    roles,
    registry,
    store,
    scope: 'studio', // must match the memory tools' scope above, or the handoff is invisible
    checkpoint: () => true, // the pipeline's own gates are machine-approve; the HUMAN gate is this panel
    snapshot: () => ws.snapshot(),
  });
  if (!res.ok) return { ok: false, reason: res.reason };

  const targetId = res.handoff.refs[0]!.path;
  return {
    goal: trimmed,
    pageId,
    handoff: res.handoff,
    targetId,
    targetName: doc.nodes[targetId]?.name ?? targetId,
    outcome: res.editorOutcome,
    evaluation: res.evaluation,
    batch: agentBatchFor(doc, pageId, trimmed, res.handoff),
  };
}

/* ---- v11: structural visual QA over the applied document (§63, no pixel claims) ---- */

export function qaForDoc(doc: DesignDocument, pageId: string): QaReport {
  const layout = layoutPage(doc, pageId);
  const page = layout[pageId];
  if (!page) return { verdict: 'ok', checked: 0, flags: [] };
  const rects: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const id of childIdList(doc.nodes[pageId]!)) {
    const r = layout[id];
    if (r) rects[id] = { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  return runVisualQa({ page: { x: page.x, y: page.y, width: page.width, height: page.height }, rects });
}

/* ---- v12: QA → deterministic repair proposals, dispatched through the same op path ---- */

export interface RepairPlan {
  repairs: Repair[];
  remaining: QaReport;
  batch: OpBatch;
}

export function planRepairs(doc: DesignDocument, pageId: string, goal: string): RepairPlan | null {
  const qa = qaForDoc(doc, pageId);
  if (qa.verdict === 'ok') return null;
  const layout = layoutPage(doc, pageId);
  const page = layout[pageId]!;
  const rects: Record<string, QaRectLike> = {};
  for (const id of childIdList(doc.nodes[pageId]!)) {
    const r = layout[id];
    if (r) rects[id] = { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  const res = proposeRepairs({ page: { x: page.x, y: page.y, width: page.width, height: page.height }, rects });
  if (res.repairs.length === 0) return { repairs: [], remaining: res.remaining, batch: { id: newId(), ops: [], provenance: { mode: 'demo', provider: 'nexus-agent-runtime', label: 'studio repair (no-op)' }, timestamp: Date.now(), summary: 'Agent repair: nothing safely fixable' } };
  const batch: OpBatch = {
    id: newId(),
    ops: res.repairs.map((p) => ops.updateNode(p.targetId, { x: Math.round(p.to.x), y: Math.round(p.to.y), width: Math.round(p.to.width), height: Math.round(p.to.height) })),
    provenance: { mode: 'demo', provider: 'nexus-agent-runtime', label: `studio repair for ${goal}` },
    timestamp: Date.now(),
    summary: `Agent repair: ${res.repairs.length} fix(es)`,
  };
  return { repairs: res.repairs, remaining: res.remaining, batch };
}

type QaRectLike = { x: number; y: number; width: number; height: number };

/* ---- §28 audit trail: JSONL ledger through the studio's KvStore seam ---- */
export interface LedgerEntry {
  goal: string;
  target: string;
  via: string;
  score: number;
  approved: boolean;
  reason?: string;
  qa?: 'ok' | 'flagged';
  repairs?: number;
  at: number;
}

export function ledgerLine(plan: AgentPlan, approved: boolean, reason?: string, qa?: QaReport, repairs?: number): string {
  const e: LedgerEntry = {
    goal: plan.goal,
    target: plan.targetId,
    via: plan.handoff.via,
    score: plan.evaluation.score,
    approved,
    ...(reason ? { reason } : {}),
    ...(qa ? { qa: qa.verdict } : {}),
    ...(repairs !== undefined ? { repairs } : {}),
    at: Date.now(),
  };
  return JSON.stringify(e);
}

interface Kv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function appendLedgerLine(kv: Kv, line: string): void {
  const cur = kv.getItem(AGENT_LEDGER_KEY) ?? '';
  kv.setItem(AGENT_LEDGER_KEY, cur === '' || cur.endsWith('\n') ? cur + line + '\n' : cur + '\n' + line + '\n');
}

export function readAgentLedger(kv: Kv): { entries: LedgerEntry[]; malformed: number } {
  const text = kv.getItem(AGENT_LEDGER_KEY) ?? '';
  const entries: LedgerEntry[] = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const raw = JSON.parse(line) as Partial<LedgerEntry>;
      if (typeof raw.goal !== 'string' || typeof raw.approved !== 'boolean') malformed++;
      else entries.push(raw as LedgerEntry);
    } catch {
      malformed++;
    }
  }
  return { entries, malformed };
}
