import { describe, expect, it } from 'vitest';
import type { CheckpointPolicy, UiDriver, UiElement } from '@nexus/agent-runtime';
import { faceCheckpoint, gateLineFor } from './dockPolicy';
import { runUiTask } from './uiRun';

const PAGE: UiElement[] = [
  { kind: 'input', label: 'analytics dashboard' },
  { kind: 'button', label: 'Compose' },
];

class FakeDriver implements UiDriver {
  calls: string[] = [];
  layers = 0;
  elements(): UiElement[] {
    return PAGE;
  }
  click(i: number): string {
    this.layers = 5;
    const s = `click:${PAGE[i]!.label}`;
    this.calls.push(s);
    return s;
  }
  type(i: number, t: string): string {
    const s = `type:${PAGE[i]!.label}=${t}`;
    this.calls.push(s);
    return s;
  }
  layerCount(): number {
    return this.layers;
  }
}

const ALLOW_UI: CheckpointPolicy = {
  rules: [{ tool: 'ui.*', grant: true, reason: 'pre-approved demo composer' }],
  default: { grant: false, reason: 'anything else still needs the human' },
};

describe('faceCheckpoint (v41 — two §28 faces, one receipt trail)', () => {
  it('policy face gates from the table and receipts name the rule + its reason', async () => {
    const gate = faceCheckpoint({ mode: 'policy', policy: ALLOW_UI });
    const granted = await gate.checkpoint({ call: { callId: 'a', tool: 'ui.click', args: { label: 'Compose' } }, permissions: ['exec'] });
    expect(granted).toBe(true);
    const denied = await gate.checkpoint({ call: { callId: 'b', tool: 'memory.save', args: {} }, permissions: ['write'] });
    expect(denied).toBe(false);
    expect(gate.verdicts).toEqual([
      { tool: 'ui.click', granted: true, by: 'policy', reason: 'rule ui.*: pre-approved demo composer' },
      { tool: 'memory.save', granted: false, by: 'policy', reason: 'rule default: anything else still needs the human' },
    ]);
  });

  it('human face records clicks, async included', async () => {
    const gate = faceCheckpoint({ mode: 'human', decide: async ({ call }) => call.tool === 'ui.type' });
    expect(await gate.checkpoint({ call: { callId: 'a', tool: 'ui.type', args: {} }, permissions: ['exec'] })).toBe(true);
    expect(await gate.checkpoint({ call: { callId: 'b', tool: 'ui.click', args: {} }, permissions: ['exec'] })).toBe(false);
    expect(gate.verdicts.map((v) => `${v.tool}:${v.by}:${v.granted}`)).toEqual(['ui.type:human:true', 'ui.click:human:false']);
  });

  it('gateLineFor states WHO spoke — uniform, mixed or silent', () => {
    const v = (tool: string, by: 'human' | 'policy', granted: boolean) => ({ tool, by, granted, reason: 'r' });
    expect(gateLineFor([])).toBe('no gated calls');
    expect(gateLineFor([v('ui.type', 'policy', true), v('ui.click', 'policy', false)])).toBe('policy: ui.type granted · ui.click VETO');
    expect(gateLineFor([v('ui.type', 'human', true), v('ui.click', 'policy', true)])).toBe('mixed: ui.type granted · ui.click granted');
  });

  it('a single human face reads as human: <tool> <granted|VETO>', () => {
    const v = (tool: string, by: 'human' | 'policy', granted: boolean) => ({ tool, by, granted, reason: 'r' });
    expect(gateLineFor([v('ui.type', 'human', true)])).toBe('human: ui.type granted');
    expect(gateLineFor([v('ui.click', 'human', false)])).toBe('human: ui.click VETO');
  });
});

describe('runUiTask through the policy face (v41)', () => {
  const runWith = async (policy: CheckpointPolicy) => {
    const d = new FakeDriver();
    const kv = { map: new Map<string, string>(), getItem(k: string) { return this.map.get(k) ?? null; }, setItem(k: string, v: string) { this.map.set(k, v); } };
    let humanAsked = 0;
    const r = await runUiTask(d, 'an analytics dashboard', async () => { humanAsked++; return true; }, undefined, kv as never, { mode: 'policy', policy });
    const entry = JSON.parse((kv.getItem('nexus.agentLedger.v1') ?? '').trim());
    return { r, entry, humanAsked };
  };

  it('a table that grants every exec step drives the WHOLE task with zero human callbacks', async () => {
    const { r, entry, humanAsked } = await runWith({
      rules: [
        { tool: 'ui.*', grant: true, reason: 'pre-approved demo composer' },
        { tool: 'test.run', grant: true, reason: 'verification is never scary' },
      ],
      default: { grant: false, reason: 'anything else still needs the human' },
    });
    expect(humanAsked).toBe(0); // the human callback was NEVER consulted — the table spoke
    expect(r.outcome.status).toBe('completed');
    expect(r.actions).toEqual(['type:analytics dashboard=an analytics dashboard', 'click:Compose']);
    expect(r.gate).toBe('policy: ui.type granted · ui.click granted · test.run granted');
    expect(entry.gate).toBe(r.gate);
    expect(entry.approved).toBe(true);
  });

  it('the default row is load-bearing: a table that forgets test.run gets vetoed honestly', async () => {
    const { r, entry, humanAsked } = await runWith(ALLOW_UI); // ui.* only — test.run falls to the default
    expect(humanAsked).toBe(0);
    expect(r.outcome.status).toBe('denied'); // the vetoed verify ends the run — no silent green
    expect(r.gate).toBe('policy: ui.type granted · ui.click granted · test.run VETO');
    expect(entry.approved).toBe(false);
    expect(entry.gate).toBe(r.gate);
  });

  it('the human face keeps v20 semantics and now ALSO leaves a gate line', async () => {
    const d = new FakeDriver();
    const kv = { map: new Map<string, string>(), getItem(k: string) { return this.map.get(k) ?? null; }, setItem(k: string, v: string) { this.map.set(k, v); } };
    const asked: string[] = [];
    const r = await runUiTask(d, 'an analytics dashboard', async (p) => { asked.push(p.tool); return true; }, undefined, kv as never);
    expect(asked).toEqual(['ui.type', 'ui.click', 'test.run']); // same consultation as pre-v41
    expect(r.outcome.status).toBe('completed');
    expect(r.gate).toBe('human: ui.type granted · ui.click granted · test.run granted');
    expect(JSON.parse((kv.getItem('nexus.agentLedger.v1') ?? '').trim()).gate).toBe(r.gate);
  });
});
