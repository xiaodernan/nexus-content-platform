import { ToolRegistry } from './registry.js';
import type { RoleDefinition } from './roles.js';
import type { MemoryStore, MemoryRef } from './memory.js';
import type { FsWriteLike } from './durability.js';

export interface AgentCapability {
  name: string;
  description: string;
  tools: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  capabilities: AgentCapability[];
  allowedTools: string[];
  metadata?: Record<string, unknown>;
}

export interface HandoffPayload {
  from: string;
  to: string;
  goal: string;
  summary: string;
  refs: MemoryRef[];
  artifacts?: Record<string, unknown>;
  timestamp: number;
  runId: string;
}

export interface AgentRegistryOptions {
  toolRegistry: ToolRegistry;
  memoryStore: MemoryStore;
  fsLike?: FsWriteLike;
  handoffFile?: string;
}

export class AgentRegistry {
  private agents = new Map<string, AgentDefinition>();
  private toolRegistry: ToolRegistry;
  private memoryStore: MemoryStore;
  private fsLike?: FsWriteLike;
  private handoffFile?: string;
  private handoffs: HandoffPayload[] = [];

  constructor(opts: AgentRegistryOptions) {
    this.toolRegistry = opts.toolRegistry;
    this.memoryStore = opts.memoryStore;
    this.fsLike = opts.fsLike;
    this.handoffFile = opts.handoffFile;
  }

  /**
   * v91: the first draft ALSO kept a `RoleRegistry`, pre-filled with `DEMO_ROLES` and fed an
   * agent-shaped role on every registration. Two tables of the same grant is one table too
   * many, and the second one was already wrong: `qa`/`editor`/`researcher`/`designer`/
   * `archivist` are ids `DEMO_ROLES` owns, so registering the very agents `createDefaultAgents`
   * returns threw `role already registered`. The agent's own `allowedTools` is the grant, the
   * registry projects from it (`getScopedRegistry`), and `roleFor` derives a `RoleDefinition`
   * FROM the agent — so the two can no longer disagree.
   */
  registerAgent(def: AgentDefinition): this {
    if (this.agents.has(def.id)) throw new Error(`agent already registered: ${def.id}`);
    this.agents.set(def.id, def);
    return this;
  }

  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  listAgents(): AgentDefinition[] {
    return [...this.agents.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  hasAgent(id: string): boolean {
    return this.agents.has(id);
  }

  /** Unknown agent ⇒ empty scope (no capabilities exist for a name nobody registered). */
  getScopedRegistry(agentId: string): ToolRegistry {
    const agent = this.agents.get(agentId);
    if (!agent) return new ToolRegistry();
    return this.toolRegistry.scope(agent.allowedTools);
  }

  /** §24's projection, derived from the agent itself so a grant cannot drift from its licensee. */
  roleFor(agentId: string): RoleDefinition | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;
    return { id: agent.id, name: agent.name, description: agent.description, allowedTools: [...agent.allowedTools] };
  }

  async handoff(payload: HandoffPayload): Promise<void> {
    const fromAgent = this.agents.get(payload.from);
    const toAgent = this.agents.get(payload.to);
    if (!fromAgent || !toAgent) throw new Error(`agent not found in handoff: ${payload.from} -> ${payload.to}`);

    this.memoryStore.save({
      scope: `handoff:${payload.runId}`,
      runId: payload.runId,
      query: payload.goal,
      summary: `${payload.from} -> ${payload.to}: ${payload.summary}`,
      refs: payload.refs,
    });

    this.handoffs.push(payload);
    if (this.fsLike && this.handoffFile) {
      await this.persistHandoffs();
    }
  }

  private async persistHandoffs(): Promise<void> {
    if (!this.fsLike || !this.handoffFile) return;
    // v108 — this used to be `slice(0, lastIndexOf('/'))` with no guard, and `lastIndexOf` returns
    // -1 for a path with no separator, so `slice(0, -1)` silently STRIPPED THE LAST CHARACTER and the
    // registry created a directory named `handoffs.jso`. Both separators are honoured, and a path
    // with no directory component creates none.
    const sep = Math.max(this.handoffFile.lastIndexOf('/'), this.handoffFile.lastIndexOf('\\'));
    const dir = sep > 0 ? this.handoffFile.slice(0, sep) : '';
    if (dir) this.fsLike.mkdirSync(dir, { recursive: true });
    this.fsLike.writeFileSync(this.handoffFile, JSON.stringify(this.handoffs, null, 2), 'utf8');
  }

  getHandoffs(runId?: string): HandoffPayload[] {
    if (runId) return this.handoffs.filter((h) => h.runId === runId);
    return [...this.handoffs];
  }

  getAvailableCapabilities(agentId: string): AgentCapability[] {
    const agent = this.agents.get(agentId);
    if (!agent) return [];
    return agent.capabilities;
  }

  createHandoff(
    from: string,
    to: string,
    goal: string,
    summary: string,
    refs: MemoryRef[],
    runId: string,
    artifacts?: Record<string, unknown>
  ): HandoffPayload {
    return { from, to, goal, summary, refs, artifacts, timestamp: Date.now(), runId };
  }
}

/**
 * The §24 roster, as data. v91: the parameter this used to take (`toolRegistry`) was never read —
 * a dead argument promises a scoping that does not happen — so it is gone.
 */
export function createDefaultAgents(): AgentDefinition[] {
  return [
    {
      id: 'researcher',
      name: 'Researcher',
      description: 'Read-only discovery: index/search + memory recall and inspection.',
      capabilities: [
        { name: 'code-search', description: 'Search codebase via index or grep', tools: ['fs.index', 'fs.search'] },
        { name: 'memory-recall', description: 'Recall prior findings from memory', tools: ['memory.recall'] },
        { name: 'file-read', description: 'Read file contents', tools: ['fs.read'] },
      ],
      allowedTools: ['fs.list', 'fs.read', 'fs.search', 'fs.index', 'memory.recall', 'memory.list'],
    },
    {
      id: 'designer',
      name: 'Designer',
      description: 'Research plus design-brief annotation (write-class, checkpoint-gated).',
      capabilities: [
        { name: 'code-search', description: 'Search codebase via index or grep', tools: ['fs.index', 'fs.search'] },
        { name: 'design-brief', description: 'Write design briefs to files', tools: ['fs.append'] },
        { name: 'memory-recall', description: 'Recall prior findings from memory', tools: ['memory.recall'] },
      ],
      allowedTools: ['fs.list', 'fs.read', 'fs.search', 'fs.index', 'fs.append', 'memory.recall', 'memory.list'],
    },
    {
      id: 'qa',
      name: 'QA Engineer',
      description: 'Reads artifacts and reports computed structural/contrast findings; writes nothing.',
      capabilities: [
        { name: 'visual-qa', description: 'Run structural visual QA checks', tools: ['fs.read', 'fs.search'] },
        { name: 'contrast-check', description: 'Check WCAG contrast ratios', tools: ['fs.read'] },
      ],
      allowedTools: ['fs.read', 'fs.search', 'fs.index', 'memory.recall', 'memory.list'],
    },
    {
      id: 'editor',
      name: 'Editor',
      description: 'Research plus workspace annotation, host verification, and gated page actions.',
      capabilities: [
        { name: 'code-search', description: 'Search codebase via index or grep', tools: ['fs.index', 'fs.search'] },
        { name: 'file-edit', description: 'Edit files in workspace', tools: ['fs.write', 'fs.append'] },
        { name: 'test-run', description: 'Run tests and verify', tools: ['test.run'] },
        { name: 'ui-actions', description: 'Drive UI via observe/click/type', tools: ['ui.*'] },
        { name: 'memory', description: 'Full memory access', tools: ['memory.*'] },
      ],
      allowedTools: ['fs.*', 'memory.recall', 'memory.list', 'test.run', 'ui.*'],
    },
    {
      id: 'archivist',
      name: 'Archivist',
      description: 'Memory curation only: recall, inspect, save, forget.',
      capabilities: [
        { name: 'memory-full', description: 'Full memory lifecycle', tools: ['memory.*'] },
      ],
      allowedTools: ['memory.*'],
    },
    {
      id: 'coder',
      name: 'Coder',
      description: 'Full coding loop: search, read, write, test, verify, commit.',
      capabilities: [
        { name: 'code-search', description: 'Search codebase', tools: ['fs.index', 'fs.search'] },
        { name: 'code-edit', description: 'Edit source files', tools: ['fs.write', 'fs.append'] },
        { name: 'test-run', description: 'Run test suite', tools: ['test.run'] },
        { name: 'git-ops', description: 'Git operations (staged, commit, log)', tools: ['git.staged', 'git.commit', 'git.log', 'git.show'] },
        { name: 'memory', description: 'Memory access', tools: ['memory.*'] },
      ],
      allowedTools: ['fs.*', 'memory.*', 'test.run', 'git.staged', 'git.commit', 'git.log', 'git.show'],
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      description: 'Code review: read changes, run tests, comment, approve/deny.',
      capabilities: [
        { name: 'diff-read', description: 'Read diffs and changes', tools: ['fs.read', 'git.diff', 'git.show'] },
        { name: 'test-verify', description: 'Verify test results', tools: ['test.run'] },
        { name: 'review-comment', description: 'Write review comments', tools: ['fs.append'] },
      ],
      allowedTools: ['fs.read', 'fs.append', 'fs.search', 'git.diff', 'git.show', 'test.run', 'memory.recall'],
    },
    {
      id: 'devops',
      name: 'DevOps',
      description: 'Deploy, monitor, incident response (gated by human checkpoints).',
      capabilities: [
        { name: 'deploy', description: 'Deploy artifacts', tools: ['exec.deploy'] },
        { name: 'monitor', description: 'Check system health', tools: ['exec.monitor'] },
        { name: 'incident', description: 'Incident response', tools: ['exec.incident'] },
      ],
      allowedTools: ['exec.deploy', 'exec.monitor', 'exec.incident', 'fs.read', 'memory.recall'],
    },
  ];
}