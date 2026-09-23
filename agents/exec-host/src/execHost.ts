import { spawn as nodeSpawnLib, spawnSync as spawnSyncLib } from 'node:child_process';
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
  /**
   * M2 v55 (ADR 0016 amendment 55): the OS pid, when the adapter knows it. Its absence is the
   * honest answer for a fake; its PRESENCE is what makes "kill the tree, not just the child"
   * possible at all — before v55 the host had no handle on the process it started, so a timeout
   * could only ever stop the direct child and report whatever a detached grandchild then did.
   */
  pid?: number;
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
    pid: child.pid,
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
  /**
   * SOME stream lost bytes. Since v53 `maxOutputBytes` is a PER-STREAM ceiling, so this flag says
   * nothing about the other stream — v48 trims each cut stream to whole lines independently, and a
   * door's sentence names whichever of the two applies.
   */
  truncated: boolean;
  /**
   * M2 v56 (ADR 0016 amendment 56): WHICH pipe the budget actually cut — present exactly when
   * `truncated` is true. The aggregate flag alone was measurably misleading: a command that prints a
   * 32-byte answer on stdout and floods stderr under a 1 024-byte ceiling produced
   * `exec node -e … → exit 0 (output truncated)` beside a stdout that was BYTE-IDENTICAL to the
   * answer, so the door cast doubt on the one thing it had received whole. Read doors have the
   * sharper version: v48's "no complete line survived the output budget" is a claim about the stream
   * the door parsed, and a cut on the OTHER stream must not trigger it.
   */
  truncatedStreams?: Array<'stdout' | 'stderr'>;
  /** True when the host killed the process IT started because the plan's timeout expired. */
  killedByBudget: boolean;
  /**
   * M2 v55 (ADR 0016 amendment 55): whether anything the command SPAWNED is also stopped. Present
   * exactly when a timeout kill happened. `killedByBudget` has always been a claim about ONE
   * process, and measurement showed it being read as a claim about the tree: a program that leaves
   * a detached child behind kept writing 6 more heartbeats AFTER the host reported
   * `killedByBudget: true, signal: SIGTERM`. Absent otherwise rather than defaulted, so every
   * pre-v55 record and reader keeps parsing (one-directional compatibility, as in v51).
   */
  descendantsStopped?: DescendantsStopped;
  /** Spawn-layer failure (ENOENT, EPERM…); '' when the process reported its own exit. */
  spawnError: string;
}

/**
 * M2 v55: what the host achieved against the process TREE. The failure names are deliberately not
 * collapsed into one "no" — an operator who asked for reaping needs to know whether the reason is
 * this platform, a missing handle, or a reaper call that failed.
 */
export type DescendantsStopped =
  | 'reaped' /** the tree reaper reported success and the survivor was silenced (measured, win32) */
  | 'reaper-failed' /** asked for, ran, reported failure */
  | 'no-pid' /** the adapter gave the host no process handle, so a tree kill is impossible */
  | 'unsupported-platform' /** no reaper is implemented here, and none was pretended */
  | 'not-attempted'; /** the host killed only its own child — v30's behaviour, still the default */

/** Injectable so the tree behaviour is unit-testable without an OS process. */
export type TreeReaper = (pid: number) => boolean;

/**
 * win32: `taskkill /PID <pid> /T /F`, and the ORDER is the finding. Measured on this box, calling it
 * AFTER `child.kill()` returns 128 ("not found") and the detached survivor keeps writing — a dead
 * parent has no children left to enumerate. Issued INSTEAD of `child.kill()` it returns 0 and the
 * survivor goes silent. So the host reaps by substitution, never in addition; the exit fields then
 * carry what the OS reported (code 1, signal null) beside `killedByBudget: true`, because the host
 * knows it killed the run and the process knows it was force-terminated.
 * Anywhere else: no implementation, and no pretending — the answer is `unsupported-platform`.
 */
export const DEFAULT_TREE_REAPER: (pid: number) => boolean = (pid) => {
  if (process.platform !== 'win32') return false;
  try {
    return spawnSyncLib('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
};
/** False on any platform where the host has no tree reaper, so `unsupported-platform` can be told apart from a failed call. */
export const TREE_REAPER_AVAILABLE = process.platform === 'win32';

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
   *
   * M2 v51: EVERY outcome of this method — including a refusal — is an audited event.
   */
  run(request: ExecRequest, opts?: { checkpoint?: Checkpoint; preApproved?: boolean; callId?: string }): Promise<ExecRunResult>;
}

/**
 * M2 v51 (ADR 0016 amendment 51): what the host appends when it is asked to keep records.
 * An `ExecRunResult` plus the two things only the host knows: its own order, and WHICH
 * allowlist rule let the command through (`null` exactly when the policy said no).
 */
export interface ExecAuditRecord extends ExecRunResult {
  /** Order within ONE host instance, from 1. The file's own line order is the record order across hosts. */
  seq: number;
  /** Index into `policy.allow`; non-null ⟺ `planned: true` — the invariant the reader re-checks. */
  rule: number | null;
}

export interface ExecJournalRef {
  disk: ExecJournalDisk;
  file: string;
}

export interface ExecHostOptions {
  spawnLike?: SpawnLike;
  /** Absent by design: a host keeps no records unless its operator asks for a file (§9 — no writes by default). */
  journal?: ExecJournalRef;
  /**
   * M2 v55: on a timeout, stop the process TREE instead of only the process the host started.
   * Default OFF, exactly as v51's journal — a host built without it behaves byte-identically to
   * v30-v53, which is what lets every already-committed proof be the assertion that nothing moved.
   */
  reapTree?: boolean;
  /** The reaper itself, injectable so the tree behaviour is testable without an OS process. */
  reaper?: TreeReaper;
}

export function createExecHost(policy: ExecPolicy, options: ExecHostOptions = {}): ExecHost {
  const spawnLike = options.spawnLike ?? NODE_SPAWN;
  const journal = options.journal;
  const reapTree = options.reapTree ?? false;
  const reaper = options.reaper ?? DEFAULT_TREE_REAPER;
  let seq = 0;
  return {
    policy,
    async run(request, opts = {}) {
      // v51: the record is written by the ONE function every process is born through, so no
      // caller can forget it and no door added later can escape it. A sink that cannot write
      // makes the CALL fail: a host asked to keep an audit trail never reports success about
      // something it could not record.
      const audit = (result: ExecRunResult, rule: number | null): void => {
        if (!journal) return;
        seq += 1; // BEFORE the write: a record that fails to land leaves a gap, which is what a gap should mean
        const record: ExecAuditRecord = { ...result, seq, rule };
        appendExecRun(journal.disk, journal.file, record);
      };
      const refuse = (over: Partial<ExecRunResult>, rule: number | null): ExecRunResult => {
        const result = noRun(over);
        audit(result, rule);
        return result;
      };
      const decision = planExec(request, policy);
      if (!decision.ok) return refuse({ reason: decision.reason }, null);
      const plan: ExecPlan = decision.plan;
      if (!opts.preApproved) {
        if (!opts.checkpoint) return refuse({ planned: true, reason: 'checkpoint required for exec (§28)' }, plan.matchedRule);
        const call: ToolCall = { callId: opts.callId ?? 'exec-host', tool: 'exec.run', args: { argv: plan.argv, cwd: plan.cwd } };
        const approved = await opts.checkpoint({ call, permissions: ['exec'] });
        if (!approved) return refuse({ planned: true, reason: 'checkpoint denied', argv: plan.argv, cwd: plan.cwd }, plan.matchedRule);
      }
      return await new Promise<ExecRunResult>((resolve, reject) => {
        const budget = plan.maxOutputBytes;
        // M2 v48 (ADR 0016 amendment 48): the budget accumulates RAW BYTES and decodes once.
        // Decoding per chunk turned a multibyte character straddling a chunk boundary into
        // U+FFFD, and cutting at a byte landed INSIDE a line — so a truncated read handed the
        // agent a line the program never printed, which every downstream parser then counted as
        // content. A cut stream therefore keeps only whole lines.
        // M2 v53 (ADR 0016 amendment 53): `budget` is now a PER-STREAM ceiling, so the host may hold
        // up to 2 × maxOutputBytes in total — that doubling is the honest price, and it is stated
        // here, in the policy docs and in the proof. Measured with real processes before choosing it:
        // one program writing 9 KB to stderr and then 19 B of answer to stdout, and the same program
        // in the opposite order, at one shared 4 KB budget. Under v30's single counter the
        // stderr-first order returned `stdout 0 B / stderr 0 B` (the big line spent the whole budget,
        // then v48 trimmed the partial line, so NOTHING survived) while stdout-first returned the
        // answer: whether an agent saw a command's output depended on WHICH PIPE FLUSHED FIRST. A
        // split-with-lending design was tried and rejected by the same reasoning — a fast stream can
        // always spend borrowed ground before the other one reaches it, so a borrowed share is not a
        // guarantee. What each stream gets is its own ceiling and nothing another program wrote can
        // take it away, which is also why every assertion below is order-independent.
        const chunks: Record<'stdout' | 'stderr', Buffer[]> = { stdout: [], stderr: [] };
        const cut: Record<'stdout' | 'stderr', boolean> = { stdout: false, stderr: false };
        const kept: Record<'stdout' | 'stderr', number> = { stdout: 0, stderr: 0 };
        let truncated = false;
        let killed = false;
        let descendants: DescendantsStopped | undefined;
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
          if (!cut[target]) return text; // an uncut stream keeps its final line even without a newline
          const lastBreak = text.lastIndexOf('\n');
          return lastBreak < 0 ? '' : text.slice(0, lastBreak + 1);
        };
        const child = spawnLike(plan.argv[0]!, plan.argv.slice(1), { cwd: plan.cwd, env: plan.env });
        child.onData(append);
        const timer = setTimeout(() => {
          killed = true;
          // M2 v55: `child.kill()` stops the process the host started and NOTHING else. When the
          // operator asked for a tree kill, the reaper is issued INSTEAD of that call — measured on
          // this box, kill-then-reap finds no children (the parent is already gone) while reap-in-place
          // silences a detached survivor. When reaping cannot happen at all, the host falls back to
          // what it always did AND SAYS SO in `descendantsStopped`; it never upgrades its own reach.
          if (!reapTree) {
            descendants = 'not-attempted';
            child.kill();
          } else if (child.pid === undefined) {
            descendants = 'no-pid';
            child.kill();
          } else if (!TREE_REAPER_AVAILABLE) {
            descendants = 'unsupported-platform';
            child.kill();
          } else {
            // A reaper that throws is a FAILED reaper, not a crashed host: the run already ran, and
            // the fallback kill still happens below.
            try {
              descendants = reaper(child.pid!) ? 'reaped' : 'reaper-failed';
            } catch {
              descendants = 'reaper-failed';
            }
            if (descendants !== 'reaped') child.kill(); // a failed tree call still stops the child it can reach
          }
        }, plan.timeoutMs);
        child.onEnd((e) => {
          clearTimeout(timer);
          const streams = (['stdout', 'stderr'] as const).filter((s) => cut[s]);
          const result: ExecRunResult = {
            ran: true,
            planned: true,
            reason: '',
            argv: [...plan.argv],
            cwd: plan.cwd,
            exitCode: e.code,
            signal: e.signal,
            stdout: textOf('stdout'),
            stderr: textOf('stderr'),
            truncated,
            ...(streams.length > 0 ? { truncatedStreams: [...streams] } : {}),
            killedByBudget: killed,
            ...(descendants === undefined ? {} : { descendantsStopped: descendants }),
            spawnError: e.error ?? '',
          };
          try {
            audit(result, plan.matchedRule); // written BEFORE the caller resumes, so a reader can always see the run it just did
          } catch (e) {
            reject(new Error(`exec audit failed for "${result.argv.join(' ')}" (the process ran and exited ${result.exitCode}; the record did not land): ${e instanceof Error ? e.message : String(e)}`));
            return;
          }
          resolve(result);
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
      const detail = `exec ${result.argv.join(' ')} → exit ${result.exitCode}${result.killedByBudget ? ' (killed at timeout budget)' : ''}${result.descendantsStopped === undefined || result.descendantsStopped === 'reaped' ? '' : ` (descendants: ${result.descendantsStopped})`}${result.truncated ? ` (output truncated${result.truncatedStreams && result.truncatedStreams.length > 0 ? `: ${result.truncatedStreams.join(' + ')}` : ''})` : ''}`;
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

/**
 * v51: an audit line must LOOK like one, and must OBEY the invariant the writer guarantees —
 * a rule number exactly when the policy approved. A record that claims `planned:true` with no
 * rule (or the reverse) was not written by this host; counting it malformed beats trusting it.
 */
function isExecAuditRecord(raw: unknown): raw is ExecAuditRecord {
  if (!isExecRunResult(raw)) return false;
  const r = raw as unknown as Record<string, unknown>;
  if (typeof r.seq !== 'number') return false;
  if (!(r.rule === null || typeof r.rule === 'number')) return false;
  return r.planned === (r.rule !== null);
}

type JournalDisk = { readFileSync(file: string, encoding: 'utf8'): string };

/** One append-only JSONL reader, two shapes: a line that fails its own gate is `malformed`, never upgraded. */
function readJournal<T>(disk: JournalDisk, file: string, guard: (raw: unknown) => raw is T, last?: number): { rows: T[]; malformed: number } {
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

export function loadExecRuns(disk: JournalDisk, file: string, last?: number): { runs: ExecRunResult[]; malformed: number } {
  const { rows, malformed } = readJournal(disk, file, isExecRunResult, last);
  return { runs: rows, malformed };
}

/** v51 reader: every outcome the host reported, in the order the host reported it. */
export function loadExecAudits(disk: JournalDisk, file: string, last?: number): { records: ExecAuditRecord[]; malformed: number } {
  const { rows, malformed } = readJournal(disk, file, isExecAuditRecord, last);
  return { records: rows, malformed };
}
