import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { MemoryStore, registerMemoryTools } from '../src/memory.js';
import { RoleRegistry, DEMO_ROLES } from '../src/roles.js';
import { GIT_ARC_TOOLS } from '../src/gitArc.js';
import { runRoleChain } from '../src/pipeline.js';
import type { CheckpointRequest } from '../src/registry.js';
import type { UiDriver } from '../src/domkit.js';

const SEED = {
  'docs/widget.md': '# Widget\n\nwidget rotation notes\n',
  'docs/extra.md': '# Extra\n\nother stuff\n',
};

function host(opts: { green?: boolean } = {}) {
  const ws = new InMemoryWorkspace(SEED);
  const store = new MemoryStore();
  const registry = registerMemoryTools(registerWorkspaceTools(new ToolRegistry(), ws), store, 'chain');
  registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => {
    const green = opts.green !== false && ws.read('docs/widget.md').includes('NOTE (DEMO MODE');
    return { ok: green, detail: green ? 'annotated' : 'never annotated' };
  });
  const roles = new RoleRegistry();
  DEMO_ROLES.forEach((r) => roles.register(r));
  return { ws, store, registry, roles };
}

const task = { id: 'chain-1', goal: 'annotate widget rotation docs' };

describe('runRoleChain (v14 §24 four-stage pipeline)', () => {
  it('all four stages run in order; every transition is a handoff record', async () => {
    const h = host();
    const res = await runRoleChain(task, {
      roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: () => true, snapshot: () => h.ws.snapshot(),
      qaInput: { page: { x: 0, y: 0, width: 100, height: 100 }, rects: { a: { x: 0, y: 0, width: 50, height: 50 }, b: { x: 10, y: 10, width: 40, height: 40 } } },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.handoffs.map((x) => `${x.from}→${x.to}`)).toEqual(['researcher→designer', 'designer→qa', 'qa→editor']);
    expect(res.qa.flags.some((f) => f.code === 'overlap')).toBe(true);
    expect(res.editorOutcome.status).toBe('completed');
    expect(res.editorOutcome.plan.steps[0]!.tool).toBe('memory.recall');
    expect(res.evaluation.score).toBe(1);
    expect(h.ws.read('docs/widget.md')).toContain('DESIGN (DEMO MODE · chain-1)');
    expect(h.store.list('chain').length).toBeGreaterThanOrEqual(3);
  });

  it('no qa input: QA honestly checked nothing, chain still completes', async () => {
    const h = host();
    const res = await runRoleChain(task, { roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: () => true });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.qa).toEqual({ verdict: 'ok', checked: 0, flags: [] });
  });

  it('checkpoint denial at the designer stage stops the chain, naming the stage', async () => {
    const h = host();
    const res = await runRoleChain(task, { roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: ({ call }) => call.tool !== 'fs.append' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.stage).toBe('designer');
    expect(res.handoffs).toHaveLength(1);
    expect(h.ws.read('docs/widget.md')).not.toContain('DESIGN');
  });

  it('deterministic: identical chains produce identical transcripts', async () => {
    const a = await runRoleChain(task, { ...hostShim(host()) });
    const b = await runRoleChain(task, { ...hostShim(host()) });
    expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
  });
});

function hostShim(h: ReturnType<typeof host>) {
  return { roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: () => true };
}

/* ---- v22: the editor stage can act through gated ui tools ---- */

function uiHost() {
  const ws = new InMemoryWorkspace(SEED);
  const store = new MemoryStore();
  const registry = registerMemoryTools(registerWorkspaceTools(new ToolRegistry(), ws), store, 'chain');
  const els = [
    { kind: 'input' as const, label: 'goal composer' },
    { kind: 'button' as const, label: 'Compose' },
  ];
  const page = { prompt: '', layers: 1 };
  const driver: UiDriver = {
    elements: () => els,
    click: (i) => {
      if (page.prompt.length > 0 && els[i]!.kind === 'button') page.layers++;
      return `click:${els[i]!.label} layers=${page.layers}`;
    },
    type: (i, t) => {
      page.prompt = t;
      return `type:${els[i]!.label}=${t}`;
    },
    layerCount: () => page.layers,
  };
  registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
    ok: page.layers > 1,
    detail: `layers now ${page.layers}`,
  }));
  const roles = new RoleRegistry();
  DEMO_ROLES.forEach((r) => roles.register(r));
  return { ws, store, registry, roles, driver, page };
}

describe('runRoleChain with a UI driver (v22)', () => {
  it('editor stage drives the page observe→type→click and the host verify confirms the effect', async () => {
    const h = uiHost();
    const res = await runRoleChain(task, {
      roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: () => true,
      uiDriver: h.driver, uiInputLabel: 'goal composer', uiButtonLabel: 'Compose',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.editorOutcome.status).toBe('completed');
    expect(res.editorOutcome.plan.steps.map((s) => s.tool)).toEqual(['ui.observe', 'ui.type', 'ui.click', 'test.run']);
    expect(h.page.prompt).toBe(task.goal);
    expect(h.page.layers).toBe(2);
    expect(res.handoffs.map((x) => `${x.from}→${x.to}`)).toEqual(['researcher→designer', 'designer→qa', 'qa→editor', 'editor→host']);
    expect(res.handoffs[3]!.via).toBe('ui:ui.observe+ui.type+ui.click');
  });

  it('denying ui.click at the checkpoint stops the editor mid-plan; earlier actions still ran and are stated', async () => {
    const h = uiHost();
    const gated: string[] = [];
    const res = await runRoleChain(task, {
      roles: h.roles, registry: h.registry, store: h.store, scope: 'chain',
      checkpoint: ({ call }) => {
        if (call.tool.startsWith('ui.')) gated.push(call.tool);
        return call.tool !== 'ui.click';
      },
      uiDriver: h.driver, uiInputLabel: 'goal composer', uiButtonLabel: 'Compose',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.editorOutcome.status).toBe('denied');
    expect(gated).toEqual(['ui.type', 'ui.click']); // ui.observe is read-class: never checkpointed
    expect(h.page.prompt).toBe(task.goal); // typing happened before the denial
    expect(h.page.layers).toBe(1); // the button was never pressed
    expect(res.handoffs[3]!.via).toBe('ui:ui.observe+ui.type'); // recorded honestly, without the click
  });
});

/* ---- v47: the git arc gains a fifth, opt-in stage that OWNS those doors ---- */

interface DoorCall {
  tool: string;
  args: Record<string, unknown>;
}

/**
 * The four arc doors, registered on whatever host a case is exercising. They are FAKES on
 * purpose: this file tests which doors a ROLE can see, in which order, and who is asked —
 * that git itself answers correctly is the exec-host suite's job, and a chained run against
 * real git is `docs/evidence/agents/role-arc-proof.mjs`.
 */
function addDoors(registry: ToolRegistry, calls: DoorCall[]): ToolRegistry {
  const specs = [
    { name: 'git.staged', arg: { name: 'stat', type: 'boolean', required: true } },
    { name: 'git.commit', arg: { name: 'message', type: 'string', required: true } },
    { name: 'git.log', arg: { name: 'count', type: 'number', required: true } },
    { name: 'git.show', arg: { name: 'path', type: 'string', required: true } },
  ] as const;
  for (const s of specs) {
    registry.register({ name: s.name, description: '', permissions: ['exec'], args: [s.arg] }, (args) => {
      calls.push({ tool: s.name, args });
      return { ok: true, detail: `${s.name}: walked` };
    });
  }
  return registry;
}

function arcHost(opts: { doors?: boolean; green?: boolean } = {}) {
  const h = host(opts);
  const calls: DoorCall[] = [];
  if (opts.doors !== false) addDoors(h.registry, calls);
  const gates: string[] = [];
  const checkpoint = ({ call }: CheckpointRequest) => {
    if (call.tool.startsWith('git.')) gates.push(call.tool);
    return true;
  };
  return { ...h, calls, gates, checkpoint };
}

const arcOptions = (h: ReturnType<typeof arcHost>) => ({
  roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: h.checkpoint, release: true,
});

describe('runRoleChain release stage (v47)', () => {
  it('opt-out: without `release` the chain is byte-for-byte the v14/v22 chain', async () => {
    const h = arcHost();
    const res = await runRoleChain(task, { roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: () => true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('release' in res).toBe(false);
    expect(res.handoffs.map((x) => `${x.from}→${x.to}`)).toEqual(['researcher→designer', 'designer→qa', 'qa→editor']);
    expect(h.calls).toEqual([]); // doors present in the host, touched by nobody
    expect(h.gates).toEqual([]);
  });

  it('a green chain walks all four doors through the releaser scope, one §28 gate each', async () => {
    const h = arcHost();
    const res = await runRoleChain(task, arcOptions(h));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.release?.status).toBe('completed');
    expect(res.release?.doors).toEqual([...GIT_ARC_TOOLS]);
    expect(res.release?.steps.map((s) => s.stepId)).toEqual(['staged', 'commit', 'confirm', 'inspect']);
    expect(res.release?.results.map((r) => r.callId)).toEqual([
      'chain-1:release:staged', 'chain-1:release:commit', 'chain-1:release:confirm', 'chain-1:release:inspect',
    ]);
    expect(h.calls.map((c) => c.tool)).toEqual([...GIT_ARC_TOOLS]);
    expect(h.gates).toEqual([...GIT_ARC_TOOLS]); // four separate asks, never one for the arc
    expect(res.handoffs.map((x) => `${x.from}→${x.to}`)).toEqual([
      'researcher→designer', 'designer→qa', 'qa→editor', 'editor→releaser', 'releaser→host',
    ]);
    expect(res.handoffs[3]!.via).toBe('git.arc:git.staged+git.commit+git.log+git.show');
    expect(res.handoffs[4]!.via).toBe('git:staged→commit→confirm→inspect');
    // The message is the CHAIN's, not the single-run planner's — and it names the run it verified.
    const commitStep = res.release?.steps.find((s) => s.stepId === 'commit');
    expect(commitStep?.args.message).toContain(`verified chain ${task.id}`);
    const remembered = h.store.list('chain').filter((r) => r.query === `${task.goal} — release`);
    expect(remembered.map((r) => r.summary)).toEqual(['release completed: staged→commit→confirm→inspect']);
  });

  it('the content door reads the path an EARLIER stage actually returned, never one this stage chose', async () => {
    const h = arcHost();
    const res = await runRoleChain(task, arcOptions(h));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // The chain task declares no targetPath, so the arc follows the same ref the plan would have:
    // the first hit of the editor's own research step.
    expect(res.editorOutcome.results.find((r) => r.callId === 'chain-1:search')?.tool).toBe('memory.recall');
    expect(res.release?.steps.at(-1)?.args).toEqual({ path: 'docs/widget.md' });
  });

  it('no live path for the content door: the arc stops at the hash and SAYS why', async () => {
    const h = uiHost();
    const calls: DoorCall[] = [];
    addDoors(h.registry, calls);
    const res = await runRoleChain(task, {
      roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: () => true,
      uiDriver: h.driver, uiInputLabel: 'goal composer', uiButtonLabel: 'Compose', release: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.editorOutcome.status).toBe('completed');
    // A UI chain's `search` step is ui.observe: it returns a page, not refs — so there is no path.
    expect(res.release?.doors).toEqual(['git.staged', 'git.commit', 'git.log']);
    expect(res.release?.status).toBe('completed');
    expect(res.release?.notes).toEqual(['git.show skipped: no live target path was handed to the arc, and a path the walker invented would be a guess']);
    expect(calls.map((c) => c.tool)).toEqual(['git.staged', 'git.commit', 'git.log']);
    // A UI chain carries its own `editor→host` handoff, so the arc's is the one after it.
    expect(res.handoffs.map((x) => `${x.from}→${x.to}`)).toEqual([
      'researcher→designer', 'designer→qa', 'qa→editor', 'editor→host', 'editor→releaser', 'releaser→host',
    ]);
    expect(res.handoffs.at(-1)!.via).toBe('git:staged→commit→confirm');
  });

  it('a red chain never reaches the arc: no door opens, and the refusal names the editor status', async () => {
    const h = arcHost({ green: false });
    const res = await runRoleChain(task, arcOptions(h));
    expect(res.ok).toBe(true); // the chain reports honestly; it does not inherit the run's failure
    if (!res.ok) return;
    expect(res.editorOutcome.status).toBe('failed_verification');
    expect(res.release?.status).toBe('no-arc');
    expect(res.release?.reason).toBe('the editor stage ended failed_verification — the arc lives behind verification (v36)');
    expect(h.calls).toEqual([]);
    expect(h.gates).toEqual([]); // not even an ask: position, not permission, stopped it
    expect(res.handoffs[3]!.via).toBe('git.arc:none');
    expect(res.handoffs).toHaveLength(4); // no releaser→host handoff from an arc that had no doors
  });

  it('denying the content door stops the walk after the commit landed — and the commit stands', async () => {
    const h = arcHost();
    const res = await runRoleChain(task, {
      ...arcOptions(h),
      checkpoint: (req: CheckpointRequest) => {
        if (req.call.tool.startsWith('git.')) h.gates.push(req.call.tool);
        return req.call.tool !== 'git.show';
      },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.release?.status).toBe('stopped');
    expect(res.release?.stoppedAt).toBe('inspect');
    expect(res.release?.results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(h.calls.map((c) => c.tool)).toEqual(['git.staged', 'git.commit', 'git.log']); // show never ran
    expect(h.gates).toEqual(['git.staged', 'git.commit', 'git.log', 'git.show']); // asked, then refused
    expect(res.handoffs[4]!.via).toBe('git:staged→commit→confirm→inspect!stopped');
    expect(h.store.list('chain').find((r) => r.query === `${task.goal} — release`)?.summary)
      .toBe('release stopped: staged→commit→confirm→inspect — denied at inspect: denied at checkpoint (exec)');
  });

  it('a host with no git doors: the releaser scope is empty, so there is no arc and no ask', async () => {
    const h = arcHost({ doors: false });
    const res = await runRoleChain(task, arcOptions(h));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.release?.status).toBe('no-arc');
    expect(res.release?.reason).toContain('no git.commit in this scope');
    expect(h.gates).toEqual([]);
    expect(res.handoffs.map((x) => `${x.from}→${x.to}`)).toEqual([
      'researcher→designer', 'designer→qa', 'qa→editor', 'editor→releaser',
    ]);
  });

  it('§60: the arc is its own stage — the editor plan and results never claim git steps', async () => {
    const h = arcHost();
    const res = await runRoleChain(task, arcOptions(h));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.editorOutcome.plan.steps.some((s) => s.tool.startsWith('git.'))).toBe(false);
    expect(res.editorOutcome.results.some((r) => r.tool.startsWith('git.'))).toBe(false);
    expect(res.release?.results).toHaveLength(4);
    expect(res.evaluation.score).toBe(1); // scored on what the editor DID, not on the release after it
  });
});

