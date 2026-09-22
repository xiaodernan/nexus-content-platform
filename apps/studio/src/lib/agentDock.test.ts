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
  planAgentRun,
  planRepairs,
  qaForDoc,
  readAgentLedger,
  studioMemoryForget,
  studioMemoryOverview,
  type AgentPlan,
} from './agentDock';
import { memoryStore } from './storage';

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
});
