import type { ArgType, PermissionClass, ToolArgSpec, ToolCall, ToolResult, ToolSpec } from './types.js';

export type ToolImpl = (args: Record<string, unknown>) => unknown | Promise<unknown>;

export interface CheckpointRequest {
  call: ToolCall;
  permissions: PermissionClass[];
}

/** Human Checkpoint (§28 / ADR 0013): a non-read tool only runs if the host approves. */
export type Checkpoint = (req: CheckpointRequest) => boolean | Promise<boolean>;

export interface InvokeOptions {
  checkpoint?: Checkpoint;
}

export const DANGEROUS: PermissionClass[] = ['write', 'exec', 'network'];

/** Exact name or trailing-glob match (`fs.*` covers `fs.read`; `*` covers everything). */
export function matchesTool(pattern: string, name: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return name.startsWith(pattern.slice(0, -1));
  return pattern === name;
}

function typeOf(value: unknown): ArgType | null {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value) && value.every((v) => typeof v === 'string')) return 'string[]';
  return null;
}

function validateArgs(specs: ToolArgSpec[], args: Record<string, unknown>): string | null {
  for (const s of specs) {
    const v = args[s.name];
    if (v === undefined) {
      if (s.required) return `missing required arg "${s.name}"`;
      continue;
    }
    const t = typeOf(v);
    if (t !== s.type) return `arg "${s.name}" expected ${s.type}, got ${t ?? typeof v}`;
  }
  const declared = new Set(specs.map((s) => s.name));
  for (const key of Object.keys(args)) {
    if (!declared.has(key)) return `unknown arg "${key}"`;
  }
  return null;
}

/**
 * Permission-scoped tool registry (§27/§28). Invocations never throw: validation,
 * checkpoint and implementation failures all come back as `ok:false` results.
 */
export class ToolRegistry {
  private tools = new Map<string, { spec: ToolSpec; impl: ToolImpl }>();

  register(spec: ToolSpec, impl: ToolImpl): this {
    if (this.tools.has(spec.name)) throw new Error(`tool already registered: ${spec.name}`);
    this.tools.set(spec.name, { spec, impl });
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): ToolSpec | undefined {
    return this.tools.get(name)?.spec;
  }

  list(): ToolSpec[] {
    return [...this.tools.values()].map((t) => t.spec);
  }

  /**
   * v8 (§24 role capability scoping): a read-only projection containing only tools whose
   * names match one of `allowed` (exact or trailing glob). The child never mutates the
   * parent; invoking an excluded tool returns `unknown tool`, not a permission error —
   * capabilities are absent, not merely denied.
   */
  scope(allowed: string[]): ToolRegistry {
    const projected = new ToolRegistry();
    for (const [name, entry] of this.tools) {
      if (allowed.some((p) => matchesTool(p, name))) projected.register(entry.spec, entry.impl);
    }
    return projected;
  }

  async invoke(call: ToolCall, opts: InvokeOptions = {}): Promise<ToolResult> {
    const fail = (error: string): ToolResult => ({ callId: call.callId, tool: call.tool, ok: false, error });
    const entry = this.tools.get(call.tool);
    if (!entry) return fail(`unknown tool "${call.tool}"`);
    const argError = validateArgs(entry.spec.args, call.args);
    if (argError) return fail(argError);
    const dangerous = entry.spec.permissions.filter((p) => DANGEROUS.includes(p));
    if (dangerous.length > 0) {
      if (!opts.checkpoint) return fail(`checkpoint required for ${dangerous.join('/')}`);
      const granted = await opts.checkpoint({ call, permissions: dangerous });
      if (!granted) return fail(`denied at checkpoint (${dangerous.join('/')})`);
    }
    try {
      const output = await entry.impl(call.args);
      return { callId: call.callId, tool: call.tool, ok: true, output };
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }
}
