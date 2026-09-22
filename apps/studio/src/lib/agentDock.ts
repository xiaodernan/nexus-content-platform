import {
  DEMO_ROLES,
  InMemoryWorkspace,
  MemoryStore,
  RoleRegistry,
  ToolRegistry,
  deserializeMemory,
  predicateRunner,
  registerMemoryTools,
  registerTestTools,
  registerWorkspaceTools,
  runRoleChain,
  runRolePipeline,
  runVisualQa,
  proposeRepairs,
  saveMemory,
  loadMemoryStore,
  serializeMemory,
  type ChainStageHandoff,
  type HandoffRecord,
  type QaReport,
  type Repair,
  type RunEvaluation,
  type RunOutcome,
  type TestPredicate,
} from '@nexus/agent-runtime';
import {
  childIdList,
  colorToCss,
  layoutPage,
  newId,
  ops,
  resolveToken,
  textNode,
  type DesignDocument,
  type DesignNode,
  type OpBatch,
  type Paint,
  type TextStyle,
} from '@nexus/design-model';

import { browserStorage } from './storage';
import { saveVectors } from '@nexus/agent-runtime';
export const STUDIO_VECTORS_FILE = 'agent/vectors-studio.json';
import { createWebFs } from './webfs';

/**
 * M2 v10 — the Studio Agent dock (§23/§25/§28). The @nexus/agent-runtime pipeline runs
 * over a *corpus view* of the Design Model (every layer → one text "file"), so research,
 * memory handoffs, scopes and scoring are the same tested machinery as the CLI proofs —
 * no second implementation (§8: the model stays canonical; the dock only proposes ops).
 * The user is the Human Checkpoint: nothing touches the op path without Approve.
 */
export const AGENT_LEDGER_KEY = 'nexus.agentLedger.v1';
/** v13: the dock's §26 memory lives on the web-fs seam — the same JSON format the node proofs reload. */
export const STUDIO_MEMORY_FILE = 'agent/memory-studio.json';

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

/**
 * v28: the dock verifies through the runtime's shared predicate engine — both plan modes
 * register the SAME named check (no more ad-hoc, one-off `test.run` bodies). The check
 * runs in-process over the corpus copy; the document itself is still untouched until §28.
 */
const ANNOTATION_LANDED: TestPredicate = {
  name: 'annotation-landed',
  check: (files) => (Object.values(files).some((c) => c.includes('NOTE (DEMO MODE')) ? null : 'the annotation must land in the corpus copy'),
};
const dockTestRunner = (ws: InMemoryWorkspace) => predicateRunner('in-process-predicates', [ANNOTATION_LANDED], () => ws.snapshot());

/**
 * v33: WHAT VERIFIED each run, made visible. The §63 reports already journal on the
 * RunOutcome (v28) — the dock renders them as chips so a green banner can always be
 * traced to the engine that proved it, and a failure names itself. Pure selector:
 * no state, no I/O, trivially testable.
 */
export interface TestChip {
  engine: string;
  ok: boolean;
  passed: number;
  total: number;
  /** `name: message` of the first failure, or null when the report passed. */
  firstFailure: string | null;
}

export function testChipsFor(outcome: RunOutcome): TestChip[] {
  return (outcome.testReports ?? []).map((r) => ({
    engine: r.engine,
    ok: r.ok,
    passed: r.passed,
    total: r.total,
    firstFailure: r.failures[0] ? `${r.failures[0].name}: ${r.failures[0].message}` : null,
  }));
}

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

export async function planAgentRun(doc: DesignDocument, pageId: string, goal: string, kv: Kv = browserStorage()): Promise<AgentPlan | PlanFailure> {
  const trimmed = goal.trim();
  if (!trimmed) return { ok: false, reason: 'type a goal first' };
  const corpus = corpusFromDoc(doc, pageId);
  if (Object.keys(corpus).length === 0) return { ok: false, reason: 'this page has no layers to research' };

  const ws = new InMemoryWorkspace(corpus);
  const webFs = createWebFs(kv);
  const store = new MemoryStore();
  loadMemoryStore(store, webFs, STUDIO_MEMORY_FILE); // cold restore across refreshes; missing file is fine
  const registry = registerMemoryTools(registerWorkspaceTools(new ToolRegistry(), ws), store, 'studio');
  registerTestTools(registry, dockTestRunner(ws));
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
  saveMemory(store, webFs, STUDIO_MEMORY_FILE); // v13: handoffs now survive page refreshes
  saveVectors(webFs, STUDIO_VECTORS_FILE, store.toVectorDb()); // v19: persisted vectors back recall after reloads
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

/** First solid-resolvable paint as a CSS color string (token refs followed), else undefined. */
function firstColor(doc: DesignDocument, paints: Paint[] | undefined): string | undefined {
  for (const p of paints ?? []) {
    if (p.kind === 'solid') return colorToCss(p.color);
    if (p.kind === 'token') {
      const v = resolveToken(doc.tokens, p.ref);
      if (v !== undefined) {
        const css = colorToCss(v);
        if (css) return css;
      }
    }
  }
  return undefined;
}

export function qaInputForDoc(doc: DesignDocument, pageId: string): { page: QaRectLike; rects: Record<string, QaRectLike> } | null {
  const layout = layoutPage(doc, pageId);
  const page = layout[pageId];
  if (!page) return null;
  const pageBg = firstColor(doc, (doc.nodes[pageId] as { fills?: Paint[] } | undefined)?.fills);
  const rects: Record<string, QaRectLike> = {};
  for (const id of childIdList(doc.nodes[pageId]!)) {
    const r = layout[id];
    const node = doc.nodes[id] as { fills?: Paint[] } | undefined;
    if (r && node) {
      const fill = firstColor(doc, node.fills);
      rects[id] = { x: r.x, y: r.y, width: r.width, height: r.height, ...(fill ? { fill, ...(pageBg ? { bg: pageBg } : {}) } : {}) };
    }
  }
  return { page: { x: page.x, y: page.y, width: page.width, height: page.height }, rects };
}

export function qaForDoc(doc: DesignDocument, pageId: string): QaReport {
  const input = qaInputForDoc(doc, pageId);
  if (!input) return { verdict: 'ok', checked: 0, flags: [] };
  // v24: the dock opts into the near-miss lints at a tight 2px — measurable slips only.
  // v26 adds the even-gap distribution lint at the same 2px (a 1–2px spacing wobble in a
  // chain of ≥3 siblings is arithmetic, not taste). v27 adds the near-edge snap lint.
  return runVisualQa({ ...input, alignTolerance: 2, centerTolerance: 2, gapTolerance: 2, edgeTolerance: 2 });
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
  // v25: the dock opts into alignment nudges at the same 2px as qaForDoc — but they land
  // as ordinary repair proposals, still gated behind §28 Approve; nothing moves on its own.
  const res = proposeRepairs({ page: { x: page.x, y: page.y, width: page.width, height: page.height }, rects, alignTolerance: 2, centerTolerance: 2, edgeTolerance: 2 }, { alignRepairs: true });
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

type QaRectLike = { x: number; y: number; width: number; height: number; fill?: string; bg?: string };

/* ---- v15: four-role chain mode for the dock (§24 handoffs visible before approval) ---- */

export interface ChainPlan {
  goal: string;
  pageId: string;
  handoffs: ChainStageHandoff[];
  qa: QaReport;
  outcome: RunOutcome;
  evaluation: RunEvaluation;
  batch: OpBatch;
}

export async function planAgentChain(doc: DesignDocument, pageId: string, goal: string, kv: Kv = browserStorage()): Promise<ChainPlan | PlanFailure> {
  const trimmed = goal.trim();
  if (!trimmed) return { ok: false, reason: 'type a goal first' };
  const corpus = corpusFromDoc(doc, pageId);
  if (Object.keys(corpus).length === 0) return { ok: false, reason: 'this page has no layers to research' };
  const ws = new InMemoryWorkspace(corpus);
  const webFs = createWebFs(kv);
  const store = new MemoryStore();
  loadMemoryStore(store, webFs, STUDIO_MEMORY_FILE);
  const registry = registerMemoryTools(registerWorkspaceTools(new ToolRegistry(), ws), store, 'studio');
  registerTestTools(registry, dockTestRunner(ws));
  const roles = new RoleRegistry();
  DEMO_ROLES.forEach((r) => roles.register(r));
  const qaInput = qaInputForDoc(doc, pageId) ?? { page: { x: 0, y: 0, width: 0, height: 0 }, rects: {} };
  const res = await runRoleChain({ id: `studio-chain-${Date.now()}`, goal: trimmed }, { // v19 vectors persisted by the pipeline path below on approve
    roles, registry, store, scope: 'studio', checkpoint: () => true, snapshot: () => ws.snapshot(),
    memoryFile: STUDIO_MEMORY_FILE, fsLike: webFs, qaInput,
  });
  if (!res.ok) return { ok: false, reason: `${res.stage}: ${res.reason}` };
  saveVectors(webFs, STUDIO_VECTORS_FILE, store.toVectorDb()); // v19: chain memories are vectorized too
  const first = res.handoffs[0]!;
  return {
    goal: trimmed,
    pageId,
    handoffs: res.handoffs,
    qa: res.qa,
    outcome: res.editorOutcome,
    evaluation: res.evaluation,
    batch: agentBatchFor(doc, pageId, trimmed, { from: 'researcher', to: 'editor', goal: trimmed, via: first.via, refs: first.refs, runId: first.runId }),
  };
}

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
  /** v33: the LAST §63 verification report as stated data — `engine passed/total ok|fail`. */
  tests?: string;
  at: number;
}

export function ledgerLine(plan: AgentPlan, approved: boolean, reason?: string, qa?: QaReport, repairs?: number): string {
  const reports = plan.outcome.testReports ?? [];
  const last = reports.length > 0 ? reports[reports.length - 1] : undefined;
  const e: LedgerEntry = {
    goal: plan.goal,
    target: plan.targetId,
    via: plan.handoff.via,
    score: plan.evaluation.score,
    approved,
    ...(reason ? { reason } : {}),
    ...(qa ? { qa: qa.verdict } : {}),
    ...(repairs !== undefined ? { repairs } : {}),
    ...(last ? { tests: `${last.engine} ${last.passed}/${last.total} ${last.ok ? 'ok' : 'FAIL'}` } : {}),
    at: Date.now(),
  };
  return JSON.stringify(e);
}

export interface KvLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
type Kv = KvLike;

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

/* ---- v13: §26 memory inspection for the dock (scoped, inspectable, deletable) ---- */

export interface MemoryOverview {
  total: number;
  records: { id: string; query: string; paths: string[] }[];
}

export function studioMemoryOverview(kv: Kv = browserStorage()): MemoryOverview {
  const store = new MemoryStore();
  const res = loadMemoryStore(store, createWebFs(kv), STUDIO_MEMORY_FILE);
  if (!res.ok) return { total: 0, records: [] };
  const records = store
    .list('studio')
    .map((r) => ({ id: r.id, query: r.query, paths: r.refs.map((f) => f.path) }));
  return { total: records.length, records };
}

/** Delete one memory record by id (user-initiated; returns whether it existed). */
export function studioMemoryForget(id: string, kv: Kv = browserStorage()): boolean {
  const webFs = createWebFs(kv);
  let json: string;
  try {
    json = webFs.readFileSync(STUDIO_MEMORY_FILE, 'utf8');
  } catch {
    return false;
  }
  const parsed = deserializeMemory(json);
  if (!parsed.ok) return false;
  const keep = parsed.records.filter((r) => r.id !== id);
  if (keep.length === parsed.records.length) return false;
  const store = new MemoryStore();
  for (const r of keep) store.restore(r);
  webFs.writeFileSync(STUDIO_MEMORY_FILE, serializeMemory(store), 'utf8');
  return true;
}
