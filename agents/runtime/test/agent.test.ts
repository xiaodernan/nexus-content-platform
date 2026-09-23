import { describe, expect, it } from 'vitest';
import { ToolRegistry, type Checkpoint } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { goalKeyword, planTask } from '../src/planner.js';
import { runTask } from '../src/orchestrator.js';
import { registerUiTools } from '../src/domkit.js';
import { MemoryStore, registerMemoryTools } from '../src/memory.js';
import type { AgentTask } from '../src/types.js';

const SEED_DOC = '# Alpha\n\nnotes about widgets here\n';

function harness(testImpl: (ws: InMemoryWorkspace) => unknown, checkpoint: Checkpoint | undefined = () => true) {
  const ws = new InMemoryWorkspace({ 'docs/a.md': SEED_DOC });
  const registry = registerWorkspaceTools(new ToolRegistry(), ws);
  registry.register({ name: 'test.run', description: 'host verification', permissions: ['exec'], args: [] }, () => testImpl(ws));
  const task: AgentTask = { id: 't1', goal: 'add widget docs' };
  return { ws, registry, checkpoint, task };
}

const noteTest = (ws: InMemoryWorkspace) => ({
  ok: ws.read('docs/a.md').includes('NOTE (DEMO'),
  detail: 'file must carry the agent note',
});

describe('planner: deterministic templates', () => {
  it('keyword extraction skips stopwords and short tokens', () => {
    expect(goalKeyword('add widget docs')).toBe('widget');
    expect(goalKeyword('go fix it')).toBe('fix');
    expect(goalKeyword('the and its')).toBe('readme');
  });
  it('same task plans identically twice; the seed stamp matches', () => {
    const a = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: true });
    const b = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: true });
    expect(a).toEqual(b);
    expect(a.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify']);
    expect(JSON.stringify(a.steps[2])).toContain(`seed ${a.seed}`);
    const noVerify = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: false });
    expect(noVerify.steps.map((s) => s.tool)).toEqual(['fs.search', 'fs.read', 'fs.append']);
  });

  it('v36: hasCommit appends a git.commit step ONLY after a verify step', () => {
    const withVerify = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true });
    expect(withVerify.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify', 'commit']);
    expect(withVerify.steps[4]!.tool).toBe('git.commit');
    expect(String(withVerify.steps[4]!.args.message)).toContain('verified run t');
    // no verify → nothing to be "green" about → never a commit step
    const noVerify = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: false, hasCommit: true });
    expect(noVerify.steps.map((s) => s.tool)).not.toContain('git.commit');
    // determinism holds with the commit step too
    expect(planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true })).toEqual(withVerify);
  });

  it('v38: hasConfirm trails a git.log step after the commit — and NEVER without one', () => {
    const full = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true, hasConfirm: true });
    expect(full.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify', 'commit', 'confirm']);
    expect(full.steps[5]!.tool).toBe('git.log');
    expect(full.steps[5]!.args).toEqual({ count: 2 });
    // confirm without commit is reading history nobody wrote — the nesting refuses it
    const noCommit = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: true, hasConfirm: true });
    expect(noCommit.steps.map((s) => s.tool)).not.toContain('git.log');
    const noVerify = planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: false, hasCommit: true, hasConfirm: true });
    expect(noVerify.steps.map((s) => s.tool)).not.toContain('git.log');
    expect(planTask({ id: 't', goal: 'add widget docs' }, { hasVerify: true, hasCommit: true, hasConfirm: true })).toEqual(full);
  });

  it('v39: hasRemember trails memory.save ONLY after the confirmed commit — never earlier', () => {
    const fullOpts = { hasVerify: true, hasCommit: true, hasConfirm: true, hasRemember: true };
    const full = planTask({ id: 't', goal: 'add widget docs' }, fullOpts);
    expect(full.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify', 'commit', 'confirm', 'remember']);
    const remember = full.steps.at(-1)!;
    expect(remember.tool).toBe('memory.save');
    expect(remember.args.runId).toBe('t');
    expect(String(remember.args.query)).toBe('add widget docs');
    expect(String(remember.args.summary)).toContain('COMMITTED+CONFIRMED');
    expect(String(remember.args.summary)).toContain(`seed ${full.seed}`);
    expect(remember.args.refs).toEqual(['@search.hits.0.path']); // resolved from the LIVE search at invoke time
    expect(planTask({ id: 't', goal: 'add widget docs', targetPath: 'docs/a.md' }, fullOpts).steps.at(-1)!.args.refs).toEqual(['docs/a.md']);
    // the nesting: pull ANY earlier tier and the remember step vanishes with it
    for (const opts of [
      { hasVerify: true, hasCommit: true, hasRemember: true }, // no confirm tier
      { hasVerify: true, hasRemember: true }, // no commit tier
      { hasRemember: true }, // no verify → nothing green to remember
    ]) {
      expect(planTask({ id: 't', goal: 'add widget docs' }, opts).steps.map((s) => s.tool)).not.toContain('memory.save');
    }
    expect(planTask({ id: 't', goal: 'add widget docs' }, fullOpts)).toEqual(full);
  });

  it('v44: hasContent trails a git.show inspect after the CONFIRM — and NEVER without one', () => {
    const fullOpts = { hasVerify: true, hasCommit: true, hasConfirm: true, hasContent: true };
    const full = planTask({ id: 't', goal: 'add widget docs' }, fullOpts);
    expect(full.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify', 'commit', 'confirm', 'inspect']);
    const inspect = full.steps.at(-1)!;
    expect(inspect.tool).toBe('git.show');
    expect(inspect.args).toEqual({ path: '@search.hits.0.path' }); // the SAME live ref read/annotate use
    expect(planTask({ id: 't', goal: 'add widget docs', targetPath: 'docs/a.md' }, fullOpts).steps.at(-1)!.args).toEqual({ path: 'docs/a.md' });
    // the nesting: content is only ever inspected behind a commit AND its hash confirm
    for (const opts of [
      { hasVerify: true, hasCommit: true, hasContent: true }, // no confirm tier
      { hasVerify: true, hasContent: true }, // no commit tier
      { hasContent: true }, // no verify → nothing green to read back
    ]) {
      expect(planTask({ id: 't', goal: 'add widget docs' }, opts).steps.map((s) => s.tool)).not.toContain('git.show');
    }
    // remember stays the TAIL: with both flags the order is confirm→inspect→remember
    const both = planTask({ id: 't', goal: 'add widget docs' }, { ...fullOpts, hasRemember: true });
    expect(both.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify', 'commit', 'confirm', 'inspect', 'remember']);
    expect(planTask({ id: 't', goal: 'add widget docs' }, fullOpts)).toEqual(full);
  });
});

describe('orchestrator: golden path', () => {
  it('plan → act → observe → verify completes with demo provenance', async () => {
    const h = harness(noteTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.provenance).toEqual({ mode: 'demo', runtime: 'nexus-agent-runtime', version: '0.1.0' });
    expect(out.results.every((r) => r.ok)).toBe(true);
    // @ref dataflow resolved the read target from the live search hit
    expect(out.results[1].callId).toBe('t1:read');
    const readCall = out.plan.steps[1]!.args.path;
    expect(readCall).toBe('@search.hits.0.path');
    expect(h.ws.read('docs/a.md')).toContain(`NOTE (DEMO MODE · agent t1 · seed ${out.plan.seed})`);
    expect(out.events.map((e) => e.type)).toEqual([
      'plan',
      'step_start', 'step_result', // search
      'step_start', 'step_result', // read
      'step_start', 'step_result', // annotate
      'step_start', 'step_result', // verify
      'verify',
      'done',
    ]);
  });
});

describe('orchestrator: gates and failures are honest', () => {
  it('without a checkpoint the write step is denied and the file stays untouched', async () => {
    const h = harness(noteTest, undefined);
    const out = await runTask(h.task, { registry: h.registry });
    expect(out.status).toBe('denied');
    expect(h.ws.read('docs/a.md')).toBe(SEED_DOC);
    expect(out.events.some((e) => e.type === 'checkpoint' && !e.granted)).toBe(true);
  });
  it('a failing verify gets bounded auto-fix rounds and can pass', async () => {
    const fixTest = (ws: InMemoryWorkspace) => ({ ok: ws.read('docs/a.md').includes('FIX'), detail: 'needs a FIX line' });
    const h = harness(fixTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.plan.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify', 'fix-1', 'verify-2']);
    expect(h.ws.read('docs/a.md')).toContain('FIX (DEMO MODE · attempt 1)');
    expect(out.events.filter((e) => e.type === 'verify')).toHaveLength(2);
  });
  it('persistent verification failure ends failed_verification after maxFixRounds', async () => {
    const h = harness(() => ({ ok: false, detail: 'never passes' }));
    const out = await runTask(h.task, { registry: h.registry, checkpoint: h.checkpoint, maxFixRounds: 1 });
    expect(out.status).toBe('failed_verification');
    expect(out.results).toHaveLength(6); // search read annotate verify fix-1 verify-2
  });
  it('the step budget stops the loop honestly', async () => {
    const h = harness(noteTest);
    const out = await runTask(h.task, { registry: h.registry, checkpoint: h.checkpoint, maxSteps: 3 });
    expect(out.status).toBe('budget_exhausted');
    expect(out.events.at(-2)).toMatchObject({ type: 'budget_exhausted', stepsUsed: 3 });
  });

  it('plans the research step through fs.index when it is registered', async () => {
    const ws = new InMemoryWorkspace({ 'docs/a.md': SEED_DOC });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => noteTest(ws));
    const out = await runTask({ id: 't2', goal: 'add widget docs' }, { registry, checkpoint: () => true });
    expect(out.plan.steps[0]!.tool).toBe('fs.index');
    expect(out.status).toBe('completed');
    expect((out.results[0]!.output as { hits: { path: string }[] }).hits[0]!.path).toBe('docs/a.md');
    expect(ws.read('docs/a.md')).toContain('NOTE (DEMO MODE');
  });

  it('prefers memory.recall over fs.index when memory is warm', async () => {
    const ws = new InMemoryWorkspace({ 'docs/a.md': SEED_DOC });
    const store = new MemoryStore();
    store.save({
      scope: 'demo',
      runId: 'r0',
      query: 'widget docs',
      summary: 'previous run: widget docs live in docs/a.md',
      refs: [{ path: 'docs/a.md', startLine: 1 }],
    });
    const registry = registerMemoryTools(
      registerWorkspaceTools(new ToolRegistry(), ws),
      store,
      'demo',
    );
    registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => noteTest(ws));
    const out = await runTask({ id: 't3', goal: 'add widget docs' }, { registry, checkpoint: () => true });
    expect(out.plan.steps[0]!.tool).toBe('memory.recall');
    expect(out.status).toBe('completed');
    expect((out.results[0]!.output as { hits: { path: string }[] }).hits[0]!.path).toBe('docs/a.md');
    expect(ws.read('docs/a.md')).toContain('NOTE (DEMO MODE');
  });

  it('attaches an observed changeSet when the host supplies a snapshot hook', async () => {
    const h = harness(noteTest);
    const out = await runTask(h.task, { registry: h.registry, checkpoint: h.checkpoint, snapshot: () => h.ws.snapshot() });
    expect(out.status).toBe('completed');
    expect(out.changeSet).toBeDefined();
    expect(out.changeSet!.runId).toBe('t1');
    expect(out.changeSet!.files.map((f) => f.path)).toEqual(['docs/a.md']);
    expect(out.changeSet!.files[0]!.removed).toBe(0);
    expect(out.changeSet!.files[0]!.added).toBeGreaterThan(0);
    const outNoSnap = await runTask(h.task, { registry: h.registry, checkpoint: h.checkpoint });
    expect(outNoSnap.changeSet).toBeUndefined();
  });
});

describe('orchestrator: commit after green (v36)', () => {
  function commitHarness(testImpl: (ws: InMemoryWorkspace) => unknown, checkpoint: Checkpoint | undefined = () => true) {
    const h = harness(testImpl, checkpoint);
    const commits: string[] = [];
    h.registry.register(
      { name: 'git.commit', description: 'fake commit tool', permissions: ['exec'], args: [{ name: 'message', type: 'string' }] },
      (args) => {
        commits.push(String(args.message));
        return { ok: true, detail: `fake commit ${commits.length}` };
      },
    );
    return { ...h, commits };
  }

  it('a green run reaches the commit step; the tool sees the planned message', async () => {
    const h = commitHarness(noteTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.plan.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify', 'commit']);
    expect(h.commits).toHaveLength(1);
    expect(h.commits[0]).toContain(`seed ${out.plan.seed}`);
    // the commit step went THROUGH the registry (exec → checkpoint asked with the real call)
    expect(out.results.at(-1)!.tool).toBe('git.commit');
    expect(out.results.at(-1)!.ok).toBe(true);
  });

  it('denied at the checkpoint: earlier annotated work stands, nothing commits, status denied', async () => {
    const h = commitHarness(noteTest, ({ call }) => call.tool !== 'git.commit');
    const out = await runTask(h.task, h);
    expect(out.status).toBe('denied');
    expect(h.commits).toHaveLength(0);
    expect(h.ws.read('docs/a.md')).toContain('NOTE (DEMO'); // the run's earlier steps already landed
    expect(out.events.some((e) => e.type === 'checkpoint' && e.tool === 'git.commit' && !e.granted)).toBe(true);
  });

  it('green AFTER a fix round still commits — and fix steps never run twice', async () => {
    const fixTest = (ws: InMemoryWorkspace) => ({ ok: ws.read('docs/a.md').includes('FIX'), detail: 'needs a FIX line' });
    const h = commitHarness(fixTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    // fix steps are APPENDED to the plan after commit (history of what happened);
    // what matters is the EXECUTION order — commit runs only once the re-verify is green
    expect(out.results.map((r) => r.callId)).toEqual(['t1:search', 't1:read', 't1:annotate', 't1:verify', 't1:fix-1', 't1:verify-2', 't1:commit']);
    expect(h.commits).toHaveLength(1);
    // each fix-round step invoked exactly once despite the loop revisiting the plan array
    const callIds = out.results.map((r) => r.callId);
    expect(callIds.filter((c) => c === 't1:fix-1')).toHaveLength(1);
    expect(callIds.filter((c) => c === 't1:verify-2')).toHaveLength(1);
    expect(callIds.filter((c) => c === 't1:verify')).toHaveLength(1);
  });

  it('a run that never verifies green NEVER commits', async () => {
    const h = commitHarness(() => ({ ok: false, detail: 'never passes' }));
    const out = await runTask(h.task, { registry: h.registry, checkpoint: h.checkpoint, maxFixRounds: 1 });
    expect(out.status).toBe('failed_verification');
    expect(h.commits).toHaveLength(0);
    expect(out.results.at(-1)!.tool).toBe('test.run');
  });

  it('a failing commit (impl throws) is honest status, not a silent green', async () => {
    const h = harness(noteTest);
    h.registry.register(
      { name: 'git.commit', description: 'broken', permissions: ['exec'], args: [{ name: 'message', type: 'string' }] },
      () => {
        throw new Error('policy refused');
      },
    );
    const out = await runTask(h.task, h);
    expect(out.status).toBe('failed_verification');
    expect(out.results.at(-1)!.error).toContain('policy refused');
  });
});

describe('orchestrator: confirm after commit (v38)', () => {
  function confirmHarness(testImpl: (ws: InMemoryWorkspace) => unknown, checkpoint: Checkpoint | undefined = () => true) {
    const h = harness(testImpl, checkpoint);
    const actions: string[] = [];
    h.registry.register(
      { name: 'git.commit', description: 'fake commit tool', permissions: ['exec'], args: [{ name: 'message', type: 'string' }] },
      () => {
        actions.push('commit');
        return { ok: true, detail: 'fake commit landed' };
      },
    );
    h.registry.register(
      { name: 'git.log', description: 'fake read-back', permissions: ['exec'], args: [{ name: 'count', type: 'number' }] },
      (args) => {
        actions.push(`log:${args.count}`);
        return { ok: true, detail: 'fake log: newest entry matches the fake commit', commits: [{ hash: '0a1b2c3', subject: 'chore(agent): fake' }] };
      },
    );
    return { ...h, actions };
  }

  it('a green run now ends commit→confirm, in that order, reading back with the planned window', async () => {
    const h = confirmHarness(noteTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.plan.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify', 'commit', 'confirm']);
    expect(h.actions).toEqual(['commit', 'log:2']); // confirm ran AFTER the commit, never before
    expect(out.results.at(-1)!.tool).toBe('git.log');
    expect(out.results.at(-1)!.ok).toBe(true);
  });

  it('green AFTER a fix round still walks to commit and confirm — executed order is the contract', async () => {
    const fixTest = (ws: InMemoryWorkspace) => ({ ok: ws.read('docs/a.md').includes('FIX'), detail: 'needs a FIX line' });
    const h = confirmHarness(fixTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.results.map((r) => r.callId)).toEqual(['t1:search', 't1:read', 't1:annotate', 't1:verify', 't1:fix-1', 't1:verify-2', 't1:commit', 't1:confirm']);
    expect(h.actions).toEqual(['commit', 'log:2']);
  });

  it('a DENIED confirm after a landed commit: status denied, the commit result honestly STANDS', async () => {
    const h = confirmHarness(noteTest, ({ call }) => call.tool !== 'git.log');
    const out = await runTask(h.task, h);
    expect(out.status).toBe('denied');
    expect(h.actions).toEqual(['commit']); // the read-back never ran — but the commit already ran
    const commitResult = out.results.at(-2)!;
    expect(commitResult.tool).toBe('git.commit');
    expect(commitResult.ok).toBe(true);
    expect(out.results.at(-1)!.error).toContain('denied at checkpoint');
  });

  it('a throwing git.log is honest non-green — completed never rides on a broken read-back', async () => {
    const h = harness(noteTest);
    h.registry.register(
      { name: 'git.commit', description: 'fake', permissions: ['exec'], args: [{ name: 'message', type: 'string' }] },
      () => ({ ok: true, detail: 'fake commit landed' }),
    );
    h.registry.register(
      { name: 'git.log', description: 'broken', permissions: ['exec'], args: [{ name: 'count', type: 'number' }] },
      () => {
        throw new Error('policy refused');
      },
    );
    const out = await runTask(h.task, h);
    expect(out.status).toBe('failed_verification');
    expect(out.results.at(-1)!.error).toContain('policy refused');
  });
});

describe('orchestrator: remembered victory after confirm (v39)', () => {
  function rememberHarness(testImpl: (ws: InMemoryWorkspace) => unknown, checkpoint: Checkpoint | undefined = () => true) {
    const h = harness(testImpl, checkpoint);
    const saves: Record<string, unknown>[] = [];
    h.registry.register(
      { name: 'git.commit', description: 'fake commit tool', permissions: ['exec'], args: [{ name: 'message', type: 'string' }] },
      () => ({ ok: true, detail: 'fake commit landed', record: { hash: '0a1b2c3', subject: 'chore(agent): fake', stat: { files: 1 } } }),
    );
    h.registry.register(
      { name: 'git.log', description: 'fake read-back', permissions: ['exec'], args: [{ name: 'count', type: 'number' }] },
      () => ({ ok: true, detail: 'fake log agrees', commits: [{ hash: '0a1b2c3', subject: 'chore(agent): fake' }] }),
    );
    h.registry.register(
      {
        name: 'memory.save',
        description: 'fake §26 memory',
        permissions: ['write'],
        args: [
          { name: 'runId', type: 'string' },
          { name: 'query', type: 'string' },
          { name: 'summary', type: 'string' },
          { name: 'refs', type: 'string[]' },
        ],
      },
      (args) => {
        saves.push(args);
        return { id: `mem-${saves.length}` };
      },
    );
    return { ...h, saves };
  }

  it('a green run ends commit→confirm→remember, and memory.save got the LIVE search ref', async () => {
    const h = rememberHarness(noteTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.results.map((r) => r.callId)).toEqual(['t1:search', 't1:read', 't1:annotate', 't1:verify', 't1:commit', 't1:confirm', 't1:remember']);
    expect(h.saves).toHaveLength(1);
    const saved = h.saves[0]!;
    expect(saved.runId).toBe('t1');
    expect(String(saved.summary)).toContain('COMMITTED+CONFIRMED');
    // v39 resolveArgs extends @refs INSIDE array args: the planned ref became the live hit
    expect(saved.refs).toEqual(['docs/a.md']);
    expect(out.results.at(-1)!.ok).toBe(true);
  });

  it('green AFTER a fix round also remembers exactly once', async () => {
    const fixTest = (ws: InMemoryWorkspace) => ({ ok: ws.read('docs/a.md').includes('FIX'), detail: 'needs a FIX line' });
    const h = rememberHarness(fixTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.results.map((r) => r.callId).slice(-3)).toEqual(['t1:commit', 't1:confirm', 't1:remember']);
    expect(h.saves).toHaveLength(1);
    expect(out.results.filter((r) => r.callId === 't1:remember')).toHaveLength(1);
  });

  it('a DENIED confirm means nothing to remember — memory.save never runs', async () => {
    const h = rememberHarness(noteTest, ({ call }) => call.tool !== 'git.log');
    const out = await runTask(h.task, h);
    expect(out.status).toBe('denied');
    expect(out.results.at(-2)!.tool).toBe('git.commit');
    expect(out.results.at(-2)!.ok).toBe(true); // the landed commit still STANDS…
    expect(h.saves).toHaveLength(0); // …but an UNconfirmed arc never becomes a "victory"
    expect(out.results.at(-1)!.tool).toBe('git.log');
  });

  it('a DENIED remember: commit+confirm results stand, memory stays empty, status denied', async () => {
    const h = rememberHarness(noteTest, ({ call }) => call.tool !== 'memory.save');
    const out = await runTask(h.task, h);
    expect(out.status).toBe('denied');
    expect(h.saves).toHaveLength(0); // deny ⇒ the fake impl never ran
    expect(out.results.at(-2)!.tool).toBe('git.log');
    expect(out.results.at(-2)!.ok).toBe(true);
    expect(out.results.at(-1)!.error).toContain('denied at checkpoint');
  });

  it('a throwing memory.save is honest non-green — a claimed victory nobody stored never completes', async () => {
    const h = harness(noteTest);
    h.registry.register(
      { name: 'git.commit', description: 'fake', permissions: ['exec'], args: [{ name: 'message', type: 'string' }] },
      () => ({ ok: true, detail: 'fake commit landed' }),
    );
    h.registry.register(
      { name: 'git.log', description: 'fake', permissions: ['exec'], args: [{ name: 'count', type: 'number' }] },
      () => ({ ok: true, detail: 'fake log agrees' }),
    );
    h.registry.register(
      {
        name: 'memory.save',
        description: 'broken',
        permissions: ['write'],
        args: [
          { name: 'runId', type: 'string' },
          { name: 'query', type: 'string' },
          { name: 'summary', type: 'string' },
          { name: 'refs', type: 'string[]' },
        ],
      },
      () => {
        throw new Error('memory disk full');
      },
    );
    const out = await runTask(h.task, h);
    expect(out.status).toBe('failed_verification');
    expect(out.results.at(-1)!.error).toContain('memory disk full');
  });
});

describe('orchestrator: content confirmation after the hash confirm (v44)', () => {
  function inspectHarness(testImpl: (ws: InMemoryWorkspace) => unknown, checkpoint: Checkpoint | undefined = () => true) {
    const h = harness(testImpl, checkpoint);
    const actions: string[] = [];
    h.registry.register(
      { name: 'git.commit', description: 'fake commit tool', permissions: ['exec'], args: [{ name: 'message', type: 'string' }] },
      () => {
        actions.push('commit');
        return { ok: true, detail: 'fake commit landed' };
      },
    );
    h.registry.register(
      { name: 'git.log', description: 'fake read-back', permissions: ['exec'], args: [{ name: 'count', type: 'number' }] },
      () => {
        actions.push('log');
        return { ok: true, detail: 'fake log agrees' };
      },
    );
    h.registry.register(
      { name: 'git.show', description: 'fake content read-back', permissions: ['exec'], args: [{ name: 'path', type: 'string' }] },
      (args) => {
        actions.push(`show:${args.path}`);
        return { ok: true, detail: `fake show: HEAD changed ${args.path} · +3 −0`, addedLines: ['widget notes', 'line two', 'NOTE (DEMO MODE · seed 42)'] };
      },
    );
    return { ...h, actions };
  }

  it('a green run ends commit→confirm→inspect, and git.show got the LIVE search path', async () => {
    const h = inspectHarness(noteTest);
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.plan.steps.map((s) => s.stepId)).toEqual(['search', 'read', 'annotate', 'verify', 'commit', 'confirm', 'inspect']);
    expect(h.actions).toEqual(['commit', 'log', 'show:docs/a.md']); // the planned @ref became the live hit, AFTER the confirm
    const inspect = out.results.at(-1)!;
    expect(inspect.tool).toBe('git.show');
    expect((inspect.output as { addedLines: string[] }).addedLines).toHaveLength(3);
  });

  it('inspect sits BEFORE remember, and the memory text still claims only COMMITTED+CONFIRMED (§60: content lives in results, not in the claim)', async () => {
    const h = inspectHarness(noteTest);
    const saves: Record<string, unknown>[] = [];
    h.registry.register(
      {
        name: 'memory.save',
        description: 'fake §26 memory',
        permissions: ['write'],
        args: [
          { name: 'runId', type: 'string' },
          { name: 'query', type: 'string' },
          { name: 'summary', type: 'string' },
          { name: 'refs', type: 'string[]' },
        ],
      },
      (args) => {
        saves.push(args);
        return { id: `mem-${saves.length}` };
      },
    );
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    expect(out.results.map((r) => r.tool).slice(-3)).toEqual(['git.log', 'git.show', 'memory.save']);
    expect(String(saves[0]!.summary)).toContain('COMMITTED+CONFIRMED');
    expect(String(saves[0]!.summary)).not.toContain('CONTENT'); // no tier overclaims what the next tier only PROPOSED to read
  });

  it('a DENIED inspect after a landed+confirmed commit: status denied, both earlier results STAND, git.show never ran', async () => {
    const h = inspectHarness(noteTest, ({ call }) => call.tool !== 'git.show');
    const out = await runTask(h.task, h);
    expect(out.status).toBe('denied');
    expect(h.actions).toEqual(['commit', 'log']);
    expect(out.results.at(-2)!.tool).toBe('git.log');
    expect(out.results.at(-2)!.ok).toBe(true);
    expect(out.results.at(-1)!.error).toContain('denied at checkpoint');
  });

  it('git ANSWERING "HEAD touches nothing" is honest DATA — the walk continues, the run completes, the answer stands in results', async () => {
    const h = harness(noteTest);
    h.registry.register(
      { name: 'git.commit', description: 'fake', permissions: ['exec'], args: [{ name: 'message', type: 'string' }] },
      () => ({ ok: true, detail: 'fake commit landed' }),
    );
    h.registry.register(
      { name: 'git.log', description: 'fake', permissions: ['exec'], args: [{ name: 'count', type: 'number' }] },
      () => ({ ok: true, detail: 'fake log agrees' }),
    );
    h.registry.register(
      { name: 'git.show', description: 'fake honest-empty answer', permissions: ['exec'], args: [{ name: 'path', type: 'string' }] },
      () => ({ ok: true, detail: 'git.show → exit 0: HEAD touches nothing at docs/a.md (empty diff)', addedLines: [] }),
    );
    const out = await runTask(h.task, h);
    expect(out.status).toBe('completed');
    const inspect = out.results.at(-1)!;
    expect(inspect.ok).toBe(true); // the TOOL worked; the ANSWER was "nothing here" — a fact, not a failure
    expect((inspect.output as { addedLines: string[] }).addedLines).toEqual([]);
    expect(String((inspect.output as { detail: string }).detail)).toContain('touches nothing');
  });

  it('a throwing git.show is honest non-green — completed never rides on a broken content read', async () => {
    const h = harness(noteTest);
    h.registry.register(
      { name: 'git.commit', description: 'fake', permissions: ['exec'], args: [{ name: 'message', type: 'string' }] },
      () => ({ ok: true, detail: 'fake commit landed' }),
    );
    h.registry.register(
      { name: 'git.log', description: 'fake', permissions: ['exec'], args: [{ name: 'count', type: 'number' }] },
      () => ({ ok: true, detail: 'fake log agrees' }),
    );
    h.registry.register(
      { name: 'git.show', description: 'broken', permissions: ['exec'], args: [{ name: 'path', type: 'string' }] },
      () => {
        throw new Error('cwd refused');
      },
    );
    const out = await runTask(h.task, h);
    expect(out.status).toBe('failed_verification');
    expect(out.results.at(-1)!.error).toContain('cwd refused');
  });

  it('a run that never verifies green NEVER inspects', async () => {
    const h = inspectHarness(() => ({ ok: false, detail: 'never passes' }));
    const out = await runTask(h.task, { registry: h.registry, checkpoint: h.checkpoint, maxFixRounds: 1 });
    expect(out.status).toBe('failed_verification');
    expect(h.actions).toEqual([]); // no commit, no confirm, no show — the tail is unreachable from red
  });
});

describe('runTask drives the UI plan (v20)', () => {
  const PAGE = [
    { kind: 'input', label: 'analytics dashboard' },
    { kind: 'button', label: 'Compose' },
  ];
  function driver() {
    const calls = [];
    const reg = registerUiTools(new ToolRegistry(), { elements: () => PAGE, click: (i) => { calls.push(`click:${PAGE[i].label}`); return calls.join('|'); }, type: (i, t) => { calls.push(`type:${PAGE[i].label}=${t}`); return calls.join('|'); } });
    return { reg, calls };
  }
  it('plans observe→type→click and executes with per-step checkpoints', async () => {
    const { reg, calls } = driver();
    const asked = [];
    const out = await runTask({ id: 'ui-1', goal: 'an analytics dashboard' }, {
      registry: reg,
      checkpoint: async ({ call }) => { asked.push(call.tool); return call.tool !== 'ui.click' || true; },
      uiInputLabel: 'analytics dashboard',
      uiButtonLabel: 'Compose',
    });
    expect(out.status).toBe('completed');
    expect(out.plan.steps.map((s) => s.tool)).toEqual(['ui.observe', 'ui.type', 'ui.click']);
    expect(calls).toEqual(['type:analytics dashboard=an analytics dashboard', 'click:Compose']);
    expect(asked).toEqual(['ui.type', 'ui.click']);
    expect(out.planner).toEqual({ backend: 'demo' });
  });

  it('with a state-reporting driver, the plan gains a host-verified verify step', async () => {
    const PAGE = [{ kind: 'input' as const, label: 'prompt' }, { kind: 'button' as const, label: 'Go' }];
    let layers = 0;
    const reg = registerUiTools(new ToolRegistry(), {
      elements: () => PAGE,
      click: () => { layers = 3; return 'clicked'; },
      type: (_i, t) => `typed:${t}`,
      layerCount: () => layers,
    });
    reg.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({ ok: layers > 0, detail: `layers=${layers}` }));
    const out = await runTask({ id: 'ui-v', goal: 'g' }, { registry: reg, checkpoint: () => true, uiInputLabel: 'prompt', uiButtonLabel: 'Go' });
    expect(out.status).toBe('completed');
    expect(out.plan.steps.map((s) => s.tool)).toEqual(['ui.observe', 'ui.type', 'ui.click', 'test.run']);
    expect(out.events.some((e) => e.type === 'verify' && e.ok)).toBe(true);
  });

  it('denied click stops the loop honestly: earlier actions stand, status denied', async () => {
    const { reg, calls } = driver();
    const out = await runTask({ id: 'ui-2', goal: 'g' }, { registry: reg, checkpoint: ({ call }) => call.tool !== 'ui.click', uiInputLabel: 'analytics dashboard', uiButtonLabel: 'Compose' });
    expect(out.status).toBe('denied');
    expect(calls).toEqual(['type:analytics dashboard=g']);
    expect(out.results.at(-1)!.error).toContain('denied at checkpoint');
  });
});
