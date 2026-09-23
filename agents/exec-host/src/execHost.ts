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
  /**
   * SOME stream lost bytes. Since v53 `maxOutputBytes` is a PER-STREAM ceiling, so this flag says
   * nothing about the other stream — v48 trims each cut stream to whole lines independently, and a
   * door's sentence names whichever of the two applies.
   */
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
}

export function createExecHost(policy: ExecPolicy, options: ExecHostOptions = {}): ExecHost {
  const spawnLike = options.spawnLike ?? NODE_SPAWN;
  const journal = options.journal;
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
          child.kill();
        }, plan.timeoutMs);
        child.onEnd((e) => {
          clearTimeout(timer);
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
            killedByBudget: killed,
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
