import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { MemoryStore, registerMemoryTools } from '../src/memory.js';
import { RoleRegistry, DEMO_ROLES } from '../src/roles.js';
import { GIT_ARC_TOOLS, RELEASE_ROLE } from '../src/gitArc.js';
import { NO_RECEIPTS_NOTE } from '../src/checkpointPolicy.js';
import { policyCheckpoint } from '../src/checkpointPolicy.js';
import { runRoleChain } from '../src/pipeline.js';
import { loadLedger, parseLedgerLine } from '../src/ledger.js';
import type { Checkpoint, CheckpointRequest } from '../src/registry.js';
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

/* ---- v49: the arc's own walk is durable, not just returned ---- */

class MemDisk {
  files = new Map<string, string>();
  readFileSync(p: string): string {
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return c;
  }
  /**
   * v206: `FsWriteLike` extends `FsLike`, which requires these two — and this mock had NEITHER, in six of
   * the eight suites that define one, until the type gate learned to read `test/`. Nothing on these paths
   * reads a directory or stats a file, so every suite stayed green while the mock was incomplete against its
   * own interface. They THROW rather than answering an empty listing: a mock that reports "no entries" for a
   * disk that HAS entries is the kind of lie a future test would pass against.
   */
  readdirSync(): never {
    throw new Error('MemDisk.readdirSync is not implemented for this suite — nothing here needs it');
  }
  statSync(): never {
    throw new Error('MemDisk.statSync is not implemented for this suite — nothing here needs it');
  }
  mkdirSync(): void {}
  writeFileSync(p: string, data: string): void {
    this.files.set(p, data);
  }
}

const LEDGER = 'state/chain-ledger.jsonl';

function durableOptions(h: ReturnType<typeof arcHost>, disk: MemDisk, checkpoint?: Checkpoint) {
  return { ...arcOptions(h), fsLike: disk, ledgerFile: LEDGER, ...(checkpoint ? { checkpoint } : {}) };
}

describe('runRoleChain ledger records (v49)', () => {
  it('a green chain writes its run line AND an arc line, in that order, joined by runId', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    const res = await runRoleChain(task, durableOptions(h, disk));
    expect(res.ok).toBe(true);
    expect(disk.readFileSync(LEDGER).trimEnd().split('\n')).toHaveLength(2);
    const { runs, arcs, malformed } = loadLedger(disk, LEDGER);
    expect(malformed).toBe(0);
    expect(runs.map((r) => r.task.id)).toEqual([task.id]);
    expect(arcs).toHaveLength(1);
    const arc = arcs[0]!;
    expect(arc.kind).toBe('git-arc');
    expect(arc.runId).toBe(runs[0]!.task.id);
    expect(arc.role).toBe(RELEASE_ROLE);
    expect(arc.provenance.mode).toBe('demo');
    expect(arc.goal).toBe(task.goal);
    // The durable walk IS the returned walk — byte for byte, not a summary of it.
    expect(arc.arc).toEqual(res.release);
    expect(arc.arc.steps.map((s) => s.stepId)).toEqual(['staged', 'commit', 'confirm', 'inspect']);
    expect(arc.arc.results.map((r) => (r.output as { detail: string }).detail)).toEqual([
      'git.staged: walked', 'git.commit: walked', 'git.log: walked', 'git.show: walked',
    ]);
  });

  it('§60 anti-fold on disk: the run line still holds no git step, so neither record lies about its stage', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    await runRoleChain(task, durableOptions(h, disk));
    const { runs, arcs } = loadLedger(disk, LEDGER);
    expect(runs[0]!.plan.steps.some((s) => s.tool.startsWith('git.'))).toBe(false);
    expect(runs[0]!.results.some((r) => r.tool.startsWith('git.'))).toBe(false);
    expect(arcs[0]!.arc.steps.every((s) => s.tool.startsWith('git.'))).toBe(true);
    // The arc line is the ONLY place a cold reader learns the four doors, and its callIds name the stage.
    expect(arcs[0]!.arc.results[1]!.callId).toBe(`${task.id}:release:commit`);
  });

  it('a stopped arc is durable AS stopped: the doors that passed and the refusal both survive', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    const res = await runRoleChain(task, durableOptions(h, disk, (req) => req.call.tool !== 'git.log'));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { arcs } = loadLedger(disk, LEDGER);
    expect(arcs[0]!.arc.status).toBe('stopped');
    expect(arcs[0]!.arc.stoppedAt).toBe('confirm');
    expect(arcs[0]!.arc.reason).toBe('denied at confirm: denied at checkpoint (exec)');
    expect(arcs[0]!.arc.results.map((r) => r.ok)).toEqual([true, true, false]);
    expect(arcs[0]!.arc.doors).toEqual([...GIT_ARC_TOOLS]); // the doors it COULD walk, not the ones it did
  });

  it('a red chain journals the release it was REFUSED — an absent arc line would hide the ask', async () => {
    const h = arcHost({ green: false });
    const disk = new MemDisk();
    const res = await runRoleChain(task, durableOptions(h, disk));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { arcs } = loadLedger(disk, LEDGER);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.arc.status).toBe('no-arc');
    expect(arcs[0]!.arc.doors).toEqual([]);
    expect(arcs[0]!.arc.reason).toContain('the arc lives behind verification');
    // No door was opened, and the ledger says so rather than leaving a gap to interpret.
    expect(res.editorOutcome.status).toBe('failed_verification');
  });

  it('without `release` the ledger keeps exactly the v14 shape: one run line, no arc line', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    const res = await runRoleChain(task, { roles: h.roles, registry: h.registry, store: h.store, scope: 'chain', checkpoint: () => true, fsLike: disk, ledgerFile: LEDGER });
    expect(res.ok).toBe(true);
    const { runs, arcs } = loadLedger(disk, LEDGER);
    expect(runs).toHaveLength(1);
    expect(arcs).toEqual([]);
  });

  it('append-only across runs: two chains, four lines, each arc joins its own run', async () => {
    const disk = new MemDisk();
    const h1 = arcHost();
    const h2 = arcHost();
    await runRoleChain(task, durableOptions(h1, disk));
    await runRoleChain({ id: 'chain-2', goal: 'annotate widget rotation docs' }, durableOptions(h2, disk));
    const { runs, arcs, malformed } = loadLedger(disk, LEDGER);
    expect(malformed).toBe(0);
    expect(runs.map((r) => r.task.id)).toEqual(['chain-1', 'chain-2']);
    expect(arcs.map((a) => a.runId)).toEqual(['chain-1', 'chain-2']);
    // `last` trims trailing RECORDS across both kinds: the last thing written was chain-2's arc.
    expect(loadLedger(disk, LEDGER, 1).runs).toEqual([]);
    expect(loadLedger(disk, LEDGER, 1).arcs.map((a) => a.runId)).toEqual(['chain-2']);
    expect(loadLedger(disk, LEDGER, 2).runs.map((r) => r.task.id)).toEqual(['chain-2']);
    expect(loadLedger(disk, LEDGER, 2).arcs.map((a) => a.runId)).toEqual(['chain-2']);
    // A cold reader who only has the file can still name the door each walk stopped at.
    const lines = disk.readFileSync(LEDGER).trimEnd().split('\n');
    const kinds = lines.map((l) => (parseLedgerLine(l).ok ? (JSON.parse(l).kind ?? 'run') : 'junk'));
    expect(kinds).toEqual(['run', 'git-arc', 'run', 'git-arc']);
  });
});

/* ---- v50: the durable arc also answers WHO allowed each door ---- */

/** The stages BEFORE the release must pass the same table, or the chain never reaches the arc. */
const STAGE_RULES = [
  { tool: 'fs.*', grant: true, reason: 'the demo workspace is open to every stage' },
  { tool: 'memory.*', grant: true, reason: 'recalling the past is not writing the repo' },
  { tool: 'test.run', grant: true, reason: 'verification is always welcome' },
];
const openArc = () => policyCheckpoint({ rules: [...STAGE_RULES, { tool: 'git.*', grant: true, reason: 'the release window is open today' }], default: { grant: false, reason: 'unlisted tools are refused' } });
const vetoInspect = () => policyCheckpoint({
  rules: [...STAGE_RULES, { tool: 'git.show', grant: false, reason: 'only the human reads HEAD\'s contents' }, { tool: 'git.*', grant: true, reason: 'the release window is open today' }],
  default: { grant: false, reason: 'unlisted tools are refused' },
});
const arcCallIds = ['staged', 'commit', 'confirm', 'inspect'].map((s) => `${task.id}:release:${s}`);

describe('runRoleChain arc receipts on the ledger (v50)', () => {
  it('a policy face\'s verdicts ride on the durable line: one receipt per door, rule and reason verbatim', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    const cp = openArc();
    const res = await runRoleChain(task, durableOptions(h, disk, cp));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const durable = loadLedger(disk, LEDGER).arcs[0]!.arc;
    // v49's identity EXTENDS to the receipts: the durable walk is the returned walk, field for field.
    expect(durable.decisions).toEqual(res.release!.decisions);
    expect(durable.decisions!.map((d) => d.call.callId)).toEqual(arcCallIds);
    expect(durable.decisions!.map((d) => [d.call.tool, d.granted, d.matched])).toEqual([
      ['git.staged', true, 'git.*'],
      ['git.commit', true, 'git.*'],
      ['git.log', true, 'git.*'],
      ['git.show', true, 'git.*'],
    ]);
    expect([...new Set(durable.decisions!.map((d) => d.reason))]).toEqual(['the release window is open today']);
    // The arc claims ONLY its own gates. The editor's fs/test decisions are not its alibi (§60).
    expect(cp.decisions.length).toBeGreaterThan(durable.decisions!.length);
    expect(durable.decisions!.every((d) => d.call.tool.startsWith('git.'))).toBe(true);
    expect(h.calls.map((c) => c.tool)).toEqual([...GIT_ARC_TOOLS]);
  });

  it('the veto\'s REASON sits beside the commit it could not undo — the file answers who said no', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    const res = await runRoleChain(task, durableOptions(h, disk, vetoInspect()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const durable = loadLedger(disk, LEDGER).arcs[0]!.arc;
    expect(durable.status).toBe('stopped');
    expect(durable.stoppedAt).toBe('inspect');
    expect(durable.results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(durable.decisions!.map((d) => d.granted)).toEqual([true, true, true, false]);
    expect(durable.decisions!.at(-1)).toMatchObject({
      call: { tool: 'git.show', callId: `${task.id}:release:inspect` },
      matched: 'git.show',
      reason: 'only the human reads HEAD\'s contents',
    });
    // The three granted doors are recorded as granted BY THE TABLE, not by silence.
    expect(durable.decisions!.slice(0, 3).map((d) => d.matched)).toEqual(['git.*', 'git.*', 'git.*']);
  });

  it('durability is what asks for receipts: the same policy without a ledger writes the v47 shape', async () => {
    const h = arcHost();
    const res = await runRoleChain(task, { ...arcOptions(h), checkpoint: openArc() });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.release!.status).toBe('completed');
    expect('decisions' in res.release!).toBe(false);
    expect(res.release!.notes).toEqual([]);
  });

  it('a face that keeps no list states that on the durable line instead of leaving a gap to interpret', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    await runRoleChain(task, durableOptions(h, disk));
    const durable = loadLedger(disk, LEDGER).arcs[0]!.arc;
    expect(durable.decisions).toEqual([]);
    expect(durable.notes).toEqual([NO_RECEIPTS_NOTE]);
    // Not durable ⇒ the same plain closure produces the v47/v49 outcome: no field, no note.
    const h2 = arcHost();
    const mem = await runRoleChain(task, arcOptions(h2));
    expect(mem.ok).toBe(true);
    if (!mem.ok) return;
    expect('decisions' in mem.release!).toBe(false);
    expect(mem.release!.notes).toEqual([]);
  });

  it('a red chain gated NOTHING, so its durable no-arc line carries an empty list and no note', async () => {
    const h = arcHost({ green: false });
    const disk = new MemDisk();
    const res = await runRoleChain(task, durableOptions(h, disk));
    expect(res.ok).toBe(true);
    const durable = loadLedger(disk, LEDGER).arcs[0]!.arc;
    expect(durable.status).toBe('no-arc');
    // An empty receipt list with zero asks is the truth, so no note is owed beside it.
    expect(durable.decisions).toEqual([]);
    expect(durable.notes).toEqual([]);
  });
});

/* ---- v54: the RUN line answers for its own gates too, by the same rule ---- */

/** The two calls the editor loop actually made, in the order §28 disposed of them. */
const runCallIds = ['annotate', 'verify'].map((s) => `${task.id}:${s}`);
const openRun = () => policyCheckpoint({ rules: [...STAGE_RULES, { tool: 'git.*', grant: true, reason: 'the release window is open today' }], default: { grant: false, reason: 'unlisted tools are refused' } });

describe('runRoleChain run-line receipts (v54)', () => {
  it('the durable run line carries its OWN two gates, naming the row that decided each', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    const cp = openRun();
    const res = await runRoleChain(task, durableOptions(h, disk, cp));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { runs, arcs, malformed } = loadLedger(disk, LEDGER);
    expect(malformed).toBe(0);
    const run = runs[0]!;
    // v49's identity, now on the run face: the line in the file IS the outcome the caller got.
    expect(run).toEqual(res.editorOutcome);
    expect(run.decisions!.map((d) => d.call.callId)).toEqual(runCallIds);
    expect(run.decisions!.map((d) => [d.call.tool, d.granted, d.matched, d.reason])).toEqual([
      ['fs.append', true, 'fs.*', 'the demo workspace is open to every stage'],
      ['test.run', true, 'test.run', 'verification is always welcome'],
    ]);
    // The arc's four doors are NOT folded in, though the same face decided them minutes earlier.
    expect(run.decisions!.some((d) => d.call.tool.startsWith('git.'))).toBe(false);
    expect(arcs[0]!.arc.decisions!.map((d) => d.call.callId)).toEqual(arcCallIds);
    expect(new Set([...run.decisions!, ...arcs[0]!.arc.decisions!].map((d) => d.call.callId)).size).toBe(6);
  });

  it('the arithmetic of one chain: every gate lands on the record that owns it, and the brief on none', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    const cp = openRun();
    const res = await runRoleChain(task, durableOptions(h, disk, cp));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { runs, arcs } = loadLedger(disk, LEDGER);
    const journaled = new Set([...runs[0]!.decisions!, ...arcs[0]!.arc.decisions!].map((d) => d.call.callId));
    // The designer's brief WAS gated (it is a write) and appears in NO durable record: a chained
    // stage's own call is neither the editor's plan nor the release's arc. Stated, not smoothed over.
    expect(cp.decisions.map((d) => d.call.callId)).toContain(`${task.id}:brief`);
    expect(journaled.has(`${task.id}:brief`)).toBe(false);
    expect(cp.decisions.length).toBe(journaled.size + 1);
    expect(cp.decisions.every((d) => d.call.callId === `${task.id}:brief` || journaled.has(d.call.callId))).toBe(true);
  });

  it('a veto of the run\'s OWN verification is recorded with its reason, beside a grant it cannot erase', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    // The veto REPLACES the `test.run` row rather than shadowing it — v40's validator refuses a
    // duplicate pattern precisely because a shadowed rule is dead code nobody can see.
    const vetoVerify = policyCheckpoint({
      rules: [
        { tool: 'test.run', grant: false, reason: 'this host runs no verification the agent may invoke' },
        ...STAGE_RULES.filter((r) => r.tool !== 'test.run'),
        { tool: 'git.*', grant: true, reason: 'the release window is open today' },
      ],
      default: { grant: false, reason: 'unlisted tools are refused' },
    });
    const res = await runRoleChain(task, durableOptions(h, disk, vetoVerify));
    expect(res.ok).toBe(true); // the chain reports honestly: the stages ran, the run did not finish
    if (!res.ok) return;
    expect(res.editorOutcome.status).toBe('denied');
    const { runs, arcs, malformed } = loadLedger(disk, LEDGER);
    expect(malformed).toBe(0);
    expect(runs[0]!.decisions!.map((d) => [d.call.tool, d.granted, d.matched])).toEqual([
      ['fs.append', true, 'fs.*'],
      ['test.run', false, 'test.run'],
    ]);
    expect(runs[0]!.decisions![1]!.reason).toBe('this host runs no verification the agent may invoke');
    // The granted write stands in the receipts AND on disk: a later veto did not pretend otherwise.
    expect(h.ws.read('docs/widget.md')).toContain('NOTE (DEMO MODE');
    // Behind a red editor there is no arc — and its own empty list is the truth, not a gap.
    expect(arcs[0]!.arc.status).toBe('no-arc');
    expect(arcs[0]!.arc.decisions).toEqual([]);
    expect(arcs[0]!.arc.notes).toEqual([]);
  });

  it('not durable ⇒ the run line carries nothing, exactly as the arc line learned in v50', async () => {
    const h = arcHost();
    const res = await runRoleChain(task, { ...arcOptions(h), checkpoint: openRun() });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('decisions' in res.editorOutcome).toBe(false);
    expect('decisionsNote' in res.editorOutcome).toBe(false);
    expect('decisions' in res.release!).toBe(false);
  });

  it('a face with no audit list says so on BOTH kinds of line, in the same sentence', async () => {
    const h = arcHost();
    const disk = new MemDisk();
    const res = await runRoleChain(task, durableOptions(h, disk));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { runs, arcs } = loadLedger(disk, LEDGER);
    expect(runs[0]!.decisions).toEqual([]);
    expect(runs[0]!.decisionsNote).toBe(NO_RECEIPTS_NOTE);
    expect(arcs[0]!.arc.decisions).toEqual([]);
    expect(arcs[0]!.arc.notes).toEqual([NO_RECEIPTS_NOTE]);
  });
});


