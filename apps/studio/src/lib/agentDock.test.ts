import { describe, expect, it } from 'vitest';
import {
  applyBatch,
  childIdList,
  createEmptyDocument,
  invertOp,
  newId,
  ops,
  rectNode,
  textNode,
  type DesignDocument,
  type Op,
  type TextStyle,
} from '@nexus/design-model';
import {
  AGENT_LEDGER_KEY,
  appendLedgerLine,
  corpusFromDoc,
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
} from './agentDock';
import { memoryStore } from './storage';
import { createWebFs } from './webfs';
import { loadVectors, queryVectors } from '@nexus/agent-runtime';
import { STUDIO_VECTORS_FILE } from './agentDock';

const STYLE: TextStyle = { fontFamilyToken: 'font.family.body', sizeToken: 'font.size.base', weight: 400, lineHeight: 1.35, letterSpacing: 0, align: 'left' };

function seededDoc(): { doc: DesignDocument; pageId: string; heroId: string; cardId: string } {
  const created = createEmptyDocument('dock test');
  const pageId = created.activePageId;
  const sized = applyBatch(created, {
    id: newId(),
    ops: [ops.updateNode(pageId, { x: 0, y: 0, width: 1200, height: 800 })],
    provenance: { mode: 'user' },
    timestamp: 0,
  });
  const heroId = newId();
  const cardId = newId();
  const hero = textNode('Hero title', 'welcome to the widget showcase', STYLE, { id: heroId, x: 40, y: 40, width: 300, height: 40 });
  const card = rectNode('CTA card', { id: cardId, x: 40, y: 120, width: 200, height: 80 });
  const doc = applyBatch(sized, {
    id: newId(),
    ops: [
      ops.addSubtree(pageId, childIdList(sized.nodes[pageId]!).length, [hero]),
      ops.addSubtree(pageId, childIdList(sized.nodes[pageId]!).length + 1, [card]),
    ],
    provenance: { mode: 'user' },
    timestamp: 1,
  });
  return { doc, pageId, heroId, cardId };
}

class FakeKv {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

describe('agentDock corpus', () => {
  it('one deterministic pseudo-file per layer, text content included', () => {
    const { doc, pageId, heroId, cardId } = seededDoc();
    const corpus = corpusFromDoc(doc, pageId);
    expect(Object.keys(corpus).sort()).toEqual([cardId, heroId].sort());
    expect(corpus[heroId]).toContain('Hero title');
    expect(corpus[heroId]).toContain('welcome to the widget showcase');
    expect(corpusFromDoc(doc, 'nope')).toEqual({});
  });
});

describe('agentDock pipeline (§23/§25/§28)', () => {
  it('empty goal fails with a stated reason', async () => {
    const { doc, pageId } = seededDoc();
    const res = await planAgentRun(doc, pageId, '   ');
    expect(res).toEqual({ ok: false, reason: 'type a goal first' });
  });

  it('researches the matching layer and proposes a valid, reversible OpBatch', async () => {
    const { doc, pageId, heroId } = seededDoc();
    const res = await planAgentRun(doc, pageId, 'recolor the welcome hero text');
    expect('handoff' in res).toBe(true);
    if (!('handoff' in res)) return;
    const plan = res as AgentPlan;
    expect(plan.handoff.via).toBe('fs.index');
    expect(plan.targetId).toBe(heroId);
    expect(plan.targetName).toBe('Hero title');
    expect(plan.outcome.status).toBe('completed');
    expect(plan.evaluation.score).toBe(1);
    expect(plan.batch.provenance?.mode).toBe('demo');
    const applied = applyBatch(doc, plan.batch);
    expect(childIdList(applied.nodes[pageId]!).length).toBe(childIdList(doc.nodes[pageId]!).length + 1);
    const banner = Object.values(applied.nodes).find((n) => n.name === 'Agent Note');
    expect(banner?.type).toBe('text');
    expect((banner as { characters?: string }).characters).toContain('recolor the welcome hero text');
    const undone = applyBatch(applied, {
      id: newId(),
      ops: plan.batch.ops.map((op) => invertOp(applied, op)).reverse() as Op[],
      provenance: { mode: 'user' },
      timestamp: 2,
    });
    expect(Object.keys(undone.nodes).length).toBe(Object.keys(doc.nodes).length);
  });

  it('v28: the dock verifies with the shared predicate engine of the runtime — reports travel on the outcome', async () => {
    const { doc, pageId } = seededDoc();
    const res = await planAgentRun(doc, pageId, 'recolor the welcome hero text');
    if (!('handoff' in res)) throw new Error('plan unexpectedly rejected');
    const reports = res.outcome.testReports;
    expect(reports).toBeDefined();
    const last = reports![reports!.length - 1]!;
    expect(last).toMatchObject({ engine: 'in-process-predicates', ok: true, total: 1, passed: 1 });
    expect(last.failures).toEqual([]);
  });

  it('v33: testChipsFor states WHO verified a run — passing AND failing reports become chips with named engines', () => {
    const outcome = {
      status: 'completed',
      testReports: [
        { engine: 'in-process-predicates', ok: true, total: 2, passed: 2, detail: '', failures: [] },
        { engine: 'exec-host:node check.js', ok: false, total: 1, passed: 0, detail: '', failures: [{ name: 'exit-zero', message: 'exit 1 · boom' }] },
      ],
    } as never;
    expect(testChipsFor(outcome)).toEqual([
      { engine: 'in-process-predicates', ok: true, passed: 2, total: 2, firstFailure: null, evidenceCut: null },
      { engine: 'exec-host:node check.js', ok: false, passed: 0, total: 1, firstFailure: 'exit-zero: exit 1 · boom', evidenceCut: null },
    ]);
    expect(testChipsFor({ status: 'completed' } as never)).toEqual([]); // hosts without test.run say so, they don't fake chips
  });

  it('v72: a GREEN report whose evidence was cut is stated as green AND cut — the two are different facts', () => {
    const outcome = {
      status: 'completed',
      testReports: [
        // what v71's bridge produces for `exit 0` with an overflowed stdout: the verdict is the command's,
        // the quote is a window. A chip that printed only `✓ 1/1` hid the second half.
        { engine: 'exec-host:node suite.js', ok: true, total: 1, passed: 1, detail: '', failures: [], truncatedStreams: ['stdout'] },
        { engine: 'exec-host:node noisy.js', ok: true, total: 1, passed: 1, detail: '', failures: [], truncatedStreams: ['stdout', 'stderr'] },
        { engine: 'in-process-predicates', ok: true, total: 1, passed: 1, detail: '', failures: [] },
      ],
    } as never;
    expect(testChipsFor(outcome).map((c) => [c.ok, c.evidenceCut])).toEqual([
      [true, 'stdout'],
      [true, 'stdout + stderr'], // the same joining v56 chose for its budget clause, so nothing new is invented
      [true, null], // an in-process predicate runner has no pipes to cut: null, never an empty string
    ]);
  });

  it('v33: a real pipeline plan yields exactly one honest ok chip', async () => {
    const { doc, pageId } = seededDoc();
    const res = await planAgentRun(doc, pageId, 'recolor the welcome hero text');
    if (!('handoff' in res)) throw new Error('plan unexpectedly rejected');
    const chips = testChipsFor(res.outcome);
    expect(chips).toEqual([{ engine: 'in-process-predicates', ok: true, passed: 1, total: 1, firstFailure: null, evidenceCut: null }]);
  });

  it('v33: the ledger records the verification verdict beside the decision; report-less plans add no field', () => {
    const { pageId } = seededDoc();
    const base = {
      goal: 'g',
      pageId,
      handoff: { from: 'researcher', to: 'editor', goal: 'g', via: 'fs.index', refs: [{ path: 'n1' }], runId: 'r' },
      targetId: 'n1',
      targetName: 'N1',
      evaluation: { score: 1 },
      batch: { id: 'b', ops: [], timestamp: 0 },
    };
    const withReport = { ...base, outcome: { status: 'completed', testReports: [{ engine: 'in-process-predicates', ok: true, total: 1, passed: 1, detail: '', failures: [] }] } } as unknown as AgentPlan;
    const entry = JSON.parse(ledgerLine(withReport, true));
    expect(entry.tests).toBe('in-process-predicates 1/1 ok');
    const without = JSON.parse(ledgerLine({ ...base, outcome: { status: 'completed' } } as unknown as AgentPlan, false, 'denied'));
    expect('tests' in without).toBe(false);
  });

  it('ledger lines round-trip through the KvStore seam and count malformed', () => {
    const { pageId } = seededDoc();    const kv = new FakeKv();
    const fake = {
      goal: 'g',
      pageId,
      handoff: { from: 'researcher', to: 'editor', goal: 'g', via: 'fs.index', refs: [{ path: 'n1' }], runId: 'r' },
      targetId: 'n1',
      targetName: 'N1',
      outcome: { status: 'completed' },
      evaluation: { score: 0.5 },
      batch: { id: 'b', ops: [], timestamp: 0 },
    } as unknown as AgentPlan;
    appendLedgerLine(kv, ledgerLine(fake, true));
    appendLedgerLine(kv, ledgerLine(fake, false, 'denied at human checkpoint'));
    kv.setItem(AGENT_LEDGER_KEY, (kv.getItem(AGENT_LEDGER_KEY) ?? '') + 'junk\n');
    const { entries, malformed } = readAgentLedger(kv);
    expect(entries.map((e) => e.approved)).toEqual([true, false]);
    expect(entries[1]!.reason).toBe('denied at human checkpoint');
    expect(malformed).toBe(1);
  });
});

describe('agentDock visual QA (v11)', () => {
  it('seeded page is structurally clean; stacking a copy over a layer flags overlap', () => {
    const { doc, pageId, cardId } = seededDoc();
    const clean = qaForDoc(doc, pageId);
    expect(clean.verdict).toBe('ok');
    expect(clean.checked).toBe(2);

    const copy = rectNode('CTA copy', { id: 'copy-1', x: 45, y: 125, width: 190, height: 70 });
    const stacked = applyBatch(doc, {
      id: newId(),
      ops: [ops.addSubtree(pageId, childIdList(doc.nodes[pageId]!).length, [copy])],
      provenance: { mode: 'user' },
      timestamp: 3,
    });
    const rep = qaForDoc(stacked, pageId);
    expect(rep.verdict).toBe('flagged');
    const overlap = rep.flags.find((f) => f.code === 'overlap');
    expect(overlap?.ids).toContain(cardId);
  });

  it('v24 near-miss opt-in: a 1.5px edge slip yields near-align chips; exact alignment yields none', () => {
    const { doc, pageId, heroId, cardId } = seededDoc();
    const slipped = rectNode('Slip', { id: 'slip-1', x: 41.5, y: 300, width: 250, height: 40 });
    const withSlip = applyBatch(doc, { id: newId(), ops: [ops.addSubtree(pageId, childIdList(doc.nodes[pageId]!).length, [slipped])], provenance: { mode: 'user' }, timestamp: 6 });
    const near = qaForDoc(withSlip, pageId).flags.filter((f) => f.code === 'near-align');
    // slip shares a left edge 1.5px off BOTH seed layers — and the seed pair itself (exact x=40) never flags
    expect(near).toHaveLength(2);
    expect(near.some((f) => f.ids.includes(heroId) && f.ids.includes(cardId))).toBe(false);
    expect(near.every((f) => f.ids.includes('slip-1') && f.severity === 'warn')).toBe(true);
  });

  it('v25 nudges are proposals, not magic: the dock offers an align-nudge batch that clears QA only once applied', () => {
    const { doc, pageId } = seededDoc();
    const slipped = rectNode('Slip', { id: 'slip-1', x: 41.5, y: 300, width: 250, height: 40 });
    const withSlip = applyBatch(doc, { id: newId(), ops: [ops.addSubtree(pageId, childIdList(doc.nodes[pageId]!).length, [slipped])], provenance: { mode: 'user' }, timestamp: 7 });
    const plan = planRepairs(withSlip, pageId, 'fix alignment');
    expect(plan).not.toBeNull();
    expect(plan!.repairs.every((p) => p.action === 'align-nudge')).toBe(true);
    expect(plan!.repairs.map((p) => p.targetId)).toEqual(['slip-1']); // the smallest layer is the one that moves
    // proposing changes nothing on disk until the batch goes through the op path (§28):
    expect(qaForDoc(withSlip, pageId).flags.some((f) => f.code === 'near-align')).toBe(true);
    const fixed = applyBatch(withSlip, plan!.batch);
    expect(qaForDoc(fixed, pageId).verdict).toBe('ok');
  });

  it('v26 distribution chip: a 1px spacing wobble across a 3-layer chain surfaces as uneven-gaps, nothing more', () => {
    const { doc, pageId, heroId, cardId } = seededDoc();
    const wob = rectNode('Wobble', { id: 'wob-1', x: 60, y: 241, width: 200, height: 20 }); // y gaps 40 then 41 — 1px uneven
    const withWob = applyBatch(doc, { id: newId(), ops: [ops.addSubtree(pageId, childIdList(doc.nodes[pageId]!).length, [wob])], provenance: { mode: 'user' }, timestamp: 8 });
    const rep = qaForDoc(withWob, pageId);
    const uneven = rep.flags.filter((f) => f.code === 'uneven-gaps');
    expect(uneven).toHaveLength(1);
    expect(uneven[0]!.ids).toEqual([heroId, cardId, 'wob-1']); // sorted by y-start, the real chain
    expect(uneven[0]!.detail).toContain('along y');
    expect(uneven[0]!.detail).toContain('1.0px uneven');
    expect(rep.flags.every((f) => f.code === 'uneven-gaps' || f.severity === 'warn')).toBe(true);
    // and it is a LINT, not a repair: the v26 rule has no auto-fix — planRepairs stays honest
    const plan = planRepairs(withWob, pageId, 'fix spacing');
    expect(plan!.repairs).toEqual([]); // wob-1 gets no invented nudge; the loop reports "nothing safely fixable"
  });

  it('v27 edge-snap: a 1.5px page-margin slip lints AND earns a flush proposal that only lands after the op path', () => {
    const { doc, pageId } = seededDoc();
    const flusher = rectNode('Flusher', { id: 'flush-1', x: 1.5, y: 400, width: 200, height: 50 });
    const withFlush = applyBatch(doc, { id: newId(), ops: [ops.addSubtree(pageId, childIdList(doc.nodes[pageId]!).length, [flusher])], provenance: { mode: 'user' }, timestamp: 9 });
    expect(qaForDoc(withFlush, pageId).flags.some((f) => f.code === 'near-edge' && f.ids.includes('flush-1'))).toBe(true);
    const plan = planRepairs(withFlush, pageId, 'snap to edge');
    expect(plan!.repairs.map((p) => p.targetId)).toEqual(['flush-1']);
    expect(plan!.repairs[0]!.action).toBe('edge-snap');
    const fixed = applyBatch(withFlush, plan!.batch);
    expect(qaForDoc(fixed, pageId).verdict).toBe('ok'); // flush-on-purpose passes the lint
  });

  it('planRepairs closes the loop: applying its batch through the op path clears QA errors (v12)', () => {
    const { doc, pageId } = seededDoc();
    const strayed = rectNode('Lost', { id: 'lost-1', x: 5000, y: 200, width: 100, height: 50 });
    const broken = applyBatch(doc, { id: newId(), ops: [ops.addSubtree(pageId, childIdList(doc.nodes[pageId]!).length, [strayed])], provenance: { mode: 'user' }, timestamp: 4 });
    expect(qaForDoc(broken, pageId).verdict).toBe('flagged');

    const plan = planRepairs(broken, pageId, 'fix layout');
    expect(plan).not.toBeNull();
    expect(plan!.repairs.map((p) => p.targetId)).toContain('lost-1');
    const fixed = applyBatch(broken, plan!.batch);
    const after = qaForDoc(fixed, pageId);
    expect(after.flags.filter((f) => f.severity === 'error')).toEqual([]);
    // and it is reversible through the same op path (invert against the pre-repair doc)
    const reverted = applyBatch(fixed, { id: newId(), ops: plan!.batch.ops.map((op) => invertOp(broken, op)).reverse() as Op[], provenance: { mode: 'user' }, timestamp: 5 });
    expect(qaForDoc(reverted, pageId).flags.some((f) => f.code === 'off-page')).toBe(true);
  });

  it('v13 durability: a second planAgentRun sees the first run’s memory through the injected kv', async () => {
    const { doc, pageId } = seededDoc();
    const kv = memoryStore();
    const first = await planAgentRun(doc, pageId, 'recolor the welcome hero text', kv);
    expect('handoff' in first).toBe(true);
    const overview = studioMemoryOverview(kv);
    expect(overview.total).toBe(1);
    expect(overview.records[0]!.paths).toContain((first as AgentPlan).targetId);
    // forget is real: the durable file loses exactly that record
    expect(studioMemoryForget(overview.records[0]!.id, kv)).toBe(true);
    expect(studioMemoryOverview(kv).total).toBe(0);
    expect(studioMemoryForget('mem-999', kv)).toBe(false);
  });

  it('v15 chain mode: three typed handoffs, QA preview present, doc untouched pre-approval', async () => {
    const { doc, pageId } = seededDoc();
    const kv = memoryStore();
    const res = await planAgentChain(doc, pageId, 'recolor the welcome hero text', kv);
    expect('handoffs' in res).toBe(true);
    if (!('handoffs' in res)) return;
    expect(res.handoffs.map((h) => `${h.from}→${h.to}`)).toEqual(['researcher→designer', 'designer→qa', 'qa→editor']);
    expect(res.qa.checked).toBeGreaterThanOrEqual(2);
    expect(res.outcome.status).toBe('completed');
    expect(res.batch.ops).toHaveLength(1);
    // the real document never saw the designer brief — only the sandbox corpus did (§60/§28)
    expect(JSON.stringify(doc.nodes)).not.toContain('DESIGN (DEMO MODE');
    // and the durable memory now carries the three stage records
    expect(studioMemoryOverview(kv).total).toBeGreaterThanOrEqual(3);
  });

  it('v19: pipeline persists a vector db that answers the same recall cold', async () => {
    const { doc, pageId } = seededDoc();
    const kv = memoryStore();
    const res = await planAgentRun(doc, pageId, 'recolor the welcome hero text', kv);
    expect('handoff' in res).toBe(true);
    const loaded = loadVectors(createWebFs(kv), STUDIO_VECTORS_FILE);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const hits = queryVectors(loaded.db, 'recolor the welcome hero text', { k: 1 });
    expect(hits[0]!.meta?.paths).toContain((res as AgentPlan).targetId);
  });
});
describe('agentDock container ledger line (v172)', () => {
  it('lands one parseable JSONL entry with the exec detail stated', async () => {
    const { containerLedgerLine } = await import('./agentDock');
    const line = containerLedgerLine(['node', '-e', 'console.log("jail ok")'], 'node:22-alpine', true, 'container node:22-alpine node -e console.log("jail ok") → exit 0');
    const e = JSON.parse(line) as { goal: string; target: string; via: string; approved: boolean; exec?: string };
    if (e.goal !== 'container exec: node -e console.log("jail ok")') throw new Error(`goal: ${e.goal}`);
    if (e.target !== 'node:22-alpine') throw new Error('target');
    if (e.via !== 'container.exec') throw new Error('via');
    if (e.approved !== true) throw new Error('approved');
    if (!e.exec || !e.exec.includes('exit 0')) throw new Error('exec detail');
  });

  it('records a denial without an exec detail', async () => {
    const { containerLedgerLine } = await import('./agentDock');
    const e = JSON.parse(containerLedgerLine(['node', '-e', '1'], 'node:22-alpine', false, undefined, 'denied at human checkpoint')) as { approved: boolean; reason?: string; exec?: string };
    if (e.approved !== false) throw new Error('approved');
    if (e.reason !== 'denied at human checkpoint') throw new Error('reason');
    if (e.exec !== undefined) throw new Error('exec must be absent on a denial');
  });
});