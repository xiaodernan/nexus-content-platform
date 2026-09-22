import { ToolRegistry, registerUiTools, type UiDriver, type UiElement } from '@nexus/agent-runtime';

/**
 * M2 v16 (§63 browser automation *by* the agent, in-page edition): a deterministic UI
 * script executed through the runtime's checkpoint-gated `ui.*` tools. The runtime owns
 * the vocabulary; this module only injects the driver and the human decider — every
 * single click/type is surfaced for Allow-once/Deny (§28). No hidden puppeteer anywhere (§60).
 */
export interface UiStep {
  tool: 'ui.click' | 'ui.type';
  label: string;
  text?: string;
}

export interface UiRunResult {
  ok: boolean;
  actions: string[];
  stoppedAt?: string;
  reason?: string;
}

/** The DOM driver over the studio's own markup: buttons by label, inputs by placeholder. */
export function createDomDriver(): UiDriver {
  const list = (): Element[] => [...document.querySelectorAll('button.btn, input.field')];
  const labelOf = (el: Element): string =>
    el instanceof HTMLButtonElement ? (el.textContent ?? '').trim() : (el as HTMLInputElement).placeholder.slice(0, 28);
  return {
    elements(): UiElement[] {
      return list().map((el) => ({ kind: el instanceof HTMLButtonElement ? 'button' : 'input', label: labelOf(el) }));
    },
    click(index: number): string {
      const el = list()[index];
      if (!(el instanceof HTMLButtonElement)) throw new Error(`element ${index} is not a button`);
      el.click();
      return `click:${el.textContent?.trim() ?? index}`;
    },
    type(index: number, text: string): string {
      const el = list()[index];
      if (!(el instanceof HTMLInputElement)) throw new Error(`element ${index} is not an input`);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return `type:${labelOf(el)}=${text}`;
    },
  };
}

/** Exact label or first substring match (real placeholders carry hints beyond the key text). */
function locate(els: UiElement[], label: string): number {
  return els.findIndex((e) => e.label === label || e.label.includes(label));
}
export function uiScript(goal: string): UiStep[] {
  return [
    { tool: 'ui.type', label: 'analytics dashboard', text: goal },
    { tool: 'ui.click', label: 'Compose' },
  ];
}

export async function runUiDrive(
  driver: UiDriver,
  steps: UiStep[],
  decide: (plan: { tool: string; label: string; detail: string }) => Promise<boolean>,
): Promise<UiRunResult> {
  const registry = registerUiTools(new ToolRegistry(), driver);
  const actions: string[] = [];
  for (const step of steps) {
    const els = driver.elements();
    const index = locate(els, step.label);
    if (index < 0) return { ok: false, actions, stoppedAt: step.label, reason: 'label not found on page' };
    const args = step.tool === 'ui.type' ? { index, text: step.text ?? '' } : { index };
    const res = await registry.invoke(
      { callId: `ui:${step.label}`, tool: step.tool, args },
      {
        checkpoint: async ({ call }) =>
          decide({ tool: call.tool, label: step.label, detail: step.tool === 'ui.type' ? `type “${step.text}”` : 'one click' }),
      },
    );
    if (!res.ok) return { ok: false, actions, stoppedAt: step.label, reason: res.error };
    actions.push(String((res.output as { log: string }).log));
  }
  return { ok: true, actions };
}
