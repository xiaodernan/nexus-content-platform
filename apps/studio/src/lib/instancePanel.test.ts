import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * M1 v132 — the panel half of the per-instance style overrides.
 *
 * This repo has no component-rendering harness: the studio suite runs in the node environment (no jsdom, no
 * testing-library) and the browser harness drives the app by clicking, which is a different, heavier seam. So
 * the two style controls are pinned the way this repo pins a wiring it cannot execute here — by reading the
 * component's own source and requiring the seam it must use (the same idiom as `saveSnapshot.test.ts`'s
 * "read from types.ts" guards and the audit-sentence guard).
 *
 * What this CANNOT prove is stated in the record: that a real click moves the model. What it does prove is the
 * one mistake that would silently edit the master instead of the instance.
 */
describe('InstanceOverrides panel wiring', () => {
  const source = readFileSync(new URL('../components/InstanceOverrides.tsx', import.meta.url), 'utf8');

  it('routes the fill swatch and the radius through setInstanceOverride, never through updateNode', () => {
    // Every call in this file must target the INSTANCE. A guard that only greps for the literal
    // `setInstanceOverride(instance.id, r.masterId, {` passes a file where ONE of the rows was rewired to write
    // the override under the master's id — which is the failure this case exists for. Found by arm 05 of this
    // pass's probe: that arm survived the first version of this guard, so the guard became an argument check
    // (every receiver must be `instance.id`) and the arm was re-run against it.
    const receivers = [...source.matchAll(/setInstanceOverride\(([^,]+),/g)].map((m) => m[1].trim());
    expect(receivers.length, 'the panel has three override rows (text, fill, radius)').toBeGreaterThanOrEqual(3);
    expect([...new Set(receivers)], 'every override write must be addressed to the instance, never the master').toEqual(['instance.id']);
    expect(source, 'the swatch must write the fills patch').toMatch(/fills:\s*\[\{ kind: 'solid'/);
    expect(source, 'the radius input must write the cornerRadius patch').toContain('{ cornerRadius: n }');
    expect(source, 'updateNode edits the canonical node — the master — which is exactly what this panel must not do')
      .not.toContain('updateNode');
  });

  it('reads the clone it is editing out of the projection, so the inputs show the override that is applied', () => {
    expect(source).toContain('instanceView(doc)');
    expect(source, 'the radius shown is the projected clone\'s own corner radius').toMatch(/radius:\s*node\.cornerRadius/);
    expect(source, 'the swatch shows the clone\'s own first paint').toMatch(/fills:\s*node\.fills/);
  });
});
