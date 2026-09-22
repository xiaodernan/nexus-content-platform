import { guardedJoin } from './durability.js';
import type { ToolRegistry } from './registry.js';
import type { ToolSpec } from './types.js';

/**
 * M2 v29 (ADR 0013 first slice, amendment 29): exec POLICY as pure data. `planExec`
 * decides — deterministically and from config alone — whether a command COULD run and
 * under what budget; nothing here spawns anything. An `ExecPlan` carries
 * `executes: false` in its very type: a real executor is deliberately NOT wired until
 * the policy itself is proven and a sandboxed runner is designed (§60 — no half-built
 * process pipes pretending to be safety).
 *
 * Policy pillars (all default-deny): exact-argv allowlist (no shell strings, ever),
 * cwd confined to the jail root via the proven `guardedJoin`, env scrubbed to a named
 * allowlist, and finite timeout/output budgets the REQUEST cannot raise.
 */
export interface ExecRule {
  /** Exact argv pattern; '*' matches one argument token but NEVER the executable. */
  argv: string[];
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface ExecPolicy {
  /** Jail root — same semantics as `guardedJoin`'s root. */
  root: string;
  allow: ExecRule[];
  /** Env var names allowed through; everything else is dropped and listed. Default: none. */
  envAllow?: string[];
  /** Hard caps; a rule asking for more is clamped down to these. */
  maxTimeoutMs?: number; // default 30_000
  maxOutputBytes?: number; // default 65_536
}

export interface ExecRequest {
  argv: unknown;
  cwd?: unknown;
  env?: unknown;
}

export interface ExecPlan {
  argv: string[];
  /** Resolved absolute cwd, provably inside `root`. */
  cwd: string;
  root: string;
  env: Record<string, string>;
  droppedEnv: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  matchedRule: number;
  /** Type-level honesty: this data structure is all v29 produces. */
  executes: false;
}

export type ExecDecision = { ok: true; plan: ExecPlan } | { ok: false; reason: string };

const DEFAULT_MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 65_536;

/** Registration-time check: a wildcard executable would silently allow ANY binary. */
export function validatePolicy(policy: ExecPolicy): string | null {
  for (const [i, r] of policy.allow.entries()) {
    if (!Array.isArray(r.argv) || r.argv.length === 0) return `rule ${i}: argv pattern must be non-empty`;
    if (r.argv[0] === '*') return `rule ${i}: '*' may not match the executable`;
    if (r.argv.some((t) => typeof t !== 'string' || t === '')) return `rule ${i}: tokens must be non-empty strings`;
    if (r.argv[0] !== '*' && (r.argv[0]!.includes('/') || r.argv[0]!.includes('\\'))) return `rule ${i}: executable must be a bare name`;
  }
  return null;
}

function argvMatches(pattern: string[], argv: string[]): boolean {
  if (pattern.length !== argv.length) return false;
  return pattern.every((p, i) => p === '*' || p === argv[i]);
}

/**
 * The whole of v29's "execution": a pure decision function. Returns either an inert
 * plan or a stated refusal — never runs anything, never touches the filesystem beyond
 * string math.
 */
export function planExec(request: ExecRequest, policy: ExecPolicy): ExecDecision {
  const policyError = validatePolicy(policy);
  if (policyError) return { ok: false, reason: `policy invalid: ${policyError}` };
  const argv = request.argv;
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((t) => typeof t !== 'string' || t === '')) {
    return { ok: false, reason: 'argv must be a non-empty array of non-empty strings (no shell strings)' };
  }
  const args = argv as string[];
  if (args[0]!.includes('/') || args[0]!.includes('\\')) return { ok: false, reason: 'executable must be a bare name, not a path' };
  const matched = policy.allow.findIndex((r) => argvMatches(r.argv, args));
  if (matched < 0) return { ok: false, reason: `no allowlist rule matches ${JSON.stringify(args)} (default-deny)` };
  let cwd: string;
  try {
    cwd = guardedJoin(policy.root, typeof request.cwd === 'string' ? request.cwd : '').path;
  } catch (e) {
    return { ok: false, reason: `cwd refused: ${e instanceof Error ? e.message : String(e)}` };
  }
  const rule = policy.allow[matched]!;
  const capT = policy.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;
  const capO = policy.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const env: Record<string, string> = {};
  const dropped: string[] = [];
  const allowEnv = new Set(policy.envAllow ?? []);
  const given = (typeof request.env === 'object' && request.env !== null ? request.env : {}) as Record<string, unknown>;
  for (const key of Object.keys(given).sort()) {
    const v = given[key];
    if (allowEnv.has(key) && typeof v === 'string') env[key] = v;
    else dropped.push(key);
  }
  return {
    ok: true,
    plan: {
      argv: [...args],
      cwd,
      root: guardedJoin(policy.root, '').root,
      env,
      droppedEnv: dropped,
      timeoutMs: Math.min(rule.timeoutMs ?? capT, capT),
      maxOutputBytes: Math.min(rule.maxOutputBytes ?? capO, capO),
      matchedRule: matched,
      executes: false,
    },
  };
}

export const EXEC_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'exec.plan',
    description: 'Evaluate an exec request against the sandbox policy and return the resulting PLAN or refusal. Plans are inert: this tool starts no process (§60).',
    permissions: ['read'], // it decides, it does not execute — hence no checkpoint
    args: [
      { name: 'argv', type: 'string[]', required: true },
      { name: 'cwd', type: 'string' },
    ],
  },
];

export function registerExecTools(registry: ToolRegistry, policy: ExecPolicy): ToolRegistry {
  const policyError = validatePolicy(policy);
  if (policyError) throw new Error(`exec policy invalid: ${policyError}`);
  for (const spec of EXEC_TOOL_SPECS) {
    registry.register(spec, (args) => {
      const decision = planExec({ argv: args.argv, cwd: args.cwd }, policy);
      return decision.ok
        ? { planned: true, executes: decision.plan.executes, plan: decision.plan }
        : { planned: false, executes: false, reason: decision.reason };
    });
  }
  return registry;
}
