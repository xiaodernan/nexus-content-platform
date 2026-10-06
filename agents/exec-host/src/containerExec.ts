import type { Checkpoint, ExecPolicy, ExecRequest, ExecRule, ToolCall, ToolRegistry, ToolSpec } from '@nexus/agent-runtime';
import { planExec, validatePolicy } from '@nexus/agent-runtime';
import { NODE_SPAWN, type ExecJournalDisk, type ExecJournalRef, type ExecChild, type SpawnLike } from './execHost.js';

/**
 * M2 v166 (ADR 0016 amendment 166, ADR 0013 third slice): the CONTAINER executor — the first
 * OS-level isolation in the repo. What ADR 0013 proposed and this file now enforces for a
 * policy-approved plan: the command runs inside an EPHEMERAL container (`--rm`) whose argv can
 * contain NO host filesystem mount (there is no `-v`/`--volume`/`--mount` flag this module can
 * ever emit — the audit reads the spawned argv, not the docs), with egress default-deny
 * (`--network none`), CPU/memory/PID caps, a read-only rootfs over a noexec tmpfs scratch, and
 * the plan's own timeout/output budgets on top. Wall-clock is a HOST budget: when it fires the
 * docker client is killed and `docker rm -f <name>` retires a container the client may have left
 * running — measured, not assumed (container-proof §5).
 * The division of labour stays v29/v30's: `planExec` in @nexus/agent-runtime remains the SINGLE
 * decision function (argv allowlist, bare-name executables, env scrubbing, budget clamping — and
 * its `guardedJoin` is pure string math on slashes, so the same jail check that guarded a host
 * path guards the container workdir). This module adds the container layer on top of the SAME
 * plan: the image is POLICY-PINNED (the request cannot choose one), the workdir root is a
 * CONTAINER path, and what spawns is `docker run …` — still through the ONE
 * SpawnLike seam, so the v30 audit's answer ("exactly ONE module in the monorepo may talk to
 * node's process-spawn module") keeps its teeth without a line changed. This file deliberately
 * never spells that module's name: the proof greps dist for it, and a comment would count.
 *
 * What still keeps ADR 0013 "Proposed": gVisor/Firecracker alternatives, per-job secret
 * injection from services/ai-svc, and a warm pool — none of which exist here; this host is an
 * honest Docker backend, not a claim that the ADR's full surface landed.
 */

/** The container-side policy. `root` is deliberately ABSENT from ExecPolicy's shape: no host path exists. */
export type ContainerPolicyBase = Omit<ExecPolicy, 'root'>;

export interface ContainerPolicy extends ContainerPolicyBase {
  /** The ONE image this policy pins; the request can never name one. No leading `-`, no whitespace. */
  image: string;
  /** Container-side jail root, e.g. `/workspace`; the request's cwd is a RELATIVE subpath of it. */
  workdirRoot: string;
  memoryMb?: number;
  cpus?: number;
  pidsLimit?: number;
  /** One `--tmpfs` spec for the only writable dir. Default: noexec/nosuid scratch under /tmp. */
  tmpfs?: string;
}

export const CONTAINER_DEFAULTS = {
  memoryMb: 512,
  cpus: 1,
  pidsLimit: 128,
  tmpfs: '/tmp:rw,noexec,nosuid,size=64m',
} as const;

/**
 * The isolation the spawned argv ALWAYS carries, exported as data so the audit asserts from the
 * same array the builder reads — two copies of an order drift, this is not a copy.
 * `--pull never` is host-side egress denial: a missing image fails the run instead of reaching
 * for a registry the policy never asked about.
 */
export const CONTAINER_ISOLATION_ARGS: readonly string[] = [
  '--rm',
  '--network',
  'none',
  '--pull',
  'never',
  '--cap-drop',
  'ALL',
  '--security-opt',
  'no-new-privileges',
  '--read-only',
];

/** Flags that would mount HOST state into the container. The builder can never emit them; the audit refuses them. */
export const CONTAINER_MOUNT_FLAGS: readonly string[] = ['-v', '--volume', '--mount'];

export function validateContainerPolicy(policy: ContainerPolicy): string | null {
  const ruleError = validatePolicy({ ...policy, root: policy.workdirRoot });
  if (ruleError) return ruleError;
  if (typeof policy.image !== 'string' || policy.image === '') return 'image must be a non-empty string';
  if (/\s/.test(policy.image)) return 'image must not contain whitespace';
  if (policy.image.startsWith('-')) return 'image must not start with "-" (flag injection)';
  if (typeof policy.workdirRoot !== 'string' || policy.workdirRoot === '') return 'workdirRoot must be a non-empty string';
  if (!policy.workdirRoot.startsWith('/') || policy.workdirRoot.includes('\\')) return 'workdirRoot must be an absolute CONTAINER path (posix, "/…")';
  if (policy.workdirRoot.split('/').some((p) => p === '..')) return 'workdirRoot must not contain ".."';
  const clamp = (v: number | undefined, lo: number, hi: number, name: string, dflt: number): number | string =>
    v === undefined ? dflt : Number.isInteger(v) && v >= lo && v <= hi ? v : `${name} must be an integer in [${lo}, ${hi}]`;
  const memoryMb = clamp(policy.memoryMb, 8, 65_536, 'memoryMb', CONTAINER_DEFAULTS.memoryMb);
  if (typeof memoryMb === 'string') return memoryMb;
  const cpus = policy.cpus === undefined ? CONTAINER_DEFAULTS.cpus : policy.cpus;
  if (typeof cpus !== 'number' || !Number.isFinite(cpus) || cpus < 0.01 || cpus > 64) return 'cpus must be a number in [0.01, 64]';
  const pidsLimit = clamp(policy.pidsLimit, 1, 4_096, 'pidsLimit', CONTAINER_DEFAULTS.pidsLimit);
  if (typeof pidsLimit === 'string') return pidsLimit;
  if (policy.tmpfs !== undefined && (typeof policy.tmpfs !== 'string' || policy.tmpfs === '' || policy.tmpfs.includes('\\'))) return 'tmpfs must be a posix tmpfs spec';
  return null;
}

export interface ContainerPlan {
  /** The INNER command — what runs INSIDE the container. Same allowlist discipline as v29. */
  argv: string[];
  /** The argv the host actually spawns AFTER the `docker` command word. Carries the isolation flags. */
  dockerArgs: string[];
  image: string;
  /** Resolved container-side workdir: `workdirRoot` plus the request's guarded relative path. */
  workdir: string;
  env: Record<string, string>;
  droppedEnv: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  matchedRule: number;
  containerName: string;
  /** Type-level honesty, unchanged from v29: planning alone executes nothing. */
  executes: false;
}

export type ContainerDecision = { ok: true; plan: ContainerPlan } | { ok: false; reason: string };

/**
 * The container argv, as ONE pure function over the plan pieces — the proof and the tests read
 * this shape, the host spawns it, and neither restates it.
 */
export function buildDockerArgs(opts: { image: string; workdir: string; containerName: string; argv: string[]; env: Record<string, string>; memoryMb: number; cpus: number; pidsLimit: number; tmpfs: string }): string[] {
  const envArgs = Object.keys(opts.env)
    .sort()
    .flatMap((k) => ['--env', `${k}=${opts.env[k]}`]);
  return [
    'run',
    ...CONTAINER_ISOLATION_ARGS,
    '--name',
    opts.containerName,
    '--memory',
    `${opts.memoryMb}m`,
    '--memory-swap',
    `${opts.memoryMb}m`, // no swap escape hatch: the cap is the cap
    '--cpus',
    String(opts.cpus),
    '--pids-limit',
    String(opts.pidsLimit),
    '--tmpfs',
    opts.tmpfs,
    '-w',
    opts.workdir,
    ...envArgs,
    opts.image,
    ...opts.argv, // exec-form: the inner command rides as argv data, never re-parsed by a shell
  ];
}

/**
 * The v29 decision, extended one layer out. The inner command is judged by the SAME `planExec`
 * the host exec used — allowlist, bare names, env scrub, budgets — with the jail root being a
 * container path; the container layer then pins the image and builds the docker argv. A request
 * can no more widen this plan than it could widen v29's.
 */
export function planContainerRun(request: ExecRequest, policy: ContainerPolicy): ContainerDecision {
  const invalid = validateContainerPolicy(policy);
  if (invalid) return { ok: false, reason: `container policy invalid: ${invalid}` };
  const decision = planExec(request, { ...policy, root: policy.workdirRoot });
  if (!decision.ok) return { ok: false, reason: decision.reason };
  const p = decision.plan;
  const memoryMb = policy.memoryMb ?? CONTAINER_DEFAULTS.memoryMb;
  const cpus = policy.cpus ?? CONTAINER_DEFAULTS.cpus;
  const pidsLimit = policy.pidsLimit ?? CONTAINER_DEFAULTS.pidsLimit;
  const tmpfs = policy.tmpfs ?? CONTAINER_DEFAULTS.tmpfs;
  const containerName = `${CONTAINER_NAME_PREFIX}${process.pid.toString(36)}-${(nameSeq += 1).toString(36)}`;
  const plan: ContainerPlan = {
    argv: p.argv,
    dockerArgs: buildDockerArgs({ image: policy.image, workdir: p.cwd, containerName, argv: p.argv, env: p.env, memoryMb, cpus, pidsLimit, tmpfs }),
    image: policy.image,
    workdir: p.cwd,
    env: p.env,
    droppedEnv: p.droppedEnv,
    timeoutMs: p.timeoutMs,
    maxOutputBytes: p.maxOutputBytes,
    matchedRule: p.matchedRule,
    containerName,
    executes: false,
  };
  return { ok: true, plan };
}
let nameSeq = 0;
export const CONTAINER_NAME_PREFIX = 'nexus-exec-';

export interface ContainerRunResult {
  ran: boolean;
  planned: boolean;
  /** Stated refusal when the run did not happen; '' when it did. */
  reason: string;
  argv: string[];
  image: string;
  workdir: string;
  /** The exact docker argv the run carries — '' fields never, [] only on a policy-level refusal. */
  dockerArgs: string[];
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  /** Per-stream ceilings (v53 discipline inherited verbatim); cut streams keep whole lines (v48). */
  truncated: boolean;
  truncatedStreams?: Array<'stdout' | 'stderr'>;
  killedByBudget: boolean;
  /** Spawn-layer failure of the DOCKER CLIENT (ENOENT, daemon down…); '' when the container ran. */
  spawnError: string;
  containerName?: string;
  /**
   * Present EXACTLY when the budget killed the run. A killed client can leave the container
   * running (the daemon outlives the CLI), so the host retires it by name and reports what the
   * retyire reported — 'removed' is the cleanup call's own answer, never an assumption.
   */
  cleanup?: { attempted: boolean; removed: boolean; note: string };
}

export interface ContainerRuntimeProbe {
  available: boolean;
  /** The daemon's version string, '' when unavailable. */
  serverVersion: string;
  /** Stated reason when unavailable; '' when available. */
  reason: string;
}

/**
 * One honest question: is there a docker daemon here at all? Absence is a NORMAL answer, not an
 * error — a host configured with a probe refuses legibly ("container runtime unavailable: …")
 * instead of surfacing a raw ENOENT from the spawn layer.
 */
export async function probeContainerRuntime(options: { spawnLike?: SpawnLike; timeoutMs?: number } = {}): Promise<ContainerRuntimeProbe> {
  const spawnLike = options.spawnLike ?? NODE_SPAWN;
  const budget = options.timeoutMs ?? 10_000;
  return await new Promise<ContainerRuntimeProbe>((resolve) => {
    const out: Buffer[] = [];
    let settled = false;
    let killed = false;
    const done = (p: ContainerRuntimeProbe) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(p);
    };
    const timer = setTimeout(() => {
      killed = true;
      child.kill();
      done({ available: false, serverVersion: '', reason: `probe exceeded ${budget}ms and was killed` });
    }, budget);
    const child = spawnLike('docker', ['version', '--format', '{{.Server.Version}}'], { cwd: process.cwd(), env: minimalClientEnv() });
    child.onData((_stream, chunk) => out.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')));
    child.onEnd((e) => {
      if (killed) return; // the timer already answered; a killed probe's exit is not a second answer
      const text = Buffer.concat(out).toString('utf8');
      const version = text.split('\n').filter((l) => l.trim() !== '').join(' ').trim();
      if (e.error) done({ available: false, serverVersion: '', reason: `docker CLI failed: ${e.error}` });
      else if (e.code !== 0) done({ available: false, serverVersion: '', reason: `docker version exited ${e.code}${text.trim() === '' ? '' : `: ${text.trim()}`}` });
      else done({ available: true, serverVersion: version, reason: '' });
    });
  });
}

/**
 * The DOCKER CLIENT's own environment (host-side implementation detail — the CONTAINER env is
 * the plan's scrubbed allowlist, a different thing entirely). Minimal by default: the client
 * needs PATH to be found and, on Windows, SystemRoot to start at all.
 */
export function minimalClientEnv(): Record<string, string> {
  const env: Record<string, string> = { PATH: process.env.PATH ?? process.env.Path ?? '' };
  if (process.platform === 'win32' && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  return env;
}

export interface ContainerHostOptions {
  spawnLike?: SpawnLike;
  /** Absent by design: a host keeps no records unless its operator asks for a file (v51's rule, inherited). */
  journal?: ExecJournalRef;
  /** Optional early gate: when the probe says unavailable, the run refuses LEGIBLY before any spawn. */
  probe?: () => Promise<ContainerRuntimeProbe>;
  clientEnv?: Record<string, string>;
  clientCwd?: string;
  /** The `docker rm -f` cleanup gets its own small budget so a wedged client cannot wedge the host. */
  cleanupTimeoutMs?: number;
}

export interface ContainerHost {
  policy: ContainerPolicy;
  /** Same §28 shape as ExecHost.run: no gate means no spawn; the policy outranks the human. */
  run(request: ExecRequest, opts?: { checkpoint?: Checkpoint; preApproved?: boolean; callId?: string }): Promise<ContainerRunResult>;
}

const noRun = (over: Partial<ContainerRunResult>): ContainerRunResult => ({
  ran: false,
  planned: false,
  reason: '',
  argv: [],
  image: '',
  workdir: '',
  dockerArgs: [],
  exitCode: null,
  signal: null,
  stdout: '',
  stderr: '',
  truncated: false,
  killedByBudget: false,
  spawnError: '',
  ...over,
});

interface CleanupOutcome {
  attempted: boolean;
  removed: boolean;
  note: string;
}

/** `docker rm -f <name>` — the answer is what the call REPORTED, with its own small budget. */
async function rmContainer(spawnLike: SpawnLike, name: string, timeoutMs: number): Promise<CleanupOutcome> {
  return await new Promise<CleanupOutcome>((resolve) => {
    const notes: string[] = [];
    let settled = false;
    let killed = false;
    const done = (o: CleanupOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(o);
    };
    const timer = setTimeout(() => {
      killed = true;
      child.kill();
      done({ attempted: true, removed: false, note: `cleanup exceeded ${timeoutMs}ms and was killed — the container "${name}" may still exist` });
    }, timeoutMs);
    const child = spawnLike('docker', ['rm', '-f', name], { cwd: process.cwd(), env: minimalClientEnv() });
    child.onData((_stream, chunk) => {
      const t = (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')).toString('utf8').trim();
      if (t !== '') notes.push(t);
    });
    child.onEnd((e) => {
      if (killed) return;
      if (e.error) done({ attempted: true, removed: false, note: `cleanup spawn failed: ${e.error}` });
      else if (e.code !== 0) done({ attempted: true, removed: false, note: `docker rm -f exited ${e.code}${notes.length > 0 ? `: ${notes.join(' ')}` : ''}` });
      else done({ attempted: true, removed: true, note: `docker rm -f reported success for "${name}"` });
    });
  });
}

/**
 * The container twin of `createExecHost` (v30): executes ONLY what `planContainerRun` approved,
 * under the §28 checkpoint, with the plan's budgets enforced by the SAME per-stream byte
 * discipline (v48 whole-line cuts, v53 per-stream ceilings) and the timeout answered by a kill
 * PLUS the named-container retirement. It borrows the ONE SpawnLike seam and adds no new
 * process-spawn import anywhere (the v30 audit greps for the name; this file must never match).
 */
export function createContainerExecHost(policy: ContainerPolicy, options: ContainerHostOptions = {}): ContainerHost {
  const spawnLike = options.spawnLike ?? NODE_SPAWN;
  const journal = options.journal;
  const probe = options.probe;
  const clientEnv = options.clientEnv ?? minimalClientEnv();
  const clientCwd = options.clientCwd ?? process.cwd();
  const cleanupTimeoutMs = options.cleanupTimeoutMs ?? 10_000;
  let seq = 0;
  return {
    policy,
    async run(request, opts = {}) {
      const audit = (result: ContainerRunResult, rule: number | null): void => {
        if (!journal) return;
        seq += 1; // BEFORE the write: a record that fails to land leaves a gap, which is what a gap should mean
        const record: ContainerAuditRecord = { ...result, seq, rule };
        appendContainerRun(journal.disk, journal.file, record);
      };
      const refuse = (over: Partial<ContainerRunResult>, rule: number | null): ContainerRunResult => {
        const result = noRun(over);
        audit(result, rule);
        return result;
      };
      const decision = planContainerRun(request, policy);
      if (!decision.ok) return refuse({ reason: decision.reason }, null);
      const plan: ContainerPlan = decision.plan;
      const planned: Partial<ContainerRunResult> = { planned: true, argv: [...plan.argv], image: plan.image, workdir: plan.workdir, dockerArgs: [...plan.dockerArgs], containerName: plan.containerName };
      if (!opts.preApproved) {
        if (!opts.checkpoint) return refuse({ ...planned, reason: 'checkpoint required for exec (§28)' }, plan.matchedRule);
        const call: ToolCall = { callId: opts.callId ?? 'container-exec-host', tool: 'container.exec', args: { argv: plan.argv, cwd: request.cwd } };
        const approved = await opts.checkpoint({ call, permissions: ['exec'] });
        if (!approved) return refuse({ ...planned, reason: 'checkpoint denied' }, plan.matchedRule);
      }
      if (probe) {
        const p = await probe();
        if (!p.available) return refuse({ ...planned, reason: `container runtime unavailable: ${p.reason}` }, plan.matchedRule);
      }
      return await new Promise<ContainerRunResult>((resolve, reject) => {
        const budget = plan.maxOutputBytes;
        // v48/v53 discipline, unchanged: raw bytes accumulate per stream, decode once, a cut stream
        // keeps WHOLE lines, and each stream's ceiling belongs to that stream alone.
        const chunks: Record<'stdout' | 'stderr', Buffer[]> = { stdout: [], stderr: [] };
        const cut: Record<'stdout' | 'stderr', boolean> = { stdout: false, stderr: false };
        const kept: Record<'stdout' | 'stderr', number> = { stdout: 0, stderr: 0 };
        let truncated = false;
        let killed = false;
        let cleanup: CleanupOutcome | undefined;
        let cleanupSettled: Promise<void> | null = null;
        const append = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
          const room = Math.max(0, budget - kept[target]);
          const keep = buf.byteLength <= room ? buf : buf.subarray(0, room);
          if (keep.byteLength < buf.byteLength) {
            truncated = true;
            cut[target] = true;
          }
          if (keep.byteLength > 0) {
            chunks[target].push(keep);
            kept[target] += keep.byteLength;
          }
        };
        const textOf = (target: 'stdout' | 'stderr') => {
          const text = Buffer.concat(chunks[target]).toString('utf8');
          if (!cut[target]) return text;
          const lastBreak = text.lastIndexOf('\n');
          return lastBreak < 0 ? '' : text.slice(0, lastBreak + 1);
        };
        const child = spawnLike('docker', plan.dockerArgs, { cwd: clientCwd, env: clientEnv });
        child.onData(append);
        const timer = setTimeout(() => {
          killed = true;
          // Assign the retirement promise BEFORE the kill: `child.kill()` may end the child
          // SYNCHRONOUSLY (any onEnd that fires inside this call must find the promise already
          // pending, or it would build its result without the cleanup and answer a question the
          // host did answer — the v55/v86 lesson, learned again one layer out).
          cleanupSettled = rmContainer(spawnLike, plan.containerName, cleanupTimeoutMs)
            .then((o) => {
              cleanup = o;
            })
            .catch((e: unknown) => {
              cleanup = { attempted: true, removed: false, note: `cleanup threw: ${e instanceof Error ? e.message : String(e)}` };
            });
          child.kill();
        }, plan.timeoutMs);
        child.onEnd(async (e) => {
          clearTimeout(timer);
          if (cleanupSettled) await cleanupSettled;
          const streams = (['stdout', 'stderr'] as const).filter((s) => cut[s]);
          const result: ContainerRunResult = {
            ran: true,
            planned: true,
            reason: '',
            argv: [...plan.argv],
            image: plan.image,
            workdir: plan.workdir,
            dockerArgs: [...plan.dockerArgs],
            exitCode: e.code,
            signal: e.signal,
            stdout: textOf('stdout'),
            stderr: textOf('stderr'),
            truncated,
            ...(streams.length > 0 ? { truncatedStreams: [...streams] } : {}),
            killedByBudget: killed,
            spawnError: e.error ?? '',
            containerName: plan.containerName,
            ...(cleanup !== undefined ? { cleanup } : {}),
          };
          try {
            audit(result, plan.matchedRule);
          } catch (err) {
            reject(new Error(`container audit failed for "${result.argv.join(' ')}" (the container ran and exited ${result.exitCode}; the record did not land): ${err instanceof Error ? err.message : String(err)}`));
            return;
          }
          resolve(result);
        });
      });
    },
  };
}

export const CONTAINER_EXEC_TOOL_SPECS: ToolSpec[] = [
  {
    name: 'container.exec',
    description:
      'Execute a policy-approved command inside an EPHEMERAL container (ADR 0013): the image is policy-pinned, the spawned argv can carry no host mount, egress is denied (--network none), CPU/memory/PID caps and a read-only rootfs are enforced by the container runtime, and the plan budgets still bound time and output. Registry-level §28 checkpoint gates this tool; a policy refusal or denial is an error, never a silent success.',
    permissions: ['exec'],
    args: [
      { name: 'argv', type: 'string[]', required: true },
      { name: 'cwd', type: 'string' },
      { name: 'env', type: 'string[]' },
    ],
  },
];

/** Door-level decode of `["KEY=VALUE", …]`; every name still faces the policy's env allowlist. */
function decodeEnvPairs(pairs: unknown): Record<string, string> {
  if (!Array.isArray(pairs)) return {};
  const out: Record<string, string> = {};
  for (const kv of pairs) {
    if (typeof kv !== 'string') continue;
    const i = kv.indexOf('=');
    if (i < 0) out[kv] = '';
    else out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}

export function registerContainerExecTools(registry: ToolRegistry, host: ContainerHost): ToolRegistry {
  const policyError = validateContainerPolicy(host.policy);
  if (policyError) throw new Error(`container policy invalid: ${policyError}`);
  for (const spec of CONTAINER_EXEC_TOOL_SPECS) {
    registry.register(spec, async (args) => {
      const result = await host.run({ argv: args.argv, cwd: args.cwd, env: decodeEnvPairs(args.env) }, { preApproved: true }); // the registry already gated 'exec'
      if (!result.ran) throw new Error(result.reason || 'run refused');
      if (result.spawnError !== '') throw new Error(`spawn failed: ${result.spawnError}`);
      const ok = result.exitCode === 0 && !result.killedByBudget;
      const cleanupNote = result.cleanup ? ` (cleanup: ${result.cleanup.removed ? 'removed' : result.cleanup.note})` : '';
      const detail = `container ${result.image} ${result.argv.join(' ')} → exit ${result.exitCode}${result.killedByBudget ? ' (killed at timeout budget)' : ''}${cleanupNote}${result.truncated ? ` (output truncated${result.truncatedStreams && result.truncatedStreams.length > 0 ? `: ${result.truncatedStreams.join(' + ')}` : ''})` : ''}`;
      return { ok, detail, result };
    });
  }
  return registry;
}

// ── journal (v51's discipline, container-shaped) ─────────────────────────────────────────────

export type ContainerAuditRecord = ContainerRunResult & { seq: number; rule: number | null };

export function formatContainerLine(result: ContainerRunResult): string {
  return JSON.stringify(result);
}

export function appendContainerRun(disk: ExecJournalDisk, file: string, result: ContainerRunResult): void {
  let existing = '';
  try {
    existing = disk.readFileSync(file, 'utf8');
  } catch {
    existing = '';
  }
  const dir = file.slice(0, file.lastIndexOf('/'));
  if (dir && dir !== file) disk.mkdirSync(dir, { recursive: true });
  disk.writeFileSync(file, (existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`) + formatContainerLine(result) + '\n', 'utf8');
}

function isContainerRunResult(raw: unknown): raw is ContainerRunResult {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return typeof r.ran === 'boolean' && typeof r.planned === 'boolean' && Array.isArray(r.argv) && typeof r.truncated === 'boolean';
}

/** A rule number exactly when the policy approved — the writer's invariant, re-checked on read. */
function isContainerAuditRecord(raw: unknown): raw is ContainerAuditRecord {
  if (!isContainerRunResult(raw)) return false;
  const r = raw as unknown as Record<string, unknown>;
  if (typeof r.seq !== 'number') return false;
  if (!(r.rule === null || typeof r.rule === 'number')) return false;
  return r.planned === (r.rule !== null);
}

type JournalDiskReader = { readFileSync(file: string, encoding: 'utf8'): string };

function readJournal<T>(disk: JournalDiskReader, file: string, guard: (raw: unknown) => raw is T, last?: number): { rows: T[]; malformed: number } {
  let text: string;
  try {
    text = disk.readFileSync(file, 'utf8');
  } catch {
    return { rows: [], malformed: 0 };
  }
  const rows: T[] = [];
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
    if (guard(raw)) rows.push(raw);
    else malformed += 1;
  }
  return { rows: last === undefined ? rows : rows.slice(Math.max(0, rows.length - last)), malformed };
}

export function loadContainerRuns(disk: JournalDiskReader, file: string, last?: number): { runs: ContainerRunResult[]; malformed: number } {
  const { rows, malformed } = readJournal(disk, file, isContainerRunResult, last);
  return { runs: rows, malformed };
}

export function loadContainerAudits(disk: JournalDiskReader, file: string, last?: number): { records: ContainerAuditRecord[]; malformed: number } {
  const { rows, malformed } = readJournal(disk, file, isContainerAuditRecord, last);
  return { records: rows, malformed };
}

/** Re-exported for callers that build container policies from existing exec rules. */
export type { ExecRule };
export type { ExecChild };
