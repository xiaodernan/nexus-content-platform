import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import {
  BROWSER_TOOL_SPECS,
  createBrowserDriver,
  registerBrowserTools,
  type BrowserToolOptions,
} from '../src/browserTools.js';

/**
 * v91/v108 — §63 browser automation, honest edition.
 *
 * The defects this suite is written against, all named in the source: the first draft answered
 * `browser.screenshot` with the literal string `base64-screenshot-placeholder` and `browser.evaluate`
 * with `eval result for: <script>`, and `click`/`type` reported success whenever a selector STRING was
 * present — whether or not anything answered to it. Those shapes were indistinguishable from a real
 * driver's, which is worse than a stub. The rules asserted below are the replacement:
 *
 *   - an unmatched selector is an ERROR, never a silent success;
 *   - `screenshot`/`evaluate` refuse in words and carry NO `data` key at all;
 *   - every result says `engine: 'demo'`;
 *   - the tools do NOT gate themselves — the registry's §28 checkpoint is the only gate.
 */

const PAGES: BrowserToolOptions['pages'] = {
  'https://nexus.test/login': {
    title: 'Sign in',
    elements: [
      { selector: '#email', kind: 'input', label: 'Email' },
      { selector: '#go', kind: 'button', label: 'Continue' },
      { selector: '#help', kind: 'link', label: 'Help' },
    ],
  },
};

function driver(opts: BrowserToolOptions = { pages: PAGES }) {
  return createBrowserDriver(opts);
}

describe('browser driver — refusals are errors, not successes', () => {
  it('cannot act before init, and says which call is missing', async () => {
    const d = driver();
    const r = await d.execute({ type: 'navigate', url: 'https://nexus.test/login' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/call browser\.init first/);
  });

  it('an unmatched selector is an ERROR (the defect: a selector string used to be enough)', async () => {
    const d = driver();
    await d.initialize();
    await d.execute({ type: 'navigate', url: 'https://nexus.test/login' });
    const r = await d.execute({ type: 'click', selector: '#does-not-exist' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/no element matches selector "#does-not-exist"/);
    expect(r.data).toBeUndefined();
  });

  it('clicking an input and typing into a button are both refused, by kind', async () => {
    const d = driver();
    await d.initialize();
    await d.execute({ type: 'navigate', url: 'https://nexus.test/login' });
    expect((await d.execute({ type: 'click', selector: '#email' })).error).toMatch(/is a input, cannot click/);
    expect((await d.execute({ type: 'type', selector: '#go', text: 'x' })).error).toMatch(/is a button, cannot type/);
  });

  it('missing required fields are named', async () => {
    const d = driver();
    await d.initialize();
    expect((await d.execute({ type: 'navigate' })).error).toMatch(/navigate requires url/);
    expect((await d.execute({ type: 'click' })).error).toMatch(/click requires selector/);
    expect((await d.execute({ type: 'type', selector: '#email' })).error).toMatch(/type requires text/);
  });

  it('an unknown action type is refused rather than ignored', async () => {
    const d = driver();
    await d.initialize();
    const r = await d.execute({ type: 'teleport' as never });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/unknown action type: teleport/);
  });
});

describe('browser driver — the two doors that do not exist (§60)', () => {
  it('screenshot refuses in words and returns NO data key', async () => {
    const d = driver();
    await d.initialize();
    const r = await d.execute({ type: 'screenshot' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/screenshot not implemented in this build/);
    // The whole point: no placeholder may be mistaken for a picture.
    expect('data' in r).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/placeholder|base64/i);
  });

  it('evaluate refuses in words and returns NO data key', async () => {
    const d = driver();
    await d.initialize();
    const r = await d.execute({ type: 'evaluate', script: 'return 1' });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/evaluate not implemented in this build/);
    expect('data' in r).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/eval result for/i);
  });
});

describe('browser driver — what it really does', () => {
  it('navigate adopts the host’s description, and records history', async () => {
    const d = driver();
    await d.initialize();
    const r = await d.execute({ type: 'navigate', url: 'https://nexus.test/login' });
    expect(r.success).toBe(true);
    expect(r.engine).toBe('demo');
    expect(r.state?.title).toBe('Sign in');
    expect(r.state?.elements.map((e) => e.selector)).toEqual(['#email', '#go', '#help']);
    expect(r.state?.history).toEqual(['https://nexus.test/login']);
  });

  it('an undescribed URL succeeds but claims NO title and NO elements', async () => {
    const d = driver();
    await d.initialize();
    const r = await d.execute({ type: 'navigate', url: 'https://nexus.test/elsewhere' });
    expect(r.success).toBe(true);
    expect(r.state?.title).toBe(''); // stated, never invented
    expect(r.state?.elements).toEqual([]);
    expect((r.data as { note: string }).note).toMatch(/describes no page for/);
  });

  it('click and type report the LABEL they acted on', async () => {
    const d = driver();
    await d.initialize();
    await d.execute({ type: 'navigate', url: 'https://nexus.test/login' });
    expect((await d.execute({ type: 'click', selector: '#go' })).data).toEqual({ clicked: 'Continue', selector: '#go' });
    expect((await d.execute({ type: 'type', selector: '#email', text: 'a@b.c' })).data).toEqual({
      into: 'Email',
      selector: '#email',
      text: 'a@b.c',
    });
  });

  it('scroll moves only the axes it was given', async () => {
    const d = driver();
    await d.initialize();
    await d.execute({ type: 'scroll', y: 120 });
    expect((await d.getState()).scroll).toEqual({ x: 0, y: 120 });
    await d.execute({ type: 'scroll', x: 40 });
    expect((await d.getState()).scroll).toEqual({ x: 40, y: 120 }); // y untouched
  });

  it('wait is bounded by maxWaitMs whatever budget was asked for', async () => {
    const d = driver({ pages: PAGES, maxWaitMs: 5 });
    await d.initialize();
    const r = await d.execute({ type: 'wait', timeout: 60_000 });
    expect(r.data).toEqual({ sleptMs: 5, budgetMs: 60_000 }); // the cap is visible in the answer
  });

  it('executeAll stops at the first failure and returns the prefix it can name', async () => {
    const d = driver();
    await d.initialize();
    const results = await d.executeAll([
      { type: 'navigate', url: 'https://nexus.test/login' },
      { type: 'type', selector: '#email', text: 'a@b.c' },
      { type: 'click', selector: '#nope' }, // fails here
      { type: 'click', selector: '#go' }, // must never run
    ]);
    expect(results).toHaveLength(3);
    expect(results.at(-1)!.success).toBe(false);
    expect(d.log().map((a) => a.type)).toEqual(['navigate', 'type', 'click']); // the 4th never ran
  });

  it('log() records what ran, in order, and close() resets state', async () => {
    const d = driver();
    await d.initialize();
    expect(d.isRunning()).toBe(true);
    await d.execute({ type: 'navigate', url: 'https://nexus.test/login' });
    await d.execute({ type: 'hover', selector: '#help' });
    expect(d.log().map((a) => a.type)).toEqual(['navigate', 'hover']);

    await d.close();
    expect(d.isRunning()).toBe(false);
    const after = await d.getState();
    expect(after.url).toBe('about:blank');
    expect(after.history).toEqual([]);
    expect(after.elements).toEqual([]);
  });
});

describe('browser tools — the registry is the ONLY gate', () => {
  function wired() {
    const d = driver({ pages: PAGES, maxWaitMs: 5 });
    const registry = registerBrowserTools(new ToolRegistry(), d);
    return { d, registry };
  }

  it('routes every declared spec (an unrouted tool would be a silent hole)', () => {
    const { registry } = wired();
    for (const spec of BROWSER_TOOL_SPECS) {
      expect(registry.get(spec.name), `${spec.name} is not registered`).toBeDefined();
    }
  });

  it('a dangerous door does not run without the §28 checkpoint', async () => {
    const { registry, d } = wired();
    const r = await registry.invoke({ callId: 'c1', tool: 'browser.navigate', args: { url: 'https://nexus.test/login' } });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/checkpoint/i);
    expect(d.log()).toEqual([]); // nothing reached the driver: the gate held
  });

  it('a read-class door runs with NO checkpoint (browser.state)', async () => {
    const { registry } = wired();
    await registry.invoke({ callId: 'i', tool: 'browser.init', args: {} }, { checkpoint: () => true });
    const r = await registry.invoke({ callId: 's', tool: 'browser.state', args: {} });
    expect(r.ok).toBe(true);
    expect((r.output as { engine: string }).engine).toBe('demo');
  });

  it('the tools do not keep a second gate: an approved call runs, and a refusal surfaces as ok:false', async () => {
    const { registry, d } = wired();
    const approve = { checkpoint: () => true };
    await registry.invoke({ callId: 'i', tool: 'browser.init', args: {} }, approve);
    await registry.invoke({ callId: 'n', tool: 'browser.navigate', args: { url: 'https://nexus.test/login' } }, approve);

    const okClick = await registry.invoke({ callId: 'c', tool: 'browser.click', args: { selector: '#go' } }, approve);
    expect(okClick.ok).toBe(true);
    expect((okClick.output as { data: { clicked: string } }).data.clicked).toBe('Continue');

    const bad = await registry.invoke({ callId: 'c2', tool: 'browser.click', args: { selector: '#ghost' } }, approve);
    expect(bad.ok).toBe(false); // the driver's refusal became a failed tool call, not a thrown crash
    expect(bad.error).toMatch(/no element matches selector/);
    expect(d.log()).toHaveLength(3); // navigate + the two clicks
  });

  it('screenshot through the registry is a FAILED call with no data to mistake for a picture', async () => {
    const { registry } = wired();
    const approve = { checkpoint: () => true };
    await registry.invoke({ callId: 'i', tool: 'browser.init', args: {} }, approve);
    const r = await registry.invoke({ callId: 'p', tool: 'browser.screenshot', args: {} }, approve);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not implemented in this build/);
    expect(JSON.stringify(r)).not.toMatch(/placeholder|base64/i);
  });

  it('args are validated by the registry before the driver sees them', async () => {
    const { registry, d } = wired();
    const approve = { checkpoint: () => true };
    const r = await registry.invoke({ callId: 'x', tool: 'browser.navigate', args: {} }, approve);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/missing required/);
    expect(d.log()).toEqual([]);
  });
});
