import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { MemoryStore, registerMemoryTools } from '../src/memory.js';
import { RoleRegistry, DEMO_ROLES } from '../src/roles.js';
import { runRolePipeline } from '../src/pipeline.js';
import { NO_RECEIPTS_NOTE, policyCheckpoint } from '../src/checkpointPolicy.js';
import { loadMemoryStore } from '../src/durability.js';
import { loadLedger } from '../src/ledger.js';
import { loadEvaluations } from '../src/evaluate.js';
import type { FsDirentLike } from '../src/realfs.js';

class MemDisk {
  files = new Map<string, string>();
  readdirSync(dir: string): FsDirentLike[] {
    return [...this.files.keys()]
      .filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
      .map((p) => ({ name: p.slice(dir.length + 1), isDirectory: () => false, isFile: () => true }));
  }
  statSync(p: string): { size: number } {
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return { size: c.length };
  }
  readFileSync(p: string): string {
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return c;
  }
  mkdirSync(): void {}
  writeFileSync(p: string, data: string): void {
    this.files.set(p, data);
  }
}

const SEED = { 'docs/widget.md': '# Widget\n\nwidget rotation notes\n', 'docs/x.md': '# X\n\nunrelated\n' };

function host() {
  const ws = new InMemoryWorkspace(SEED);
  const store = new MemoryStore();
  const registry = registerMemoryTools(registerWorkspaceTools(new ToolRegistry(), ws), store, 'pipeline');
  registry.register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
    ok: ws.read('docs/widget.md').includes('NOTE (DEMO MODE'),
    detail: 'annotated',
  }));
  const roles = new RoleRegistry();
  DEMO_ROLES.forEach((r) => roles.register(r));
  return { ws, store, registry, roles };
}

const task = { id: 'pipe-1', goal: 'annotate widget rotation docs' };

describe('runRolePipeline (§25 handoff as data)', () => {
  it('researcher refs hand off to an editor run that completes with score 1', async () => {
    const h = host();
    const res = await runRolePipeline(task, { roles: h.roles, registry: h.registry, store: h.store, checkpoint: () => true, snapshot: () => h.ws.snapshot() });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.handoff.via).toBe('fs.index');
    expect(res.handoff.refs[0]!.path).toBe('docs/widget.md');
    expect(res.editorOutcome.status).toBe('completed');
    expect(res.editorOutcome.plan.steps[0]!.tool).toBe('memory.recall'); // editor researchs from the handoff, not the index
    expect(res.evaluation.score).toBe(1);
    expect(h.store.list('pipeline')).toHaveLength(1);
  });

  it('without a checkpoint the editor stage is denied — handoff still real', async () => {
    const h = host();
    const res = await runRolePipeline(task, { roles: h.roles, registry: h.registry, store: h.store, checkpoint: () => false });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.editorOutcome.status).toBe('denied');
    expect(res.handoff.refs.length).toBeGreaterThan(0);
    expect(res.evaluation.score).toBeLessThan(1);
  });

  it('durable mode: memory + ledger + evaluations files written through the injected fs, reload proves survival', async () => {
    const disk = new MemDisk();
    const h = host();
    const res = await runRolePipeline(task, {
      roles: h.roles, registry: h.registry, store: h.store, checkpoint: () => true, fsLike: disk,
      memoryFile: 'state/mem.json', ledgerFile: 'state/ledger.jsonl', evaluationFile: 'state/eval.jsonl',
    });
    expect(res.ok).toBe(true);
    expect(disk.files.get('state/mem.json')).toContain('"schemaVersion": 1');
    const cold = new MemoryStore();
    const loaded = loadMemoryStore(cold, disk, 'state/mem.json');
    expect(loaded.ok).toBe(true);
    expect(cold.recall('annotate widget rotation docs')[0]!.path).toBe('docs/widget.md');
    expect(loadLedger(disk, 'state/ledger.jsonl').runs[0]!.task.id).toBe('pipe-1');
    expect(loadEvaluations(disk, 'state/eval.jsonl').ok).toBe(true);
  });

  it('a researcher without research tools fails with a reason, never invents refs', async () => {
    const h = host();
    const empty = new RoleRegistry();
    empty.register({ id: 'researcher', name: 'r', description: '', allowedTools: ['fs.read'] });
    DEMO_ROLES.filter((r) => r.id !== 'researcher').forEach((r) => empty.register(r));
    const res = await runRolePipeline(task, { roles: empty, registry: h.registry, store: h.store, checkpoint: () => true });
    expect(res).toEqual({ ok: false, reason: 'researcher role has no research tool (fs.index/fs.search absent)' });
  });

  it('two identical pipelines are deterministic in every observable', async () => {
    const a = await runRolePipeline(task, { ...hostShim(await host()) });
    const b = await runRolePipeline(task, { ...hostShim(await host()) });
    expect(JSON.stringify(b)).toEqual(JSON.stringify(a));
  });
});

function hostShim(h: ReturnType<typeof host>) {
  return { roles: h.roles, registry: h.registry, store: h.store, checkpoint: () => true };
}

/* ---- v54: the two-role face gets the same durable answer the chain learned in v50 ---- */

describe('runRolePipeline run-line receipts (v54)', () => {
  const policy = () =>
    policyCheckpoint({
      rules: [
        { tool: 'fs.*', grant: true, reason: 'the demo workspace is open to every stage' },
        { tool: 'memory.*', grant: true, reason: 'recall is not a write' },
        { tool: 'test.run', grant: true, reason: 'verification is always welcome' },
      ],
      default: { grant: false, reason: 'unlisted tools are refused' },
    });

  it('the durable run line names the rule behind each of its own two gates', async () => {
    const disk = new MemDisk();
    const h = host();
    const res = await runRolePipeline(task, { roles: h.roles, registry: h.registry, store: h.store, checkpoint: policy(), fsLike: disk, ledgerFile: 'state/ledger.jsonl' });
    expect(res.ok).toBe(true);
    // `PipelineResult` is a union; the green branch is narrowed rather than read optimistically (v213).
    if (!res.ok) throw new Error(`expected a green pipeline, got: ${res.reason}`);
    const read = loadLedger(disk, 'state/ledger.jsonl');
    expect(read.malformed).toBe(0);
    expect(read.runs[0]).toEqual(res.editorOutcome); // the line in the file IS the outcome handed back
    expect(read.runs[0]!.decisions!.map((d) => [d.call.callId, d.call.tool, d.granted, d.matched])).toEqual([
      ['pipe-1:annotate', 'fs.append', true, 'fs.*'],
      ['pipe-1:verify', 'test.run', true, 'test.run'],
    ]);
    // fs.index and memory.recall are read-permission: §28 never spoke for them, so nothing is claimed.
    expect(read.runs[0]!.results.length).toBeGreaterThan(read.runs[0]!.decisions!.length);
  });

  it('a bare closure answers for nothing on a stored line, and says so in the same sentence the arc uses', async () => {
    const disk = new MemDisk();
    const h = host();
    await runRolePipeline(task, { roles: h.roles, registry: h.registry, store: h.store, checkpoint: () => true, fsLike: disk, ledgerFile: 'state/ledger.jsonl' });
    const run = loadLedger(disk, 'state/ledger.jsonl').runs[0]!;
    expect(run.decisions).toEqual([]);
    expect(run.decisionsNote).toBe(NO_RECEIPTS_NOTE);
  });

  it('an in-memory pipeline — the dock\'s face — carries neither field', async () => {
    const h = host();
    const res = await runRolePipeline(task, { roles: h.roles, registry: h.registry, store: h.store, checkpoint: policy() });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('decisions' in res.editorOutcome).toBe(false);
    expect('decisionsNote' in res.editorOutcome).toBe(false);
  });
});
