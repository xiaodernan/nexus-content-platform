import { describe, expect, it } from 'vitest';
import { InMemoryWorkspace, ToolRegistry, registerTestTools, registerWorkspaceTools, runTask } from '@nexus/agent-runtime';
import type { ExecPolicy, SpawnLike } from '@nexus/agent-runtime';
import { createExecHost, type ExecChild } from '../src/execHost.js';
import { execTestRunner, NEVER_RAN } from '../src/execTestRunner.js';

const POLICY: ExecPolicy = {
  root: 'X:/jail',
  allow: [{ argv: ['node', 'app.js'], timeoutMs: 60_000, maxOutputBytes: 2_000 }, { argv: ['git', 'status', '*'], timeoutMs: 20, maxOutputBytes: 200 }],
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

function harness(end: { code?: number | null; signal?: string | null } = { code: 0, signal: null }, chunks: ['stdout' | 'stderr', string][] = []) {
  const calls: string[][] = [];
  let child: FakeChild | undefined;
  const spawnLike: SpawnLike = (command, args) => {
    calls.push([command, ...args]);
    child = new FakeChild();
    const c = child;
    queueMicrotask(() => {
      for (const [s, t] of chunks) c.emitData(s, t);
      if (end.code !== undefined || end.signal !== undefined) c.emitEnd({ code: end.code ?? null, signal: end.signal ?? null });
    });
    return c;
  };
  return { host: createExecHost(POLICY, { spawnLike }), calls, lastChild: () => child! };
}

const PASS_OPTS = { preApproved: true };

describe('execTestRunner (v31: a real command answers the §63 verify step)', () => {
  it('exit 0 → passing report whose engine NAMES the argv, shape identical to predicates', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', 'all good']]);
    const rep = await execTestRunner(h.host, ['node', 'app.js'], PASS_OPTS).run();
    expect(rep).toMatchObject({ engine: 'exec-host:node app.js', ok: true, total: 1, passed: 1, failures: [] });
    // v60: the pipe is named. Before v60 this read `exit 0 · all good`, which was true only because
    // nothing else was printed — the sentence did not say WHERE the text came from.
    expect(rep.detail).toBe('exec-host:node app.js: 1/1 passed — exit 0 · stdout: all good');
  });

  it('exit 1 with stderr → failing report carrying the exit code and stderr VERBATIM, on its own pipe', async () => {
    const h = harness({ code: 1, signal: null }, [['stderr', 'boom: assertion failed']]);
    const rep = await execTestRunner(h.host, ['node', 'app.js'], PASS_OPTS).run();
    expect(rep.ok).toBe(false);
    // v60 changed this expectation from `exit 1 · boom: assertion failed`: the words are the
    // command's, the pipe label is the bridge's, and the two are no longer glueable into one blob.
    expect(rep.failures).toEqual([{ name: 'exit-zero', message: 'exit 1 · stderr: boom: assertion failed' }]);
  });

  it('timeout kill → honest failure: budget death is NEVER exit-code 0 noise', async () => {
    const h = harness({}, []); // never auto-ends; git rule caps at 20ms
    const rep = await execTestRunner(h.host, ['git', 'status', '--short'], PASS_OPTS).run();
    expect(rep.ok).toBe(false);
    expect(rep.failures[0]!.message).toContain('killed at timeout budget (SIGTERM)');
    // v55's fact, now spoken by the bridge too: the host stopped the process IT started, and the
    // tree it left behind is a separate answer the caller is entitled to read.
    expect(rep.failures[0]!.message).toContain('(descendants: not-attempted)');
    // v60: `exit null` used to be printed here — a sentence about an exit code, for a process that
    // never exited. The absence is named as an absence; nothing is invented either way.
    expect(rep.failures[0]!.message).toContain('no exit code reported');
    expect(rep.failures[0]!.message.includes('exit null'), 'a killed run has no exit code to print').toBe(false);
    expect(h.lastChild().killed).toBe(true);
  });

  it('a policy refusal becomes a FAILING report with the stated reason — never a crash, never a spawn', async () => {
    const h = harness();
    const rep = await execTestRunner(h.host, ['curl', 'http://evil.test'], PASS_OPTS).run();
    expect(h.calls).toHaveLength(0);
    expect(rep.ok).toBe(false);
    expect(rep.total).toBe(1);
    expect(rep.failures[0]!.message).toContain('default-deny');
    // v60: the failure is filed under NEVER_RAN, not under the predicate's own name. The dock chip
    // renders `failures[0].name`, so `exit-zero: no allowlist rule matches…` read as a test that
    // ran and failed. `total` stays 1 on purpose — it counts a predicate IN SCOPE (runPredicates'
    // contract), and zeroing it would make `registerTestTools` answer an asked-for `only` with
    // "no test predicate named exit-zero", replacing one lie with another.
    expect(rep.failures[0]!.name).toBe(NEVER_RAN);
    expect(rep.detail).toContain('never ran:');
  });

  it('§28 at the bridge: without preApproved the host refuses and the report says exactly that', async () => {
    const h = harness();
    const rep = await execTestRunner(h.host, ['node', 'app.js']).run();
    expect(h.calls).toHaveLength(0);
    // v60 expectation change (was: name 'exit-zero', message the bare reason): same reason, now
    // labelled as a run that never happened.
    expect(rep.failures).toEqual([
      {
        name: NEVER_RAN,
        message: 'never ran: checkpoint required for exec (§28) · the 0/1 beside this sentence counts a predicate that was IN SCOPE, not a test that ran and failed',
      },
    ]);
  });

  it('an asked-for `only` on a REFUSED run is still a report, not a "no such predicate" error', async () => {
    const h = harness();
    const registry = registerTestTools(new ToolRegistry(), execTestRunner(h.host, ['curl', 'http://evil.test'], PASS_OPTS));
    const res = await registry.invoke({ callId: 'c-refused', tool: 'test.run', args: { only: 'exit-zero' } }, { checkpoint: () => true });
    const out = res.output as { ok: boolean; detail: string; report: { total: number; failures: Array<{ name: string }> } };
    expect(res.ok, 'the TOOL answered — a refusal is a verdict, not a crash').toBe(true);
    expect(out.ok).toBe(false);
    expect(out.report.total, 'total 0 here would make the tool answer "no test predicate named exit-zero"').toBe(1);
    expect(out.report.failures[0]!.name).toBe(NEVER_RAN);
    expect(out.detail).toContain('never ran:');
    expect(h.calls).toHaveLength(0, 'a refusal must not pay for a spawn just to fill in a number');
  });

  it('`only` on another name → vacuous total-0 report (the tool turns it into a stated error)', async () => {
    const h = harness();
    const rep = await execTestRunner(h.host, ['node', 'app.js'], PASS_OPTS).run('ghost');
    expect(rep).toMatchObject({ total: 0, ok: false });
    expect(rep.detail).toContain('vacuous: no predicate ran');
    expect(h.calls).toHaveLength(0, 'a filter miss must not even pay for a spawn');
  });
});

describe('execTestRunner through registerTestTools (test.run now command-backed)', () => {
  const setup = (h: ReturnType<typeof harness>) => {
    const ws = new InMemoryWorkspace({ 'docs/alpha.md': 'notes\n' });
    const registry = registerWorkspaceTools(new ToolRegistry(), ws);
    registerTestTools(registry, execTestRunner(h.host, ['node', 'app.js'], PASS_OPTS));
    return { ws, registry };
  };

  it('granted call → {ok, detail, report} with the exec-host engine stated', async () => {
    const h = harness({ code: 0, signal: null });
    const { registry } = setup(h);
    const res = await registry.invoke({ callId: 'c1', tool: 'test.run', args: {} }, { checkpoint: () => true });
    expect(res.ok).toBe(true);
    const out = res.output as { ok: boolean; detail: string; report: { engine: string } };
    expect(out.report.engine).toBe('exec-host:node app.js');
    expect(out.detail).toContain('exit 0');
  });

  it('an unknown `only` filter is a tool ERROR naming the predicate, not a vacuous pass', async () => {
    const h = harness();
    const { registry } = setup(h);
    const res = await registry.invoke({ callId: 'c2', tool: 'test.run', args: { only: 'ghost' } }, { checkpoint: () => true });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('no test predicate named "ghost"');
  });

  it('runTask end-to-end: template run verifies with the REAL command and journals the report', async () => {
    const h = harness({ code: 0, signal: null });
    const { registry } = setup(h);
    const out = await runTask({ id: 't1', goal: 'annotate the alpha doc', targetPath: 'docs/alpha.md' }, { registry, checkpoint: () => true });
    expect(out.status).toBe('completed');
    expect(out.testReports).toHaveLength(1);
    expect(out.testReports![0]).toMatchObject({ engine: 'exec-host:node app.js', ok: true, total: 1 });
    expect(h.calls).toEqual([['node', 'app.js']]);
  });
});

/* --------------------------------------------------------------------------
 * M2 v60 (ADR 0016 amendment 60): the reporting layer used to QUOTE ONE PIPE —
 * `stderr || stdout` — so a suite's answer died behind a deprecation warning.
 * Measured against real processes first: 42 bytes of "RESULT: 41 passed, 2 failed"
 * on stdout, 42 bytes of warning on stderr, exit 1 → the report showed the warning
 * only. Flipping the write order changed nothing, which is how v53's coin-toss got
 * reborn one level up: the choice was not timing, it was that stderr always won.
 * -------------------------------------------------------------------------- */
describe('execTestRunner pipes (v60: one pipe may not mute the other in the report either)', () => {
  const ANSWER = 'RESULT: 41 passed, 2 failed in src/foo.ts';
  const WARNING = '(node:123) DeprecationWarning: legacy url';
  const reportFor = async (chunks: ['stdout' | 'stderr', string][]) =>
    (await execTestRunner(harness({ code: 1, signal: null }, chunks).host, ['node', 'app.js'], PASS_OPTS).run());

  it('an answer on stdout is NOT replaced by a warning on stderr: both pipes, each named', async () => {
    const rep = await reportFor([['stdout', ANSWER], ['stderr', WARNING]]);
    expect(rep.detail).toContain(`stdout: ${ANSWER}`);
    expect(rep.detail).toContain(`stderr: ${WARNING}`);
    expect(rep.failures[0]!.message).toBe(`exit 1 · stdout: ${ANSWER} · stderr: ${WARNING}`);
  });

  it('the sentence is ORDER-INDEPENDENT: the same two writes, emitted the other way round, read the same', async () => {
    expect(await reportFor([['stderr', WARNING], ['stdout', ANSWER]])).toEqual(await reportFor([['stdout', ANSWER], ['stderr', WARNING]]));
  });

  it('a pipe the budget cut to NOTHING says so — and does not claim the command printed nothing', async () => {
    const rep = await reportFor([['stdout', 'E'.repeat(3_000)]]); // one line, no newline, past a 2 000 B ceiling
    expect(rep.detail).toContain('stdout: no WHOLE line survived the output budget');
    expect(rep.detail).toContain('NOT a statement that it printed nothing');
    expect(rep.detail).toContain('output truncated at budget (stdout)');
    // the counterfactual, computed here so the test cannot pass by accident:
    expect(rep.failures[0]!.message.includes(`${'E'.repeat(99)}`), 'a trimmed pipe contributes no text').toBe(false);
  });

  it('a cut pipe that DID survive is quoted in full lines, and the v56 aggregate still names it', async () => {
    const line = `${'A'.repeat(99)}\n`;
    const rep = await reportFor([['stderr', 'warn'], ['stdout', line.repeat(25)]]); // 2 500 B against 2 000 B
    expect(rep.failures[0]!.message).toBe(`exit 1 · stdout: ${line.repeat(20).trimEnd()} · stderr: warn · output truncated at budget (stdout)`);
  });

  it('a budget cut may not change the VERDICT: exit 0 with a truncated stream is still green', async () => {
    const h = harness({ code: 0, signal: null }, [['stdout', `${'A'.repeat(99)}\n`.repeat(25)]]);
    const rep = await execTestRunner(h.host, ['node', 'app.js'], PASS_OPTS).run();
    expect([rep.ok, rep.passed, rep.failures.length]).toEqual([true, 1, 0]);
    expect(rep.detail).toContain('output truncated at budget (stdout)');
    // v71 (ADR 0016 amendment 71): the verdict is the command's own, so it stays green — but the EVIDENCE
    // quoted beside it is a window, and that fact now rides in the structured report, not only in prose.
    expect(rep.truncatedStreams).toEqual(['stdout']);
  });

  it('v71: the cut pipes are a REPORT field, absent when nothing was cut and named per pipe otherwise', async () => {
    const clean = await execTestRunner(harness({ code: 0, signal: null }, [['stdout', 'all good']]).host, ['node', 'app.js'], PASS_OPTS).run();
    expect('truncatedStreams' in clean).toBe(false); // absent, never an empty list (v56's shape)
    const both = await execTestRunner(harness({ code: 1, signal: null }, [['stderr', 'E'.repeat(3000)], ['stdout', 'A'.repeat(3000)]]).host, ['node', 'app.js'], PASS_OPTS).run();
    expect(both.truncatedStreams).toEqual(['stdout', 'stderr']); // reader order, not write order
    expect(both.ok).toBe(false);
    const onlyNoise = await execTestRunner(harness({ code: 0, signal: null }, [['stderr', 'W'.repeat(3000)], ['stdout', 'the answer\n']]).host, ['node', 'app.js'], PASS_OPTS).run();
    expect(onlyNoise.truncatedStreams).toEqual(['stderr']); // the answer survived whole; the noise did not
    expect(onlyNoise.ok).toBe(true);
    const refused = await execTestRunner(harness({ code: 0, signal: null }, [['stdout', 'x']]).host, ['node', 'app.js'], {}).run();
    expect('truncatedStreams' in refused).toBe(false); // §28 refused it: no run, so no pipe to name
  });

  it('v73: a KILLED run carries what the kill stopped — and a cut never pretends to be one', async () => {
    // the POLICY's second row is `git status *` at timeoutMs 20; this child never ends, so the host kills it.
    const never = { host: createExecHost(POLICY, { spawnLike: () => new FakeChild() }) };
    const rep = await execTestRunner(never.host, ['git', 'status', '--short'], { preApproved: true }).run();
    expect(rep.ok).toBe(false);
    expect(rep.killed).toMatchObject({ signal: 'SIGTERM' });
    expect(rep.killed?.descendantsStopped).toBe('not-attempted'); // v55: the default host stops ONE process
    expect(rep.killed?.exitCode).toBeNull();
    expect('truncatedStreams' in rep).toBe(false); // a kill is not a cut — the two axes stay separate
    expect(rep.detail).toContain('killed at timeout budget (SIGTERM) (descendants: not-attempted)'); // prose and record say the same thing

    const whole = await execTestRunner(harness({ code: 0, signal: null }, [['stdout', 'all good']]).host, ['node', 'app.js'], PASS_OPTS).run();
    expect('killed' in whole).toBe(false); // absent, never a zeroed object (v55/v56 precedent)
  });
});
