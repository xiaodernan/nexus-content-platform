import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '@nexus/agent-runtime';
import type { ExecPolicy, SpawnLike } from '@nexus/agent-runtime';
import {
  DEFAULT_TREE_REAPER,
  EXEC_HOST_TOOL_SPECS,
  TREE_REAPER_AVAILABLE,
  appendExecRun,
  createExecHost,
  formatExecLine,
  loadExecAudits,
  loadExecRuns,
  registerExecHostTools,
  type ExecAuditRecord,
  type ExecChild,
  type ExecJournalRef,
  type ExecRunResult,
  type TreeReaper,
} from '../src/execHost.js';

const POLICY: ExecPolicy = {
  root: 'X:/jail',
  allow: [{ argv: ['node', 'app.js'], timeoutMs: 60_000, maxOutputBytes: 1_000 }, { argv: ['git', 'status', '*'], timeoutMs: 20, maxOutputBytes: 6 }],
  envAllow: ['PATH'],
};

class FakeChild implements ExecChild {
  killed = false;
  private data: Array<(s: 'stdout' | 'stderr', c: Buffer | string) => void> = [];
  private ends: Array<(e: { code: number | null; signal: string | null; error?: string }) => void> = [];
  onData(l: (s: 'stdout' | 'stderr', c: Buffer | string) => void) {
    this.data.push(l);
  }
  onEnd(l: (e: { code: number | null; signal: string | null; error?: string }) => void) {
    this.ends.push(l);
  }
  kill() {
    this.killed = true;
    this.emitEnd({ code: null, signal: 'SIGTERM' });
  }
  emitData(s: 'stdout' | 'stderr', c: Buffer | string) {
    for (const l of this.data) l(s, c);
  }
  emitEnd(e: { code: number | null; signal: string | null; error?: string }) {
    for (const l of this.ends) l(e);
  }
}

interface Harness {
  host: ReturnType<typeof createExecHost>;
  calls: { command: string; args: string[]; opts: { cwd: string; env: Record<string, string> } }[];
  lastChild: () => FakeChild;
}

/** spawnLike that starts NOTHING: the child is fake and auto-exits on a microtask. */
function harness(end: { code?: number | null; signal?: string | null } = { code: 0, signal: null }, chunks: ['stdout' | 'stderr', Buffer | string][] = [], journal?: ExecJournalRef): Harness {
  const calls: Harness['calls'] = [];
  let child: FakeChild | undefined;
  const spawnLike: SpawnLike = (command, args, opts) => {
    calls.push({ command, args, opts });
    child = new FakeChild();
    const c = child;
    queueMicrotask(() => {
      for (const [s, t] of chunks) c.emitData(s, t);
      if (end.code !== undefined || end.signal !== undefined) c.emitEnd({ code: end.code ?? null, signal: end.signal ?? null });
    });
    return c;
  };
  return { host: createExecHost(POLICY, { spawnLike, journal }), calls, lastChild: () => child! };
}

const OK_GATE = { checkpoint: () => true };

describe('createExecHost (v30: only what planExec approved ever spawns)', () => {
  it('an allowlisted run spawns argv-as-data with the PLAN cwd/env, and reports exit 0', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'all good']]);
    const r = await h.host.run({ argv: ['node', 'app.js'], cwd: 'sub', env: { PATH: '/bin', SECRET: 'no' } }, OK_GATE);
    expect(h.calls).toEqual([{ command: 'node', args: ['app.js'], opts: { cwd: 'X:/jail/sub', env: { PATH: '/bin' } } }]);
    expect(r).toMatchObject({ ran: true, planned: true, exitCode: 0, stdout: 'all good', stderr: '', truncated: false, killedByBudget: false, spawnError: '' });
    expect(r.argv).toEqual(['node', 'app.js']);
  });

  it('an argument keeps its spaces: argv tokens are NEVER re-tokenized or shell-parsed', async () => {
    const h = harness({ code: 0, signal: null });
    // the '*' slot takes the WHOLE quoted string as one argv element, spaces and all
    await h.host.run({ argv: ['git', 'status', '--long --cached'] }, OK_GATE);
    expect(h.calls[0]!.args).toEqual(['status', '--long --cached']);
  });

  it('a policy refusal spawns NOTHING even if a checkpoint would approve it (policy outranks the gate)', async () => {
    const h = harness();
    const r = await h.host.run({ argv: ['curl', 'http://evil.test'] }, { checkpoint: () => true });
    expect(h.calls).toHaveLength(0);
    expect(r).toMatchObject({ ran: false, planned: false });
    expect(r.reason).toContain('default-deny');
  });

  it('§28 at the host: no checkpoint ⇒ stated refusal, nothing spawns; deny ⇒ planned:true + denied', async () => {
    const h = harness();
    const ungated = await h.host.run({ argv: ['node', 'app.js'] });
    expect(h.calls).toHaveLength(0);
    expect(ungated).toMatchObject({ ran: false, planned: true, reason: 'checkpoint required for exec (§28)' });
    const denied = await h.host.run({ argv: ['node', 'app.js'] }, { checkpoint: () => false });
    expect(h.calls).toHaveLength(0);
    expect(denied).toMatchObject({ ran: false, planned: true, reason: 'checkpoint denied' });
  });

  it('an approving checkpoint is asked with an exec-permission ToolCall carrying the planned argv', async () => {
    const h = harness();
    const seen: unknown[] = [];
    const r = await h.host.run({ argv: ['node', 'app.js'], env: { PATH: '/bin' } }, {
      checkpoint: (req) => {
        seen.push(req);
        return true;
      },
    });
    expect(r.ran).toBe(true);
    expect(seen).toEqual([{ call: { callId: 'exec-host', tool: 'exec.run', args: { argv: ['node', 'app.js'], cwd: 'X:/jail' } }, permissions: ['exec'] }]);
  });

  it('output budget: EACH stream is hard-capped on its own, the cut is marked truncated (v48 lines, v53 per-stream)', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'ab\ncd\n'], ['stderr', 'efghij\n']]); // 6-byte cap: stdout fits, stderr loses a byte
    const r = await h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE); // rule caps at 6 bytes
    expect(r.stdout).toBe('ab\ncd\n'); // v53: stdout keeps its full 6 bytes — stderr's overflow no longer reaches it
    expect(r.stderr).toBe(''); // the 6 kept bytes end mid-line, and v48 refuses to call half a line content
    expect(r.truncated).toBe(true); // one flag, two possible causes: the cut is attributed per stream
  });

  // M2 v53 (ADR 0016 amendment 53): that 6-byte cap used to be a SINGLE counter shared by both
  // pipes, which meant the order a program wrote in decided who was heard at all. Measured against
  // real processes before the change: 9 KB to stderr then 19 B of answer to stdout, at a 4 KB
  // budget, returned `stdout 0 B / stderr 0 B` (the big line spent everything, then v48 trimmed the
  // partial line, so nothing survived) while the same program writing stdout first returned the
  // answer. Each stream now has its own ceiling — the cost is that the host can hold 2 × cap, and
  // that is what the totals case below pins.
  it('write order no longer decides who is heard: the same bytes, both orders, same answer', async () => {
    const answer = 'RESULT-LINE\nsecond\n';
    const loud = `${'E'.repeat(99)}\n`.repeat(91); // 9 100 B of progress lines on ONE stream
    const loudFirst = harness({ code: 0, signal: null }, [['stderr', loud], ['stdout', answer]]);
    const quietFirst = harness({ code: 0, signal: null }, [['stdout', answer], ['stderr', loud]]);
    const a = await loudFirst.host.run({ argv: ['node', 'app.js'] }, OK_GATE); // rule caps at 1 000 bytes
    const b = await quietFirst.host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect(a.stdout).toBe(answer);
    expect(b.stdout).toBe(answer);
    expect(a.stdout).toBe(b.stdout); // the pre-v53 assertion that could not be made: order-independence
    expect(Buffer.byteLength(a.stderr, 'utf8')).toBe(1000); // the loud stream is the one that got cut, to its own ceiling
    expect(a.truncated).toBe(true);
  });

  it('the ceiling is per stream, so the host holds at most 2 × the policy number', async () => {
    const flooded = `${'x'.repeat(99)}\n`.repeat(51); // 5 100 B, newline every 100 B
    const h = harness({ code: 0, signal: null }, [['stderr', flooded], ['stdout', flooded]]);
    const r = await h.host.run({ argv: ['node', 'app.js'] }, OK_GATE); // 1 000-byte cap on EACH stream
    expect(Buffer.byteLength(r.stdout, 'utf8')).toBe(1000);
    expect(Buffer.byteLength(r.stderr, 'utf8')).toBe(1000);
    expect(r.truncated).toBe(true);
    expect(r.stdout.endsWith('\n')).toBe(true); // v48 still owns the shape of a cut: whole lines only
  });

  it('an entirely-cut stream is stated as CUT, not as a program that said nothing (v53 × v52)', async () => {
    const h = harness({ code: 1, signal: null }, [['stdout', 'no newline at all and it keeps going']]);
    const r = await h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE); // 6 bytes, no \n inside them
    expect(r.stdout).toBe('');
    expect(r.truncated).toBe(true); // the host's own claim: bytes were dropped, not that none existed
  });

  // M2 v56 (ADR 0016 amendment 56): `truncated` alone could not say WHICH pipe overflowed, so a door
  // cast doubt on an answer it had received whole. The host now reports the streams it cut, in a
  // stable order, and says nothing at all when it cut nothing.
  it('the host names the pipe it cut, in a stable order, and is silent when it cut nothing', async () => {
    const oneSided = await harness({ code: 0, signal: null }, [['stdout', 'ab\ncd\n'], ['stderr', 'efghij\n']]).host.run({ argv: ['git', 'status', '--short'] }, OK_GATE);
    expect(oneSided.stdout).toBe('ab\ncd\n'); // the answer arrived whole
    expect(oneSided.truncatedStreams).toEqual(['stderr']); // and the sentence can now say whose it was
    const both = await harness({ code: 0, signal: null }, [['stderr', 'efghij\n'], ['stdout', 'ab\ncd\nef\n']]).host.run({ argv: ['git', 'status', '--short'] }, OK_GATE);
    expect(both.truncatedStreams).toEqual(['stdout', 'stderr']); // order follows the streams, not the arrival order
    const clean = await harness({ code: 0, signal: null }, [['stdout', 'ok\n']]).host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect('truncatedStreams' in clean).toBe(false); // absent, not []: nothing was cut, so there is nothing to name
  });

  it('exec.run says WHICH output was truncated — the sentence a human reads before approving', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'ab\ncd\n'], ['stderr', 'efghij\n']]);
    const registry = new ToolRegistry();
    registerExecHostTools(registry, h.host);
    const res = await registry.invoke({ callId: 't9', tool: 'exec.run', args: { argv: ['git', 'status', '--short'] } }, OK_GATE);
    const detail = (res.output as { detail: string }).detail;
    expect(detail).toContain('output truncated: stderr');
    expect(detail).not.toContain('stdout)'); // the intact stream is not implicated
  });

  // M2 v48: the budget is measured in bytes, but it spends them on LINES. What it cannot fit it
  // does not report — an earlier shape decoded chunk-by-chunk and cut at the byte, so a truncated
  // read handed parsers a line the program never printed (measured against real git: an
  // `addedLines` entry of `line 5 — 中`, and one with a U+FFFD inside it).
  it('a cut stream keeps whole lines and drops the partial one, in bytes not characters', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'l1\nl2\nl3']]); // 3+3+2 bytes against a 6-byte cap
    const r = await h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE);
    expect(r.stdout).toBe('l1\nl2\n');
    expect(r.truncated).toBe(true);
  });

  it('an UNCUT stream keeps its final line even when it never got a newline (verbatim, not trimmed)', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'no trailing newline']]);
    const r = await h.host.run({ argv: ['node', 'app.js'] }, OK_GATE); // this rule caps at 1 000 bytes
    expect(r.stdout).toBe('no trailing newline');
    expect(r.truncated).toBe(false);
  });

  it('v53: a cut on one stream no longer touches the other (the old test here proved the OPPOSITE)', async () => {
    // Pre-v53 this fed stdout 5 B and stderr 4 B through a 6-byte SHARED counter and asserted
    // `stdout 'abcd\n', stderr ''` — the very order-dependence v53 removes. Each stream now holds
    // its own 6-byte ceiling, so a 4-byte stderr that fits is kept verbatim.
    const h = harness({ code: 0, signal: null }, [['stdout', 'abcd\n'], ['stderr', 'efgh']]);
    const r = await h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE);
    expect(r.stdout).toBe('abcd\n');
    expect(r.stderr).toBe('efgh'); // v30/v48 dropped this because stdout had spent the shared budget
    expect(r.truncated).toBe(false); // nothing was cut: each stream was inside its own ceiling
  });

  it('a multibyte character split across CHUNK boundaries is one character, not U+FFFD (bytes are decoded once, at the end)', async () => {
    const han = Buffer.from('汉', 'utf8'); // E6 B1 89 — deliberately torn between its first and last byte
    const zi = Buffer.from('字\n', 'utf8');
    const h = harness({ code: 0, signal: null }, [['stdout', han.subarray(0, 2)], ['stdout', Buffer.concat([han.subarray(2), zi])]]);
    const r = await h.host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect(r.stdout).toBe('汉字\n');
    expect(r.stdout.includes(String.fromCodePoint(0xfffd))).toBe(false);
    expect(r.truncated).toBe(false);
  });

  it('timeout budget: a child that never ends is killed, and killedByBudget flips the verdict data', async () => {
    const h = harness({}, []); // never auto-ends
    const r = await h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE); // rule timeoutMs = 20
    expect(r.ran).toBe(true);
    expect(r.killedByBudget).toBe(true);
    expect(r.signal).toBe('SIGTERM');
    expect(h.lastChild().killed).toBe(true);
  });

  it('a spawn-layer failure (ENOENT) is structured data, not a crash', async () => {
    const spawnLike: SpawnLike = () => {
      const c = new FakeChild();
      queueMicrotask(() => c.emitEnd({ code: null, signal: null, error: 'spawn node ENOENT' }));
      return c;
    };
    const host = createExecHost(POLICY, { spawnLike });
    const r = await host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect(r).toMatchObject({ ran: true, exitCode: null, spawnError: 'spawn node ENOENT' });
  });
});

describe('the exec.run tool in the gated registry (§28 at the registry, budgets at the host)', () => {
  const setup = (h: Harness) => {
    const registry = new ToolRegistry();
    registerExecHostTools(registry, h.host);
    return registry;
  };

  it('exec.run is exec-permission: without a checkpoint the tool NEVER reaches the host', async () => {
    const h = harness();
    const res = await setup(h).invoke({ callId: 'c1', tool: 'exec.run', args: { argv: ['node', 'app.js'] } });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('checkpoint required for exec');
    expect(h.calls).toHaveLength(0);
  });

  it('granted + exit 0 ⇒ {ok, detail} with the full result riding along', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'done']]);
    const res = await setup(h).invoke({ callId: 'c2', tool: 'exec.run', args: { argv: ['node', 'app.js'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(true);
    const out = res.output as { ok: boolean; detail: string; result: ExecRunResult };
    expect(out.ok).toBe(true);
    expect(out.detail).toContain('exit 0');
    expect(out.result.stdout).toBe('done');
  });

  it('a policy refusal surfaces as a tool ERROR (never a silent success), registry gate included', async () => {
    const h = harness();
    const res = await setup(h).invoke({ callId: 'c3', tool: 'exec.run', args: { argv: ['rm', '-rf', '/'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('default-deny');
  });

  it('a nonzero exit is ok:false WITHOUT throwing: detail states the code, result carries stderr', async () => {
    const h = harness({ code: 3, signal: null }, [['stderr', 'bad flag']]);
    const res = await setup(h).invoke({ callId: 'c4', tool: 'exec.run', args: { argv: ['node', 'app.js'] } }, { checkpoint: () => true });
    expect(res.ok).toBe(true); // the CALL succeeded; the exit verdict is in the output
    const out = res.output as { ok: boolean; detail: string; result: ExecRunResult };
    expect(out.ok).toBe(false);
    expect(out.detail).toContain('exit 3');
    expect(out.result.stderr).toContain('bad flag');
  });

  it('the spec is registered with exec permission', () => {
    expect(EXEC_HOST_TOOL_SPECS[0]).toMatchObject({ name: 'exec.run', permissions: ['exec'] });
  });
});

/**
 * M2 v55 (ADR 0016 amendment 55): a fake that models the OS fact the increment is about — the
 * direct child does NOT end just because it was told to; what ends it is the reaper (or nothing).
 * `reaped` records exactly which pid the host tried, because the ORDER of the two calls is the
 * whole finding: kill-then-reap reaches no one, reap-instead-of-kill silences the survivor.
 */
function treeHarness(options: { pid?: number; reapTree?: boolean; reaperResult?: boolean; reaperThrows?: boolean }) {
  const reaped: (number | 'threw')[] = [];
  let kills = 0;
  let child: FakeChild | undefined;
  const spawnLike: SpawnLike = () => {
    const c = new FakeChild();
    c.kill = () => {
      kills += 1;
      c.killed = true;
      c.emitEnd({ code: null, signal: 'SIGTERM' });
    }; // like the real FakeChild: the direct kill ends THIS process, and only this one
    child = c;
    return options.pid === undefined ? { onData: (l) => c.onData(l), onEnd: (l) => c.onEnd(l), kill: c.kill } : { onData: (l) => c.onData(l), onEnd: (l) => c.onEnd(l), kill: c.kill, pid: options.pid };
  };
  const reaper: TreeReaper = (pid) => {
    reaped.push(pid);
    if (options.reaperThrows) throw new Error('taskkill unavailable');
    if (options.reaperResult ?? true) queueMicrotask(() => child!.emitEnd({ code: 1, signal: null }));
    return options.reaperResult ?? true;
  };
  const host = createExecHost(POLICY, { spawnLike, reapTree: options.reapTree, reaper });
  return { host, reaped, killsOf: () => kills, lastChild: () => child! };
}

describe('the process tree (v55): what a timeout kill stops, and what it says it stopped', () => {
  const run = async (h: ReturnType<typeof treeHarness>) => h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE); // the rule with the 20 ms timeout

  it('by default the host kills its OWN child and says the tree was not attempted', async () => {
    const h = treeHarness({ pid: 4242 });
    const r = await run(h);
    expect(r.killedByBudget).toBe(true);
    expect(r.descendantsStopped).toBe('not-attempted');
    expect(h.reaped).toEqual([]); // no reaper was called: v30-v53 behaviour is byte-identical
    expect(h.killsOf()).toBe(1);
  });

  it('when reaping happens it is issued INSTEAD of the direct kill, on the pid the adapter reported', async () => {
    const h = treeHarness({ pid: 4242, reapTree: true });
    const r = await run(h);
    expect(h.reaped).toEqual([4242]);
    expect(h.killsOf()).toBe(0); // kill-then-reap is the shape that silently fails (measured: status 128, survivor writes on)
    expect(r).toMatchObject({ ran: true, killedByBudget: true, descendantsStopped: 'reaped', exitCode: 1, signal: null });
  });

  it('a failed tree call still stops the child it CAN reach, and names the difference', async () => {
    const h = treeHarness({ pid: 4242, reapTree: true, reaperResult: false });
    const r = await run(h);
    expect(h.reaped).toEqual([4242]);
    expect(r.descendantsStopped).toBe('reaper-failed');
    expect(r.signal).toBe('SIGTERM'); // the fallback kill is what ended the run
    expect(h.killsOf()).toBe(1);
  });

  it('a reaper that throws is a stated failure, never a crash of the CALL', async () => {
    const h = treeHarness({ pid: 4242, reapTree: true, reaperThrows: true });
    const r = await run(h);
    expect(r.descendantsStopped).toBe('reaper-failed');
    expect(r.killedByBudget).toBe(true);
  });

  it('an adapter that reports no pid is answered honestly: no handle, no tree claim', async () => {
    const h = treeHarness({ reapTree: true }); // no pid on the ExecChild
    const r = await run(h);
    expect(r.descendantsStopped).toBe('no-pid');
    expect(h.reaped).toEqual([]);
    expect(h.killsOf()).toBe(1);
  });

  it('a run that was never killed carries no claim about descendants at all', async () => {
    const host = createExecHost(POLICY, {
      spawnLike: () => ({ onData: () => {}, onEnd: (l) => queueMicrotask(() => l({ code: 0, signal: null })), kill: () => {}, pid: 4242 }),
      reapTree: true,
      reaper: () => true,
    });
    const r = await host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    expect(r.killedByBudget).toBe(false);
    expect('descendantsStopped' in r).toBe(false); // absent, not defaulted: the host does not answer a question it was not asked
  });

  it('the platform answer is a value the operator can read, not a silent no', async () => {
    expect(typeof TREE_REAPER_AVAILABLE).toBe('boolean');
    expect(DEFAULT_TREE_REAPER(0)).toBe(false); // pid 0 is not somebody elus process; and the call must not throw
  });
});

class MemDisk {  files = new Map<string, string>();
  readFileSync(p: string): string {
    const c = this.files.get(p);
    if (c === undefined) throw new Error(`no such file: ${p}`);
    return c;
  }
  mkdirSync(): void {}
  writeFileSync(p: string, data: string): void {
    this.files.set(p, data);
  }
}

describe('exec journal (append-only JSONL, ledger discipline)', () => {
  const okRun: ExecRunResult = { ran: true, planned: true, reason: '', argv: ['git', 'status', '--short'], cwd: 'X:/jail', exitCode: 0, signal: null, stdout: 'clean', stderr: '', truncated: false, killedByBudget: false, spawnError: '' };
  const deniedRun: ExecRunResult = { ...okRun, ran: false, planned: true, reason: 'checkpoint denied', exitCode: null, stdout: '' };

  it('append → reload round-trips; malformed and shape-wrong lines are counted, never trusted', () => {
    const disk = new MemDisk();
    appendExecRun(disk, 'logs/exec.jsonl', okRun);
    appendExecRun(disk, 'logs/exec.jsonl', deniedRun);
    disk.files.set('logs/exec.jsonl', `${disk.files.get('logs/exec.jsonl')!}garbage\n{"ran":true}\n`);
    const load = loadExecRuns(disk, 'logs/exec.jsonl');
    expect(load.runs).toEqual([okRun, deniedRun]);
    expect(load.malformed).toBe(2);
  });

  it('last-N keeps the trailing runs; missing file reads empty; formatExecLine is one line', () => {
    const disk = new MemDisk();
    appendExecRun(disk, 'x/e.jsonl', okRun);
    appendExecRun(disk, 'x/e.jsonl', deniedRun);
    expect(loadExecRuns(disk, 'x/e.jsonl', 1).runs).toEqual([deniedRun]);
    expect(loadExecRuns(disk, 'x/none.jsonl')).toEqual({ runs: [], malformed: 0 });
    expect(formatExecLine(okRun).split('\n')).toHaveLength(1);
  });
});

/**
 * M2 v51 (ADR 0016 amendment 51): the journal above existed since v30 as an API — and NOTHING in
 * product code ever called it, so the sandbox's own most consequential act (a policy refusal) left
 * no trace, and "which processes really ran" was recoverable only from the agent's narrated results
 * one layer up. Now the record is written BY the host, inside run(). On trial here: every outcome
 * lands exactly once, in the host's own order, refusal included; the record hides nothing from and
 * adds nothing to what the caller was told; a line that breaks the writer's invariant is refused
 * rather than trusted; and a sink that cannot write makes the CALL fail, because a host asked to
 * keep an audit trail must never report success about something it could not record.
 */
describe('exec audit journal (v51): run() records its own outcomes, refusals included', () => {
  const FILE = 'logs/exec-audit.jsonl';

  it('four outcomes, four records, one process: the refusals are on the record too', async () => {
    const disk = new MemDisk();
    const h = harness({ code: 0, signal: null }, [['stdout', 'ok']], { disk, file: FILE });
    const refused = await h.host.run({ argv: ['curl', 'http://evil.test'] }, OK_GATE); // policy: no rule matched
    const ungated = await h.host.run({ argv: ['node', 'app.js'] }); // §28: no gate, so nothing spawns
    const denied = await h.host.run({ argv: ['node', 'app.js'] }, { checkpoint: () => false }); // human: no
    const ran = await h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE);
    expect([refused.ran, ungated.ran, denied.ran, ran.ran]).toEqual([false, false, false, true]);
    expect(h.calls).toHaveLength(1); // three refusals, one process — and FOUR records

    const { records, malformed } = loadExecAudits(disk, FILE);
    expect(malformed).toBe(0);
    expect(records.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
    // `rule` is the allowlist index, so it is a number EXACTLY when the policy said yes
    expect(records.map((r) => r.rule)).toEqual([null, 0, 0, 1]);
    expect(records.map((r) => [r.planned, r.reason])).toEqual([
      [false, expect.stringContaining('default-deny')],
      [true, 'checkpoint required for exec (§28)'],
      [true, 'checkpoint denied'],
      [true, ''],
    ]);
    expect(records.map((r) => r.argv)).toEqual([[], [], ['node', 'app.js'], ['git', 'status', '--short']]);
  });

  it('the record says what the caller was told — the journal adds two fields and hides nothing', async () => {
    const disk = new MemDisk();
    const h = harness({ code: 0, signal: null }, [['stdout', 'ok']], { disk, file: FILE });
    const ran = await h.host.run({ argv: ['git', 'status', '--short'] }, OK_GATE);
    const { records } = loadExecAudits(disk, FILE);
    const { seq, rule, ...without } = records[0] as ExecAuditRecord;
    expect(without).toEqual(ran);
    expect([seq, rule]).toEqual([1, 1]);
  });

  it('a host with no journal configured writes NOTHING anywhere (the default is today, unchanged)', async () => {
    const disk = new MemDisk();
    const h = harness({ code: 0, signal: null }, [['stdout', 'ok']]); // no journal argument at all
    await h.host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    await h.host.run({ argv: ['curl', 'x'] }, OK_GATE);
    expect(disk.files.size).toBe(0);
    expect(h.calls).toHaveLength(1);
  });

  it('v30 and v51 read each other in ONE direction, and the direction is the honest one', () => {
    const disk = new MemDisk();
    const v30Line: ExecRunResult = { ran: true, planned: true, reason: '', argv: ['node', 'app.js'], cwd: 'X:/jail', exitCode: 0, signal: null, stdout: 'x', stderr: '', truncated: false, killedByBudget: false, spawnError: '' };
    appendExecRun(disk, FILE, v30Line); // a pre-v51 line: no seq, no rule
    disk.files.set(FILE, `${disk.files.get(FILE)!}${formatExecLine({ ...v30Line, seq: 1, rule: 0 } as unknown as ExecRunResult)}\n`);
    expect(loadExecRuns(disk, FILE).runs).toHaveLength(2); // v30's reader: extra keys are nobody's business
    const audits = loadExecAudits(disk, FILE);
    expect(audits.records.map((r) => r.seq)).toEqual([1]); // v51's reader refuses a line it cannot order
    expect(audits.malformed).toBe(1);
  });

  it('the writer invariant is a GATE, not a comment: a hand-edited line is counted, never trusted', () => {
    const disk = new MemDisk();
    const base = { ran: true, planned: true, reason: '', argv: ['node', 'app.js'], cwd: 'X:/jail', exitCode: 0, signal: null, stdout: '', stderr: '', truncated: false, killedByBudget: false, spawnError: '' };
    disk.files.set(FILE, [
      { ...base, seq: 1, rule: null }, // claims a run the policy never approved
      { ...base, planned: false, seq: 2, rule: 0 }, // claims a refusal that DID match a rule
      { ...base, rule: 0, seq: 'one' }, // not even a number
    ].map((r) => JSON.stringify(r)).join('\n') + '\n');
    const audits = loadExecAudits(disk, FILE);
    expect(audits.records).toEqual([]);
    expect(audits.malformed).toBe(3);
    expect(loadExecRuns(disk, FILE).runs).toHaveLength(3); // the old reader would have believed all three (§60)
  });

  it('a sink that cannot write fails the CALL, loudly, on both paths — and never pretends the process did not run', async () => {
    const disk = new MemDisk();
    disk.writeFileSync = (): void => {
      throw new Error('disk full');
    };
    const h = harness({ code: 0, signal: null }, [['stdout', 'ok']], { disk, file: FILE });
    await expect(h.host.run({ argv: ['curl', 'x'] }, OK_GATE)).rejects.toThrow('disk full'); // refusal path: before any spawn
    await expect(h.host.run({ argv: ['node', 'app.js'] }, OK_GATE)).rejects.toThrow(/exec audit failed.*the process ran and exited 0/);
    expect(h.calls).toHaveLength(1); // the command DID run: the failure is the record's, not the command's
    expect(disk.files.size).toBe(0);
  });

  it('two hosts sharing a file: seq orders one host, so the line order of the file is the record', async () => {
    const disk = new MemDisk();
    const a = harness({ code: 0, signal: null }, [['stdout', 'A']], { disk, file: 'two.jsonl' });
    const b = harness({ code: 0, signal: null }, [['stdout', 'B']], { disk, file: 'two.jsonl' });
    await a.host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    await b.host.run({ argv: ['node', 'app.js'] }, OK_GATE);
    const { records } = loadExecAudits(disk, 'two.jsonl');
    expect(records.map((r) => r.stdout)).toEqual(['A', 'B']); // write order survives
    expect(records.map((r) => r.seq)).toEqual([1, 1]); // and the reader is TOLD seq is per-host
  });
});
