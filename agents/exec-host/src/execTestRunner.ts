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
 */
export interface ExecTestRunnerOptions {
  /** Name of the single synthetic predicate (what `only` filters on). Default 'exit-zero'. */
  name?: string;
  /** Registry already gated test.run (§28 single-gate contract). Default false = host refuses. */
  preApproved?: boolean;
  cwd?: string;
  env?: Record<string, string>;
}

function reportFrom(name: string, engine: string, r: ExecRunResult): TestReport {
  const parts: string[] = [];
  if (!r.ran) parts.push(r.reason || 'run refused');
  else {
    if (r.spawnError !== '') parts.push(`spawn failed: ${r.spawnError}`);
    if (r.killedByBudget) parts.push(`killed at timeout budget${r.signal ? ` (${r.signal})` : ''}`);
    parts.push(`exit ${r.exitCode}`);
    const output = r.stderr.trim() !== '' ? r.stderr.trim() : r.stdout.trim();
    if (output !== '') parts.push(output);
    if (r.truncated) parts.push(`output truncated at budget${r.truncatedStreams && r.truncatedStreams.length > 0 ? ` (${r.truncatedStreams.join(' + ')})` : ''}`); // v56: WHICH pipe the suite overflowed
  }
  const passed = r.ran && r.exitCode === 0 && !r.killedByBudget && r.spawnError === '';
  const message = parts.join(' · ');
  return {
    engine,
    ok: passed,
    total: 1,
    passed: passed ? 1 : 0,
    failures: passed ? [] : [{ name, message }],
    detail: `${engine}: ${passed ? 1 : 0}/1 passed — ${message}`,
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
