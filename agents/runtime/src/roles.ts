import type { ToolRegistry } from './registry.js';

/**
 * M2 v8 first slice of the §24 Agent Registry: named roles carry tool capabilities, and a
 * role's registry is a *projection* of the host registry (`registry.scope`) — capabilities
 * the role lacks simply do not exist for it. Roles here are data, not personas (§60).
 */
export interface RoleDefinition {
  id: string;
  name: string;
  description: string;
  /** Exact tool names or trailing globs, e.g. ['fs.*', 'memory.recall']. */
  allowedTools: string[];
}

export class RoleRegistry {
  private roles = new Map<string, RoleDefinition>();

  register(role: RoleDefinition): this {
    if (this.roles.has(role.id)) throw new Error(`role already registered: ${role.id}`);
    this.roles.set(role.id, role);
    return this;
  }

  get(id: string): RoleDefinition | undefined {
    return this.roles.get(id);
  }

  list(): RoleDefinition[] {
    return [...this.roles.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Project the host registry down to this role's capabilities; unknown role ⇒ empty scope. */
  scopedRegistry(id: string, registry: ToolRegistry): ToolRegistry {
    const role = this.roles.get(id);
    return registry.scope(role ? role.allowedTools : []);
  }
}

export const DEMO_ROLES: RoleDefinition[] = [
  { id: 'researcher', name: 'Research role', description: 'Read-only discovery: index/search + memory recall and inspection.', allowedTools: ['fs.list', 'fs.read', 'fs.search', 'fs.index', 'memory.recall', 'memory.list'] },
  { id: 'designer', name: 'Designer role', description: 'Research plus design-brief annotation (write-class, checkpoint-gated).', allowedTools: ['fs.list', 'fs.read', 'fs.search', 'fs.index', 'fs.append', 'memory.recall', 'memory.list'] },
  { id: 'qa', name: 'QA role', description: 'Reads artifacts and reports computed structural/contrast findings; writes nothing.', allowedTools: ['fs.read', 'fs.search', 'fs.index', 'memory.recall', 'memory.list'] },
  { id: 'editor', name: 'Editor role', description: 'Research plus workspace annotation (write-class, checkpoint-gated) and host verification.', allowedTools: ['fs.*', 'memory.recall', 'memory.list', 'test.run'] },
  { id: 'archivist', name: 'Archivist role', description: 'Memory curation only: recall, inspect, save, forget.', allowedTools: ['memory.*'] },
];
