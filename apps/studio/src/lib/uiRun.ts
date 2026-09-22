import { ToolRegistry, predicateRunner, registerTestTools, registerUiTools, runTask, scoreRun, type RunOutcome, type UiDriver, type UiElement } from '@nexus/agent-runtime';
import { AGENT_LEDGER_KEY, type KvLike } from './agentDock';

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
    if (locate(els, step.label) < 0) return { ok: false, actions, stoppedAt: step.label, reason: 'label not found on page' };
    const args = step.tool === 'ui.type' ? { label: step.label, text: step.text ?? '' } : { label: step.label };
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

/** v20: the SAME orchestrator loop drives the page — plan (observe→type→click) comes from
 * the demo planner, every exec step passes the injected human decider via the checkpoint. */
export async function runUiTask(
  driver: UiDriver,
  goal: string,
  decide: (plan: { tool: string; label: string; detail: string }) => Promise<boolean>,
  labels: { input: string; button: string } = { input: 'analytics dashboard', button: 'Compose' },
  kv?: KvLike,
): Promise<{ outcome: RunOutcome; actions: string[]; score: number }> {
  const registry = registerUiTools(new ToolRegistry(), driver);
  const baseline = driver.layerCount ? driver.layerCount() : 0;
  if (driver.layerCount) {
    // v28: the same shared predicate engine the dock uses — the check closes over the
    // design model instead of the corpus, and the report states its engine.
    registerTestTools(
      registry,
      predicateRunner('in-process-predicates', [
        { name: 'layers-grew', check: () => (driver.layerCount!() > baseline ? null : `layers stayed at ${baseline}`) },
      ]),
    );
  }
  const actions: string[] = [];
  const origInvoke = registry.invoke.bind(registry);
  registry.invoke = async (call, opts) => {
    const res = await origInvoke(call, {
      ...opts,
      checkpoint: async () => {
        const label = String(call.args.label ?? 'page');
        return decide({ tool: call.tool, label, detail: call.tool === 'ui.type' ? `type “${call.args.text}”` : 'one click' });
      },
    });
    if (res.ok && (call.tool === 'ui.click' || call.tool === 'ui.type')) actions.push(String((res.output as { log: string }).log));
    return res;
  };
  const outcome = await runTask({ id: `ui-task-${Date.now()}`, goal }, { registry, checkpoint: () => true, uiInputLabel: labels.input, uiButtonLabel: labels.button });
  const evaluation = scoreRun(outcome);
  if (kv) {
    const entry = { goal: `ui-task: ${goal}`, target: labels.button, via: 'ui', score: evaluation.score, approved: outcome.status === 'completed', reason: `status=${outcome.status} planner=${outcome.planner?.backend ?? 'demo'}`, at: Date.now() };
    const cur = kv.getItem(AGENT_LEDGER_KEY) ?? '';
    const sep = cur === '' || cur.endsWith('\n') ? '' : '\n';
    kv.setItem(AGENT_LEDGER_KEY, `${cur}${sep}${JSON.stringify(entry)}\n`);
  }
  return { outcome, actions, score: evaluation.score };
}
