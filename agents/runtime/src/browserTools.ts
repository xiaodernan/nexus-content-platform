import type { ToolImpl, ToolRegistry } from './registry.js';
import type { ToolSpec } from './types.js';

/**
 * M2 v91 (§63 browser automation, honest edition). The first draft of this file answered
 * `browser.screenshot` with the literal string `base64-screenshot-placeholder` and
 * `browser.evaluate` with `eval result for: <the script>`, and `click`/`type` returned
 * success whenever a selector STRING was present — whether or not anything answered to it.
 * That is the "giant fake demo" §60 forbids, and worse than a stub: the shapes were
 * indistinguishable from a real driver's.
 *
 * So this file ships what it can actually do and REFUSES the rest, in words:
 *  - the host describes what each URL contains (`BrowserToolOptions.pages`), exactly as
 *    `domkit`'s `UiDriver` works — this runtime has no HTML parser, no DevTools, no browser;
 *  - `navigate`/`click`/`type`/`hover`/`scroll`/`wait` really happen against that description
 *    and are recorded in the driver's own log, so a result can be checked against what ran;
 *  - an unmatched selector is an ERROR, never a silent success;
 *  - `screenshot` and `evaluate` answer `not implemented` and carry NO `data` key at all, so
 *    no placeholder can be mistaken for a picture or an evaluation;
 *  - every result states `engine: 'demo'` (§60), and the checkpoint gate is the registry's
 *    own — this file must not keep a second copy of it (the first draft did, and its gate
 *    invented its own call ids).
 */
export type BrowserActionType = 'navigate' | 'click' | 'type' | 'wait' | 'scroll' | 'hover' | 'screenshot' | 'evaluate';

export interface BrowserAction {
  type: BrowserActionType;
  url?: string;
  /** Addressed by the page description's own selector keys; there is no second addressing scheme. */
  selector?: string;
  text?: string;
  timeout?: number;
  script?: string;
  args?: string[];
  x?: number;
  y?: number;
}

export interface BrowserElement {
  selector: string;
  kind: 'button' | 'input' | 'link';
  label: string;
}

export interface BrowserPageDescription {
  title: string;
  elements: BrowserElement[];
}

export interface BrowserState {
  url: string;
  /** '' when the host describes no page for this URL — stated, never invented. */
  title: string;
  viewport: { width: number; height: number };
  elements: BrowserElement[];
  scroll: { x: number; y: number };
  history: string[];
}

export interface BrowserResult {
  success: boolean;
  /** §60: there is no live browser in this build, and every answer says so. */
  engine: 'demo';
  state?: BrowserState;
  data?: unknown;
  error?: string;
}

export interface BrowserToolOptions {
  /** The host supplies what each URL contains: this runtime ships no HTML parser and no browser. */
  pages?: Record<string, BrowserPageDescription>;
  viewport?: { width: number; height: number };
  defaultTimeout?: number;
  /** `wait` never sleeps longer than this, whatever budget an action asks for. */
  maxWaitMs?: number;
}

export interface BrowserDriver {
  initialize(): Promise<void>;
  close(): Promise<void>;
  isRunning(): boolean;
  execute(action: BrowserAction): Promise<BrowserResult>;
  /** Sequential; STOPS at the first failure, so the returned array is a prefix it can name. */
  executeAll(actions: BrowserAction[]): Promise<BrowserResult[]>;
  getState(): Promise<BrowserState>;
  /** What the driver actually did, in order — the record a result can be checked against. */
  log(): BrowserAction[];
}

const NOT_IMPLEMENTED = 'not implemented in this build: no browser engine is attached (no DevTools pipe, no page context)';

export function createBrowserDriver(options: BrowserToolOptions = {}): BrowserDriver {
  const viewport = options.viewport ?? { width: 1280, height: 720 };
  const maxWaitMs = options.maxWaitMs ?? 5000;
  let initialized = false;
  let actions: BrowserAction[] = [];
  let state: BrowserState = { url: 'about:blank', title: '', viewport, elements: [], scroll: { x: 0, y: 0 }, history: [] };

  const fail = (error: string): BrowserResult => ({ success: false, engine: 'demo', error });
  const ok = (extra: Partial<BrowserResult> = {}): BrowserResult => ({ success: true, engine: 'demo', state, ...extra });

  const describe = (url: string): BrowserPageDescription | undefined => options.pages?.[url];

  const elementFor = (selector: string): BrowserElement => {
    const page = describe(state.url);
    if (!page) {
      throw new Error(`the host describes no page for "${state.url}": this driver cannot know what is on it`);
    }
    const found = page.elements.find((e) => e.selector === selector);
    if (!found) throw new Error(`no element matches selector "${selector}" on ${state.url}`);
    return found;
  };

  return {
    async initialize() {
      initialized = true;
      actions = [];
    },

    async close() {
      initialized = false;
      state = { url: 'about:blank', title: '', viewport, elements: [], scroll: { x: 0, y: 0 }, history: [] };
    },

    isRunning() {
      return initialized;
    },

    async execute(action: BrowserAction): Promise<BrowserResult> {
      if (!initialized) return fail('browser not initialized: call browser.init first');
      actions.push(action);
      const timeout = action.timeout ?? options.defaultTimeout ?? 30000;

      // v108 — `execute` RETURNS failures, it does not throw them. `elementFor` throws for an
      // unmatched selector (and for a URL the host never described), and the first draft let that
      // escape: the caller got a rejected promise instead of a `{success:false}` result, which broke
      // the contract `executeAll` is built on — it promises to stop at the first failure and hand
      // back the prefix it can name, and it cannot do that if the failure arrives as a throw. The
      // registry happened to hide this, because `invoke` catches a thrown error and turns it into
      // `ok:false`; a direct caller had no such cover.
      try {
        switch (action.type) {
        case 'navigate': {
          if (!action.url) return fail('navigate requires url');
          const page = describe(action.url);
          state = {
            url: action.url,
            title: page?.title ?? '',
            viewport,
            elements: page ? [...page.elements] : [],
            scroll: { x: 0, y: 0 },
            history: [...state.history, action.url],
          };
          return page
            ? ok()
            : ok({ data: { note: `the host describes no page for ${action.url}: no title and no elements are claimable here` } });
        }

        case 'click': {
          if (!action.selector) return fail('click requires selector');
          const el = elementFor(action.selector);
          if (el.kind === 'input') return fail(`element "${el.selector}" is a ${el.kind}, cannot click`);
          return ok({ data: { clicked: el.label, selector: el.selector } });
        }

        case 'type': {
          if (!action.selector) return fail('type requires selector');
          if (action.text === undefined) return fail('type requires text');
          const el = elementFor(action.selector);
          if (el.kind !== 'input') return fail(`element "${el.selector}" is a ${el.kind}, cannot type`);
          return ok({ data: { into: el.label, selector: el.selector, text: action.text } });
        }

        case 'hover': {
          if (!action.selector) return fail('hover requires selector');
          const el = elementFor(action.selector);
          return ok({ data: { hovered: el.label, selector: el.selector } });
        }

        case 'scroll': {
          state = { ...state, scroll: { x: action.x ?? state.scroll.x, y: action.y ?? state.scroll.y } };
          return ok({ data: { scroll: state.scroll } });
        }

        case 'wait': {
          const slept = Math.min(Math.max(timeout, 0), maxWaitMs);
          await new Promise((r) => setTimeout(r, slept));
          return ok({ data: { sleptMs: slept, budgetMs: timeout } });
        }

        case 'screenshot':
          return fail(`screenshot ${NOT_IMPLEMENTED}`);

        case 'evaluate':
          return fail(`evaluate ${NOT_IMPLEMENTED}`);

        default:
          return fail(`unknown action type: ${String((action as { type?: unknown }).type)}`);
        }
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err));
      }
    },

    async executeAll(actionsToRun: BrowserAction[]): Promise<BrowserResult[]> {
      const results: BrowserResult[] = [];
      for (const action of actionsToRun) {
        const result = await this.execute(action);
        results.push(result);
        if (!result.success) break;
      }
      return results;
    },

    async getState(): Promise<BrowserState> {
      return state;
    },

    log() {
      return [...actions];
    },
  };
}
export const BROWSER_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'browser.init',
    description: 'Start the in-memory demo driver. The viewport is a construction option, not an argument.',
    permissions: ['exec'],
    args: [],
  },
  {
    name: 'browser.navigate',
    description: 'Navigate to a URL. The host’s page description decides what the page then contains.',
    permissions: ['exec', 'network'],
    args: [
      { name: 'url', type: 'string', required: true },
      { name: 'timeout', type: 'number', required: false },
    ],
  },
  {
    name: 'browser.click',
    description: 'Click an element by its selector. An unmatched selector is an error, not a success.',
    permissions: ['exec'],
    args: [
      { name: 'selector', type: 'string', required: true },
      { name: 'timeout', type: 'number', required: false },
    ],
  },
  {
    name: 'browser.type',
    description: 'Type text into an input addressed by selector.',
    permissions: ['exec'],
    args: [
      { name: 'selector', type: 'string', required: true },
      { name: 'text', type: 'string', required: true },
      { name: 'timeout', type: 'number', required: false },
    ],
  },
  {
    name: 'browser.hover',
    description: 'Hover an element addressed by selector.',
    permissions: ['exec'],
    args: [{ name: 'selector', type: 'string', required: true }],
  },
  {
    name: 'browser.scroll',
    description: 'Set the recorded scroll offset; each axis moves only when given.',
    permissions: ['exec'],
    args: [
      { name: 'x', type: 'number', required: false },
      { name: 'y', type: 'number', required: false },
    ],
  },
  {
    name: 'browser.wait',
    description: 'Sleep, bounded by the driver’s maxWaitMs whatever budget is asked for.',
    permissions: ['exec'],
    args: [{ name: 'timeout', type: 'number', required: false }],
  },
  {
    name: 'browser.screenshot',
    description: 'NOT IMPLEMENTED: no browser engine is attached, so this door refuses in words and returns no data.',
    permissions: ['exec'],
    args: [],
  },
  {
    name: 'browser.evaluate',
    description: 'NOT IMPLEMENTED: no page context exists to evaluate in, so this door refuses in words and returns no data.',
    permissions: ['exec'],
    args: [],
  },
  {
    name: 'browser.state',
    description: 'Read the driver’s state (read-class: no checkpoint is asked).',
    permissions: ['read'],
    args: [],
  },
  {
    name: 'browser.close',
    description: 'Stop the driver and reset its state to about:blank.',
    permissions: ['exec'],
    args: [],
  },
];

const refused = (r: BrowserResult): unknown => {
  if (!r.success) throw new Error(r.error ?? 'browser action refused');
  return r;
};

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);

/**
 * v91: the tools DO NOT gate themselves. `ToolRegistry.invoke` already validates args, asks the
 * §28 checkpoint for every dangerous permission and turns a thrown error into `ok:false` — the
 * first draft duplicated that logic here, with call ids of its own invention, which is a second
 * gate that can disagree with the first.
 */
export function registerBrowserTools(registry: ToolRegistry, driver: BrowserDriver): ToolRegistry {
  const impls: Record<string, ToolImpl> = {
    'browser.init': async () => {
      await driver.initialize();
      return { engine: 'demo', running: driver.isRunning(), state: await driver.getState() };
    },
    'browser.navigate': async (args) =>
      refused(await driver.execute({ type: 'navigate', url: String(args.url), ...(num(args.timeout) !== undefined ? { timeout: num(args.timeout)! } : {}) })),
    'browser.click': async (args) =>
      refused(await driver.execute({ type: 'click', selector: String(args.selector), ...(num(args.timeout) !== undefined ? { timeout: num(args.timeout)! } : {}) })),
    'browser.type': async (args) =>
      refused(await driver.execute({ type: 'type', selector: String(args.selector), text: String(args.text), ...(num(args.timeout) !== undefined ? { timeout: num(args.timeout)! } : {}) })),
    'browser.hover': async (args) => refused(await driver.execute({ type: 'hover', selector: String(args.selector) })),
    'browser.scroll': async (args) =>
      refused(await driver.execute({ type: 'scroll', ...(num(args.x) !== undefined ? { x: num(args.x)! } : {}), ...(num(args.y) !== undefined ? { y: num(args.y)! } : {}) })),
    'browser.wait': async (args) =>
      refused(await driver.execute({ type: 'wait', ...(num(args.timeout) !== undefined ? { timeout: num(args.timeout)! } : {}) })),
    'browser.screenshot': async () => refused(await driver.execute({ type: 'screenshot' })),
    'browser.evaluate': async () => refused(await driver.execute({ type: 'evaluate' })),
    'browser.state': async () => ({ engine: 'demo', state: await driver.getState() }),
    'browser.close': async () => {
      await driver.close();
      return { engine: 'demo', running: driver.isRunning() };
    },
  };

  for (const spec of BROWSER_TOOL_SPECS) {
    const impl = impls[spec.name];
    if (!impl) throw new Error(`unrouted browser tool ${spec.name}`);
    registry.register(spec, impl);
  }
  return registry;
}

