import { describe, expect, it } from 'vitest';
import { runUiDrive, runUiTask, uiScript, type UiRunResult } from './uiRun';
import type { UiDriver, UiElement } from '@nexus/agent-runtime';

class FakeDriver implements UiDriver {
  calls: string[] = [];
  constructor(private els: UiElement[]) {}
  elements(): UiElement[] {
    return this.els;
  }
  click(i: number): string {
    const s = `click:${this.els[i]!.label}`;
    this.calls.push(s);
    return s;
  }
  type(i: number, text: string): string {
    const s = `type:${this.els[i]!.label}=${text}`;
    this.calls.push(s);
    return s;
  }
}

const PAGE: UiElement[] = [
  { kind: 'input', label: 'analytics dashboard' },
  { kind: 'button', label: 'Compose' },
];

const allowAll = async () => true;

describe('uiRun (v16 gated agent UI drive, headless driver)', () => {
  it('approved script types then clicks, logging each gated action', async () => {
    const d = new FakeDriver(PAGE);
    const asked: string[] = [];
    const res = await runUiDrive(d, uiScript('an analytics dashboard'), async (plan) => {
      asked.push(`${plan.tool}:${plan.label}`);
      return allowAll();
    });
    expect(res.ok).toBe(true);
    expect(res.actions).toEqual(['type:analytics dashboard=an analytics dashboard', 'click:Compose']);
    expect(asked).toEqual(['ui.type:analytics dashboard', 'ui.click:Compose']);
  });

  it('denying mid-run stops at that action; earlier actions stand, later never happen', async () => {
    const d = new FakeDriver(PAGE);
    let n = 0;
    const res: UiRunResult = await runUiDrive(d, uiScript('g'), async () => ++n === 2 ? false : true);
    expect(res.ok).toBe(false);
    expect(res.stoppedAt).toBe('Compose');
    expect(res.reason).toContain('denied at checkpoint');
    expect(res.actions).toEqual(['type:analytics dashboard=g']);
    expect(d.calls).toEqual(['type:analytics dashboard=g']);
  });

  it('a missing label fails honestly before any checkpoint is asked', async () => {
    const d = new FakeDriver([]);
    let asked = 0;
    const res = await runUiDrive(d, uiScript('g'), async () => { asked++; return true; });
    expect(res).toMatchObject({ ok: false, stoppedAt: 'analytics dashboard', reason: 'label not found on page' });
    expect(asked).toBe(0);
  });
});

describe('runUiTask (v20 orchestrator-driven)', () => {
  it('demo planner drives the fake page end-to-end with per-step decisions', async () => {
    const d = new FakeDriver(PAGE);
    const asked: string[] = [];
    const { outcome, actions } = await runUiTask(d, 'an analytics dashboard', async (p) => { asked.push(p.tool); return true; });
    expect(outcome.status).toBe('completed');
    expect(outcome.plan.steps.map((s) => s.tool)).toEqual(['ui.observe', 'ui.type', 'ui.click']);
    expect(actions).toEqual(['type:analytics dashboard=an analytics dashboard', 'click:Compose']);
    expect(asked).toEqual(['ui.type', 'ui.click']);
  });

  it('denied click ⇒ status denied, typed action stands', async () => {
    const d = new FakeDriver(PAGE);
    const { outcome, actions } = await runUiTask(d, 'g', async (p) => p.tool !== 'ui.click');
    expect(outcome.status).toBe('denied');
    expect(actions).toEqual(['type:analytics dashboard=g']);
  });
});

describe('runUiTask v21 (host-verified + ledger)', () => {
  it('state-reporting driver adds the verify step and journals one ledger line', async () => {
    let layers = 0;
    const d = {
      elements: () => PAGE,
      click: (i: number) => { layers = 5; return `click:${PAGE[i]!.label}`; },
      type: (i: number, t: string) => `type:${PAGE[i]!.label}=${t}`,
      layerCount: () => layers,
    };
    const kv = { map: new Map<string, string>(), getItem(k: string) { return this.map.get(k) ?? null; }, setItem(k: string, v: string) { this.map.set(k, v); } };
    const r = await runUiTask(d, 'an analytics dashboard', async () => true, undefined, kv as never);
    expect(r.outcome.status).toBe('completed');
    expect(r.outcome.plan.steps.map((s) => s.tool)).toEqual(['ui.observe', 'ui.type', 'ui.click', 'test.run']);
    expect(r.score).toBe(1);
    const lines = (kv.getItem('nexus.agentLedger.v1') ?? '').trim().split(String.fromCharCode(10));
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]!);
    expect(entry).toMatchObject({ goal: 'ui-task: an analytics dashboard', approved: true });
    expect(entry.reason).toContain('planner=demo');
  });

  it('without a state reporter, no verify step is invented', async () => {
    const d = new FakeDriver(PAGE);
    const r = await runUiTask(d, 'g', async () => true);
    expect(r.outcome.plan.steps.map((s) => s.tool)).toEqual(['ui.observe', 'ui.type', 'ui.click']);
  });
});
