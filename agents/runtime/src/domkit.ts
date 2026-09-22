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
  /** v21 (optional): count of real artifacts the host can verify against (e.g. Design Model layers). */
  layerCount?(): number;
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
    description: 'Click the element whose label matches (exact, then substring). Requires human checkpoint.',
    permissions: ['exec'],
    args: [{ name: 'label', type: 'string', required: true }],
  },
  {
    name: 'ui.type',
    description: 'Type text into the matching input. Requires human checkpoint.',
    permissions: ['exec'],
    args: [
      { name: 'label', type: 'string', required: true },
      { name: 'text', type: 'string', required: true },
    ],
  },
];

/** v20: exact match first, then substring (real placeholders carry extra hint text). */
export function locate(els: UiElement[], label: string): number {
  const exact = els.findIndex((e) => e.label === label);
  return exact >= 0 ? exact : els.findIndex((e) => e.label.includes(label));
}

export function registerUiTools(registry: ToolRegistry, driver: UiDriver): ToolRegistry {
  for (const spec of UI_TOOL_SPECS) {
    registry.register(spec, (args) => {
      const els = driver.elements();
      switch (spec.name) {
        case 'ui.observe':
          return { elements: els.map((e, i) => ({ index: i, ...e })) };
        case 'ui.click': {
          const i = locate(els, String(args.label));
          if (i < 0) throw new Error(`no element matches label "${String(args.label)}"`);
          return { clicked: els[i]!.label, log: driver.click(i) };
        }
        case 'ui.type': {
          const i = locate(els, String(args.label));
          if (i < 0) throw new Error(`no element matches label "${String(args.label)}"`);
          if (els[i]!.kind !== 'input') throw new Error(`element "${els[i]!.label}" is a ${els[i]!.kind}, cannot type`);
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
