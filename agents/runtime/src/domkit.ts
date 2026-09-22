import type { ToolRegistry } from './registry.js';
import type { ToolSpec } from './types.js';

/**
 * M2 v16 (§63 browser automation, in-page edition): the runtime learns a minimal UI
 * vocabulary but touches NO DOM — the host injects a `UiDriver`, and every click/type is
 * an `exec`-permission tool, so each single action passes the Human Checkpoint (§28).
 * This is automation as gated data flow, not a hidden puppeteer (§60).
 */
export interface UiElement {
  kind: 'button' | 'input';
  label: string;
}

export interface UiDriver {
  elements(): UiElement[];
  click(index: number): string;
  type(index: number, text: string): string;
}

export const UI_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'ui.observe',
    description: 'List the visible interactive elements (kind + label, indexed).',
    permissions: ['read'],
    args: [],
  },
  {
    name: 'ui.click',
    description: 'Click the element at the given index. Requires human checkpoint.',
    permissions: ['exec'],
    args: [{ name: 'index', type: 'number', required: true }],
  },
  {
    name: 'ui.type',
    description: 'Type text into the input at the given index. Requires human checkpoint.',
    permissions: ['exec'],
    args: [
      { name: 'index', type: 'number', required: true },
      { name: 'text', type: 'string', required: true },
    ],
  },
];

export function registerUiTools(registry: ToolRegistry, driver: UiDriver): ToolRegistry {
  for (const spec of UI_TOOL_SPECS) {
    registry.register(spec, (args) => {
      const els = driver.elements();
      switch (spec.name) {
        case 'ui.observe':
          return { elements: els.map((e, i) => ({ index: i, ...e })) };
        case 'ui.click': {
          const i = Number(args.index);
          if (!Number.isInteger(i) || i < 0 || i >= els.length) throw new Error(`index ${args.index} out of range (0..${els.length - 1})`);
          return { clicked: els[i]!.label, log: driver.click(i) };
        }
        case 'ui.type': {
          const i = Number(args.index);
          if (!Number.isInteger(i) || i < 0 || i >= els.length) throw new Error(`index ${args.index} out of range (0..${els.length - 1})`);
          if (els[i]!.kind !== 'input') throw new Error(`element ${i} is a ${els[i]!.kind}, cannot type`);
          return { into: els[i]!.label, log: driver.type(i, String(args.text)) };
        }
        default:
          throw new Error(`unrouted tool ${spec.name}`);
      }
    });
  }
  return registry;
}

/** One index per label occurrence; -1 when absent. Deterministic and total. */
export function findLabel(els: UiElement[], label: string): number {
  return els.findIndex((e) => e.label === label);
}
