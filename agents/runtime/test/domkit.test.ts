import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import { findLabel, registerUiTools, type UiDriver, type UiElement } from '../src/domkit.js';

class FakeDriver implements UiDriver {
  calls: string[] = [];
  constructor(public els: UiElement[]) {}
  elements(): UiElement[] {
    return this.els;
  }
  click(index: number): string {
    this.calls.push(`click:${this.els[index]!.label}`);
    return this.calls.join('|');
  }
  type(index: number, text: string): string {
    this.calls.push(`type:${this.els[index]!.label}=${text}`);
    return this.calls.join('|');
  }
}

const driver = () => new FakeDriver([
  { kind: 'button', label: 'Compose' },
  { kind: 'input', label: 'prompt' },
  { kind: 'button', label: 'Plan' },
]);

describe('domkit (v16 gated UI vocabulary)', () => {
  it('ui.observe is read-only and indexed', async () => {
    const reg = registerUiTools(new ToolRegistry(), driver());
    const res = await reg.invoke({ callId: 'c', tool: 'ui.observe', args: {} }, {});
    expect(res.ok).toBe(true);
    expect((res.output as { elements: unknown[] }).elements).toHaveLength(3);
  });

  it('click/type are exec-gated: no checkpoint ⇒ nothing happens', async () => {
    const d = driver();
    const reg = registerUiTools(new ToolRegistry(), d);
    const denied = await reg.invoke({ callId: 'c1', tool: 'ui.click', args: { label: 'Compose' } }, {});
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain('checkpoint required');
    expect(d.calls).toEqual([]);
  });

  it('approved actions flow through the driver and log', async () => {
    const d = driver();
    const reg = registerUiTools(new ToolRegistry(), d);
    const click = await reg.invoke({ callId: 'c1', tool: 'ui.click', args: { label: 'Compose' } }, { checkpoint: () => true });
    expect(click.output).toEqual({ clicked: 'Compose', log: 'click:Compose' });
    const typed = await reg.invoke({ callId: 'c2', tool: 'ui.type', args: { label: 'prompt', text: 'hi' } }, { checkpoint: () => true });
    expect(typed.output).toEqual({ into: 'prompt', log: 'click:Compose|type:prompt=hi' });
  });

  it('out-of-range and wrong-kind targets fail as results, never throws', async () => {
    const reg = registerUiTools(new ToolRegistry(), driver());
    const oob = await reg.invoke({ callId: 'c', tool: 'ui.click', args: { label: 'Nope' } }, { checkpoint: () => true });
    expect(oob.ok).toBe(false);
    expect(oob.error).toContain('no element matches');
    const wrongKind = await reg.invoke({ callId: 'c2', tool: 'ui.type', args: { label: 'Compose', text: 'x' } }, { checkpoint: () => true });
    expect(wrongKind.error).toContain('cannot type');
  });

  it('findLabel is total and deterministic', () => {
    const els = driver().els;
    expect(findLabel(els, 'Plan')).toBe(2);
    expect(findLabel(els, 'nope')).toBe(-1);
  });
});
