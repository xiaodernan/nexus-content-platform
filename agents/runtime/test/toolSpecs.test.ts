/**
 * Contract lock for the security-relevant tool specs (agents/runtime).
 *
 * `BUILD_TOOL_SPECS` / `DEPLOY_TOOL_SPECS` / `UI_TOOL_SPECS` were only ever read indirectly
 * through `registerBuildTools` / `registerDeployTools` / `registerUiTools`, so their §28
 * permission surface — WHICH door is dangerous and therefore checkpoint-gated — was never
 * asserted directly. A permission regression (e.g. `build.verify` silently losing `exec`) would
 * open a gate nothing else catches. Per house discipline an untested export *is* the next
 * increment; these lock the dangerous-tool contract.
 */
import { describe, expect, it } from 'vitest';
import { BUILD_TOOL_SPECS } from '../src/buildArc.js';
import { DEPLOY_TOOL_SPECS } from '../src/deployArc.js';
import { UI_TOOL_SPECS } from '../src/domkit.js';
import type { ToolSpec } from '../src/types.js';

const byName = (specs: ToolSpec[]): Record<string, ToolSpec> => Object.fromEntries(specs.map((s) => [s.name, s]));

describe('BUILD_TOOL_SPECS — the one exec door (§28)', () => {
  it('declares exactly build.verify, gated by exec', () => {
    expect(BUILD_TOOL_SPECS.map((s) => s.name)).toEqual(['build.verify']);
    expect(BUILD_TOOL_SPECS[0]!.permissions).toEqual(['exec']);
  });

  it('requires arcId, stepId and argv as declared args', () => {
    const required = BUILD_TOOL_SPECS[0]!.args.filter((a) => a.required).map((a) => a.name);
    expect(required).toEqual(['arcId', 'stepId', 'argv']);
  });
});

describe('DEPLOY_TOOL_SPECS — the one write door (§28)', () => {
  it('declares exactly deploy.record, gated by write', () => {
    expect(DEPLOY_TOOL_SPECS.map((s) => s.name)).toEqual(['deploy.record']);
    expect(DEPLOY_TOOL_SPECS[0]!.permissions).toEqual(['write']);
  });

  it('requires arcId, stepId and fact as declared args', () => {
    const required = DEPLOY_TOOL_SPECS[0]!.args.filter((a) => a.required).map((a) => a.name);
    expect(required).toEqual(['arcId', 'stepId', 'fact']);
  });
});

describe('UI_TOOL_SPECS — observe is read, click/type are exec', () => {
  it('splits the read/exec boundary exactly', () => {
    const s = byName(UI_TOOL_SPECS);
    expect(Object.keys(s)).toEqual(['ui.observe', 'ui.click', 'ui.type']);
    expect(s['ui.observe']!.permissions).toEqual(['read']); // observe needs no gate
    expect(s['ui.click']!.permissions).toEqual(['exec']); // every action passes §28
    expect(s['ui.type']!.permissions).toEqual(['exec']);
  });

  it('ui.click requires label; ui.type requires label + text', () => {
    const s = byName(UI_TOOL_SPECS);
    expect(s['ui.click']!.args.filter((a) => a.required).map((a) => a.name)).toEqual(['label']);
    expect(s['ui.type']!.args.filter((a) => a.required).map((a) => a.name)).toEqual(['label', 'text']);
  });
});
