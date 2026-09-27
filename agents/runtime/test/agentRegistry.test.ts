import { describe, expect, it } from 'vitest';
import { AgentRegistry, createDefaultAgents, type AgentDefinition, type HandoffPayload } from '../src/agentRegistry.js';
import { ToolRegistry } from '../src/registry.js';
import { MemoryStore } from '../src/memory.js';
import type { FsWriteLike } from '../src/durability.js';

/**
 * v91/v108 — the §24 roster as data, and the one rule that keeps it honest: an agent's own
 * `allowedTools` IS the grant, and every other view of it is projected FROM the agent.
 *
 * The regression this suite exists for is named in the source: the first draft kept a second
 * table (`RoleRegistry` pre-filled with `DEMO_ROLES`) and registering the default agents threw
 * `role already registered`, because `qa`/`editor`/`researcher`/… are ids `DEMO_ROLES` already
 * owns. Two tables of the same grant is one table too many.
 */

function tools() {
  return new ToolRegistry()
    .register({ name: 'fs.read', description: '', permissions: ['read'], args: [] }, () => 'read')
    .register({ name: 'fs.list', description: '', permissions: ['read'], args: [] }, () => 'list')
    .register({ name: 'fs.write', description: '', permissions: ['write'], args: [] }, () => 'write')
    .register({ name: 'fs.append', description: '', permissions: ['write'], args: [] }, () => 'append')
    .register({ name: 'test.run', description: '', permissions: ['exec'], args: [] }, () => 'ran')
    .register({ name: 'memory.recall', description: '', permissions: ['read'], args: [] }, () => 'recall');
}

function registry(overrides: Partial<ConstructorParameters<typeof AgentRegistry>[0]> = {}) {
  return new AgentRegistry({ toolRegistry: tools(), memoryStore: new MemoryStore(), ...overrides });
}

const agent = (id: string, allowedTools: string[]): AgentDefinition => ({
  id,
  name: id.toUpperCase(),
  description: `${id} agent`,
  capabilities: [{ name: 'cap', description: 'a capability', tools: allowedTools }],
  allowedTools,
});

describe('AgentRegistry — registration', () => {
  it('registers, reads back and refuses a duplicate id', () => {
    const r = registry();
    expect(r.registerAgent(agent('writer', ['fs.write']))).toBe(r); // chainable
    expect(r.hasAgent('writer')).toBe(true);
    expect(r.getAgent('writer')?.name).toBe('WRITER');
    expect(() => r.registerAgent(agent('writer', ['fs.read']))).toThrow(/already registered/);
  });

  it('lists agents in id order regardless of registration order', () => {
    const r = registry().registerAgent(agent('zeta', [])).registerAgent(agent('alpha', [])).registerAgent(agent('mid', []));
    expect(r.listAgents().map((a) => a.id)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('registers every default agent without a collision (the v91 defect)', () => {
    // The whole roster must coexist. The first draft threw here because it also fed these ids into
    // a DEMO_ROLES-backed second table that already owned them.
    const r = registry();
    for (const def of createDefaultAgents()) r.registerAgent(def);
    const ids = r.listAgents().map((a) => a.id);
    expect(ids).toEqual(['archivist', 'coder', 'designer', 'devops', 'editor', 'qa', 'researcher', 'reviewer']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every default agent states at least one allowed tool', () => {
    // An agent with no grant is an agent that can do nothing, which is a roster entry nobody meant.
    for (const def of createDefaultAgents()) {
      expect(def.allowedTools.length, `${def.id} has no allowedTools`).toBeGreaterThan(0);
      expect(def.capabilities.length, `${def.id} has no capabilities`).toBeGreaterThan(0);
    }
  });
});

describe('AgentRegistry — the grant is projected, never duplicated', () => {
  it('scopes the tool registry to exactly the agent’s allowedTools', () => {
    const r = registry().registerAgent(agent('reader', ['fs.read', 'fs.list']));
    const scoped = r.getScopedRegistry('reader');
    expect(scoped.get('fs.read')).toBeDefined();
    expect(scoped.get('fs.list')).toBeDefined();
    expect(scoped.get('fs.write')).toBeUndefined(); // registered globally, absent from THIS scope
    expect(scoped.get('memory.recall')).toBeUndefined();
  });

  it('honours a trailing-glob grant (fs.*)', () => {
    const r = registry().registerAgent(agent('writer', ['fs.*']));
    const scoped = r.getScopedRegistry('writer');
    expect(scoped.get('fs.read')).toBeDefined();
    expect(scoped.get('fs.write')).toBeDefined();
    expect(scoped.get('test.run')).toBeUndefined(); // a glob is not a blanket
  });

  it('an unknown agent gets an EMPTY scope, not the full registry', () => {
    const r = registry();
    const scoped = r.getScopedRegistry('nobody');
    expect(scoped.list()).toEqual([]);
    // and it is a different registry, so scoping never leaks into the shared one
    expect(r.getScopedRegistry('nobody')).not.toBe(r.getScopedRegistry('nobody'));
  });

  it('roleFor derives the §24 role FROM the agent, as a copy', () => {
    const def = agent('writer', ['fs.write']);
    const r = registry().registerAgent(def);
    const role = r.roleFor('writer')!;
    expect(role).toEqual({ id: 'writer', name: 'WRITER', description: 'writer agent', allowedTools: ['fs.write'] });
    // A copy: mutating the derived role may not edit the registration it came from.
    role.allowedTools.push('test.run');
    expect(r.getAgent('writer')!.allowedTools).toEqual(['fs.write']);
  });

  it('roleFor is null for an unknown agent', () => {
    expect(registry().roleFor('ghost')).toBeNull();
  });

  it('getAvailableCapabilities returns the agent’s own list, and [] for nobody', () => {
    const r = registry().registerAgent(agent('writer', ['fs.write']));
    expect(r.getAvailableCapabilities('writer').map((c) => c.name)).toEqual(['cap']);
    expect(r.getAvailableCapabilities('ghost')).toEqual([]);
  });
});

describe('AgentRegistry — handoffs', () => {
  const payload = (over: Partial<HandoffPayload> = {}): HandoffPayload => ({
    from: 'researcher',
    to: 'editor',
    goal: 'ship the widget docs',
    summary: 'findings attached',
    refs: [],
    timestamp: 1,
    runId: 'run-1',
    ...over,
  });

  it('refuses a handoff naming an agent that was never registered', async () => {
    const r = registry().registerAgent(agent('researcher', ['fs.read']));
    await expect(r.handoff(payload())).rejects.toThrow(/agent not found in handoff/);
  });

  it('records the handoff AND writes it into §26 memory under a run-scoped key', async () => {
    const memoryStore = new MemoryStore();
    const r = new AgentRegistry({ toolRegistry: tools(), memoryStore })
      .registerAgent(agent('researcher', ['fs.read']))
      .registerAgent(agent('editor', ['fs.write']));

    await r.handoff(payload());

    expect(r.getHandoffs()).toHaveLength(1);
    const saved = memoryStore.list('handoff:run-1');
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      scope: 'handoff:run-1',
      runId: 'run-1',
      query: 'ship the widget docs',
      summary: 'researcher -> editor: findings attached',
    });
  });

  it('filters handoffs by run id, and returns all when asked for none', async () => {
    const r = registry()
      .registerAgent(agent('a', []))
      .registerAgent(agent('b', []))
      .registerAgent(agent('c', []));
    await r.handoff(payload({ from: 'a', to: 'b', runId: 'run-1' }));
    await r.handoff(payload({ from: 'b', to: 'c', runId: 'run-2' }));
    expect(r.getHandoffs('run-1')).toHaveLength(1);
    expect(r.getHandoffs('run-2')).toHaveLength(1);
    expect(r.getHandoffs('run-3')).toEqual([]);
    expect(r.getHandoffs()).toHaveLength(2);
  });

  it('createHandoff stamps a payload without touching the registry', () => {
    const r = registry();
    const built = r.createHandoff('a', 'b', 'goal', 'summary', [], 'run-9', { note: 'x' });
    expect(built).toMatchObject({ from: 'a', to: 'b', goal: 'goal', runId: 'run-9', artifacts: { note: 'x' } });
    expect(built.timestamp).toBeGreaterThan(0);
    expect(r.getHandoffs()).toEqual([]); // built, not recorded — the two are different acts
  });
});

describe('AgentRegistry — durable handoff journal', () => {
  function fakeFs() {
    const files = new Map<string, string>();
    const dirs: string[] = [];
    const fsLike: FsWriteLike = {
      mkdirSync: (p: string) => {
        dirs.push(p);
      },
      writeFileSync: (p: string, data: string) => {
        files.set(p, data);
      },
    } as unknown as FsWriteLike;
    return { fsLike, files, dirs };
  }

  it('persists the journal only when BOTH an fs and a path were supplied', async () => {
    const { fsLike, files, dirs } = fakeFs();
    const r = new AgentRegistry({
      toolRegistry: tools(),
      memoryStore: new MemoryStore(),
      fsLike,
      handoffFile: 'out/run/handoffs.json',
    })
      .registerAgent(agent('a', []))
      .registerAgent(agent('b', []));

    await r.handoff({ from: 'a', to: 'b', goal: 'g', summary: 's', refs: [], timestamp: 1, runId: 'r' });

    expect(dirs).toEqual(['out/run']); // the parent directory was created first
    const written = JSON.parse(files.get('out/run/handoffs.json')!);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ from: 'a', to: 'b', runId: 'r' });
  });

  it('a registry with no fs still records in memory (persistence is opt-in, not required)', async () => {
    const r = registry().registerAgent(agent('a', [])).registerAgent(agent('b', []));
    await r.handoff({ from: 'a', to: 'b', goal: 'g', summary: 's', refs: [], timestamp: 1, runId: 'r' });
    expect(r.getHandoffs()).toHaveLength(1);
  });

  it('a bare filename needs no directory to create', async () => {
    const { fsLike, dirs, files } = fakeFs();
    const r = new AgentRegistry({ toolRegistry: tools(), memoryStore: new MemoryStore(), fsLike, handoffFile: 'handoffs.json' })
      .registerAgent(agent('a', []))
      .registerAgent(agent('b', []));
    await r.handoff({ from: 'a', to: 'b', goal: 'g', summary: 's', refs: [], timestamp: 1, runId: 'r' });
    expect(dirs).toEqual([]);
    expect(files.has('handoffs.json')).toBe(true);
  });
});
