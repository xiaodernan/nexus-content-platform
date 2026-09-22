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
  readAgentLedger,
  type AgentPlan,
} from './agentDock';

const STYLE: TextStyle = { fontFamilyToken: 'font.family.body', sizeToken: 'font.size.base', weight: 400, lineHeight: 1.35, letterSpacing: 0, align: 'left' };

function seededDoc(): { doc: DesignDocument; pageId: string; heroId: string; cardId: string } {
  const base = createEmptyDocument('dock test');
  const pageId = base.activePageId;
  const heroId = newId();
  const cardId = newId();
  const hero = textNode('Hero title', 'welcome to the widget showcase', STYLE, { id: heroId, x: 40, y: 40, width: 300, height: 40 });
  const card = rectNode('CTA card', { id: cardId, x: 40, y: 120, width: 200, height: 80 });
  const doc = applyBatch(base, {
    id: newId(),
    ops: [
      ops.addSubtree(pageId, childIdList(base.nodes[pageId]!).length, [hero]),
      ops.addSubtree(pageId, childIdList(base.nodes[pageId]!).length + 1, [card]),
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
    const { pageId } = seededDoc();
    const kv = new FakeKv();
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
