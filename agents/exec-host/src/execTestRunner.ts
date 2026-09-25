import type { ExecHost, ExecRunResult } from './execHost.js';
import type { TestReport, TestRunner } from '@nexus/agent-runtime';

/**
 * M2 v31 (ADR 0016 amendment 31): the bridge that lets a REAL command answer the
 * §63 verify step — `test.run`'s runner widened to async, and this factory maps an
 * `ExecRunResult` to a `TestReport` VERBATIM. The honesty invariants:
 * - the command goes through the v29 policy (allowlist decides; refusals become an
 *   honest FAILING report, never a crash and never a pass),
 * - §28 stays a SINGLE gate: via `registerTestTools` the registry's exec permission
 *   already gated the call, so wire with `preApproved: true`; without it the host
 *   refuses and the report says exactly that,
 * - the engine label names the actual argv — nobody can mistake this for predicates.
 *
 * M2 v60 (ADR 0016 amendment 60) rewrote the sentence this factory builds, after measuring what it
 * did to real processes. Three claims it was making that the host never made:
 * 1. It QUOTED ONE PIPE. `stderr || stdout` meant a suite's own answer — 42 bytes of
 *    "RESULT: 41 passed, 2 failed" on stdout — vanished behind a 42-byte deprecation warning, and
 *    when stdout was the pipe the budget cut, the report printed the warning and then announced
 *    `output truncated at budget (stdout)` without a single byte of that surviving 500 bytes in
 *    sight. v53 had just removed this hazard from the budget itself; leaving it in the reporting
 *    layer kept the same coin-toss one level up, because the choice depended on what a program
 *    happened to write where. Each pipe is now named and shown on its own.
 * 2. It reported `exit null`, a sentence about an exit code for a process that never exited.
 * 3. It attributed a refusal to the predicate. The dock chip's tooltip is
 *    `failures[0].name: failures[0].message`, so a default-deny refusal read as
 *    "exit-zero failed" — the command was never asked. The numbers stay as they are on purpose:
 *    `total` counts predicates IN SCOPE (runPredicates' own contract), so 0/1 for a refusal is
 *    true, and the failure is now NAMED as never-ran rather than moved into a fake count.
 */
export interface ExecTestRunnerOptions {
  /** Name of the single synthetic predicate (what `only` filters on). Default 'exit-zero'. */
  name?: string;
  /** Registry already gated test.run (§28 single-gate contract). Default false = host refuses. */
  preApproved?: boolean;
  cwd?: string;
  env?: Record<string, string>;
}

/** The two pipes, in the order a reader expects them: what a program SAYS, then what it COMPLAINS. */
const STREAMS = ['stdout', 'stderr'] as const;

/**
 * The name a refusal is filed under. The dock shows `failures[0].name` to a human, so this is not
 * prose — it is the field that keeps "nobody asked the command" from being read as "exit-zero failed".
 */
export const NEVER_RAN = 'never-ran';

function reportFrom(name: string, engine: string, r: ExecRunResult): TestReport {
  const parts: string[] = [];
  if (!r.ran) {
    parts.push(
      `never ran: ${r.reason || 'run refused'} · the 0/1 beside this sentence counts a predicate that was IN SCOPE, not a test that ran and failed`,
    );
  } else {
    if (r.spawnError !== '') parts.push(`spawn failed: ${r.spawnError}`);
    // v55: the kill stops the process the host started; `descendantsStopped` says what became of the
    // rest of the tree, which matters most for a suite runner that spawns workers of its own.
    if (r.killedByBudget) {
      parts.push(`killed at timeout budget${r.signal ? ` (${r.signal})` : ''}${r.descendantsStopped ? ` (descendants: ${r.descendantsStopped})` : ''}`);
    }
    parts.push(r.exitCode !== null ? `exit ${r.exitCode}` : 'no exit code reported');
    for (const stream of STREAMS) {
      const text = r[stream].trim();
      const cut = r.truncatedStreams?.includes(stream) === true;
      if (text !== '') parts.push(`${stream}: ${text}`);
      else if (cut) {
        parts.push(`${stream}: no WHOLE line survived the output budget — the command may have printed more, and this is NOT a statement that it printed nothing`);
      }
    }
    if (r.truncated) parts.push(`output truncated at budget${r.truncatedStreams && r.truncatedStreams.length > 0 ? ` (${r.truncatedStreams.join(' + ')})` : ''}`); // v56: WHICH pipe the suite overflowed
  }
  const passed = r.ran && r.exitCode === 0 && !r.killedByBudget && r.spawnError === '';
  const message = parts.join(' · ');
  return {
    engine,
    ok: passed,
    total: 1,
    passed: passed ? 1 : 0,
    failures: passed ? [] : [{ name: r.ran ? name : NEVER_RAN, message }],
    detail: `${engine}: ${passed ? 1 : 0}/1 passed — ${message}`,
    // v71: the verdict is git's/npm's/vitest's own; the QUOTE beside it is what a cut degrades. Copy the
    // list (a report is journalled, and a journalled fact must not be a live view of the run object).
    ...(r.truncatedStreams && r.truncatedStreams.length > 0 ? { truncatedStreams: [...r.truncatedStreams] } : {}),
  };
}

export function execTestRunner(host: ExecHost, argv: string[], options: ExecTestRunnerOptions = {}): TestRunner {
  const name = options.name ?? 'exit-zero';
  const engine = `exec-host:${argv.join(' ')}`;
  return {
    name: engine,
    async run(only?: string): Promise<TestReport> {
      if (only !== undefined && only !== name) {
        return { engine, ok: false, total: 0, passed: 0, failures: [], detail: `${engine}: 0/0 passed (only ${only}) — vacuous: no predicate ran` };
      }
      const result = await host.run({ argv, cwd: options.cwd, env: options.env }, { preApproved: options.preApproved === true });
      return reportFrom(name, engine, result);
    },
  };
}
