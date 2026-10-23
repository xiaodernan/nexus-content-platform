import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDomDriver, runUiDrive, runUiTask, uiScript, type UiRunResult } from './uiRun';
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

  it('v28: the design-model check travels as a structured, engine-stated report on the outcome', async () => {
    let layers = 0;
    const d = {
      elements: () => PAGE,
      click: (i: number) => { layers = 5; return `click:${PAGE[i]!.label}`; },
      type: (i: number, t: string) => `type:${PAGE[i]!.label}=${t}`,
      layerCount: () => layers,
    };
    const r = await runUiTask(d, 'an analytics dashboard', async () => true);
    expect(r.outcome.testReports).toHaveLength(1);
    expect(r.outcome.testReports![0]).toMatchObject({ engine: 'in-process-predicates', ok: true, total: 1, passed: 1 });
    expect(r.outcome.testReports![0]!.failures).toEqual([]);
  });

  it('without a state reporter, no verify step is invented', async () => {
    const d = new FakeDriver(PAGE);
    const r = await runUiTask(d, 'g', async () => true);
    expect(r.outcome.plan.steps.map((s) => s.tool)).toEqual(['ui.observe', 'ui.type', 'ui.click']);
  });
});

describe('uiRun — script shape and step edges', () => {
  it('uiScript is the canonical type→click pair', () => {
    expect(uiScript('ship the dashboard')).toEqual([
      { tool: 'ui.type', label: 'analytics dashboard', text: 'ship the dashboard' },
      { tool: 'ui.click', label: 'Compose' },
    ]);
  });

  it('an empty step list succeeds with no actions', async () => {
    const d = new FakeDriver(PAGE);
    const res = await runUiDrive(d, [], async () => true);
    expect(res).toEqual({ ok: true, actions: [] });
  });

  it("a step whose label matches the wrong kind fails with the tool's own reason", async () => {
    const d = new FakeDriver(PAGE);
    const res = await runUiDrive(d, [{ tool: 'ui.type', label: 'Compose', text: 'x' }], async () => true);
    expect(res.ok).toBe(false);
    expect(res.stoppedAt).toBe('Compose');
    expect(res.reason).toContain('is a button, cannot type');
    expect(d.calls).toEqual([]);
  });

  it('journals onto an existing ledger without clobbering earlier lines', async () => {
    let layers = 0;
    const d = {
      elements: () => PAGE,
      click: (i: number) => { layers = 5; return `click:${PAGE[i]!.label}`; },
      type: (i: number, t: string) => `type:${PAGE[i]!.label}=${t}`,
      layerCount: () => layers,
    };
    const kv = {
      map: new Map<string, string>(),
      getItem(k: string) { return this.map.get(k) ?? null; },
      setItem(k: string, v: string) { this.map.set(k, v); },
    };
    kv.map.set('nexus.agentLedger.v1', JSON.stringify({ goal: 'ui-task: older entry', target: 'X', via: 'ui', score: 1, approved: true, reason: 'status=completed planner=demo', gate: 'human: x granted', at: 1 }) + '\n');
    await runUiTask(d, 'an analytics dashboard', async () => true, undefined, kv as never);
    const lines = (kv.getItem('nexus.agentLedger.v1') ?? '').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).goal).toBe('ui-task: older entry');
    expect(JSON.parse(lines[1]!).goal).toBe('ui-task: an analytics dashboard');
  });
});

/* ---- v453: the DOM seam itself. The suite runs in Node with no DOM, so the fakes below are the
   smallest honest ones: a tree walker that honours tag-QUALIFIED compound selectors, elements that
   know their own tag and classes, and an input whose value accessor lives on the prototype the way a
   browser's does. A canned answer per selector string would pass even if the driver asked for the
   wrong one, so the matcher is real. ---- */

class FakeElement {
  tagName: string;
  classes: string[];
  textContent = '';
  parent: FakeElement | null = null;
  kids: FakeElement[] = [];
  events: { type: string; bubbles: boolean }[] = [];
  clicks = 0;
  constructor(tagName: string, classes: string[] = []) {
    this.tagName = tagName;
    this.classes = classes;
  }
  append(...kids: FakeElement[]): void {
    for (const k of kids) {
      k.parent = this;
      this.kids.push(k);
    }
  }
  get classList(): { contains: (c: string) => boolean } {
    return { contains: (c: string) => this.classes.includes(c) };
  }
  click(): void {
    this.clicks++;
    this.dispatchEvent(new FakeEvent('click', { bubbles: true }));
  }
  dispatchEvent(e: FakeEvent): boolean {
    this.events.push({ type: e.type, bubbles: e.bubbles });
    if (e.bubbles && this.parent) this.parent.dispatchEvent(e);
    return true;
  }
}

class FakeButtonElement extends FakeElement {
  constructor(text: string) {
    super('button', ['btn']);
    this.textContent = text;
  }
}

class FakeInputElement extends FakeElement {
  placeholder: string;
  backing = '';
  constructor(placeholder: string) {
    super('input', ['field']);
    this.placeholder = placeholder;
  }
  get value(): string {
    return this.backing;
  }
  set value(v: string) {
    this.backing = v;
  }
}

class FakeEvent {
  type: string;
  bubbles: boolean;
  constructor(type: string, opts: { bubbles?: boolean } = {}) {
    this.type = type;
    this.bubbles = opts.bubbles === true;
  }
}

function fakeDocument(root: FakeElement): Document {
  const walk = (el: FakeElement, out: FakeElement[]): FakeElement[] => {
    out.push(el);
    for (const k of el.kids) walk(k, out);
    return out;
  };
  return {
    querySelectorAll(selector: string): FakeElement[] {
      // A comma list of tag( .class ) compounds — matched for real, so a selector the driver did not
      // ask for cannot be answered by a fake that only knew the one it was handed.
      const compounds = selector.split(',').map((s) => s.trim());
      return walk(root, []).filter((el) =>
        compounds.some((c) => {
          const m = /^([a-z]+)(?:\.([a-zA-Z-]+))?$/.exec(c);
          return !!m && el.tagName === m[1] && (!m[2] || el.classList.contains(m[2]));
        }),
      );
    },
  } as unknown as Document;
}

describe('createDomDriver — the DOM seam over the studio’s own markup (v453)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('elements() lists the .btn buttons and .field inputs, and NOTHING else', () => {
    // A div wearing the class is not a button: the selector is tag-QUALIFIED, and a fake that answered
    // any .btn would have hidden that. Document order, nesting included.
    const root = new FakeElement('body');
    const decoyDiv = new FakeElement('div', ['btn']);
    const compose = new FakeButtonElement('Compose');
    const prompt = new FakeInputElement('analytics dashboard');
    const bareButton = new FakeButtonElement('Bare');
    bareButton.classes = [];
    const bareInput = new FakeInputElement('bare');
    bareInput.classes = [];
    const wrapper = new FakeElement('div');
    const nested = new FakeButtonElement('Nested');
    wrapper.append(nested);
    root.append(decoyDiv, compose, prompt, bareButton, bareInput, wrapper);
    vi.stubGlobal('document', fakeDocument(root));
    vi.stubGlobal('HTMLButtonElement', FakeButtonElement);
    vi.stubGlobal('HTMLInputElement', FakeInputElement);

    const els = createDomDriver().elements();
    expect(els).toEqual([
      { kind: 'button', label: 'Compose' },
      { kind: 'input', label: 'analytics dashboard' },
      { kind: 'button', label: 'Nested' },
    ]);
  });

  it('a button’s label is its trimmed text; an input’s is its placeholder cut at 28 characters', () => {
    const root = new FakeElement('body');
    const padded = new FakeButtonElement('   Compose   ');
    const long = new FakeInputElement('describe the dashboard you want, in your own words');
    root.append(padded, long);
    vi.stubGlobal('document', fakeDocument(root));
    vi.stubGlobal('HTMLButtonElement', FakeButtonElement);
    vi.stubGlobal('HTMLInputElement', FakeInputElement);

    const els = createDomDriver().elements();
    expect(els[0]!.label).toBe('Compose');
    expect(els[1]!.label).toBe('describe the dashboard you w');
    expect(els[1]!.label).toHaveLength(28);
  });

  it('click() clicks the element and answers with its own words — and refuses anything that is not a button', () => {
    const root = new FakeElement('body');
    const compose = new FakeButtonElement('Compose');
    const prompt = new FakeInputElement('analytics dashboard');
    root.append(compose, prompt);
    vi.stubGlobal('document', fakeDocument(root));
    vi.stubGlobal('HTMLButtonElement', FakeButtonElement);
    vi.stubGlobal('HTMLInputElement', FakeInputElement);
    const driver = createDomDriver();

    expect(driver.click(0)).toBe('click:Compose');
    expect(compose.clicks).toBe(1);
    expect(() => driver.click(1)).toThrow(/element 1 is not a button/);
    expect(() => driver.click(99)).toThrow(/element 99 is not a button/);
  });

  it('type() writes through the NATIVE setter and fires a bubbling input event — a React shadow does not block it', () => {
    // The instance carries an OWN value property, the shadow a framework leaves behind. A plain
    // assignment would write that shadow and a listener would see nothing; the driver reads the
    // PROTOTYPE accessor's setter, which is why the backing field moves and the event fires.
    const root = new FakeElement('body');
    const prompt = new FakeInputElement('analytics dashboard');
    const compose = new FakeButtonElement('Compose');
    root.append(prompt, compose);
    Object.defineProperty(prompt, 'value', { value: 'shadow', writable: true, configurable: true });
    vi.stubGlobal('document', fakeDocument(root));
    vi.stubGlobal('HTMLButtonElement', FakeButtonElement);
    vi.stubGlobal('HTMLInputElement', FakeInputElement);
    vi.stubGlobal('Event', FakeEvent);
    const driver = createDomDriver();

    expect(driver.type(0, 'sales overview')).toBe('type:analytics dashboard=sales overview');
    expect(prompt.backing).toBe('sales overview');
    expect(prompt.events).toEqual([{ type: 'input', bubbles: true }]);
    expect(root.events).toEqual([{ type: 'input', bubbles: true }]); // it bubbled
    expect(() => driver.type(1, 'x')).toThrow(/element 1 is not an input/);
  });

  it('the driver reads the document at CALL time, not at creation', () => {
    const root = new FakeElement('body');
    vi.stubGlobal('document', fakeDocument(root));
    vi.stubGlobal('HTMLButtonElement', FakeButtonElement);
    vi.stubGlobal('HTMLInputElement', FakeInputElement);
    const driver = createDomDriver();
    expect(driver.elements()).toEqual([]);
    root.append(new FakeButtonElement('Later'));
    expect(driver.elements()).toEqual([{ kind: 'button', label: 'Later' }]);
  });
});
