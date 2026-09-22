import { spawn as nodeSpawnLib } from 'node:child_process';
import type { Checkpoint, ExecPlan, ExecPolicy, ExecRequest, ToolRegistry, ToolCall, ToolSpec } from '@nexus/agent-runtime';
import { planExec } from '@nexus/agent-runtime';

/**
 * M2 v30 (ADR 0013 second slice, ADR 0016 amendment 30): the SANDBOXED EXEC HOST.
 * This package is deliberately SEPARATE from @nexus/agent-runtime so the runtime's
 * provable zero-`child_process` audit (v29) keeps its teeth: spawn capability lives
 * in exactly one place, it executes ONLY inert plans that `planExec` already approved,
 * and every direct call passes the §28 checkpoint before a process is born.
 */

export interface ExecSpawnOptions {
  cwd: string;
  env: Record<string, string>;
}

/** Minimal process view the host consumes — fakeable without touching the OS. */
export interface ExecChild {
  onData(listener: (stream: 'stdout' | 'stderr', chunk: Buffer | string) => void): void;
  onEnd(listener: (end: { code: number | null; signal: string | null; error?: string }) => void): void;
  kill(): void;
}

export type SpawnLike = (command: string, args: string[], opts: ExecSpawnOptions) => ExecChild;

/** The real adapter: argv straight to spawn, `shell: false` — no string is ever re-parsed. */
export const NODE_SPAWN: SpawnLike = (command, args, opts) => {
  const child = nodeSpawnLib(command, args, { cwd: opts.cwd, env: opts.env, shell: false, windowsHide: true });
  const dataListeners: Array<(stream: 'stdout' | 'stderr', chunk: Buffer | string) => void> = [];
  const endListeners: Array<(end: { code: number | null; signal: string | null; error?: string }) => void> = [];
  let ended = false;
  const end = (e: { code: number | null; signal: string | null; error?: string }) => {
    if (ended) return;
    ended = true;
    for (const l of endListeners) l(e);
  };
  child.stdout?.on('data', (c: Buffer | string) => {
    for (const l of dataListeners) l('stdout', c);
  });
  child.stderr?.on('data', (c: Buffer | string) => {
    for (const l of dataListeners) l('stderr', c);
  });
  child.on('error', (e: Error) => end({ code: null, signal: null, error: e.message }));
  child.on('exit', (code, signal) => end({ code, signal }));
  return {
    onData: (l) => dataListeners.push(l),
    onEnd: (l) => endListeners.push(l),
    kill: () => {
      child.kill();
    },
  };
};

export interface ExecRunResult {
  ran: boolean;
  planned: boolean;
  /** Stated refusal when the run did not happen; '' when it did. */
  reason: string;
  argv: string[];
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  killedByBudget: boolean;
  /** Spawn-layer failure (ENOENT, EPERM…); '' when the process reported its own exit. */
  spawnError: string;
}

const noRun = (over: Partial<ExecRunResult>): ExecRunResult => ({
  ran: false,
  planned: false,
  reason: '',
  argv: [],
  cwd: '',
  exitCode: null,
  signal: null,
  stdout: '',
  stderr: '',
  truncated: false,
  killedByBudget: false,
  spawnError: '',
  ...over,
});

export interface ExecHost {
  policy: ExecPolicy;
  /**
   * One gate at a time (§28): a DIRECT call must carry a `checkpoint` (or state, via
   * `preApproved`, that the caller's registry already gated it) — no gate means no
   * spawn, default-deny. `planned:false` refusals never spawn, whatever the checkpoint
   * says: the policy outranks the human, not the other way round.
   */
  run(request: ExecRequest, opts?: { checkpoint?: Checkpoint; preApproved?: boolean; callId?: string }): Promise<ExecRunResult>;
}

export function createExecHost(policy: ExecPolicy, options: { spawnLike?: SpawnLike } = {}): ExecHost {
  const spawnLike = options.spawnLike ?? NODE_SPAWN;
  return {
    policy,
    async run(request, opts = {}) {
      const decision = planExec(request, policy);
      if (!decision.ok) return noRun({ reason: decision.reason });
      const plan: ExecPlan = decision.plan;
      if (!opts.preApproved) {
        if (!opts.checkpoint) return noRun({ planned: true, reason: 'checkpoint required for exec (§28)' });
        const call: ToolCall = { callId: opts.callId ?? 'exec-host', tool: 'exec.run', args: { argv: plan.argv, cwd: plan.cwd } };
        const approved = await opts.checkpoint({ call, permissions: ['exec'] });
        if (!approved) return noRun({ planned: true, reason: 'checkpoint denied', argv: plan.argv, cwd: plan.cwd });
      }
      return await new Promise<ExecRunResult>((resolve) => {
        const budget = plan.maxOutputBytes;
        let out = '';
        let err = '';
        let truncated = false;
        let killed = false;
        const append = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {
          const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
          const usedBytes = Buffer.byteLength(out, 'utf8') + Buffer.byteLength(err, 'utf8');
          const room = Math.max(0, budget - usedBytes);
          const keep = Buffer.byteLength(text, 'utf8') <= room ? text : Buffer.from(text, 'utf8').subarray(0, room).toString('utf8');
          if (keep.length < text.length) truncated = true;
          if (target === 'stdout') out += keep;
          else err += keep;
        };
        const child = spawnLike(plan.argv[0]!, plan.argv.slice(1), { cwd: plan.cwd, env: plan.env });
        child.onData(append);
        const timer = setTimeout(() => {
          killed = true;
          child.kill();
        }, plan.timeoutMs);
        child.onEnd((e) => {
          clearTimeout(timer);
          resolve({
            ran: true,
            planned: true,
            reason: '',
            argv: [...plan.argv],
            cwd: plan.cwd,
            exitCode: e.code,
            signal: e.signal,
            stdout: out,
            stderr: err,
            truncated,
            killedByBudget: killed,
            spawnError: e.error ?? '',
          });
        });
      });
    },
  };
}

export const EXEC_HOST_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'exec.run',
    description:
      'Execute a policy-approved command under the plan budgets via the exec host. Registry-level §28 checkpoint gates this tool; a policy refusal or denial is an error, never a silent success.',
    permissions: ['exec'],
    args: [
      { name: 'argv', type: 'string[]', required: true },
      { name: 'cwd', type: 'string' },
    ],
  },
];

export function registerExecHostTools(registry: ToolRegistry, host: ExecHost): ToolRegistry {
  for (const spec of EXEC_HOST_TOOL_SPECS) {
    registry.register(spec, async (args) => {
      const result = await host.run({ argv: args.argv, cwd: args.cwd }, { preApproved: true }); // the registry already gated 'exec'
      if (!result.ran) throw new Error(result.reason || 'run refused');
      if (result.spawnError !== '') throw new Error(`spawn failed: ${result.spawnError}`);
      const ok = result.exitCode === 0 && !result.killedByBudget;
      const detail = `exec ${result.argv.join(' ')} → exit ${result.exitCode}${result.killedByBudget ? ' (killed at timeout budget)' : ''}${result.truncated ? ' (output truncated)' : ''}`;
      return { ok, detail, result };
    });
  }
  return registry;
}

export interface ExecJournalDisk {
  readFileSync(file: string, encoding: 'utf8'): string;
  mkdirSync(dir: string, options?: { recursive?: boolean }): unknown;
  writeFileSync(file: string, data: string, encoding: 'utf8'): void;
}

export function formatExecLine(result: ExecRunResult): string {
  return JSON.stringify(result);
}

/** Append-only JSONL, same discipline as the ledger and the test-report log. */
export function appendExecRun(disk: ExecJournalDisk, file: string, result: ExecRunResult): void {
  let existing = '';
  try {
    existing = disk.readFileSync(file, 'utf8');
  } catch {
    existing = '';
  }
  const dir = file.slice(0, file.lastIndexOf('/'));
  if (dir && dir !== file) disk.mkdirSync(dir, { recursive: true });
  disk.writeFileSync(file, (existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`) + formatExecLine(result) + '\n', 'utf8');
}

function isExecRunResult(raw: unknown): raw is ExecRunResult {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.ran === 'boolean' && typeof r.planned === 'boolean' && Array.isArray(r.argv) && typeof r.truncated === 'boolean';
}

export function loadExecRuns(disk: { readFileSync(file: string, encoding: 'utf8'): string }, file: string, last?: number): { runs: ExecRunResult[]; malformed: number } {
  let text: string;
  try {
    text = disk.readFileSync(file, 'utf8');
  } catch {
    return { runs: [], malformed: 0 };
  }
  const runs: ExecRunResult[] = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }
    if (isExecRunResult(raw)) runs.push(raw);
    else malformed += 1;
  }
  return { runs: last === undefined ? runs : runs.slice(Math.max(0, runs.length - last)), malformed };
}
