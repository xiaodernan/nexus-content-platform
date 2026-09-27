import { describe, expect, it } from 'vitest';
import { AgentRegistry, createDefaultAgents, type AgentDefinition } from '../src/agentRegistry.js';
import { runMultiAgentPipeline } from '../src/multiAgentPipeline.js';
import { ToolRegistry } from '../src/registry.js';
import { InMemoryWorkspace, registerWorkspaceTools } from '../src/workspace.js';
import { MemoryStore } from '../src/memory.js';
import { loadLedger } from '../src/ledger.js';
import type { FsWriteLike } from '../src/durability.js';

/**
 * v91/v108 — the multi-agent §25 walk, and the two defects its own header names.
 *
 * The first draft ran the chain's LAST agent twice (once as the receiver of the final edge, once
 * again in a post-loop "final stage" block) and filed that final run under the name of the PREVIOUS
 * agent — so a record naming `researcher` carried a run `archivist` produced. Both are asserted
 * against here: the chain is ONE walk over the edges, and every stage names the agent that ran it.
 *
 * The second defect is one line further in: the two research doors take DIFFERENT arguments
 * (`fs.index` {query}, `fs.search` {term}), and the first draft always sent `query` — so an agent
 * holding only `fs.search` could never research, and the failure read as a research failure rather
 * than as the wrong request.
 */

const SEED = {
  'docs/widget.md': '# Widget\n\nwidget rotation notes\n',
  'docs/extra.md': '# Extra\n\nother widget stuff\n',
};

/** Records every research call so the ARGUMENTS can be asserted, not just the fact that one happened. */
function host() {
  const ws = new InMemoryWorkspace(SEED);
  const memoryStore = new MemoryStore();
  const researchCalls: { tool: string; args: Record<string, unknown> }[] = [];

  const base = registerWorkspaceTools(new ToolRegistry(), ws);
  // Re-register the two research doors as spies that return real hits from the workspace.
  const toolRegistry = new ToolRegistry()
    .register({ name: 'fs.index', description: '', permissions: ['read'], args: [{ name: 'query', type: 'string', required: true }] }, (a) => {
      researchCalls.push({ tool: 'fs.index', args: { ...a } });
      return { hits: [{ path: 'docs/widget.md', startLine: 1 }, { path: 'docs/extra.md', startLine: 1 }] };
    })
    .register({ name: 'fs.search', description: '', permissions: ['read'], args: [{ name: 'term', type: 'string', required: true }] }, (a) => {
      researchCalls.push({ tool: 'fs.search', args: { ...a } });
      return { hits: [{ path: 'docs/widget.md', startLine: 3 }] };
    })
    .register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => ({
      ok: ws.read('docs/widget.md').includes('NOTE (DEMO'),
      detail: 'annotation check',
    }));
  for (const spec of base.list()) {
    if (['fs.index', 'fs.search'].includes(spec.name)) continue; // the spies stand in for these
    const impl = (base as unknown as { tools: Map<string, { impl: unknown }> }).tools.get(spec.name)!.impl;
    toolRegistry.register(spec, impl as never);
  }

  const agentRegistry = new AgentRegistry({ toolRegistry, memoryStore });
  return { ws, memoryStore, toolRegistry, agentRegistry, researchCalls };
}

const agent = (id: string, allowedTools: string[]): AgentDefinition => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  description: `${id} agent`,
  capabilities: [],
  allowedTools,
});

const task = { id: 'ma-1', goal: 'widget rotation docs', targetPath: 'docs/widget.md' };

/** researcher holds ONLY fs.search (no fs.index) — the case the wrong-argument bug hid behind. */
function chain(extra: Partial<Parameters<typeof runMultiAgentPipeline>[2]> = {}) {
  const h = host();
  h.agentRegistry
    .registerAgent(agent('researcher', ['fs.search', 'fs.read']))
    .registerAgent(agent('editor', ['fs.*', 'test.run']))
    .registerAgent(agent('archivist', ['fs.search', 'memory.*']));
  return { ...h, opts: { agentRegistry: h.agentRegistry, memoryStore: h.memoryStore, checkpoint: () => true, ...extra } };
}

describe('runMultiAgentPipeline — refusals that name their reason', () => {
  it('refuses a chain shorter than two agents', async () => {
    const c = chain();
    const res = await runMultiAgentPipeline(task, ['researcher'], c.opts);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toMatch(/at least 2 agents/);
    expect(res.completedStages).toEqual([]);
  });

  it('refuses an unknown agent in the chain, reporting what already completed', async () => {
    const c = chain();
    const res = await runMultiAgentPipeline(task, ['researcher', 'ghost'], c.opts);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toMatch(/unknown agent in chain: ghost/);
  });

  it('refuses an agent with no research door, naming the doors it wanted', async () => {
    const h = host();
    h.agentRegistry.registerAgent(agent('blind', ['fs.read'])).registerAgent(agent('editor', ['fs.*', 'test.run']));
    const res = await runMultiAgentPipeline(task, ['blind', 'editor'], {
      agentRegistry: h.agentRegistry,
      memoryStore: h.memoryStore,
      checkpoint: () => true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toMatch(/no research door \(fs\.index \/ fs\.search\)/);
  });
});

describe('runMultiAgentPipeline — the walk', () => {
  it('walks the EDGES once each and names the agent that ran every stage', async () => {
    const c = chain();
    const res = await runMultiAgentPipeline(task, ['researcher', 'editor', 'archivist'], c.opts);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // 3 agents ⇒ 2 edges ⇒ 2 stages. The last agent runs once, not twice.
    expect(res.stages).toHaveLength(2);
    expect(res.stages.map((s) => `${s.from}->${s.to}`)).toEqual(['researcher->editor', 'editor->archivist']);
    expect(res.stages.map((s) => s.runner)).toEqual(['editor', 'archivist']);
    for (const stage of res.stages) {
      expect(stage.runner).toBe(stage.to); // the v91 rule: a record may not name the wrong agent
    }
    // `archivist` is the LAST agent and appears exactly once as a runner.
    expect(res.stages.filter((s) => s.runner === 'archivist')).toHaveLength(1);
  });

  it('sends fs.index {query} and fs.search {term} — each door its own argument', async () => {
    // researcher holds only fs.search, so the walk must reach for that door and use ITS argument.
    const c = chain();
    await runMultiAgentPipeline(task, ['researcher', 'editor'], c.opts);
    expect(c.researchCalls[0].tool).toBe('fs.search');
    expect(c.researchCalls[0].args).toEqual({ term: 'widget' }); // first word of the goal
    expect(c.researchCalls[0].args).not.toHaveProperty('query'); // the defect's shape
  });

  it('an fs.index-holding agent gets {query} instead', async () => {
    const h = host();
    h.agentRegistry.registerAgent(agent('indexer', ['fs.index'])).registerAgent(agent('editor', ['fs.*', 'test.run']));
    await runMultiAgentPipeline(task, ['indexer', 'editor'], {
      agentRegistry: h.agentRegistry,
      memoryStore: h.memoryStore,
      checkpoint: () => true,
    });
    expect(h.researchCalls[0]).toEqual({ tool: 'fs.index', args: { query: 'widget rotation docs' } });
  });

  it('carries refs forward, and says so, when an edge finds nothing', async () => {
    const h = host();
    // The door each edge researches through is forced by the AGENT'S OWN SCOPE, not by a call
    // counter — `researcher` holds only `fs.search` (which returns hits) and `empty` holds only
    // `fs.index` (which returns none). A counter would have been defeated by the `to` agent's own
    // planner research, which uses the same doors.
    const spy = new ToolRegistry()
      .register({ name: 'fs.search', description: '', permissions: ['read'], args: [{ name: 'term', type: 'string', required: true }] }, () => ({
        hits: [{ path: 'docs/widget.md' }],
      }))
      .register({ name: 'fs.index', description: '', permissions: ['read'], args: [{ name: 'query', type: 'string', required: true }] }, () => ({ hits: [] }));
    for (const spec of h.toolRegistry.list()) {
      if (['fs.search', 'fs.index'].includes(spec.name)) continue;
      const impl = (h.toolRegistry as unknown as { tools: Map<string, { impl: unknown }> }).tools.get(spec.name)!.impl;
      spy.register(spec, impl as never);
    }
    const reg = new AgentRegistry({ toolRegistry: spy, memoryStore: h.memoryStore });
    reg
      .registerAgent(agent('researcher', ['fs.search']))
      .registerAgent(agent('empty', ['fs.index']))
      .registerAgent(agent('editor', ['fs.*', 'test.run']));

    const res = await runMultiAgentPipeline(task, ['researcher', 'empty', 'editor'], {
      agentRegistry: reg,
      memoryStore: h.memoryStore,
      checkpoint: () => true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stages).toHaveLength(2);
    // Edge 1 found a ref; edge 2 found none and carried it forward, saying so.
    expect(res.stages[0].handoff.summary).toMatch(/Researcher found 1 ref\(s\) for Empty/);
    const second = res.stages[1];
    expect(second.handoff.summary).toMatch(/Empty found nothing; 1 ref\(s\) carried from the previous handoff to Editor/);
    expect(second.handoff.refs).toEqual([{ path: 'docs/widget.md' }]);
  });

  it('refuses when nothing was found and nothing was carried in', async () => {
    const h = host();
    const empty = new ToolRegistry().register(
      { name: 'fs.search', description: '', permissions: ['read'], args: [{ name: 'term', type: 'string', required: true }] },
      () => ({ hits: [] }),
    );
    const reg = new AgentRegistry({ toolRegistry: empty, memoryStore: h.memoryStore })
      .registerAgent(agent('researcher', ['fs.search']))
      .registerAgent(agent('editor', ['fs.*']));
    const res = await runMultiAgentPipeline(task, ['researcher', 'editor'], {
      agentRegistry: reg,
      memoryStore: h.memoryStore,
      checkpoint: () => true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toMatch(/found no refs and none were carried in/);
  });
});

describe('runMultiAgentPipeline — what it records', () => {
  it('journals one §26 record per edge under a task-scoped key', async () => {
    const c = chain();
    await runMultiAgentPipeline(task, ['researcher', 'editor', 'archivist'], c.opts);
    const records = c.memoryStore.list('multi-agent:ma-1');
    expect(records).toHaveLength(2);
    expect(records[0].summary).toMatch(/Researcher found 1 ref\(s\) for Editor/);
    expect(records[0].runId).toBe('ma-1');
  });

  it('writes the ledger and the evaluation when the host supplied files', async () => {
    const files = new Map<string, string>();
    const fsLike = {
      mkdirSync: () => {},
      writeFileSync: (p: string, data: string) => {
        files.set(p, data);
      },
      readFileSync: (p: string) => {
        const v = files.get(p);
        if (v === undefined) throw new Error(`ENOENT ${p}`);
        return v;
      },
    } as unknown as FsWriteLike;
    const c = chain({ fsLike, ledgerFile: 'out/ledger.jsonl', evaluationFile: 'out/eval.jsonl' });
    const res = await runMultiAgentPipeline(task, ['researcher', 'editor'], c.opts);
    expect(res.ok).toBe(true);
    expect(files.has('out/ledger.jsonl')).toBe(true);
    expect(files.has('out/eval.jsonl')).toBe(true);
    // The ledger really parses back, rather than merely having bytes written into it.
    const read = loadLedger(fsLike as unknown as { readFileSync(p: string, e: 'utf8'): string }, 'out/ledger.jsonl');
    expect(read.malformed).toBe(0);
    expect(read.runs.length).toBeGreaterThan(0);
  });

  it('returns the refs the LAST edge carried, so a caller need not re-derive them', async () => {
    const c = chain();
    const res = await runMultiAgentPipeline(task, ['researcher', 'editor'], c.opts);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.refs).toEqual([{ path: 'docs/widget.md', startLine: 3 }]);
    expect(res.provenance.mode).toBe('demo'); // DEMO MODE throughout (§60)
  });

  it('the default roster can actually be walked (every research-capable agent has a door)', async () => {
    const h = host();
    for (const def of createDefaultAgents()) h.agentRegistry.registerAgent(def);
    const res = await runMultiAgentPipeline(task, ['researcher', 'editor'], {
      agentRegistry: h.agentRegistry,
      memoryStore: h.memoryStore,
      checkpoint: () => true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.stages).toHaveLength(1);
    expect(res.stages[0].runner).toBe('editor');
  });
});
